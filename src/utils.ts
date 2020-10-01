import { randomBytes as cryptoRandomBytes } from 'crypto';
import { promisify } from 'util';

/**
 * Request headers
 */
export interface RequestHeaders {
	[header: string]: string | string[] | undefined;
	'accept-encoding'?: string;
	'if-match'?: string;
	'if-none-match'?: string;
	'if-modified-since'?: string;
	'if-unmodified-since'?: string;
	'range'?: string;
	'if-range'?: string;
}

/**
 * Response headers
 */
export interface ResponseHeaders {
	[header: string]: string | string[] | undefined;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Content-Encoding'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Last-Modified'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Cache-Control'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Content-Type'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'ETag'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Accept-Ranges'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Content-Range'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Content-Length'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Vary'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Content-Disposition'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'Allow'?: string;
}

/**
 * Range
 */
export class StreamRange {
	/**
	 * StreamRange constructor
	 *
	 * @param start - start index
	 * @param end - end index
	 */
	constructor(
		readonly start: number,
		readonly end: number,
	) {}
}

export type BufferOrStreamRange = StreamRange | Uint8Array;

/**
 * Random bytes function returing promise
 */
export const randomBytes = promisify(cryptoRandomBytes);

/**
 * Transform stats to etag
 *
 * @param size - file size
 * @param mtimeMs - modification time in milliseconds
 * @param contentEncoding - content encoding
 * @param weak - generate weak etag
 * @returns etag
 */
export function statsToEtag(size: number, mtimeMs: number, contentEncoding?: string, weak?: boolean) {
	const suffix = contentEncoding ? `-${ contentEncoding }` : '';
	return `${
		weak ? 'W/' : ''
	}"${
		size.toString(16)
	}-${
		Math.floor(mtimeMs * 1000).toString(16)
	}${
		suffix
	}"`;
}

/**
 * Convert milliseconds to utc string
 *
 * @param timeMs - time in milliseconds
 * @returns utc string
 */
export function millisecondsToUTCString(timeMs: number) {
	return new Date(timeMs).toUTCString();
}

/**
 * Test if etag is weak
 *
 * @param etag - etag
 * @returns true if weak
 */
function isWeakEtag(etag: string) {
	return etag.startsWith('W/"');
}

/**
 * Test if etag is strong
 *
 * @param etag - etag
 * @returns true if strong
 */
function isStrongEtag(etag: string) {
	return etag.startsWith('"');
}

/**
 * Get opaque etag (remove weak part)
 *
 * @param etag - etag
 * @returns opaque etag
 */
function opaqueEtag(etag: string) {
	if (isWeakEtag(etag)) {
		return etag.slice(2);
	}

	return etag;
}

/**
 * Compare etag with weak validation
 *
 * @param a - etag a
 * @param b - etag b
 * @returns true if match
 */
function weakEtagMatch(a: string, b: string) {
	return opaqueEtag(a) === opaqueEtag(b);
}

/**
 * Compare etag with strong validation
 *
 * @param a - etag a
 * @param b - etag b
 * @returns true if match
 */
function strongEtagMatch(a: string, b: string) {
	return isStrongEtag(a) && isStrongEtag(b) && a === b;
}

/**
 * Check if range is fresh
 *
 * @param requestHeaders - request headers
 * @param etag - etag response header
 * @param lastModified - last modified response header
 * @returns true if range fresh
 */
export function isRangeFresh(
	requestHeaders: RequestHeaders,
	etag: string | false,
	lastModified: string | false,
) {
	const { 'if-range': ifRange } = requestHeaders;

	if (!ifRange) {
		return true;
	}

	// If-Range as etag
	if (isStrongEtag(ifRange)) {
		return etag ? ifRange === etag : false;
	}

	// If-Range as modified date
	if (!lastModified) {
		return false;
	}
	const parsedLastModified = Date.parse(lastModified);
	return parsedLastModified === Date.parse(ifRange);
}

/**
 * Format content-range header
 *
 * @param rangeType - type of range
 * @param size - total size
 * @param range - range to use (empty = *)
 * @returns content-range header
 */
