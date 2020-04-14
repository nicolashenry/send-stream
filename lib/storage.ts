
import contentDisposition from 'content-disposition';
import * as http from 'http';
import * as http2 from 'http2';
import mime from 'mime';
import parseRange from 'range-parser';
import { Readable } from 'stream';

import { StreamResponse, StorageInfo, StorageError } from './response';
import { EmptyStream, BufferStream, MultiStream } from './streams';
import {
	millisecondsToUTCString,
	getContentTypeWithCharset,
	statsToEtag,
	getFreshStatus,
	isRangeFresh,
	contentRange,
	randomBytes,
	StreamRange,
	ResponseHeaders,
	CharsetMapping,
	BufferOrStreamRange
} from './utils';

/**
 * Storage.prepareResponse options
 */
export interface PrepareResponseOptions {
	/**
	 * Custom cache-control header value, overrides storage value
	 *
	 * false to remove header
	 */
	cacheControl?: string | false;
	/**
	 * Custom last-modified header value, overrides storage value
	 *
	 * `false` to remove header
	 */
	lastModified?: string | false;
	/**
	 * Custom etag header value, overrides storage value
	 *
	 * `false` to remove header
	 */
	etag?: string | false;
	/**
	 * Custom content-type header value, overrides storage value
	 *
	 * `false` to remove header
	 */
	contentType?: string | false;
	/**
	 * Custom content-disposition header type value, overrides storage value
	 *
	 * `false` to remove header
	 */
	contentDispositionType?: 'inline' | 'attachment' | false;
	/**
	 * Custom content-disposition header filename value, overrides storage value
	 *
	 * `false` to remove filename from header
	 */
	contentDispositionFilename?: string | false;
	/**
	 * Status code that will be returned in stream response
	 * Setting this will disable conditional GET and partial responses for this request
	 *
	 * Defaults to `undefined`
	 */
	statusCode?: number;
	/**
	 * By default GET and HEAD are the only allowed http methods, set this parameter to change allowed methods
	 *
	 * Defaults to `['GET', 'HEAD']`
	 */
	allowedMethods?: readonly string[];
}

/**
 * Request headers
 */
export interface StorageRequestHeaders {
	[header: string]: string | string[] | undefined;
}

/**
 * Mime module type
 */
export interface MimeModule {
	getType(path: string): string | null;
}

/**
 * Storage options
 */
export interface StorageOptions {
	/**
	 * "mime" module instance to use
	 */
	mimeModule?: MimeModule;
	/**
	 * Default content type, e.g. "application/octet-stream"
	 */
	defaultContentType?: string;
	/**
	 * Default charsets mapping, defaults to UTF-8 for text/* and application/(javascript|json) content types,
	 * e.g. `[{ matcher: /^text\/.*\/, charset: 'windows-1252' }]`
	 *
	 * Can be disabled by setting it to `false`
	 */
	defaultCharsets?: readonly CharsetMapping[] | false;
	/**
	 * Maximum ranges supported for range requests (default is `200`)
	 *
	 * `1` to disable multipart/byteranges, `0` or less to disable range requests
	 */
	maxRanges?: number;
	/**
	 * Set weak etags by default instead strong ones
	 *
	 * Defaults to `false`
	 */
	weakEtags?: boolean;
}

const defaultCharset = <const> [{ matcher: /^(?:text\/.+|application\/(?:javascript|json))$/, charset: 'UTF-8' }];

const DEFAULT_ALLOWED_METHODS = <const> ['GET', 'HEAD'];

/**
 * send-stream storage base class
 */
export abstract class Storage<Reference, AttachedData> {
	readonly mimeModule: MimeModule;
	readonly defaultContentType?: string;
	readonly defaultCharsets: readonly CharsetMapping[] | false;
	readonly maxRanges: number;
	readonly weakEtags: boolean;

	/**
	 * Create storage
	 * @param opts storage options
	 */
	constructor(opts: StorageOptions = { }) {
		this.mimeModule = opts.mimeModule ? opts.mimeModule : mime;
		this.defaultContentType = opts.defaultContentType;
		this.defaultCharsets = opts.defaultCharsets !== undefined
			? opts.defaultCharsets
			: defaultCharset;
		this.maxRanges = opts.maxRanges !== undefined ? opts.maxRanges : 200;
		this.weakEtags = opts.weakEtags === true;
	}

