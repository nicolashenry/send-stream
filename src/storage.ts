
import * as http from 'http';
import * as http2 from 'http2';
import { Readable } from 'stream';

import contentDisposition from 'content-disposition';
import { lookup as mimeTypesLookup, charset as mimeTypesCharset } from 'mime-types';
import parseRange from 'range-parser';

import { StreamResponse } from './response';
import { EmptyStream, BufferStream, MultiStream } from './streams';
import {
	millisecondsToUTCString,
	statsToEtag,
	getFreshStatus,
	isRangeFresh,
	contentRange,
	randomBytes,
	StreamRange,
	ResponseHeaders,
	BufferOrStreamRange,
} from './utils';
import {
	StorageOptions,
	PrepareResponseOptions,
	StorageRequestHeaders,
	StorageInfo,
	StorageError,
} from './storage-models';

const DEFAULT_ALLOWED_METHODS = <const> ['GET', 'HEAD'];
const DEFAULT_MAX_RANGES = 200;

/**
 * send-stream storage base class
 */
export abstract class Storage<Reference, AttachedData> {
	readonly defaultMimeType: string | false;

	readonly maxRanges: number;

	readonly weakEtags: boolean;
	readonly mimeTypesLookup: NonNullable<StorageOptions['mimeTypesLookup']>;
	readonly mimeTypesCharset: NonNullable<StorageOptions['mimeTypesCharset']>;

	/**
	 * Create storage
	 *
	 * @param opts - storage options
	 */
	constructor(opts: StorageOptions = { }) {
		this.mimeTypesLookup = opts.mimeTypesLookup ?? mimeTypesLookup;
		this.mimeTypesCharset = opts.mimeTypesCharset ?? mimeTypesCharset;
		this.defaultMimeType = opts.defaultMimeType ?? false;
		this.maxRanges = opts.maxRanges ?? DEFAULT_MAX_RANGES;
		this.weakEtags = opts.weakEtags === true;
	}

	/**
	 * Create last-mofified header value from storage information (uses mtimeMs)
	 *
	 * @param storageInfo - storage information
	 * @returns last-mofified header
	 */
	// eslint-disable-next-line class-methods-use-this
	createLastModified(storageInfo: StorageInfo<AttachedData>): string | false {
		const { lastModified } = storageInfo;
		if (lastModified) {
			return lastModified;
		}
		const { mtimeMs } = storageInfo;
		if (mtimeMs === undefined) {
			return false;
		}
		return millisecondsToUTCString(mtimeMs);
	}

	/**
	 * Create etag header value from storage information (uses mtimeMs, size and contentEncoding)
	 *
	 * @param storageInfo - storage information
	 * @returns etag header
	 */
	createEtag(storageInfo: StorageInfo<AttachedData>): string | false {
		const { etag } = storageInfo;
		if (etag) {
			return etag;
		}
		const { size, mtimeMs } = storageInfo;
		if (size === undefined || mtimeMs === undefined) {
			return false;
		}
		return statsToEtag(size, mtimeMs, storageInfo.contentEncoding, this.weakEtags);
	}

	/**
	 * Create cache-control header value from storage information (return always public, max-age=0 unless overriden)
	 *
	 * @param _storageInfo - storage information (unused unless overriden)
	 * @returns cache-control header
	 */
	// eslint-disable-next-line class-methods-use-this
	createCacheControl(_storageInfo: StorageInfo<AttachedData>): string | false {
		return 'public, max-age=0';
	}

	/**
	 * Create mime type for content-type header value from storage information
	 *
	 * @param storageInfo - storage information (unused unless overriden)
	 * @returns mime type
	 */
	createMimeType(storageInfo: StorageInfo<AttachedData>): string | false {
		const { mimeType } = storageInfo;
		if (mimeType) {
			return mimeType;
		}
		const { fileName } = storageInfo;
		if (!fileName) {
			return this.defaultMimeType;
		}
		const type = this.mimeTypesLookup(fileName);
		if (!type) {
			return this.defaultMimeType;
		}
		return type;
	}

	/**
	 * Create charset that will be appended with mime type into content-type header
	 *
	 * @param storageInfo - storage information (unused unless overriden)
	 * @param mimeType - mime type
	 * @returns charset
	 */
	createMimeTypeCharset(storageInfo: StorageInfo<AttachedData>, mimeType: string): string | false {
		if (storageInfo.mimeTypeCharset) {
			return storageInfo.mimeTypeCharset;
		}
		return this.mimeTypesCharset(mimeType);
	}

	/**
	 * Create content-disposition header filename from storage information
	 * (return always the original filename unless overriden)
	 *
	 * @param storageInfo - storage information
	 * @returns content-disposition header filename
	 */
	// eslint-disable-next-line class-methods-use-this
	createContentDispositionFilename(storageInfo: StorageInfo<AttachedData>): string | undefined {
		return storageInfo.fileName;
	}