export function contentRange(rangeType: string, size: number, range?: StreamRange) {
	const rangeStr = range ? `${ range.start }-${ range.end }` : '*';
	return `${ rangeType } ${ rangeStr }/${ size }`;
}

/**
 * Parse multiple value header
 *
 * @param header - header to parse
 * @returns splitted headers
 */
function parseMultiValueHeader(header: string) {
	const splitted = header
		.replace(/^[ \t]+|(?<![ \t])[ \t]+$/gu, '')
		.split(/[ \t]*,[ \t]*/u);
	while (splitted.length > 0 && splitted[0] === '') {
		splitted.shift();
	}
	return splitted;
}

/**
 * Get accepted content encodings
 *
 * @param acceptEncoding - Accept-Encoding header value
 * @param encodingPreferences - order of preference
 * @param identityEncodingPreference - identity encoding preference
 * @returns accepted content encodings
 */
export function acceptEncodings<T extends { order: number }>(
	acceptEncoding: string | undefined,
	encodingPreferences: ReadonlyMap<string, T>,
	identityEncodingPreference: T,
): readonly (readonly [string, T])[] {
	if (!acceptEncoding) {
		return [['identity', identityEncodingPreference]];
	}
	const values = parseMultiValueHeader(acceptEncoding);
	if (values.length === 0) {
		return [['identity', identityEncodingPreference]];
	}
	const result = new Map<string, T & { weight: number }>();
	for (const value of values) {
		// eslint-disable-next-line max-len
		const match = /^(?<rawEncoding>[-!#$%&'*+.^_`|~A-Za-z0-9]+)(?:[ \t]*;[ \t]*q=(?<weightOption>0(?:\.\d{1,3})?|1(?:\.0{1,3})?))?$/u
			.exec(value);
		if (!match || !match.groups) {
			return [['identity', identityEncodingPreference]];
		}
		const { groups: { rawEncoding, weightOption } } = match;
		let encoding = rawEncoding.toLowerCase();
		if (encoding === 'x-gzip') {
			encoding = 'gzip';
		} else if (encoding === 'x-compress') {
			encoding = 'compress';
		}
		const weight = weightOption ? Number(weightOption) : 1;
		if (encoding === '*') {
			for (const [prefEnc, pref] of encodingPreferences) {
				if (!result.has(prefEnc)) {
					result.set(prefEnc, { ...pref, weight });
				}
			}
		} else {
			const pref = encodingPreferences.get(encoding);
			if (pref) {
				result.set(encoding, { ...pref, weight });
			}
		}
	}
	if (result.size === 0) {
		return [['identity', identityEncodingPreference]];
	}
	const identity = result.get('identity');
	if (identity === undefined) {
		result.set('identity', { ...identityEncodingPreference, weight: -1 });
	}

	const resultEntries = [...result.entries()].filter(([, { weight }]) => weight !== 0);
	resultEntries.sort(([, { weight: aWeight, order: aOrder }], [, { weight: bWeight, order: bOrder }]) => {
		let diff = bWeight - aWeight;
		if (diff === 0) {
			diff = aOrder - bOrder;
		}
		return diff;
	});

	return resultEntries;
}

/**
 * Get fresh status (ETag, Last-Modified handling)
 *
 * @param isGetOrHead - http method is GET or HEAD
 * @param requestHeaders - request headers
 * @param etag - etag response header
 * @param lastModified - last modified response header
 * @returns status code
 */
export function getFreshStatus(
	isGetOrHead: boolean,
	requestHeaders: RequestHeaders,
	etag: string | false,
	lastModified: string | false,
) {
	const {
		'if-match': ifMatch,
		'if-none-match': ifNoneMatch,
		'if-modified-since': ifModifiedSince,
		'if-unmodified-since': ifUnmodifiedSince,
	} = requestHeaders;
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
	} else if (
		ifUnmodifiedSince
		&& lastModified
		&& Date.parse(lastModified) > Date.parse(ifUnmodifiedSince)
	) {
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
			return isGetOrHead
				? 304
				: 412;
		}
	} else if (
		ifModifiedSince
		&& lastModified
		&& Date.parse(lastModified) <= Date.parse(ifModifiedSince)
		&& isGetOrHead
	) {
		return 304;
	}

	return 200;
}