	/**
	 * Open file and retrieve storage information (filename, modification date, size, ...)
	 * @param reference file reference
	 * @param requestHeaders request headers
	 * @returns StorageInfo object
	 */
	abstract open(
		reference: Reference,
		requestHeaders: StorageRequestHeaders,
	): Promise<StorageInfo<AttachedData>>;

	/**
	 * Create readable stream from storage information
	 * @param storageInfo storage information
	 * @param range range to use or undefined if size is unknown
	 * @param autoClose true if stream should close itself
	 * @returns readable stream
	 */
	abstract createReadableStream(
		storageInfo: StorageInfo<AttachedData>,
		range: StreamRange | undefined,
		autoClose: boolean
	): Readable;

	/**
	 * Close storage information (if needed)
	 * @param storageInfo storage information
	 */
	abstract close(storageInfo: StorageInfo<AttachedData>): Promise<void>;

	/**
	 * Create last-mofified header value from storage information (uses mtimeMs)
	 * @param storageInfo storage information
	 * @returns last-mofified header
	 */
	createLastModified(storageInfo: StorageInfo<AttachedData>): string | false {
		if (storageInfo.mtimeMs === undefined) {
			return false;
		}
		return millisecondsToUTCString(storageInfo.mtimeMs);
	}

	/**
	 * Create etag header value from storage information (uses mtimeMs, size and contentEncoding)
	 * @param storageInfo storage information
	 * @returns etag header
	 */
	createEtag(storageInfo: StorageInfo<AttachedData>): string | false {
		if (storageInfo.size === undefined || storageInfo.mtimeMs === undefined) {
			return false;
		}
		return statsToEtag(storageInfo.size, storageInfo.mtimeMs, storageInfo.contentEncoding, this.weakEtags);
	}

	/**
	 * Create cache-control header value from storage information (return always public, max-age=0 unless overriden)
	 * @param _storageInfo storage information (unused unless overriden)
	 * @returns cache-control header
	 */
	createCacheControl(_storageInfo: StorageInfo<AttachedData>): string | false {
		return 'public, max-age=0';
	}

	/**
	 * Create content-type header value from storage information
	 * (from filename using mime module and adding default charset for some types)
	 * @param storageInfo storage information (unused unless overriden)
	 * @returns content-type header
	 */
	createContentType(storageInfo: StorageInfo<AttachedData>): string | undefined {
		if (!storageInfo.fileName) {
			return undefined;
		}
		const type = this.mimeModule.getType(storageInfo.fileName);
		if (!type) {
			return this.defaultContentType;
		}
		if (type && this.defaultCharsets) {
			return getContentTypeWithCharset(type, this.defaultCharsets);
		}
		return type;
	}

	/**
	 * Create content-disposition header filename from storage information
	 * (return always the original filename unless overriden)
	 * @param storageInfo storage information
	 * @returns content-disposition header filename
	 */
	createContentDispositionFilename(storageInfo: StorageInfo<AttachedData>): string | undefined {
		return storageInfo.fileName;
	}

	/**
	 * Create content-disposition header type from storage information (return always inline unless overriden)
	 * @param _storageInfo storage information (unused unless overriden)
	 * @returns content-disposition header type
	 */
	createContentDispositionType(_storageInfo: StorageInfo<AttachedData>): 'inline' | 'attachment' | undefined {
		return 'inline';
	}

	/**
	 * Prepare to send file
	 * @param reference file reference
	 * @param req request headers or request objects
	 * @param [opts] options
	 * @return status, response headers and body to use
	 */
	async prepareResponse(
		reference: Reference,
		req: http.IncomingMessage | http2.Http2ServerRequest | http2.IncomingHttpHeaders,
		opts: PrepareResponseOptions = {}
	): Promise<StreamResponse<AttachedData>> {
		let method;
		let requestHeaders;
		if (req instanceof http.IncomingMessage || req instanceof http2.Http2ServerRequest) {
			if (!req.method) {
				throw new Error('cannot send, method is missing');
			}
			method = req.method;
			requestHeaders = req.headers;
		} else {
			if (!req[':method']) {
				throw new Error('cannot send, method is missing');
			}
			method = req[':method'];
			requestHeaders = req;
		}
		const isGetMethod = method === 'GET';
		const isHeadMethod = method === 'HEAD';
		const isGetOrHead = isGetMethod || isHeadMethod;
		const allowedMethods = opts.allowedMethods ? opts.allowedMethods : DEFAULT_ALLOWED_METHODS;
		if (!allowedMethods.includes(method)) {
			return this.createMethodNotAllowedError(isHeadMethod, allowedMethods);
		}
		let earlyClose = false;
		let storageInfo;
		try {
			storageInfo = await this.open(
				reference,
				requestHeaders
			);
		} catch (error) {
			return this.createStorageError(isHeadMethod, error);
		}
		try {
			const responseHeaders: ResponseHeaders = { };
			const cacheControl = opts.cacheControl !== undefined
				? opts.cacheControl
				: this.createCacheControl(storageInfo);
			if (cacheControl) {
				responseHeaders['Cache-Control'] = cacheControl;
			}

			if (storageInfo.vary) {
				responseHeaders['Vary'] = storageInfo.vary;
			}

			const lastModified = opts.lastModified !== undefined
				? opts.lastModified
				: this.createLastModified(storageInfo);

			const etag = opts.etag !== undefined
				? opts.etag
				: this.createEtag(storageInfo);

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
				}
			}