	/**
	 * Create content-disposition header type from storage information (return always inline unless overriden)
	 *
	 * @param _storageInfo - storage information (unused unless overriden)
	 * @returns content-disposition header type
	 */
	// eslint-disable-next-line class-methods-use-this
	createContentDispositionType(_storageInfo: StorageInfo<AttachedData>): 'inline' | 'attachment' | undefined {
		return 'inline';
	}

	/**
	 * Prepare to send file
	 *
	 * @param reference - file reference
	 * @param req - request headers or request objects
	 * @param [opts] - options
	 * @returns status, response headers and body to use
	 * @throws when method is incorrect or when storage can not create the storage stream
	 */
	async prepareResponse(
		reference: Reference,
		req: http.IncomingMessage | http2.Http2ServerRequest | http2.IncomingHttpHeaders,
		opts: PrepareResponseOptions = {},
	): Promise<StreamResponse<AttachedData>> {
		let method;
		let requestHeaders;
		if (req instanceof http.IncomingMessage || req instanceof http2.Http2ServerRequest) {
			method = req.method;
			requestHeaders = req.headers;
		} else {
			method = req[':method'];
			requestHeaders = req;
		}
		if (!method) {
			throw new Error('cannot send, method is missing');
		}
		const isGetMethod = method === 'GET';
		const isHeadMethod = method === 'HEAD';
		const isGetOrHead = isGetMethod || isHeadMethod;
		const allowedMethods = opts.allowedMethods ?? DEFAULT_ALLOWED_METHODS;
		if (!allowedMethods.includes(method)) {
			return this.createMethodNotAllowedError(isHeadMethod, allowedMethods);
		}
		let earlyClose = false;
		let storageInfo;
		try {
			storageInfo = await this.open(
				reference,
				requestHeaders,
			);
		} catch (error: unknown) {
			return this.createStorageError(isHeadMethod, error);
		}
		try {
			const responseHeaders: ResponseHeaders = { };
			const cacheControl = opts.cacheControl ?? this.createCacheControl(storageInfo);
			if (cacheControl) {
				responseHeaders['Cache-Control'] = cacheControl;
			}

			if (storageInfo.vary) {
				responseHeaders['Vary'] = storageInfo.vary;
			}

			const lastModified = opts.lastModified ?? this.createLastModified(storageInfo);

			if (lastModified) {
				storageInfo.lastModified = lastModified;
			}

			const etag = opts.etag ?? this.createEtag(storageInfo);

			if (etag) {
				storageInfo.etag = etag;
			}

			const fullResponse = opts.statusCode !== undefined;
			if (!fullResponse) {
				if (lastModified) {
					responseHeaders['Last-Modified'] = lastModified;
				}

				if (etag) {
					responseHeaders['ETag'] = etag;
				}

				const freshStatus = getFreshStatus(isGetOrHead, requestHeaders, etag, lastModified);
				switch (freshStatus) {
				case 304:
					earlyClose = true;
					return this.createNotModifiedResponse(responseHeaders, storageInfo);
				case 412:
					earlyClose = true;
					return this.createPreconditionFailedError(isHeadMethod, storageInfo);
				default:
					break;
				}
			}

			if (storageInfo.contentEncoding && storageInfo.contentEncoding !== 'identity') {
				responseHeaders['Content-Encoding'] = storageInfo.contentEncoding;
			}

			let contentTypeHeader;
			const mimeType = opts.mimeType ?? this.createMimeType(storageInfo);
			if (mimeType) {
				storageInfo.mimeType = mimeType;
				const mimeTypeCharset = opts.mimeTypeCharset ?? this.createMimeTypeCharset(storageInfo, mimeType);
				if (mimeTypeCharset) {
					storageInfo.mimeTypeCharset = mimeTypeCharset;
					contentTypeHeader = `${ mimeType }; charset=${ mimeTypeCharset }`;
				} else {
					contentTypeHeader = mimeType;
				}
				responseHeaders['Content-Type'] = contentTypeHeader;
				responseHeaders['X-Content-Type-Options'] = 'nosniff';
			}

			const contentDispositionType = opts.contentDispositionType
				?? this.createContentDispositionType(storageInfo);
			if (contentDispositionType) {
				const { contentDispositionFilename: optsContentDispositionFilename } = opts;
				responseHeaders['Content-Disposition'] = contentDisposition(
					optsContentDispositionFilename === undefined
						? this.createContentDispositionFilename(storageInfo)
						: optsContentDispositionFilename
							? optsContentDispositionFilename
							: undefined,
					{ type: contentDispositionType },
				);
			}

			let statusCode = opts.statusCode ?? 200;
			const { size } = storageInfo;
			let rangeToUse: StreamRange | BufferOrStreamRange[] | undefined;
			if (size === undefined) {
				responseHeaders['Accept-Ranges'] = 'none';
				rangeToUse = undefined;
			} else {
				const { maxRanges } = this;
				let contentLength;
				if (maxRanges <= 0 || fullResponse || !isGetOrHead) {
					responseHeaders['Accept-Ranges'] = 'none';
					rangeToUse = new StreamRange(0, size - 1);
					contentLength = size;
				} else {
					responseHeaders['Accept-Ranges'] = 'bytes';
					const { range: rangeHeader } = requestHeaders;
					if (
						!rangeHeader
						|| !isRangeFresh(requestHeaders, etag, lastModified)
					) {
						rangeToUse = new StreamRange(0, size - 1);
						contentLength = size;
					} else {
						const parsedRanges = parseRange(size, rangeHeader, { combine: true });
						if (parsedRanges === -1) {
							earlyClose = true;
							return this.createRangeNotSatisfiableError(isHeadMethod, size, storageInfo);
						}
						if (parsedRanges === -2
							|| parsedRanges.type !== 'bytes'
							|| parsedRanges.length > maxRanges
						) {
							rangeToUse = new StreamRange(0, size - 1);
							contentLength = size;
						} else {
							statusCode = 206;
							if (parsedRanges.length === 1) {
								const [singleRange] = parsedRanges;
								responseHeaders['Content-Range'] = contentRange('bytes', size, singleRange);
								rangeToUse = new StreamRange(singleRange.start, singleRange.end);
								contentLength = singleRange.end + 1 - singleRange.start;
							} else {
								const boundary = `----SendStreamBoundary${ (await randomBytes(24)).toString('hex') }`;
								responseHeaders['Content-Type'] = `multipart/byteranges; boundary=${ boundary }`;
								responseHeaders['X-Content-Type-Options'] = 'nosniff';
								rangeToUse = [];
								contentLength = 0;
								let first = true;
								for (const range of parsedRanges) {
									let header = `${ first ? '' : '\r\n' }--${ boundary }\r\n`;
									first = false;
									if (contentTypeHeader) {
										header += `content-type: ${ contentTypeHeader }\r\n`;
									}
									header += `content-range: ${ contentRange('bytes', size, range) }\r\n\r\n`;
									const headerBuffer = Buffer.from(header);
									rangeToUse.push(headerBuffer, new StreamRange(range.start, range.end));
									contentLength += headerBuffer.byteLength + range.end + 1 - range.start;
								}
								const footer = `\r\n--${ boundary }--`;
								const footerBuffer = Buffer.from(footer);
								rangeToUse.push(footerBuffer);
								contentLength += footerBuffer.byteLength;
							}
						}
					}
				}
				responseHeaders['Content-Length'] = String(contentLength);
			}

			let stream: Readable;
			if (isHeadMethod) {
				earlyClose = true;
				stream = new EmptyStream();
			} else if (rangeToUse === undefined) {
				stream = this.createReadableStream(storageInfo, undefined, true);
			} else if (rangeToUse instanceof StreamRange) {
				if (rangeToUse.end < rangeToUse.start) {
					earlyClose = true;
					stream = new EmptyStream();
				} else {
					stream = this.createReadableStream(storageInfo, rangeToUse, true);
				}
			} else {
				const si = storageInfo;
				stream = new MultiStream(
					rangeToUse,
					range => {
						if (range instanceof StreamRange) {
							return this.createReadableStream(
								si,
								range,
								false,
							);
						}
						return new BufferStream(range);
					},
					async () => this.close(si),
				);
			}

			return this.createSuccessfulResponse(statusCode, responseHeaders, stream, storageInfo);
		} catch (err: unknown) {
			earlyClose = true;
			throw err;
		} finally {
			if (earlyClose) {
				await this.close(storageInfo);
			}
		}
	}

