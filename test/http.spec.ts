/* eslint-disable max-classes-per-file */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable max-lines, max-lines-per-function */
/* eslint-disable sonarjs/no-identical-functions */
/* eslint-env node, mocha */

import { fail, notStrictEqual, ok, strictEqual } from 'node:assert';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { Http2Server, ServerHttp2Session } from 'node:http2';
import { connect as http2Connect, createServer as http2CreateServer } from 'node:http2';
import { normalize, join } from 'node:path';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';

import request from 'supertest';
import type { BodyPart } from 'byteranges';

import type {
	FileSystemStorageOptions,
	PrepareResponseOptions,
	StorageInfo,
	FileData,
	StreamRange,
	FilePath,
	StorageRequestHeaders,
	StreamResponse,
} from '../src/send-stream';
import { FileSystemStorage, getFreshStatus } from '../src/send-stream';

import {
	checkMultipartByteRangeString,
	multipartHandler,
	rawRequest,
	shouldHaveHeader,
	shouldNotHaveHeader,
} from './utils';

async function createAndListenServer(fn: (req: IncomingMessage, res: ServerResponse) => void) {
	const app = createServer(fn);
	app.listen();
	await once(app, 'listening');
	return app;
}

describe('http', () => {
	// test server

	const dateRegExp = /^\w{3}, \d+ \w+ \d+ \d+:\d+:\d+ \w+$/u;
	const fixtures = join(__dirname, 'fixtures-http');

	let lastResult: StreamResponse<unknown> | true | undefined;

	async function createTestServer(opts: PrepareResponseOptions & FileSystemStorageOptions & { root: string }) {
		const storage = new FileSystemStorage(opts.root, opts);
		return createAndListenServer((req, res) => {
			(async () => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const response = await storage.prepareResponse(req.url!, req, opts);
				lastResult = response;
				if (response.error) {
					response.headers['X-Send-Stream-Error'] = response.error.name;
				}
				await response.send(res);
			})().catch((err: unknown) => {
				res.statusCode = 500;
				console.error(err);
				if (!res.writableEnded) {
					res.end('Internal Error');
				}
			});
		});
	}

	// eslint-disable-next-line sonarjs/no-reference-error
	afterEach('destroy check', function destroyCheck(this: Mocha.Context) {
		if (this.currentTest?.state === 'passed') {
			notStrictEqual(lastResult, undefined, 'missing last result');
			if (lastResult && lastResult !== true) {
				strictEqual(lastResult.stream.destroyed, true, 'last result not destroyed');
			}
		}
		lastResult = undefined;
	});

	describe('prepare response and send', () => {
		let app: Server;
		before(async () => {
			const storage = new FileSystemStorage(fixtures);
			app = await createAndListenServer((req, res) => {
				(async () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const response = await storage.prepareResponse(req.url!, req);
					lastResult = response;
					if (response.error) {
						response.headers['X-Send-Stream-Error'] = response.error.name;
					}
					await response.send(res);
				})().catch((err: unknown) => {
					res.statusCode = 500;
					console.error(err);
					if (!res.writableEnded) {
						res.end('Internal Error');
					}
				});
			});
		});
		after(done => {
			app.close(done);
		});

		it('should stream the file contents', async () => {
			await request(app)
				.get('/name.txt')
				.expect('Content-Length', '4')
				.expect(200, 'tobi');
		});

		it('should stream the file contents when there is query string', async () => {
			await request(app)
				.get('/name.txt?foo=bar')
				.expect('Content-Length', '4')
				.expect(200, 'tobi');
		});

		it('should stream a zero-length file', async () => {
			await request(app)
				.get('/empty.txt')
				.expect('Content-Length', '0')
				.expect(200, '');
		});

		it('should decode the given path as a URI', async () => {
			await request(app)
				.get('/some%20thing.txt')
				.expect(200, 'hey');
		});

		it('should serve files with dots in name', async () => {
			await request(app)
				.get('/do..ts.txt')
				.expect(200, '...');
		});

		it('should serve files with unicode character', async () => {
			await request(app)
				.get('/%E2%AD%90.txt')
				.expect('Content-Disposition', 'inline; filename="?.txt"; filename*=UTF-8\'\'%E2%AD%90.txt')
				.expect(200, '⭐');
		});

		it('should serve files in folder with unicode character', async () => {
			await request(app)
				.get('/snow%20%E2%98%83/index.html')
				.expect(200);
		});

		it('should treat a malformed URI as a bad request', async () => {
			await request(app)
				.get('/some%99thing.txt')
				.expect('X-Send-Stream-Error', 'MalformedPathError')
				.expect(404);
		});

		it('should 404 on NULL bytes', async () => {
			await request(app)
				.get('/some%00thing.txt')
				.expect('X-Send-Stream-Error', 'ForbiddenCharacterError')
				.expect(404);
		});

		it('should treat an ENAMETOOLONG as a 404', async () => {
			const path = Array.from({ length: 1000 }).join('foobar');
			await request(app)
				.get(`/${ path }`)
				.expect('X-Send-Stream-Error', 'DoesNotExistError')
				.expect(404);
		});

		it('should support HEAD', async () => {
			await request(app)
				.head('/name.txt')
				.expect(200)
				.expect('Content-Length', '4')
				.expect(res => {
					ok((<string | undefined> res.text) === undefined, 'should not have body');
				});
		});

		it('should add a strong ETag header field', async () => {
			await request(app)
				.get('/name.txt')
				.expect('etag', /^"[^"]+"$/u);
		});

		it('should add a Date header field', async () => {
			await request(app)
				.get('/name.txt')
				.expect('date', dateRegExp);
		});

		it('should add a Last-Modified header field', async () => {
			await request(app)
				.get('/name.txt')
				.expect('last-modified', dateRegExp);
		});

		it('should add a Accept-Ranges header field', async () => {
			await request(app)
				.get('/name.txt')
				.expect('Accept-Ranges', 'bytes');
		});

		it('should 404 if the file does not exist', async () => {
			await request(app)
				.get('/meow')
				.expect('X-Send-Stream-Error', 'DoesNotExistError')
				.expect(404);
		});

		it('should 404 if the file does not exist (HEAD)', async () => {
			await request(app)
				.head('/meow')
				.expect('X-Send-Stream-Error', 'DoesNotExistError')
				.expect(404);
		});

		it('should set Content-Type via mime map', async () => {
			await request(app)
				.get('/name.txt')
				.expect('Content-Type', 'text/plain; charset=UTF-8')
				.expect(200);
			await request(app)
				.get('/tobi.html')
				.expect('Content-Type', 'text/html; charset=UTF-8')
				.expect(200);
		});

		describe('with conditional-GET', () => {
			describe('should remove Content headers with 304', () => {
				it('should remove Content headers with 304', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					await request(app)
						.get('/name.txt')
						.set('If-None-Match', (<Record<string, string>> res.header).etag)
						.expect(shouldNotHaveHeader('Content-Length'))
						.expect(shouldNotHaveHeader('Content-Type'))
						.expect(304);
				});
			});

			describe('where "If-Match" is set', () => {
				it('should respond with 200 when "*"', async () => {
					await request(app)
						.get('/name.txt')
						.set('If-Match', '*')
						.expect(200);
				});

				it('should respond with 412 when ETag unmatched', async () => {
					await request(app)
						.get('/name.txt')
						.set('If-Match', ' "foo", "bar" ')
						.expect('X-Send-Stream-Error', 'PreconditionFailedStorageError')
						.expect(412);
				});

				it('should respond with 412 when ETag unmatched (HEAD)', async () => {
					await request(app)
						.head('/name.txt')
						.set('If-Match', ' "foo", "bar" ')
						.expect('X-Send-Stream-Error', 'PreconditionFailedStorageError')
						.expect(412);
				});

				it('should respond with 200 when strong ETag matched', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					await request(app)
						.get('/name.txt')
						.set('If-Match', `"foo", "bar", ${ (<Record<string, string>> res.header).etag }`)
						.expect(200);
				});
			});

			describe('where "If-Modified-Since" is set', () => {
				it('should respond with 304 when unmodified', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					await request(app)
						.get('/name.txt')
						.set('If-Modified-Since', (<Record<string, string>> res.header)['last-modified'])
						.expect(304);
				});

				it('should respond with 200 when modified', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					const lmod = Date.parse((<Record<string, string>> res.header)['last-modified']);
					const date = new Date(lmod - 60_000);
					await request(app)
						.get('/name.txt')
						.set('If-Modified-Since', date.toUTCString())
						.expect(200, 'tobi');
				});
			});

			describe('where "If-None-Match" is set', () => {
				it('should respond with 304 when ETag matched', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					await request(app)
						.get('/name.txt')
						.set('If-None-Match', (<Record<string, string>> res.header).etag)
						.expect(304);
				});

				it('should respond with 200 when ETag unmatched', async () => {
					await request(app)
						.get('/name.txt')
						.set('If-None-Match', '"123"')
						.expect(200, 'tobi');
				});

				it('should respond with 412 when ETag matched on not GET or HEAD', done => {
					lastResult = true;
					strictEqual(getFreshStatus(false, { 'if-none-match': '"123"' }, '"123"', false), 412);
					done();
				});
			});

			describe('where "If-Unmodified-Since" is set', () => {
				it('should respond with 200 when unmodified', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					await request(app)
						.get('/name.txt')
						.set('If-Unmodified-Since', (<Record<string, string>> res.header)['last-modified'])
						.expect(200);
				});

				it('should respond with 412 when modified', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					const lmod = Date.parse((<Record<string, string>> res.header)['last-modified']);
					const date = new Date(lmod - 60_000).toUTCString();
					await request(app)
						.get('/name.txt')
						.set('If-Unmodified-Since', date)
						.expect('X-Send-Stream-Error', 'PreconditionFailedStorageError')
						.expect(412);
				});

				it('should respond with 200 when invalid date', async () => {
					await request(app)
						.get('/name.txt')
						.set('If-Unmodified-Since', 'foo')
						.expect(200);
				});
			});
		});

		describe('with Range request', () => {
			it('should support byte ranges', async () => {
				await request(app)
					.get('/nums.txt')
					.set('Range', 'bytes=0-4')
					.expect(206, '12345');
			});

			it('should ignore non-byte ranges', async () => {
				await request(app)
					.get('/nums.txt')
					.set('Range', 'items=0-4')
					.expect(200, '123456789');
			});

			it('should be inclusive', async () => {
				await request(app)
					.get('/nums.txt')
					.set('Range', 'bytes=0-0')
					.expect(206, '1');
			});

			it('should set Content-Range', async () => {
				await request(app)
					.get('/nums.txt')
					.set('Range', 'bytes=2-5')
					.expect('Content-Range', 'bytes 2-5/9')
					.expect(206);
			});

			it('should support -n', async () => {
				await request(app)
					.get('/nums.txt')
					.set('Range', 'bytes=-3')
					.expect(206, '789');
			});

			it('should support n-', async () => {
				await request(app)
					.get('/nums.txt')
					.set('Range', 'bytes=3-')
					.expect(206, '456789');
			});

			it('should respond with 206 "Partial Content"', async () => {
				await request(app)
					.get('/nums.txt')
					.set('Range', 'bytes=0-4')
					.expect(206);
			});

			it('should set Content-Length to the # of octets transferred', async () => {
				await request(app)
					.get('/nums.txt')
					.set('Range', 'bytes=2-3')
					.expect('Content-Length', '2')
					.expect(206, '34');
			});

			describe('when last-byte-pos of the range is greater the length', () => {
				it('is taken to be equal to one less than the length', async () => {
					await request(app)
						.get('/nums.txt')
						.set('Range', 'bytes=2-50')
						.expect('Content-Range', 'bytes 2-8/9')
						.expect(206);
				});

				it('should adapt the Content-Length accordingly', async () => {
					await request(app)
						.get('/nums.txt')
						.set('Range', 'bytes=2-50')
						.expect('Content-Length', '7')
						.expect(206);
				});
			});

			describe('when the first- byte-pos of the range is greater length', () => {
				it('should respond with 416', async () => {
					await request(app)
						.get('/nums.txt')
						.set('Range', 'bytes=9-50')
						.expect('Content-Range', 'bytes */9')
						.expect('X-Send-Stream-Error', 'RangeNotSatisfiableStorageError')
						.expect(416);
				});

				it('should respond with 416 for head request', async () => {
					await request(app)
						.head('/nums.txt')
						.set('Range', 'bytes=9-50')
						.expect('Content-Range', 'bytes */9')
						.expect('X-Send-Stream-Error', 'RangeNotSatisfiableStorageError')
						.expect(416);
				});
			});

			describe('when syntactically invalid', () => {
				it('should respond with 200 and the entire contents', async () => {
					await request(app)
						.get('/nums.txt')
						.set('Range', 'asdf')
						.expect(200, '123456789');
				});
			});

			describe('when multiple ranges', () => {
				it('should respond with 206 with the multiple parts', async () => {
					await request(app)
						.get('/nums.txt')
						.set('Range', 'bytes=1-1,3-')
						.expect(shouldNotHaveHeader('Content-Range'))
						.expect('Content-Type', /^multipart\/byteranges/u)
						.parse(multipartHandler)
						.expect(res => {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
							const parts = <BodyPart[]>res.files;
							checkMultipartByteRangeString({
								parts,
								index: 0,
								type: 'text/plain; charset=UTF-8',
								unit: 'bytes',
								start: 1,
								end: 1,
								length: 9,
								stringValue: '2',
							});
							checkMultipartByteRangeString({
								parts,
								index: 1,
								type: 'text/plain; charset=UTF-8',
								unit: 'bytes',
								start: 3,
								end: 8,
								length: 9,
								stringValue: '456789',
							});
						});
				});

				it('should respond with 206 if all ranges can be combined', async () => {
					await request(app)
						.get('/nums.txt')
						.set('Range', 'bytes=1-2,3-5')
						.expect('Content-Type', /^text\/plain/u)
						.expect('Content-Range', 'bytes 1-5/9')
						.expect(206, '23456');
				});
			});

			describe('when if-range present', () => {
				it('should respond with parts when strong etag unchanged', async () => {
					const res = await request(app)
						.get('/nums.txt')
						.expect(200);
					const { etag } = <Record<string, string>> res.header;

					await request(app)
						.get('/nums.txt')
						.set('If-Range', etag)
						.set('Range', 'bytes=0-0')
						.expect(206, '1');
				});

				it('should respond with 200 when etag changed', async () => {
					const res = await request(app)
						.get('/nums.txt')
						.expect(200);
					const etag = (<Record<string, string>> res.header).etag.replace(/"(?<c>.)/u, '"0$<c>');

					await request(app)
						.get('/nums.txt')
						.set('If-Range', etag)
						.set('Range', 'bytes=0-0')
						.expect(200, '123456789');
				});

				it('should respond with parts when modified unchanged', async () => {
					const res = await request(app)
						.get('/nums.txt')
						.expect(200);
					const { 'last-modified': modified } = <Record<string, string>> res.header;

					await request(app)
						.get('/nums.txt')
						.set('If-Range', modified)
						.set('Range', 'bytes=0-0')
						.expect(206, '1');
				});

				it('should respond with 200 when modified changed', async () => {
					const res = await request(app)
						.get('/nums.txt')
						.expect(200);
					const modified = Date.parse((<Record<string, string>> res.header)['last-modified']) - 20_000;

					await request(app)
						.get('/nums.txt')
						.set('If-Range', new Date(modified).toUTCString())
						.set('Range', 'bytes=0-0')
						.expect(200, '123456789');
				});

				it('should respond with 200 when invalid value', async () => {
					await request(app)
						.get('/nums.txt')
						.set('If-Range', 'foo')
						.set('Range', 'bytes=0-0')
						.expect(200, '123456789');
				});
			});
		});

		describe('max-age', () => {
			it('should default to 0', async () => {
				await request(app)
					.get('/name.txt')
					.expect('Cache-Control', 'public, max-age=0');
			});
		});

		describe('relative paths', () => {
			it('should 404 on relative path', async () => {
				await rawRequest(app)
					.get('/pets/../name.txt')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});

			it('should 404 on relative path on head', async () => {
				await rawRequest(app)
					.head('/pets/../name.txt')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});

			it('should 404 on relative path with query params', async () => {
				await rawRequest(app)
					.get('/pets/../name.txt?foo=bar')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});

			it('should 404 on relative path with dot', async () => {
				await rawRequest(app)
					.get('/name.txt/.')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});

			it('should 404 on relative path with dot and query params', async () => {
				await rawRequest(app)
					.get('/name.txt/.?foo=bar')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});

			it('should 404 on relative path with dot bis', async () => {
				await rawRequest(app)
					.get('/./name.txt')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});

			it('should 404 on relative path with dot and query params bis', async () => {
				await rawRequest(app)
					.get('/./name.txt?foo=bar')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});
		});
	});

	describe('prepare response and send (alternate)', () => {
		describe('should add a weak ETag header field when weakEtags is set to true', () => {
			let app: Server;
			before(async () => {
				const storage = new FileSystemStorage(fixtures, { weakEtags: true });
				app = await createAndListenServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const response = await storage.prepareResponse(req.url!, req);
						lastResult = response;
						await response.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should add a weak ETag header field when weakEtags is set to true', async () => {
				await request(app)
					.get('/name.txt')
					.expect('etag', /^W\/"[^"]+"$/u);
			});
		});

		describe('should error if no method', () => {
			let app: Server;
			before(async () => {
				const storage = new FileSystemStorage(fixtures, { weakEtags: true });
				app = await createAndListenServer((req, res) => {
					(async () => {
						lastResult = true;
						req.method = '';
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const response = await storage.prepareResponse(req.url!, req);
						lastResult = response;
						await response.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should error if no method', async () => {
				await request(app)
					.get('/name.txt')
					.expect(500);
			});
		});

		describe('should handle custom file system stream implementation', () => {
			let app: Server;
			before(async () => {
				class CustomFileSystemStorage extends FileSystemStorage {
					override async open(
						path: FilePath,
						requestHeaders: StorageRequestHeaders,
					): Promise<StorageInfo<FileData>> {
						const res = await super.open(path, requestHeaders);
						res.etag = '"123"';
						res.lastModified = 'Thu, 04 Jun 2020 01:53:53 GMT';
						res.cacheControl = 'no-cache';
						res.contentDispositionType = 'attachment';
						res.contentDispositionFilename = 'test.txt';
						return res;
					}
				}
				const storage = new CustomFileSystemStorage(fixtures, {});
				app = await createAndListenServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const response = await storage.prepareResponse(req.url!, req);
						lastResult = response;
						await response.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should set matching etag and last-modified headers', async () => {
				await request(app)
					.get('/name.txt')
					.expect('ETag', '"123"')
					.expect('Last-Modified', 'Thu, 04 Jun 2020 01:53:53 GMT')
					.expect('Cache-Control', 'no-cache')
					.expect('Content-Disposition', 'attachment; filename="test.txt"')
					.expect(200);
			});
		});

		describe('should hang up on file stream error', () => {
			let app: Server;
			class ErrorStorage extends FileSystemStorage {
				override createReadableStream() {
					return new Readable({
						read() {
							process.nextTick(() => {
								this.destroy(new Error('boom!'));
							});
						},
					});
				}
			}
			before(async () => {
				const storage = new ErrorStorage(fixtures);
				app = await createAndListenServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const response = await storage.prepareResponse(req.url!, req);
						lastResult = response;
						await response.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should hang up on file stream error', async () => {
				try {
					await request(app).get('/name.txt');
					fail();
				} catch {
					await Promise.resolve(undefined);
				}
			});
		});

		describe('send result', () => {
			describe('should have headers when sending file', () => {
				let app: Server;
				before(async () => {
					const storage = new FileSystemStorage(fixtures);
					app = await createAndListenServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const response = await storage.prepareResponse(req.url!, req);
							lastResult = response;
							await response.send(res);
						})().catch((err: unknown) => {
							res.statusCode = 500;
							console.error(err);
							if (!res.writableEnded) {
								res.end('Internal Error');
							}
						});
					});
				});
				after(done => {
					app.close(done);
				});
				it('should have headers when sending file', async () => {
					await request(app)
						.get('/name.txt')
						.expect(shouldHaveHeader('Content-Length'))
						.expect(200, 'tobi');
				});
			});

			describe('should have headers on 404', () => {
				let app: Server;
				before(async () => {
					const storage = new FileSystemStorage(fixtures);
					app = await createAndListenServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const response = await storage.prepareResponse(req.url!, req);
							lastResult = response;
							await response.send(res);
						})().catch((err: unknown) => {
							res.statusCode = 500;
							console.error(err);
							if (!res.writableEnded) {
								res.end('Internal Error');
							}
						});
					});
				});
				after(done => {
					app.close(done);
				});
				it('should have headers on 404', async () => {
					await request(app)
						.get('/bogus')
						.expect(shouldHaveHeader('Content-Length'))
						.expect(404);
				});
			});

			describe('should provide path', () => {
				let app: Server;
				before(async () => {
					const storage = new FileSystemStorage(fixtures);
					app = await createAndListenServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const response = await storage.prepareResponse(req.url!, req);
							lastResult = response;
							response.headers['X-Send-Stream-Resolved-Path']
								= response.storageInfo?.attachedData.resolvedPath;
							await response.send(res);
						})().catch((err: unknown) => {
							res.statusCode = 500;
							console.error(err);
							if (!res.writableEnded) {
								res.end('Internal Error');
							}
						});
					});
				});
				after(done => {
					app.close(done);
				});
				it('should provide path', async () => {
					await request(app)
						.get('/name.txt')
						.expect('X-Send-Stream-Resolved-Path', normalize(join(fixtures, 'name.txt')))
						.expect(200, 'tobi');
				});
			});

			describe('should provide stat', () => {
				let app: Server;
				before(async () => {
					const storage = new FileSystemStorage(fixtures);
					app = await createAndListenServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const response = await storage.prepareResponse(req.url!, req);
							lastResult = response;
							const { storageInfo } = response;
							if (storageInfo) {
								const { headers } = response;
								headers['X-Send-Stream-mtimeMs'] = String('mtimeMs' in storageInfo);
								headers['X-Send-Stream-size'] = String('size' in storageInfo);
								headers['X-Send-Stream-ctime']
									= String('ctime' in storageInfo.attachedData.stats);
								headers['X-Send-Stream-mtime']
									= String('mtime' in storageInfo.attachedData.stats);
							}
							await response.send(res);
						})().catch((err: unknown) => {
							res.statusCode = 500;
							console.error(err);
							if (!res.writableEnded) {
								res.end('Internal Error');
							}
						});
					});
				});
				after(done => {
					app.close(done);
				});
				it('should provide stat', async () => {
					await request(app)
						.get('/name.txt')
						.expect('X-Send-Stream-mtimeMs', 'true')
						.expect('X-Send-Stream-size', 'true')
						.expect('X-Send-Stream-ctime', 'true')
						.expect('X-Send-Stream-mtime', 'true')
						.expect(200, 'tobi');
				});
			});

			describe('should allow altering headers', () => {
				let app: Server;
				before(async () => {
					const storage = new FileSystemStorage(fixtures);
					app = await createAndListenServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const result = await storage.prepareResponse(req.url!, req);
							lastResult = result;
							result.headers['Cache-Control'] = 'no-cache';
							result.headers['Content-Type'] = 'text/x-custom';
							result.headers['ETag'] = 'W/"everything"';
							await result.send(res);
						})().catch((err: unknown) => {
							res.statusCode = 500;
							console.error(err);
							if (!res.writableEnded) {
								res.end('Internal Error');
							}
						});
					});
				});
				after(done => {
					app.close(done);
				});
				it('should allow altering headers', async () => {
					await request(app)
						.get('/name.txt')
						.expect(200)
						.expect('Cache-Control', 'no-cache')
						.expect('Content-Type', 'text/x-custom')
						.expect('ETag', 'W/"everything"')
						.expect('tobi');
				});
			});
		});

		describe('with conditional-GET', () => {
			describe('should respond with 412 when weak ETag matched', () => {
				let app: Server;
				before(async () => {
					const storage = new FileSystemStorage(fixtures, { weakEtags: true });
					app = await createAndListenServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const result = await storage.prepareResponse(req.url!, req);
							lastResult = result;
							if (result.error) {
								result.headers['X-Send-Stream-Error'] = result.error.name;
							}
							await result.send(res);
						})().catch((err: unknown) => {
							res.statusCode = 500;
							console.error(err);
							if (!res.writableEnded) {
								res.end('Internal Error');
							}
						});
					});
				});
				after(done => {
					app.close(done);
				});
				it('should respond with 412 when weak ETag matched', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					await request(app)
						.get('/name.txt')
						.set('If-Match', `"foo", "bar", ${ (<Record<string, string>> res.header).etag }`)
						.expect('X-Send-Stream-Error', 'PreconditionFailedStorageError')
						.expect(412);
				});
			});

			describe('should respond with 304 when weak ETag matched', () => {
				let app: Server;
				before(async () => {
					const storage = new FileSystemStorage(fixtures, { weakEtags: true });
					app = await createAndListenServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const result = await storage.prepareResponse(req.url!, req);
							lastResult = result;
							await result.send(res);
						})().catch((err: unknown) => {
							res.statusCode = 500;
							console.error(err);
							if (!res.writableEnded) {
								res.end('Internal Error');
							}
						});
					});
				});
				after(done => {
					app.close(done);
				});
				it('should respond with 304 when weak ETag matched', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					await request(app)
						.get('/name.txt')
						.set('If-None-Match', (<Record<string, string>> res.header).etag)
						.expect(304);
				});
			});

			describe('statusCode option should disable 304 and always return statusCode', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ root: fixtures, statusCode: 418 });
				});
				after(done => {
					app.close(done);
				});
				it('statusCode option should disable 304 and always return statusCode', async () => {
					await request(app)
						.get('/name.txt')
						.expect(shouldNotHaveHeader('ETag'))
						.expect(shouldNotHaveHeader('Last-Modified'))
						.expect(418);
				});
			});
		});

		describe('with Range request', () => {
			describe('when if-range present', () => {
				describe('should not respond with parts when weak etag unchanged', () => {
					let app: Server;
					before(async () => {
						const storage = new FileSystemStorage(fixtures, { weakEtags: true });
						app = await createAndListenServer((req, res) => {
							(async () => {
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								const result = await storage.prepareResponse(req.url!, req);
								lastResult = result;
								await result.send(res);
							})().catch((err: unknown) => {
								res.statusCode = 500;
								console.error(err);
								if (!res.writableEnded) {
									res.end('Internal Error');
								}
							});
						});
					});
					after(done => {
						app.close(done);
					});
					it('should not respond with parts when weak etag unchanged', async () => {
						const res = await request(app)
							.get('/nums.txt')
							.expect(200);
						const { etag } = <Record<string, string>> res.header;

						await request(app)
							.get('/nums.txt')
							.set('If-Range', etag)
							.set('Range', 'bytes=0-0')
							.expect(200, '123456789');
					});
				});
			});

			describe('statusCode should disable byte ranges', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ root: fixtures, statusCode: 418 });
				});
				after(done => {
					app.close(done);
				});
				it('statusCode should disable byte ranges', async () => {
					await request(app)
						.get('/nums.txt')
						.set('Range', 'bytes=0-4')
						.expect(418, '123456789');
				});
			});
		});

		describe('etag', () => {
			let app: Server;
			before(async () => {
				const storage = new FileSystemStorage(fixtures);
				app = await createAndListenServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await storage.prepareResponse(req.url!, req, { etag: false });
						lastResult = result;
						await result.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should support disabling etags', async () => {
				await request(app)
					.get('/name.txt')
					.expect(shouldNotHaveHeader('ETag'))
					.expect(200);
			});
		});

		describe('max-age', () => {
			describe('should be configurable', () => {
				let app: Server;
				before(async () => {
					const storage = new FileSystemStorage(fixtures);
					app = await createAndListenServer((req, res) => {
						(async () => {
							const result = await storage.prepareResponse(
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								req.url!,
								req,
								{ cacheControl: 'public, max-age=1' },
							);
							lastResult = result;
							await result.send(res);
						})().catch((err: unknown) => {
							res.statusCode = 500;
							console.error(err);
							if (!res.writableEnded) {
								res.end('Internal Error');
							}
						});
					});
				});
				after(done => {
					app.close(done);
				});
				it('should be configurable', async () => {
					await request(app)
						.get('/name.txt')
						.expect('Cache-Control', 'public, max-age=1');
				});
			});
		});
	});

	describe('prepare response and send (+dispose)', () => {
		let app: Server;
		before(async () => {
			const storage = new FileSystemStorage(fixtures);
			app = await createAndListenServer((req, res) => {
				(async () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const response = await storage.prepareResponse(req.url!, req);
					try {
						lastResult = response;
						if (response.error) {
							response.headers['X-Send-Stream-Error'] = response.error.name;
						}
						await response.send(res);
					} finally {
						response.dispose();
					}
				})().catch((err: unknown) => {
					res.statusCode = 500;
					console.error(err);
					if (!res.writableEnded) {
						res.end('Internal Error');
					}
				});
			});
		});
		after(done => {
			app.close(done);
		});

		it('should stream the file contents', async () => {
			await request(app)
				.get('/name.txt')
				.expect('Content-Length', '4')
				.expect(200, 'tobi');
		});
	});

	describe('direct send', () => {
		let app: Server;
		before(async () => {
			const storage = new FileSystemStorage(fixtures);
			app = await createAndListenServer((req, res) => {
				(async () => {
					lastResult = true;
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					await storage.send(req.url!, req, res);
				})().catch((err: unknown) => {
					res.statusCode = 500;
					console.error(err);
					if (!res.writableEnded) {
						res.end('Internal Error');
					}
				});
			});
		});
		after(done => {
			app.close(done);
		});

		it('should stream the file contents', async () => {
			await request(app)
				.get('/name.txt')
				.expect('Content-Length', '4')
				.expect(200, 'tobi');
		});
	});

	describe('send(file, options)', () => {
		describe('maxRanges', () => {
			describe('should support disabling accept-ranges', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ maxRanges: 0, root: fixtures });
				});
				after(done => {
					app.close(done);
				});
				it('should support disabling accept-ranges', async () => {
					await request(app)
						.get('/nums.txt')
						.expect('Accept-Ranges', 'none')
						.expect(200);
				});
			});

			describe('should ignore requested range when maxRange is zero', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ maxRanges: 0, root: fixtures });
				});
				after(done => {
					app.close(done);
				});
				it('should ignore requested range when maxRange is zero', async () => {
					await request(app)
						.get('/nums.txt')
						.set('Range', 'bytes=0-2')
						.expect('Accept-Ranges', 'none')
						.expect(shouldNotHaveHeader('Content-Range'))
						.expect(200, '123456789');
				});
			});

			describe('should ignore requested range when maxRange below', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ maxRanges: 1, root: fixtures });
				});
				after(done => {
					app.close(done);
				});
				it('should ignore requested range when maxRange below', async () => {
					await request(app)
						.get('/nums.txt')
						.set('Range', 'bytes=0-2,4-5')
						.expect('Accept-Ranges', 'bytes')
						.expect(shouldNotHaveHeader('Content-Range'))
						.expect(200, '123456789');
				});
			});
		});

		describe('cacheControl', () => {
			describe('should support disabling cache-control', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ cacheControl: false, root: fixtures });
				});
				after(done => {
					app.close(done);
				});
				it('should support disabling cache-control', async () => {
					await request(app)
						.get('/name.txt')
						.expect(shouldNotHaveHeader('Cache-Control'))
						.expect(200);
				});
			});

			describe('should ignore maxAge option', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ cacheControl: false, root: fixtures });
				});
				after(done => {
					app.close(done);
				});
				it('should ignore maxAge option', async () => {
					await request(app)
						.get('/name.txt')
						.expect(shouldNotHaveHeader('Cache-Control'))
						.expect(200);
				});
			});
		});

		describe('etag', () => {
			let app: Server;
			before(async () => {
				app = await createTestServer({ etag: false, root: fixtures });
			});
			after(done => {
				app.close(done);
			});
			it('should support disabling etags', async () => {
				await request(app)
					.get('/name.txt')
					.expect(shouldNotHaveHeader('ETag'))
					.expect(200);
			});
		});

		describe('lastModified', () => {
			let app: Server;
			before(async () => {
				app = await createTestServer({ lastModified: false, root: fixtures });
			});
			after(done => {
				app.close(done);
			});
			it('should support disabling last-modified', async () => {
				await request(app)
					.get('/name.txt')
					.expect(shouldNotHaveHeader('Last-Modified'))
					.expect(200);
			});
		});

		describe('dotfiles', () => {
			describe('should default to "ignore"', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ root: fixtures });
				});
				after(done => {
					app.close(done);
				});
				it('should default to "ignore"', async () => {
					await request(app)
						.get('/.hidden.txt')
						.expect('X-Send-Stream-Error', 'IgnoredFileError')
						.expect(404);
				});
			});

			describe('should ignore folder too', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ root: fixtures });
				});
				after(done => {
					app.close(done);
				});
				it('should ignore folder too', async () => {
					await request(app)
						.get('/.mine/name.txt')
						.expect('X-Send-Stream-Error', 'IgnoredFileError')
						.expect(404);
				});
			});

			describe('when "allow"', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ ignorePattern: false, root: fixtures });
				});
				after(done => {
					app.close(done);
				});
				it('should send dotfile', async () => {
					await request(app)
						.get('/.hidden.txt')
						.expect(200, 'secret');
				});

				it('should send within dotfile directory', async () => {
					await request(app)
						.get('/.mine/name.txt')
						.expect(200, /tobi/u);
				});

				it('should 404 for non-existent dotfile', async () => {
					await request(app)
						.get('/.nothere')
						.expect('X-Send-Stream-Error', 'DoesNotExistError')
						.expect(404);
				});
			});

			describe('when "ignore"', () => {
				describe('when "ignore" 1', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ ignorePattern: /^\.[^.]/u, root: fixtures });
					});
					after(done => {
						app.close(done);
					});
					it('should 404 for dotfile', async () => {
						await request(app)
							.get('/.hidden.txt')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for dotfile directory', async () => {
						await request(app)
							.get('/.mine')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for dotfile directory with trailing slash', async () => {
						await request(app)
							.get('/.mine/')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for file within dotfile directory', async () => {
						await request(app)
							.get('/.mine/name.txt')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for non-existent dotfile', async () => {
						await request(app)
							.get('/.nothere')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for non-existent dotfile directory', async () => {
						await request(app)
							.get('/.what/name.txt')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});
				});

				describe('when "ignore" 1 (using regexp as text)', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ ignorePattern: String.raw`^\.[^.]`, root: fixtures });
					});
					after(done => {
						app.close(done);
					});
					it('should 404 for dotfile', async () => {
						await request(app)
							.get('/.hidden.txt')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for dotfile directory', async () => {
						await request(app)
							.get('/.mine')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for dotfile directory with trailing slash', async () => {
						await request(app)
							.get('/.mine/')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for file within dotfile directory', async () => {
						await request(app)
							.get('/.mine/name.txt')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for non-existent dotfile', async () => {
						await request(app)
							.get('/.nothere')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});

					it('should 404 for non-existent dotfile directory', async () => {
						await request(app)
							.get('/.what/name.txt')
							.expect('X-Send-Stream-Error', 'IgnoredFileError')
							.expect(404);
					});
				});

				describe('when "ignore" 2', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ ignorePattern: /^\.[^.]/u, root: join(fixtures, '.mine') });
					});
					after(done => {
						app.close(done);
					});
					it('should send files in root dotfile directory', async () => {
						await request(app)
							.get('/name.txt')
							.expect(200, /tobi/u);
					});
				});
			});
		});

		describe('root', () => {
			describe('when given', () => {
				describe('should not join root', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ root: fixtures });
					});
					after(done => {
						app.close(done);
					});
					it('should not join root', async () => {
						await rawRequest(app)
							.get('/pets/../name.txt')
							.expect('X-Send-Stream-Error', 'NotNormalizedError')
							.expect(404);
					});
				});

				describe('double slash should be ignored', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ root: fixtures });
					});
					after(done => {
						app.close(done);
					});
					it('double slash should be ignored', async () => {
						await request(app)
							.get('//name.txt')
							.expect('X-Send-Stream-Error', 'ConsecutiveSlashesError')
							.expect(404);
					});
				});

				describe('double slash in sub path should be ignored', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ root: fixtures });
					});
					after(done => {
						app.close(done);
					});
					it('double slash in sub path should be ignored', async () => {
						await request(app)
							.get('/pets//index.html')
							.expect('X-Send-Stream-Error', 'ConsecutiveSlashesError')
							.expect(404);
					});
				});

				describe('should work with trailing slash', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ root: `${ fixtures }/` });
					});
					after(done => {
						app.close(done);
					});
					it('should work with trailing slash', async () => {
						await request(app)
							.get('/name.txt')
							.expect(200, 'tobi');
					});
				});

				describe('should 404 on empty path', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ root: join(fixtures, 'name.txt') });
					});
					after(done => {
						app.close(done);
					});
					it('should 404 on empty path', async () => {
						await request(app)
							.get('')
							.expect('X-Send-Stream-Error', 'TrailingSlashError')
							.expect(404);
					});
				});

				describe('should restrict paths to within root', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ root: fixtures });
					});
					after(done => {
						app.close(done);
					});
					it('should restrict paths to within root', async () => {
						await rawRequest(app)
							.get('/pets/../../spec.ts')
							.expect('X-Send-Stream-Error', 'NotNormalizedError')
							.expect(404);
					});
				});

				describe('should restrict paths to within root with path parts', () => {
					let app: Server;
					before(async () => {
						const storage = new FileSystemStorage(fixtures);
						app = await createAndListenServer((req, res) => {
							(async () => {
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								const response = await storage.prepareResponse(req.url!.split('/'), req);
								lastResult = response;
								if (response.error) {
									response.headers['X-Send-Stream-Error'] = response.error.name;
								}
								await response.send(res);
							})().catch((err: unknown) => {
								res.statusCode = 500;
								console.error(err);
								if (!res.writableEnded) {
									res.end('Internal Error');
								}
							});
						});
					});
					after(done => {
						app.close(done);
					});
					it('should restrict paths to within root with path parts', async () => {
						await rawRequest(app)
							.get('/pets/../../http.spec.ts')
							.expect('X-Send-Stream-Error', 'InvalidPathError')
							.expect(404);
					});
				});

				describe('should allow .. in root', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ root: `${ fixtures }/../fixtures-http` });
					});
					after(done => {
						app.close(done);
					});
					it('should allow .. in root', async () => {
						await rawRequest(app)
							.get('/pets/../../http.spec.ts')
							.expect('X-Send-Stream-Error', 'NotNormalizedError')
							.expect(404);
					});
				});

				describe('should not allow root transversal', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ root: join(fixtures, 'name.d') });
					});
					after(done => {
						app.close(done);
					});
					it('should not allow root transversal', async () => {
						await rawRequest(app)
							.get('/../name.dir/name.txt')
							.expect('X-Send-Stream-Error', 'NotNormalizedError')
							.expect(404);
					});
				});

				describe('should not allow root path disclosure', () => {
					let app: Server;
					before(async () => {
						app = await createTestServer({ root: fixtures });
					});
					after(done => {
						app.close(done);
					});
					it('should not allow root path disclosure', async () => {
						await rawRequest(app)
							.get('/pets/../../fixtures-http/name.txt')
							.expect('X-Send-Stream-Error', 'NotNormalizedError')
							.expect(404);
					});
				});
			});

			describe('when missing', () => {
				let app: Server;
				before(async () => {
					const storage = new FileSystemStorage(fixtures);
					app = await createAndListenServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const response = await storage.prepareResponse(req.url!, req);
							lastResult = response;
							if (response.error) {
								response.headers['X-Send-Stream-Error'] = response.error.name;
							}
							await response.send(res);
						})().catch((err: unknown) => {
							res.statusCode = 500;
							console.error(err);
							if (!res.writableEnded) {
								res.end('Internal Error');
							}
						});
					});
				});
				after(done => {
					app.close(done);
				});

				it('should consider .. malicious', async () => {
					await rawRequest(app)
						.get('/../http.spec.ts')
						.expect('X-Send-Stream-Error', 'NotNormalizedError')
						.expect(404);
				});

				it('should still serve files with dots in name', async () => {
					await request(app)
						.get('/do..ts.txt')
						.expect(200, '...');
				});
			});
		});
		describe('other methods', () => {
			let app: Server;
			before(async () => {
				const storage = new FileSystemStorage(fixtures);
				app = await createAndListenServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await storage.prepareResponse(req.url!, req);
						lastResult = result;
						if (result.error) {
							result.headers['X-Send-Stream-Error'] = result.error.name;
						}
						await result.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});

			it('should 405 when OPTIONS request', async () => {
				await request(app)
					.options('/name.txt')
					.expect('Allow', 'GET, HEAD')
					.expect('X-Send-Stream-Error', 'MethodNotAllowedStorageError')
					.expect(405);
			});

			it('should 405 on post', async () => {
				await request(app)
					.post('/name.txt')
					.expect('Allow', 'GET, HEAD')
					.expect('X-Send-Stream-Error', 'MethodNotAllowedStorageError')
					.expect(405);
			});
		});

		describe('other methods (alternate)', () => {
			describe('should not 405 on post allowed', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ root: fixtures, allowedMethods: ['POST'] });
				});
				after(done => {
					app.close(done);
				});
				it('should not 405 on post allowed', async () => {
					await request(app)
						.post('/name.txt')
						.expect(200);
				});
				it('should 405 on not head allowed', async () => {
					await request(app)
						.head('/name.txt')
						.expect('X-Send-Stream-Error', 'MethodNotAllowedStorageError')
						.expect(405);
				});
			});

			describe('should 405 on head not allowed', () => {
				let app: Server;
				before(async () => {
					app = await createTestServer({ root: fixtures, allowedMethods: ['GET'] });
				});
				after(done => {
					app.close(done);
				});
				it('should 405 on head not allowed', async () => {
					await request(app)
						.post('/name.txt')
						.expect('Allow', 'GET')
						.expect('X-Send-Stream-Error', 'MethodNotAllowedStorageError')
						.expect(405);
				});
			});
		});
	});

	describe('when something happenned too soon', () => {
		describe('should ignore if headers already sent', () => {
			let app: Server;
			before(async () => {
				const storage = new FileSystemStorage(fixtures);
				app = await createAndListenServer((req, res) => {
					(async () => {
						res.write('the end');
						res.end();
						lastResult = true;
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await storage.prepareResponse(req.url!, req);
						lastResult = result;
						await result.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should error if headers already sent', async () => {
				try {
					await request(app)
						.get('/nums.txt');
					fail();
				} catch {
					await Promise.resolve(undefined);
				}
			});
		});

		describe('should ignore if connection already destroyed', () => {
			let app: Server;
			before(async () => {
				const storage = new FileSystemStorage(fixtures);
				app = await createAndListenServer((req, res) => {
					(async () => {
						res.destroy();
						lastResult = true;
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await storage.prepareResponse(req.url!, req);
						lastResult = result;
						await result.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should error if connection already destroyed', async () => {
				try {
					await request(app)
						.get('/nums.txt');
					fail();
				} catch {
					await Promise.resolve(undefined);
				}
			});
		});

		describe('should ignore if connection already destroyed and no socket', () => {
			let app: Server;
			before(async () => {
				const storage = new FileSystemStorage(fixtures);
				app = await createAndListenServer((req, res) => {
					(async () => {
						res.destroy();
						lastResult = true;
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await storage.prepareResponse(req.url!, req);
						lastResult = result;
						await result.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should ignore if connection already destroyed and no socket', async () => {
				try {
					await request(app)
						.get('/nums.txt');
					fail();
				} catch {
					await Promise.resolve(undefined);
				}
			});
		});

		describe('should handle connection destroyed', () => {
			let app: Server;
			before(async () => {
				const storage = new FileSystemStorage(fixtures);
				app = await createAndListenServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await storage.prepareResponse(req.url!, req);
						lastResult = result;
						await result.send(res);
						res.destroy(new Error('olala'));
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should handle connection destroyed', async () => {
				try {
					await request(app)
						.get('/nums.txt');
					fail();
				} catch {
					await Promise.resolve(undefined);
				}
			});
		});

		describe('should handle stream pipe error', () => {
			let app: Server;
			before(async () => {
				class ErrorStorage extends FileSystemStorage {
					override createReadableStream(si: StorageInfo<FileData>): Readable {
						// eslint-disable-next-line @typescript-eslint/no-this-alias
						const st = this;
						return new class extends Readable {
							// eslint-disable-next-line sonarjs/no-reference-error
							override pipe<T extends NodeJS.WritableStream>(
								destination: T,
								options?: { end?: boolean },
							): T {
								this.destroy(new Error('oops'));
								return super.pipe(destination, options);
							}

							// eslint-disable-next-line @typescript-eslint/no-misused-promises
							override async _destroy(error: Error | null, callback: (err?: Error | null) => void) {
								await st.close(si);
								callback(error);
							}
						}();
					}
				}

				const errorStorage = new ErrorStorage(fixtures);

				app = await createAndListenServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await errorStorage.prepareResponse(req.url!, req);
						lastResult = result;
						await result.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should handle stream pipe error', async () => {
				try {
					await request(app)
						.get('/nums.txt');
					fail();
				} catch {
					await Promise.resolve(undefined);
				}
			});
		});

		describe('should handle stream pipe error with ignorePrematureClose parameter', () => {
			let app: Server;
			before(async () => {
				class ErrorStorage extends FileSystemStorage {
					override createReadableStream(si: StorageInfo<FileData>): Readable {
						// eslint-disable-next-line @typescript-eslint/no-this-alias
						const st = this;
						return new class extends Readable {
							override pipe<T extends NodeJS.WritableStream>(
								destination: T,
								options?: { end?: boolean },
							): T {
								this.destroy(new Error('oops'));
								return super.pipe(destination, options);
							}

							// eslint-disable-next-line @typescript-eslint/no-misused-promises
							override async _destroy(error: Error | null, callback: (err?: Error | null) => void) {
								await st.close(si);
								callback(error);
							}
						}();
					}
				}

				const errorStorage = new ErrorStorage(fixtures);

				app = await createAndListenServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await errorStorage.prepareResponse(req.url!, req);
						lastResult = result;
						await result.send(res, { ignorePrematureClose: false });
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should handle stream pipe error', async () => {
				try {
					await request(app)
						.get('/nums.txt');
					fail();
				} catch {
					await Promise.resolve(undefined);
				}
			});
		});

		describe('should handle stream read error on already closed stream', () => {
			let app: Server;
			before(async () => {
				class ErrorStorage extends FileSystemStorage {
					override createReadableStream(si: StorageInfo<FileData>): Readable {
						// eslint-disable-next-line @typescript-eslint/no-this-alias
						const st = this;
						return new class extends Readable {
							override pipe<T extends NodeJS.WritableStream>(
								destination: T,
								options?: { end?: boolean },
							): T {
								this.destroy(new Error('oops'));
								return super.pipe(destination, options);
							}

							// eslint-disable-next-line @typescript-eslint/no-misused-promises
							override async _destroy(error: Error | null, callback: (err?: Error | null) => void) {
								await st.close(si);
								callback(error);
							}
						}();
					}
				}

				const errorStorage = new ErrorStorage(fixtures);

				app = await createAndListenServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const resp = await errorStorage.prepareResponse(req.url!, req);
						lastResult = resp;
						// eslint-disable-next-line @typescript-eslint/unbound-method
						const { stream: { pipe: p }, stream } = resp;
						stream.pipe = function pipe<T extends NodeJS.WritableStream>(
							this: Readable,
							destination: T,
							options?: { end?: boolean },
						): T {
							res.destroy();
							// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
							return <T> p.call(this, destination, options);
						};
						await resp.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.writableEnded) {
							res.end('Internal Error');
						}
					});
				});
			});
			after(done => {
				app.close(done);
			});
			it('should handle stream read error on already closed stream', async () => {
				try {
					await request(app)
						.get('/nums.txt');
					fail();
				} catch {
					await Promise.resolve(undefined);
				}
			});
		});

		describe('should handle stream read error on already closed stream (http2)', () => {
			let app: Http2Server;
			let address: AddressInfo;
			const sessions: ServerHttp2Session[] = [];
			before(done => {
				class ErrorStorage extends FileSystemStorage {
					override createReadableStream(si: StorageInfo<FileData>): Readable {
						// eslint-disable-next-line @typescript-eslint/no-this-alias
						const st = this;
						return new class extends Readable {
							override pipe<T extends NodeJS.WritableStream>(
								destination: T,
								options?: { end?: boolean },
							): T {
								this.destroy(new Error('oops'));
								return super.pipe(destination, options);
							}

							// eslint-disable-next-line @typescript-eslint/no-misused-promises
							override async _destroy(error: Error | null, callback: (err?: Error | null) => void) {
								await st.close(si);
								callback(error);
							}
						}();
					}
				}

				const errorStorage = new ErrorStorage(fixtures);

				app = http2CreateServer((req, res) => {
					(async () => {
						const resp = await errorStorage.prepareResponse(req.url, req);
						lastResult = resp;
						// eslint-disable-next-line @typescript-eslint/unbound-method
						const { stream: { pipe: p }, stream } = resp;
						stream.pipe = function pipe<T extends NodeJS.WritableStream>(
							this: Readable,
							destination: T,
							options?: { end?: boolean },
						): T {
							res.stream.destroy();
							// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
							return <T> p.call(this, destination, options);
						};
						await resp.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.stream.writableEnded) {
							res.end('Internal Error');
						}
					});
				});

				app.on('session', session => {
					sessions.push(session);
				});

				app.listen(0, () => {
					const newAddress = app.address();
					if (newAddress === null || typeof newAddress === 'string') {
						throw new Error('should not happen');
					}
					address = newAddress;
					done();
				});
			});
			after(done => {
				app.close(done);
			});
			it('should handle stream read error on already closed stream (http2)', done => {
				const client = http2Connect(`http://localhost:${ address.port }`);

				const req = client.request({ ':path': '/name.txt' });

				req.setEncoding('utf8');

				let error = false;
				req.on('error', err => {
					error = true;
					done(err);
				});

				req.on('end', () => {
					client.close();
					for (const session of sessions) {
						session.destroy();
					}
					if (!error) {
						done();
					}
				});

				req.end();
			});
		});
	});

	describe('http2 server', () => {
		describe('should 200 on simple request', () => {
			let app: Http2Server;
			let address: AddressInfo;
			const sessions: ServerHttp2Session[] = [];
			before(done => {
				const storage = new FileSystemStorage(fixtures);
				app = http2CreateServer();

				app.on('stream', (stream, headers) => {
					(async () => {
						const result = await storage.prepareResponse(
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							headers[':path']!,
							headers,
						);
						lastResult = result;
						await result.send(stream);
					})().catch((err: unknown) => {
						stream.respond({ ':status': 500 });
						stream.end(String(err));
					});
				});

				app.on('session', session => {
					sessions.push(session);
				});

				app.listen(0, () => {
					const newAddress = app.address();
					if (newAddress === null || typeof newAddress === 'string') {
						throw new Error('should not happen');
					}
					address = newAddress;
					done();
				});
			});
			after(done => {
				app.close(done);
			});
			it('should 200 on simple request', done => {
				const client = http2Connect(`http://localhost:${ address.port }`);

				let hasError = false;
				client.on('error', err => {
					client.close();
					if (!hasError) {
						hasError = true;
						done(err);
					}
				});

				const req = client.request({ ':path': '/name.txt' });

				req.on('response', headers => {
					if (headers[':status'] === 200) {
						return;
					}
					client.close();
					if (!hasError) {
						hasError = true;
						done(new Error(`status received ${ headers[':status'] ?? '<no status>' } does not equals 200`));
					}
				});

				req.setEncoding('utf8');
				let data = '';
				req.on('data', chunk => {
					data += chunk;
				});
				req.on('end', () => {
					if (data !== 'tobi' && !hasError) {
						hasError = true;
						done(new Error(`body received ${ JSON.stringify(data) } does not equals "tobi"`));
					}
					client.close();
					if (!hasError) {
						hasError = true;
						for (const session of sessions) {
							session.destroy();
						}
						done();
					}
				});
				req.end();
			});
		});

		describe('should 200 on simple request with compatibility layer', () => {
			let app: Http2Server;
			let address: AddressInfo;
			const sessions: ServerHttp2Session[] = [];
			before(done => {
				const storage = new FileSystemStorage(fixtures);
				app = http2CreateServer((req, res) => {
					(async () => {
						const result = await storage.prepareResponse(
							req.url,
							req,
						);
						lastResult = result;
						await result.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.stream.writableEnded) {
							res.end('Internal Error');
						}
					});
				});

				app.on('session', session => {
					sessions.push(session);
				});

				app.listen(0, () => {
					const newAddress = app.address();
					if (newAddress === null || typeof newAddress === 'string') {
						throw new Error('should not happen');
					}
					address = newAddress;
					done();
				});
			});
			after(done => {
				app.close(done);
			});
			it('should 200 on simple request with compatibility layer', done => {
				const client = http2Connect(`http://localhost:${ address.port }`);

				let hasError = false;
				client.on('error', err => {
					client.close();
					if (!hasError) {
						hasError = true;
						done(err);
					}
				});

				const req = client.request({ ':path': '/name.txt' });

				req.on('response', headers => {
					if (headers[':status'] === 200) {
						return;
					}
					client.close();
					if (!hasError) {
						hasError = true;
						done(new Error(`status received ${ headers[':status'] ?? '<no status>' } does not equals 200`));
					}
				});

				req.setEncoding('utf8');
				let data = '';
				req.on('data', chunk => {
					data += chunk;
				});
				req.on('end', () => {
					if (data !== 'tobi' && !hasError) {
						hasError = true;
						done(new Error(`body received ${ JSON.stringify(data) } does not equals "tobi"`));
					}
					client.close();
					if (!hasError) {
						hasError = true;
						for (const session of sessions) {
							session.destroy();
						}
						done();
					}
				});
				req.end();
			});
		});

		describe('should ignore if connection already destroyed', () => {
			let app: Http2Server;
			let address: AddressInfo;
			const sessions: ServerHttp2Session[] = [];
			before(done => {
				const storage = new FileSystemStorage(fixtures);

				app = http2CreateServer((req, res) => {
					(async () => {
						res.stream.destroy();
						lastResult = true;
						const result = await storage.prepareResponse(
							req.url,
							req,
						);
						lastResult = result;
						await result.send(res);
					})().catch((err: unknown) => {
						res.statusCode = 500;
						console.error(err);
						if (!res.stream.writableEnded) {
							res.end('Internal Error');
						}
					});
				});

				app.on('session', session => {
					sessions.push(session);
				});

				app.listen(0, () => {
					const newAddress = app.address();
					if (newAddress === null || typeof newAddress === 'string') {
						throw new Error('should not happen');
					}
					address = newAddress;
					for (const session of sessions) {
						session.destroy();
					}
					done();
				});
			});
			after(done => {
				app.close(done);
			});
			it('should ignore if connection already destroyed', done => {
				const client = http2Connect(`http://localhost:${ address.port }`);

				let hasError = false;
				client.on('error', err => {
					client.close();
					if (!hasError) {
						hasError = true;
						done(err);
					}
				});

				const req = client.request({ ':path': '/name.txt' });

				req.setEncoding('utf8');

				req.on('close', () => {
					for (const session of sessions) {
						session.destroy();
					}
					done();
				});

				req.end();
			});
		});

		describe('should handle errors', () => {
			let app: Http2Server;
			let address: AddressInfo;
			const sessions: ServerHttp2Session[] = [];
			before(done => {
				class ErrorStorage extends FileSystemStorage {
					override createReadableStream(
						_si: StorageInfo<FileData>,
						_range: StreamRange | undefined,
						autoclose: boolean,
					) {
						return new Readable({
							autoDestroy: autoclose,
							read() {
								process.nextTick(() => {
									this.destroy(new Error('oops'));
								});
							},
						});
					}
				}
				const storage = new ErrorStorage(fixtures);
				app = http2CreateServer();

				app.on('stream', (stream, headers) => {
					(async () => {
						const result = await storage.prepareResponse(
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							headers[':path']!,
							headers,
						);
						lastResult = result;
						await result.send(stream);
					})().catch((err: unknown) => {
						stream.respond({ ':status': 500 });
						stream.end(String(err));
					});
				});

				app.on('session', session => {
					sessions.push(session);
				});

				app.listen(0, () => {
					const newAddress = app.address();
					if (newAddress === null || typeof newAddress === 'string') {
						throw new Error('should not happen');
					}
					address = newAddress;
					done();
				});
			});
			after(done => {
				app.close(done);
			});
			it('should handle errors', done => {
				const client = http2Connect(`http://localhost:${ address.port }`);

				let hasError = false;
				client.on('error', err => {
					client.close();
					if (!hasError) {
						hasError = true;
						done(err);
					}
				});

				const req = client.request({ ':path': '/name.txt' });

				req.on('response', headers => {
					if (headers[':status'] === 200) {
						return;
					}
					client.close();
					if (!hasError) {
						hasError = true;
						done(new Error(`status received ${ headers[':status'] ?? '<no status>' } does not equals 200`));
					}
				});

				req.on('error', () => {
					if (hasError) {
						return;
					}
					hasError = true;
					for (const session of sessions) {
						session.destroy();
					}
					done();
				});

				req.setEncoding('utf8');
				let data = '';
				req.on('data', chunk => {
					data += chunk;
				});
				req.on('end', () => {
					client.close();
					if (data !== '' && !hasError) {
						hasError = true;
						done(new Error(`body received ${ JSON.stringify(data) } does not equals "tobi"`));
					}
				});
				req.end();
			});
		});

		describe('should 500 on missing method', () => {
			let app: Http2Server;
			let address: AddressInfo;
			const sessions: ServerHttp2Session[] = [];
			before(done => {
				const storage = new FileSystemStorage(fixtures);
				app = http2CreateServer();

				app.on('stream', (stream, headers) => {
					(async () => {
						headers[':method'] = '';
						lastResult = true;
						const result = await storage.prepareResponse(
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							headers[':path']!,
							headers,
						);
						lastResult = result;
						await result.send(stream);
					})().catch((err: unknown) => {
						stream.respond({ ':status': 500 });
						stream.end(String(err));
					});
				});

				app.on('session', session => {
					sessions.push(session);
				});

				app.listen(0, () => {
					const newAddress = app.address();
					if (newAddress === null || typeof newAddress === 'string') {
						throw new Error('should not happen');
					}
					address = newAddress;
					done();
				});
			});
			after(done => {
				for (const session of sessions) {
					session.destroy();
				}
				app.close(done);
			});
			it('should 500 on missing method', done => {
				const client = http2Connect(`http://localhost:${ address.port }`);

				let hasError = false;
				client.on('error', err => {
					client.close();
					if (!hasError) {
						hasError = true;
						done(err);
					}
				});

				const req = client.request({ ':path': '/name.txt' });

				req.on('response', headers => {
					if (headers[':status'] === 500) {
						return;
					}
					client.close();
					if (!hasError) {
						hasError = true;
						done(new Error(`status received ${ headers[':status'] ?? 'no status' } does not equals 500`));
					}
				});

				req.setEncoding('utf8');
				let data = '';
				req.on('data', chunk => {
					data += chunk;
				});
				req.on('end', () => {
					client.close();
					if (!hasError && data !== '') {
						hasError = true;
						done();
					}
				});
				req.end();
			});
		});
	});
});