			if (storageInfo.contentEncoding && storageInfo.contentEncoding !== 'identity') {
				responseHeaders['Content-Encoding'] = storageInfo.contentEncoding;
			}

			const contentType = opts.contentType !== undefined
				? opts.contentType
				: this.createContentType(storageInfo);
			if (contentType) {
				responseHeaders['Content-Type'] = contentType;
				responseHeaders['X-Content-Type-Options'] = 'nosniff';
			}

			const contentDispositionType = opts.contentDispositionType !== undefined
				? opts.contentDispositionType
				: this.createContentDispositionType(storageInfo);
			if (contentDispositionType) {
				responseHeaders['Content-Disposition'] = contentDisposition(
					opts.contentDispositionFilename !== undefined
					? (
						opts.contentDispositionFilename
						? opts.contentDispositionFilename
						: undefined
					)
					: this.createContentDispositionFilename(storageInfo),
					{ type: contentDispositionType }
				);
			}

			let statusCode = opts.statusCode !== undefined ? opts.statusCode : 200;
			const size = storageInfo.size;
			let rangeToUse: StreamRange | BufferOrStreamRange[] | undefined;
			if (size === undefined) {
				responseHeaders['Accept-Ranges'] = 'none';
				rangeToUse = undefined;
			} else {
				const maxRanges = this.maxRanges;
				let contentLength;
				if (maxRanges <= 0 || fullResponse || !isGetOrHead) {
					responseHeaders['Accept-Ranges'] = 'none';
					rangeToUse = new StreamRange(0, size - 1);
					contentLength = size;
				} else {
					responseHeaders['Accept-Ranges'] = 'bytes';
					const rangeHeader = requestHeaders['range'];
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
								const singleRange = parsedRanges[0];
								responseHeaders['Content-Range'] = contentRange('bytes', size, singleRange);
								rangeToUse = new StreamRange(singleRange.start, singleRange.end);
								contentLength = (singleRange.end + 1) - singleRange.start;
							} else {
								const boundary = `----SendStreamBoundary${(await randomBytes(24)).toString('hex')}`;
								responseHeaders['Content-Type'] = `multipart/byteranges; boundary=${boundary}`;
								responseHeaders['X-Content-Type-Options'] = 'nosniff';
								rangeToUse = [];
								contentLength = 0;
								for (let i = 0; i < parsedRanges.length; i++) {
									const range = parsedRanges[i];
									let header = `${i > 0 ? '\r\n' : ''}--${boundary}\r\n`;
									if (contentType) {
										header += `content-type: ${contentType}\r\n`;
									}
									header += `content-range: ${contentRange('bytes', size, range)}\r\n\r\n`;
									const headerBuffer = Buffer.from(header);
									rangeToUse.push(headerBuffer);
									contentLength += headerBuffer.byteLength;
									rangeToUse.push(new StreamRange(range.start, range.end));
									contentLength += (range.end + 1) - range.start;
								}
								const footer = `\r\n--${boundary}--`;
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
								false
							);
						}
						return new BufferStream(range);
					},
					async () => this.close(si)
				);
			}

			return this.createSuccessfulResponse(statusCode, responseHeaders, stream, storageInfo);
		} catch (err) {
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
	 * @param isHeadMethod true if HEAD method is used
	 * @param allowedMethods allowed methods for Allow header
	 * @returns Method Not Allowed response
	 */
	createMethodNotAllowedError(isHeadMethod: boolean, allowedMethods: readonly string[]) {
		// Method Not Allowed
		// tslint:disable-next-line: no-non-null-assertion
		const statusMessageBuffer = Buffer.from(http.STATUS_CODES['405']!);
		return new StreamResponse<AttachedData>(
			405,
			{
				'Content-Length': String(statusMessageBuffer.byteLength),
				'Content-Type': 'text/plain; charset=UTF-8',
				'X-Content-Type-Options': 'nosniff',
				Allow: allowedMethods.join(', ')
			},
			isHeadMethod ? new EmptyStream() : new BufferStream(statusMessageBuffer)
		);
	}

	/**
	 * Create storage error response (Not Found response usually)
	 * @param isHeadMethod true if HEAD method is used
	 * @param error the error causing this response
	 * @returns the error response
	 */
	createStorageError(isHeadMethod: boolean, error: unknown) {
		// Not Found
		// tslint:disable-next-line: no-non-null-assertion
		const statusMessageBuffer = Buffer.from(http.STATUS_CODES['404']!);
		return new StreamResponse<AttachedData>(
			404,
			{
				'Content-Length': String(statusMessageBuffer.byteLength),
				'Content-Type': 'text/plain; charset=UTF-8',
				'X-Content-Type-Options': 'nosniff',
			},
			isHeadMethod ? new EmptyStream() : new BufferStream(statusMessageBuffer),
			undefined,
			error instanceof StorageError ? error : new StorageError('unknown_error', 'Unknown error', error)
		);
	}

	/**
	 * Create Not Modified response
	 * @param responseHeaders response headers
	 * @param storageInfo the current storage info
	 * @returns the Not Modified response
	 */
	createNotModifiedResponse(
		responseHeaders: ResponseHeaders,
		storageInfo: StorageInfo<AttachedData>
	) {
		// Not Modified
		return new StreamResponse(304, responseHeaders, new EmptyStream(), storageInfo);
	}

	/**
	 * Create the Precondition Failed error response
	 * @param isHeadMethod true if HEAD method is used
	 * @param storageInfo the current storage info
	 * @returns the Precondition Failed error response
	 */
	createPreconditionFailedError(isHeadMethod: boolean, storageInfo: StorageInfo<AttachedData>) {
		// Precondition Failed
		// tslint:disable-next-line: no-non-null-assertion
		const statusMessageBuffer = Buffer.from(http.STATUS_CODES['412']!);
		return new StreamResponse(
			412,
			{
				'Content-Type': 'text/plain; charset=UTF-8',
				'X-Content-Type-Options': 'nosniff',
				'Content-Length': String(statusMessageBuffer.byteLength)
			},
			isHeadMethod ? new EmptyStream() : new BufferStream(statusMessageBuffer),
			storageInfo
		);
	}

	/**
	 * Create the Range Not Satisfiable error response
	 * @param isHeadMethod true if HEAD method is used
	 * @param size size of content for Content-Range header
	 * @param storageInfo the current storage info
	 * @returns the Range Not Satisfiable error response
	 */
	createRangeNotSatisfiableError(isHeadMethod: boolean, size: number, storageInfo: StorageInfo<AttachedData>) {
		// Range Not Satisfiable
		// tslint:disable-next-line: no-non-null-assertion
		const statusMessageBuffer = Buffer.from(http.STATUS_CODES['416']!);
		return new StreamResponse(
			416,
			{
				'Content-Range': contentRange('bytes', size),
				'Content-Type': 'text/plain; charset=UTF-8',
				'X-Content-Type-Options': 'nosniff',
				'Content-Length': String(statusMessageBuffer.byteLength)
			},
			isHeadMethod ? new EmptyStream() : new BufferStream(statusMessageBuffer),
			storageInfo
		);
	}

	/**
	 * Create the successful OK (200) or Partial Content (206) response
	 * (the http code could also be the one set in parameters)
	 * @param statusCode 200 or 206 or the statusCode set in parameters
	 * @param responseHeaders the response headers
	 * @param stream the content stream
	 * @param storageInfo the current storage info
	 * @returns the successful response
	 */
	private createSuccessfulResponse(
		statusCode: number,
		responseHeaders: ResponseHeaders,
		stream: Readable,
		storageInfo: StorageInfo<AttachedData>
	) {
		// Ok | Partial Content
		return new StreamResponse(statusCode, responseHeaders, stream, storageInfo);
	}
}
