/* eslint-disable jsdoc/require-jsdoc */
import { strictEqual, notStrictEqual } from 'node:assert';
import { Readable, pipeline } from 'node:stream';
import { createBrotliDecompress } from 'node:zlib';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';

import type request from 'supertest';
import type { BodyPart } from 'byteranges';
import { parse } from 'byteranges';

export function brotliParser(res: request.Response, cb: (err: Error | null, body: unknown) => void) {
	const readable = new Readable({
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		read() {},
	});

	res.on('data', chunk => {
		readable.push(chunk);
	});
	res.on('error', (err: Error | undefined) => {
		readable.destroy(err);
	});
	res.on('end', () => {
		readable.push(null);
	});

	const decompress = pipeline(readable, createBrotliDecompress(), err => {
		if (!err) {
			return;
		}
		cb(err, null);
	});

	const chunks: Buffer[] = [];
	let length = 0;
	decompress.on('data', (chunk: Buffer | string) => {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		chunks.push(buffer);
		length += buffer.length;
	});
	decompress.on('error', err => {
		cb(err, null);
	});
	decompress.on('end', () => {
		const concatChunks = Buffer.concat(chunks, length);
		cb(null, Buffer.isEncoding(res.charset) ? concatChunks.toString(res.charset) : concatChunks.toString());
	});
}

export function multipartHandler(
	res: request.Response,
	cb: (err: Error | null, body: unknown, files?: unknown) => void,
) {
	const chunks: Buffer[] = [];
	let length = 0;
	res.on('data', (chunk: Buffer | string) => {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		chunks.push(buffer);
		length += buffer.length;
	});
	let end = false;
	res.on('error', (err: Error) => {
		end = true;
		cb(err, null);
	});
	res.on('end', () => {
		end = true;
		const body = Buffer.concat(chunks, length);
		const {
			headers: { 'content-type': contentType },
		} = res;
		const match = /multipart\/byteranges; *boundary=(?<boundary>.+)/iu.exec(contentType);
		if (match === null || !match.groups) {
			cb(new Error(`wrong boundary in content-type: ${ contentType }`), null);
			return;
		}
		const {
			groups: { boundary },
		} = match;
		const parts = parse(body, boundary);
		cb(null, {}, parts);
	});
	res.on('close', () => {
		if (end) {
			return;
		}
		cb(new Error('incomplete data'), null);
	});
}

export function checkMultipartByteRangeString({
	parts,
	index,
	type,
	unit,
	start,
	end,
	length,
	stringValue,
}: {
	parts: BodyPart[];
	index: number;
	type: string;
	unit: string;
	start: number;
	end: number;
	length: number;
	stringValue: string;
}) {
	const { [index]: part } = parts;
	if (part.type !== type) {
		throw new Error(`wrong type for part at index ${ index }: ${ part.type } instead of ${ type }`);
	}
	if (part.range.unit !== unit) {
		throw new Error(`wrong range unit for part at index ${ index }: ${ part.range.unit } instead of ${ unit }`);
	}
	if (part.range.range === '*') {
		throw new Error(`wrong * range for part at index ${ index }`);
	}
	if (part.range.range.start !== start) {
		throw new Error(
			`wrong range start for part at index ${ index }: ${ part.range.range.start } instead of ${ start }`,
		);
	}
	if (part.range.range.end !== end) {
		throw new Error(`wrong range end for part at index ${ index }: ${ part.range.range.end } instead of ${ end }`);
	}
	if (part.range.length !== length) {
		throw new Error(
			`wrong range length for part at index ${ index }: ${ part.range.length } instead of ${ length }`,
		);
	}
	if (part.octets.toString('utf8') !== stringValue) {
		throw new Error(
			`wrong range string content for part at index ${ index }: "${
				part.octets.toString('utf8')
			}" instead of "${ stringValue }"`,
		);
	}
}

export function shouldNotHaveHeader(header: string) {
	return (res: request.Response) => {
		const { [header.toLowerCase()]: value } = <Record<string, string>> res.header;
		strictEqual(
			value,
			undefined,
			`should not have header ${ header } (actual value: "${ value }")`,
		);
	};
}

export function shouldHaveHeader(header: string) {
	return (res: request.Response) => {
		const { [header.toLowerCase()]: value } = <Record<string, string>> res.header;
		notStrictEqual(
			value,
			undefined,
			`should not have header ${ header } (actual value: "${ value }")`,
		);
	};
}

class RawTestImpl implements PromiseLike<void> {
	promise: Promise<void>;
	tests: { statusOrHeader: string | number; headerValue: string | undefined }[] = [];
	constructor(appObj: Server, method: 'HEAD' | 'GET', path: string) {
		this.promise = new Promise((resolve, reject) => {
			const address = appObj.address();
			if (typeof address === 'string' || !address) {
				reject(new TypeError(`unexpected type for address: ${ address }`));
				return;
			}
			const req = httpRequest({
				method,
				host: '127.0.0.1',
				port: address.port,
				path,
			}, response => {
				response.on('data', _data => {
					// noop
				});
				response.on('error', err => {
					reject(err);
				});
				response.on('end', () => {
					for (const test of this.tests) {
						if (typeof test.statusOrHeader === 'string' && test.headerValue !== undefined) {
							const statusOrHeader = test.statusOrHeader.toLocaleLowerCase();
							if (response.headers[statusOrHeader] !== test.headerValue) {
								reject(new Error(`unexpected ${
									statusOrHeader
								} header value ${
									String(response.headers[statusOrHeader])
								} instead of ${
									test.headerValue
								}`));
								return;
							}
						} else if (response.statusCode !== test.statusOrHeader) {
							reject(new Error(`unexpected response code ${
								response.statusCode
							} instead of ${
								test.statusOrHeader
							}`));
							return;
						}
					}
					resolve();
				});
			});
			req.on('error', err => {
				reject(err);
			});
			req.end();
		});
	}

	// eslint-disable-next-line unicorn/no-thenable, @typescript-eslint/promise-function-async
	then<TResult1 = void, TResult2 = never>(
		// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
		onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.promise.then(onfulfilled, onrejected);
	}

	expect(statusOrHeader: string | number, headerValue?: string) {
		this.tests.push({ statusOrHeader, headerValue });
		return this;
	}
}

export function rawRequest(appObj: Server) {
	return {
		get(path: string) {
			return new RawTestImpl(appObj, 'GET', path);
		},
		head(path: string) {
			return new RawTestImpl(appObj, 'HEAD', path);
		},
	};
}
