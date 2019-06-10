
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
	Range,
	ResponseHeaders,
	CharsetMapping
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
	defaultCharsets?: CharsetMapping[] | false;
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

const defaultCharset = [{ matcher: /^(?:text\/.+|application\/(?:javascript|json))$/, charset: 'UTF-8' }];

/**
 * send-stream storage base class
 */
export abstract class Storage<Reference, AttachedData> {
	readonly mimeModule: MimeModule;
	readonly defaultContentType?: string;
	readonly defaultCharsets: CharsetMapping[] | false;
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
	 * @param start start index
	 * @param end end index
	 * @param autoClose true if stream should close itself
	 * @returns readable stream
	 */
	abstract createReadableStream(
		storageInfo: StorageInfo<AttachedData>,
		start: number,
		end: number,
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
		return millisecondsToUTCString(storageInfo.mtimeMs);
	}

	/**
	 * Create etag header value from storage information (uses mtimeMs, size and contentEncoding)
	 * @param storageInfo storage information
	 * @returns etag header
	 */
	createEtag(storageInfo: StorageInfo<AttachedData>): string | false {
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
		if (method !== 'GET' && method !== 'HEAD') {
			// Method Not Allowed
			// tslint:disable-next-line: no-non-null-assertion
			const statusMessageBuffer = Buffer.from(http.STATUS_CODES[405]!);
			return new StreamResponse<AttachedData>(
				405,
				{
					'Content-Length': String(statusMessageBuffer.byteLength),
					'Content-Type': 'text/plain; charset=UTF-8',
					Allow: 'GET, HEAD'
				},
				new BufferStream(statusMessageBuffer)
			);
		}
		let rangeToUse: Range | (Range | Buffer)[];
		const fullResponse = opts.statusCode !== undefined;
		let statusCode = opts.statusCode !== undefined ? opts.statusCode : 200;
		const responseHeaders: ResponseHeaders = { };
		let earlyClose = false;
		let storageInfo;
		try {
			storageInfo = await this.open(
				reference,
				requestHeaders
			);
		} catch (error) {
			// Not Found
			// tslint:disable-next-line: no-non-null-assertion
			const statusMessageBuffer = Buffer.from(http.STATUS_CODES[404]!);
			return new StreamResponse<AttachedData>(
				404,
				{
					'Content-Length': String(statusMessageBuffer.byteLength),
					'Content-Type': 'text/plain; charset=UTF-8'
				},
				new BufferStream(statusMessageBuffer),
				undefined,
				error instanceof StorageError ? error : new StorageError('unknown_error', 'Unknown error', error)
			);
		}
		try {
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

			if (!fullResponse) {
				if (lastModified) {
					responseHeaders['Last-Modified'] = lastModified;
				}

				if (etag) {
					responseHeaders['ETag'] = etag;
				}

				const freshStatus = getFreshStatus(method, requestHeaders, etag, lastModified);
				switch (freshStatus) {
				case 304:
					earlyClose = true;
					// Not Modified
					return new StreamResponse(
						304,
						responseHeaders,
						new EmptyStream(),
						storageInfo
					);
				case 412:
					earlyClose = true;
					// Precondition Failed
					// tslint:disable-next-line: no-non-null-assertion
					const statusMessageBuffer = Buffer.from(http.STATUS_CODES[412]!);
					return new StreamResponse(
						412,
						{
							...responseHeaders,
							'Content-Type': 'text/plain; charset=UTF-8',
							'Content-Length': String(statusMessageBuffer.byteLength)
						},
						new BufferStream(statusMessageBuffer),
						storageInfo
					);
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

			const maxRanges = this.maxRanges;
			const size = storageInfo.size;
			let contentLength;
			if (maxRanges <= 0 || fullResponse) {
				responseHeaders['Accept-Ranges'] = 'none';
				rangeToUse = { start: 0, end: size - 1 };
				contentLength = size;
			} else {
				responseHeaders['Accept-Ranges'] = 'bytes';
				const rangeHeader = requestHeaders['range'];
				if (
					!rangeHeader
					|| !isRangeFresh(requestHeaders, etag, lastModified)
					|| (method !== 'GET' && method !== 'HEAD')
				) {
					rangeToUse = { start: 0, end: size - 1 };
					contentLength = size;
				} else {
					const parsedRanges = parseRange(size, rangeHeader, { combine: true });
					if (parsedRanges === -1) {
						earlyClose = true;
						// Range Not Satisfiable
						// tslint:disable-next-line: no-non-null-assertion
						const statusMessageBuffer = Buffer.from(http.STATUS_CODES[416]!);
						return new StreamResponse(
							416,
							{
								'Content-Range': contentRange('bytes', size),
								'Content-Type': 'text/plain; charset=UTF-8',
								'Content-Length': String(statusMessageBuffer.byteLength)
							},
							new BufferStream(statusMessageBuffer),
							storageInfo
						);
					}
					if (parsedRanges === -2
						|| parsedRanges.type !== 'bytes'
						|| parsedRanges.length > maxRanges
					) {
						rangeToUse = { start: 0, end: size - 1 };
						contentLength = size;
					} else {
						statusCode = 206;
						if (parsedRanges.length === 1) {
							const singleRange = parsedRanges[0];
							responseHeaders['Content-Range'] = contentRange('bytes', size, singleRange);
							rangeToUse = singleRange;
							contentLength = (singleRange.end + 1) - singleRange.start;
						} else {
							const boundary = `----SendStreamBoundary${(await randomBytes(24)).toString('hex')}`;
							responseHeaders['Content-Type'] = `multipart/byteranges; boundary=${boundary}`;
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
								rangeToUse.push(range);
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

			let stream: Readable;
			if (method === 'HEAD') {
				earlyClose = true;
				stream = new EmptyStream();
			} else if (!Array.isArray(rangeToUse)) {
				if (rangeToUse.end < rangeToUse.start) {
					earlyClose = true;
					stream = new EmptyStream();
				} else {
					stream = this.createReadableStream(storageInfo, rangeToUse.start, rangeToUse.end, true);
				}
			} else {
				const si = storageInfo;
				const rangeStreams = rangeToUse.map(range => {
					if (Buffer.isBuffer(range)) {
						return new BufferStream(range);
					}
					return this.createReadableStream(
						si,
						range.start,
						range.end,
						false
					);
				});
				stream = new MultiStream(rangeStreams, async () => this.close(si));
			}

			// Ok | Partial Content
			return new StreamResponse(
				statusCode,
				responseHeaders,
				stream,
				storageInfo
			);
		} catch (err) {
			earlyClose = true;
			throw err;
		} finally {
			if (earlyClose) {
				await this.close(storageInfo);
			}
		}
	}
}
