import * as crypto from 'crypto';
import { promisify } from 'util';

/**
 * Request headers
 */
export interface RequestHeaders {
	'accept-encoding'?: string;
	'if-match'?: string;
	'if-none-match'?: string;
	'if-modified-since'?: string;
	'if-unmodified-since'?: string;
	'range'?: string;
	'if-range'?: string;
	[header: string]: string | string[] | undefined;
}

/**
 * Response headers
 */
export interface ResponseHeaders {
	'Content-Encoding'?: string;
	'Last-Modified'?: string;
	'Cache-Control'?: string;
	'Content-Type'?: string;
	'ETag'?: string;
	'Accept-Ranges'?: string;
	'Content-Range'?: string;
	'Content-Length'?: string;
	'Vary'?: string;
	'Content-Disposition'?: string;
	'Allow'?: string;
	[header: string]: string | string[] | undefined;
}

/**
 * Range
 */
export interface Range {
	/**
	 * start index
	 */
	start: number;
	/**
	 * end index
	 */
	end: number;
}

/**
 * Random bytes function returing promise
 */
export const randomBytes = promisify(crypto.randomBytes);

/**
 * Charset mapping
 */
export interface CharsetMapping {
	/**
	 * Regexp pattern used to match content type
	 */
	matcher: RegExp;
	/**
	 * Charset to use with the matched content type
	 */
	charset: string;
}

/**
 * Retrieve content-type with mapped charset added
 * @param contentType content type
 * @param charsetMappings charset mapping
 * @returns content type with charset
 */
export function getContentTypeWithCharset(contentType: string, charsetMappings: CharsetMapping[]) {
	for (const { matcher, charset } of charsetMappings) {
		if (matcher.test(contentType)) {
			return `${ contentType }; charset=${ charset }`;
		}
	}
	return contentType;
}

/**
 * Transform stats to etag
 * @param size file size
 * @param mtimeMs modification time in milliseconds
 * @param contentEncoding content encoding
 * @param weak generate weak etag
 * @returns etag
 */
export function statsToEtag(size: number, mtimeMs: number, contentEncoding?: string, weak = false) {
	const encoding = contentEncoding !== 'identity'
		? `-${ contentEncoding }`
		: '';
	return `${
		weak ? 'W/' : ''
	}"${
		size.toString(16)
	}-${
		Math.floor(mtimeMs * 1000).toString(16)
	}${
		encoding
	}"`;
}

/**
 * Convert milliseconds to utc string
 * @param timeMs time in milliseconds
 * @returns utc string
 */
export function millisecondsToUTCString(timeMs: number) {
	return new Date(timeMs).toUTCString();
}

/**
 * Check if range is fresh
 * @param requestHeaders request headers
 * @param responseHeaders response headers
 * @returns true if range fresh
 */
export function isRangeFresh(requestHeaders: RequestHeaders, responseHeaders: ResponseHeaders) {
	const ifRange = requestHeaders['if-range'];

	if (!ifRange) {
		return true;
	}

	// If-Range as etag
	if (isStrongEtag(ifRange)) {
		return responseHeaders['ETag'] ? ifRange === responseHeaders['ETag'] : false;
	}

	// If-Range as modified date
	const lastModified = responseHeaders['Last-Modified'];
	if (!lastModified) {
		return false;
	}
	const parsedLastModified = Date.parse(lastModified);
	return parsedLastModified === Date.parse(ifRange) && Date.now() >= parsedLastModified + (60 * 1000);
}

/**
 * Format content-range header
 * @param rangeType type of range
 * @param size total size
 * @param range range to use (empty = *)
 * @returns content-range header
 */
export function contentRange(rangeType: string, size: number, range?: Range) {
	const rangeStr = range ? `${range.start}-${range.end}` : '*';
	return `${rangeType} ${rangeStr}/${size}`;
}

/**
 * Test if etag is weak
 * @param etag etag
 * @returns true if weak
 */
function isWeakEtag(etag: string) {
	return etag.startsWith('W/"');
}

/**
 * Test if etag is strong
 * @param etag etag
 * @returns true if strong
 */
function isStrongEtag(etag: string) {
	return etag.startsWith('"');
}

/**
 * Get opaque etag (remove weak part)
 * @param etag etag
 * @returns opaque etag
 */
function opaqueEtag(etag: string) {
	if (isWeakEtag(etag)) {
		return etag.substring(2);
	}

	return etag;
}

/**
 * Compare etag with weak validation
 * @param a etag a
 * @param b etag b
 * @returns true if match
 */
function weakEtagMatch(a: string, b: string) {
	return opaqueEtag(a) === opaqueEtag(b);
}