	/**
	 * Create Method Not Allowed error response
	 *
	 * @param isHeadMethod - true if HEAD method is used
	 * @param allowedMethods - allowed methods for Allow header
	 * @returns Method Not Allowed response
	 */
	// eslint-disable-next-line class-methods-use-this
	createMethodNotAllowedError(isHeadMethod: boolean, allowedMethods: readonly string[]) {
		// Method Not Allowed
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const statusMessageBuffer = Buffer.from(http.STATUS_CODES['405']!);
		return new StreamResponse<AttachedData>(
			405,
			{
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Length': String(statusMessageBuffer.byteLength),
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Type': 'text/plain; charset=UTF-8',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'X-Content-Type-Options': 'nosniff',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Allow: allowedMethods.join(', '),
			},
			isHeadMethod ? new EmptyStream() : new BufferStream(statusMessageBuffer),
		);
	}

	/**
	 * Create storage error response (Not Found response usually)
	 *
	 * @param isHeadMethod - true if HEAD method is used
	 * @param error - the error causing this response
	 * @returns the error response
	 */
	// eslint-disable-next-line class-methods-use-this
	createStorageError(isHeadMethod: boolean, error: unknown) {
		// Not Found
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const statusMessageBuffer = Buffer.from(http.STATUS_CODES['404']!);
		return new StreamResponse<AttachedData>(
			404,
			{
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Length': String(statusMessageBuffer.byteLength),
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Type': 'text/plain; charset=UTF-8',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'X-Content-Type-Options': 'nosniff',
			},
			isHeadMethod ? new EmptyStream() : new BufferStream(statusMessageBuffer),
			undefined,
			error instanceof StorageError ? error : new StorageError('Unknown error', error),
		);
	}

