
import type * as http from 'http';
import type * as http2 from 'http2';

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

/**
 * StreamResponse.send options
 */
export interface SendOptions {
	/**
	 * Ignore premature close errors
	 *
	 * Defaults to true
	 */
	ignorePrematureClose?: boolean;
}

/**
 * Storage.send options
 */
export type StorageSendOptions = PrepareResponseOptions & SendOptions;

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
	/**
	 * Function used to determine mime type from filename
	 * `lookup` function from `mime-types` module will be used by default
	 */
	mimeTypeLookup?: (filename: string) => string | false;
	/**
	 * Function used to determine default charset from mime type
	 * `charset` function from `mime-types` module will be used by default
	 */
	mimeTypeDefaultCharset?: (type: string) => string | false;
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
	/**
	 * Enable dynamic compression of file content.
	 * This can be a boolean or a list of encodings ordered by priority, `['br', 'gzip']` if `true` is used.
	 * Activating this option will automatically compress content as brotli or gzip
	 * if the content is detected as compressible and supported by the client.
	 *
	 * Note that this is highly recommended to use this option only if you can not use pre-compressed options
	 * like the 'contentEncodingMappings' option from FileSystemStorage.
	 *
	 * Also when dynamic compression is active, `Content-Length` header will be removed
	 * and range requests will be disabled as content length is unknown
	 *
	 * Defaults to `false`
	 */
	dynamicCompression?: boolean | string[];
	/**
	 * Function used to determine if a type is compressible (for dynamic compression only)
	 * `compressible` module will be used by default
	 */
	mimeTypeCompressible?: (type: string) => boolean | undefined;
	/**
	 * Sets the minimum length of a response that will be dynamically compressed (only when the length is known)
	 *
	 * Defaults to 20
	 */
	dynamicCompressionMinLength?: number;
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
	fileName?: string | undefined;
	/**
	 * File last modification time in milliseconds
	 */
	mtimeMs?: number | undefined;
	/**
	 * File size
	 */
	size?: number | undefined;
	/**
	 * Vary header
	 */
	vary?: string | undefined;
	/**
	 * Content encoding (undefined when `identity` is used)
	 */
	contentEncoding?: string | undefined;
	/**
	 * Mime type
	 */
	mimeType?: string | undefined;
	/**
	 * Mime type charset
	 */
	mimeTypeCharset?: string | undefined;
	/**
	 * Last-Modified header
	 */
	lastModified?: string | undefined;
	/**
	 * ETag header
	 */
	etag?: string | undefined;
	/**
	 * Cache-Control header ('public, max-age=0' by default)
	 */
	cacheControl?: string | undefined;
	/**
	 * Content-Disposition header type ('inline' by default)
	 */
	contentDispositionType?: 'inline' | 'attachment' | undefined;
	/**
	 * Content-Disposition header filename (filename by default)
	 */
	contentDispositionFilename?: string | undefined;
}