/**
 * Compare etag with strong validation
 * @param a etag a
 * @param b etag b
 * @returns true if match
 */
function strongEtagMatch(a: string, b: string) {
	return isStrongEtag(a) && isStrongEtag(b) && a === b;
}

/**
 * Parse multiple value header
 * @param header header to parse
 * @returns splitted headers
 */
function parseMultiValueHeader(header: string) {
	const splitted = header.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '').split(/[ \t]*,[ \t]*/);
	while (splitted.length > 0 && splitted[0] === '') {
		splitted.shift();
	}
	return splitted;
}

const defaultAcceptedContentEncoding = ['identity'];

/**
 * Get accepted content encodings
 * @param requestHeaders request headers
 * @param preferences order of preference
 * @returns accepted content encodings
 */
export function acceptEncodings(requestHeaders: RequestHeaders, preferences: string[]) {
	const acceptEncoding = requestHeaders['accept-encoding'];
	if (acceptEncoding === undefined) {
		return defaultAcceptedContentEncoding;
	}
	const values = parseMultiValueHeader(acceptEncoding);
	if (values.length === 0) {
		return defaultAcceptedContentEncoding;
	}
	const result: { encoding: string; weight: number }[] = [];
	for (const value of values) {
		const match = value.match(
			/^([-!#$%&'*+.^_`|~A-Za-z0-9]+)(?:[ \t]*;[ \t]*q=(0(?:\.\d{1,3})?|1(?:\.0{1,3})?))?$/
		);
		if (!match) {
			return defaultAcceptedContentEncoding;
		}
		const [, rawEncoding, weightOption] = match;
		let encoding = rawEncoding.toLowerCase();
		if (encoding === 'x-gzip') {
			encoding = 'gzip';
		} else if (encoding === 'x-compress') {
			encoding = 'compress';
		}
		const weight = weightOption ? Number(weightOption) : 1;
		if (
			(weight !== 0 || encoding === 'identity')
			&& (
				preferences.includes(encoding)
				|| encoding === '*'
			)
			&& result.find(v => v.encoding === encoding) === undefined
		) {
			result.push({ encoding, weight });
		}
	}
	if (result.length === 0) {
		return defaultAcceptedContentEncoding;
	}
	const indexOfAsterisk = result.findIndex(v => v.encoding === '*');
	if (indexOfAsterisk !== -1) {
		const asteriskVal = result[indexOfAsterisk];
		result.splice(
			indexOfAsterisk,
			1,
			...preferences
				.filter(p => result.find(v => v.encoding === p) === undefined)
				.map(p => ({ encoding: p, weight: asteriskVal.weight }))
		);
	}

	result.sort((a, b) => {
		let diff = b.weight - a.weight;
		if (diff === 0) {
			diff = preferences.indexOf(a.encoding) - preferences.indexOf(b.encoding);
		}
		return diff;
	});

	return result.map(v => v.encoding);
}

/**
 * Get fresh status (ETag, Last-Modified handling)
 * @param method http method
 * @param requestHeaders request headers
 * @param responseHeaders response headers
 * @returns status code
 */
export function getFreshStatus(
	method: string,
	requestHeaders: RequestHeaders,
	responseHeaders: ResponseHeaders
) {
	const ifMatch = requestHeaders['if-match'];
	const ifNoneMatch = requestHeaders['if-none-match'];
	const ifModifiedSince = requestHeaders['if-modified-since'];
	const ifUnmodifiedSince = requestHeaders['if-unmodified-since'];
	const etag = responseHeaders['ETag'];
	const lastModified = responseHeaders['Last-Modified'];
	if (ifMatch) {
		if (
			!etag
			|| (
				ifMatch !== '*'
				&& parseMultiValueHeader(ifMatch)
					.find(ifMatchEtag => strongEtagMatch(ifMatchEtag, etag)) === undefined
			)
		) {
			return 412;
		}
	} else if (ifUnmodifiedSince && lastModified && Date.parse(lastModified) > Date.parse(ifUnmodifiedSince)) {
		return 412;
	}
	if (ifNoneMatch) {
		if (
			etag
			&& (
				ifNoneMatch === '*'
				|| parseMultiValueHeader(ifNoneMatch)
					.find(ifMatchEtag => weakEtagMatch(ifMatchEtag, etag)) !== undefined
			)
		) {
			return method === 'GET' || method === 'HEAD'
				? 304
				: 412;
		}
	} else if (ifModifiedSince
		&& (method === 'GET' || method === 'HEAD')
		&& lastModified
		&& Date.parse(lastModified) <= Date.parse(ifModifiedSince)
	) {
		return 304;
	}

	return 200;
}