	/**
	 * Create Not Modified response
	 *
	 * @param responseHeaders - response headers
	 * @param storageInfo - the current storage info
	 * @returns the Not Modified response
	 */
	// eslint-disable-next-line class-methods-use-this
	createNotModifiedResponse(
		responseHeaders: ResponseHeaders,
		storageInfo: StorageInfo<AttachedData>,
	) {
		// Not Modified
		return new StreamResponse(304, responseHeaders, new EmptyStream(), storageInfo);
	}

	/**
	 * Create the Precondition Failed error response
	 *
	 * @param isHeadMethod - true if HEAD method is used
	 * @param storageInfo - the current storage info
	 * @returns the Precondition Failed error response
	 */
	// eslint-disable-next-line class-methods-use-this
	createPreconditionFailedError(isHeadMethod: boolean, storageInfo: StorageInfo<AttachedData>) {
		// Precondition Failed
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const statusMessageBuffer = Buffer.from(http.STATUS_CODES['412']!);
		return new StreamResponse(
			412,
			{
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Type': 'text/plain; charset=UTF-8',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'X-Content-Type-Options': 'nosniff',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Length': String(statusMessageBuffer.byteLength),
			},
			isHeadMethod ? new EmptyStream() : new BufferStream(statusMessageBuffer),
			storageInfo,
		);
	}

	/**
	 * Create the Range Not Satisfiable error response
	 *
	 * @param isHeadMethod - true if HEAD method is used
	 * @param size - size of content for Content-Range header
	 * @param storageInfo - the current storage info
	 * @returns the Range Not Satisfiable error response
	 */
	// eslint-disable-next-line class-methods-use-this
	createRangeNotSatisfiableError(isHeadMethod: boolean, size: number, storageInfo: StorageInfo<AttachedData>) {
		// Range Not Satisfiable
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const statusMessageBuffer = Buffer.from(http.STATUS_CODES['416']!);
		return new StreamResponse(
			416,
			{
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Range': contentRange('bytes', size),
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Type': 'text/plain; charset=UTF-8',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'X-Content-Type-Options': 'nosniff',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Length': String(statusMessageBuffer.byteLength),
			},
			isHeadMethod ? new EmptyStream() : new BufferStream(statusMessageBuffer),
			storageInfo,
		);
	}

	/**
	 * Create the successful OK (200) or Partial Content (206) response
	 * (the http code could also be the one set in parameters)
	 *
	 * @param statusCode - 200 or 206 or the statusCode set in parameters
	 * @param responseHeaders - the response headers
	 * @param stream - the content stream
	 * @param storageInfo - the current storage info
	 * @returns the successful response
	 */
	// eslint-disable-next-line class-methods-use-this
	createSuccessfulResponse(
		statusCode: number,
		responseHeaders: ResponseHeaders,
		stream: Readable,
		storageInfo: StorageInfo<AttachedData>,
	) {
		// Ok | Partial Content
		return new StreamResponse(statusCode, responseHeaders, stream, storageInfo);
	}

	/**
	 * Open file and retrieve storage information (filename, modification date, size, ...)
	 *
	 * @param reference - file reference
	 * @param requestHeaders - request headers
	 * @returns StorageInfo object
	 */
	abstract open(
		reference: Reference,
		requestHeaders: StorageRequestHeaders,
	): Promise<StorageInfo<AttachedData>>;

	/**
	 * Create readable stream from storage information
	 *
	 * @param storageInfo - storage information
	 * @param range - range to use or undefined if size is unknown
	 * @param autoClose - true if stream should close itself
	 * @returns readable stream
	 */
	abstract createReadableStream(
		storageInfo: StorageInfo<AttachedData>,
		range: StreamRange | undefined,
		autoClose: boolean
	): Readable;

	/**
	 * Close storage information (if needed)
	 *
	 * @param storageInfo - storage information
	 */
	abstract close(storageInfo: StorageInfo<AttachedData>): Promise<void>;
}
