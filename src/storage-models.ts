
import * as http from 'http';
import * as http2 from 'http2';

/**
 * Charset mapping
 */
export interface CharsetMapping {
	/**
	 * Regexp pattern used to match content type
	 */
	matcher: RegExp | string;
	/**
	 * Charset to use with the matched content type
	 */
	charset: string;
}

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
	 * Custom mime type for content-type header, overrides storage value
	 *
	 * `false` to remove header
	 */
	mimeType?: string | false;
	/**
	 * Custom mime type charset value, overrides storage value
	 *
	 * `false` to remove charset
	 */
	mimeTypeCharset?: string | false;
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

interface AcceptEncodingHeader {
	'accept-encoding'?: string;
}

/**
 * Request headers
 */
export type StorageRequestHeaders = (http.IncomingHttpHeaders | http2.IncomingHttpHeaders) & AcceptEncodingHeader;

/**
 * Storage options
 */
export interface StorageOptions {
	mimeTypesLookup?: (type: string) => string | false;
	mimeTypesCharset?: (type: string) => string | false;
	/**
	 * Default content type, e.g. "application/octet-stream"
	 */
	defaultMimeType?: string;
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

/**
 * Storage information
 */

export interface StorageInfo<AttachedData> {
	/**
	 * Attached data (depends on storage)
	 */
	attachedData: AttachedData;
	/**
	 * File name
	 */
	fileName?: string;
	/**
	 * File last modification time in milliseconds
	 */
	mtimeMs?: number;
	/**
	 * File size
	 */
	size?: number;
	/**
	 * Vary header
	 */
	vary?: string;
	/**
	 * Content encoding
	 */
	contentEncoding?: string;
	/**
	 * Mime type
	 */
	mimeType?: string;
	/**
	 * Mime type charset
	 */
	mimeTypeCharset?: string;
	/**
	 * Last-Modified header
	 */
	lastModified?: string;
	/**
	 * ETag header
	 */
	etag?: string;
}

/**
 * Storage error
 */
export class StorageError<T> extends Error {
	/**
	 * Storage reference
	 */
	readonly reference: T;

	/**
	 * Create a storage error
	 *
	 * @param message - error message
	 * @param reference - error storage reference
	 */
	constructor(message: string, reference: T) {
		super(message);
		this.name = 'StorageError';
		this.reference = reference;
	}
}
