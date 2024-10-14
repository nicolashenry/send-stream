/* eslint-env node, mocha */

import { notStrictEqual, ok, strictEqual } from 'node:assert';
import { once } from 'node:events';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { join } from 'node:path';

import request from 'supertest';

import type { FileSystemStorageOptions, PrepareResponseOptions, StreamResponse } from '../src/send-stream';
import { FileSystemStorage, TrailingSlashError } from '../src/send-stream';

import { rawRequest, shouldNotHaveHeader } from './utils';

describe('static', () => {
	const fixtures = join(__dirname, '/fixtures-static');

	let lastResult: StreamResponse<unknown> | true | undefined;

	async function createTestServer(
		dir?: string,
		opts?: PrepareResponseOptions & FileSystemStorageOptions,
		fn?: (req: IncomingMessage, res: ServerResponse) => void,
	) {
		const direct = dir ?? fixtures;

		const storage = new FileSystemStorage(direct, opts);

		const server = createServer((req, res) => {
			(async () => {
				if (fn) {
					fn(req, res);
				}
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				let result = await storage.prepareResponse(req.url!, req, opts);
				lastResult = result;
				if (result.error instanceof TrailingSlashError) {
					result.stream.destroy();
					result = await storage.prepareResponse(
						[...result.error.pathParts.slice(0, -1), 'index.html'],
						req,
						opts,
					);
					lastResult = result;
				}
				if (result.error) {
					result.headers['X-Send-Stream-Error'] = result.error.name;
				}
				await result.send(res);
			})().catch((err: unknown) => {
				console.error(err);
				if (!res.headersSent) {
					res.statusCode = 500;
					res.end('Internal Server Error');
				}
			});
		});

		server.listen();
		await once(server, 'listening');

		return server;
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

	describe('serveStatic()', () => {
		describe('basic operations', () => {
			let server: Server;
			before(async () => {
				server = await createTestServer();
			});
			after(done => {
				server.close(done);
			});

			it('should serve static files', async () => {
				await request(server)
					.get('/todo.txt')
					.expect(200, '- groceries');
			});

			it('should support nesting', async () => {
				await request(server)
					.get('/users/tobi.txt')
					.expect(200, 'ferret');
			});

			it('should set Content-Type', async () => {
				await request(server)
					.get('/todo.txt')
					.expect('Content-Type', 'text/plain; charset=UTF-8')
					.expect(200);
			});

			it('should set Last-Modified', async () => {
				await request(server)
					.get('/todo.txt')
					.expect('Last-Modified', /\d{2} \w{3} \d{4}/u)
					.expect(200);
			});

			it('should default max-age=0', async () => {
				await request(server)
					.get('/todo.txt')
					.expect('Cache-Control', 'public, max-age=0')
					.expect(200);
			});

			it('should support urlencoded pathnames', async () => {
				await request(server)
					.get('/foo%20bar')
					.expect(200, 'baz');
			});

			it('should not choke on auth-looking URL', async () => {
				await request(server)
					.get('//todo@txt')
					.expect('X-Send-Stream-Error', 'ConsecutiveSlashesError')
					.expect(404);
			});

			it('should support index.html', async () => {
				await request(server)
					.get('/users/')
					.expect(200)
					.expect('Content-Type', /html/u)
					.expect('<p>tobi, loki, jane</p>');
			});

			it('should support HEAD', async () => {
				await request(server)
					.head('/todo.txt')
					.expect(res => {
						ok((<string | undefined> res.text) === undefined, 'should not have body');
					})
					.expect(200);
			});

			it('should skip POST requests', async () => {
				await request(server)
					.post('/todo.txt')
					.expect('X-Send-Stream-Error', 'MethodNotAllowedStorageError')
					.expect(405);
			});

			it('should support conditional requests', async () => {
				const res = await request(server)
					.get('/todo.txt');
				await request(server)
					.get('/todo.txt')
					.set('If-None-Match', (<Record<string, string>> res.header).etag)
					.expect(304);
			});

			it('should support precondition checks', async () => {
				await request(server)
					.get('/todo.txt')
					.set('If-Match', '"foo"')
					.expect('X-Send-Stream-Error', 'PreconditionFailedStorageError')
					.expect(412);
			});

			it('should serve zero-length files', async () => {
				await request(server)
					.get('/empty.txt')
					.expect(200, '');
			});

			it('should ignore hidden files', async () => {
				await request(server)
					.get('/.hidden')
					.expect('X-Send-Stream-Error', 'IgnoredFileError')
					.expect(404);
			});
		});

		describe('acceptRanges', () => {
			describe('when false', () => {
				let server: Server;
				before(async () => {
					server = await createTestServer(fixtures, { maxRanges: 0 });
				});
				after(done => {
					server.close(done);
				});
				it('should include Accept-Ranges none', async () => {
					await request(server)
						.get('/nums')
						.expect('Accept-Ranges', 'none')
						.expect(200, '123456789');
				});

				it('should ignore Range request header', async () => {
					await request(server)
						.get('/nums')
						.set('Range', 'bytes=0-3')
						.expect('Accept-Ranges', 'none')
						.expect(shouldNotHaveHeader('Content-Range'))
						.expect(200, '123456789');
				});
			});

			describe('when true', () => {
				let server: Server;
				before(async () => {
					server = await createTestServer(fixtures, { maxRanges: 1 });
				});
				after(done => {
					server.close(done);
				});
				it('should include Accept-Ranges', async () => {
					await request(server)
						.get('/nums')
						.expect('Accept-Ranges', 'bytes')
						.expect(200, '123456789');
				});

				it('should obey Rage request header', async () => {
					await request(server)
						.get('/nums')
						.set('Range', 'bytes=0-3')
						.expect('Accept-Ranges', 'bytes')
						.expect('Content-Range', 'bytes 0-3/9')
						.expect(206, '1234');
				});
			});
		});

		describe('cacheControl', () => {
			describe('when false', () => {
				let server: Server;
				before(async () => {
					server = await createTestServer(fixtures, { cacheControl: false });
				});
				after(done => {
					server.close(done);
				});
				it('should not include Cache-Control', async () => {
					await request(server)
						.get('/nums')
						.expect(shouldNotHaveHeader('Cache-Control'))
						.expect(200, '123456789');
				});
			});

			describe('when true', () => {
				let server: Server;
				before(async () => {
					server = await createTestServer(fixtures, { cacheControl: 'public, max-age=0' });
				});
				after(done => {
					server.close(done);
				});
				it('should include Cache-Control', async () => {
					await request(server)
						.get('/nums')
						.expect('Cache-Control', 'public, max-age=0')
						.expect(200, '123456789');
				});
			});
		});

		describe('fallthrough', () => {
			describe('when false', () => {
				let server: Server;
				before(async () => {
					server = await createTestServer(fixtures, {});
				});
				after(done => {
					server.close(done);
				});
				it('should 405 when OPTIONS request', async () => {
					await request(server)
						.options('/todo.txt')
						.expect('Allow', 'GET, HEAD')
						.expect('X-Send-Stream-Error', 'MethodNotAllowedStorageError')
						.expect(405);
				});

				it('should 404 when URL malformed', async () => {
					await request(server)
						.get('/%')
						.expect('X-Send-Stream-Error', 'MalformedPathError')
						.expect(404);
				});

				it('should 404 when traversing past root', async () => {
					await rawRequest(server)
						.get('/users/../../todo.txt')
						.expect('X-Send-Stream-Error', 'NotNormalizedError')
						.expect(404);
				});
			});
		});

		describe('hidden files', () => {
			let server: Server;
			before(async () => {
				server = await createTestServer(fixtures, { ignorePattern: false });
			});
			after(done => {
				server.close(done);
			});
			it('should be served when dotfiles: "allow" is given', async () => {
				await request(server)
					.get('/.hidden')
					.expect(200, 'I am hidden');
			});
		});

		describe('lastModified', () => {
			describe('when false', () => {
				let server: Server;
				before(async () => {
					server = await createTestServer(fixtures, { lastModified: false });
				});
				after(done => {
					server.close(done);
				});
				it('should not include Last-Modifed', async () => {
					await request(server)
						.get('/nums')
						.expect(shouldNotHaveHeader('Last-Modified'))
						.expect(200, '123456789');
				});
			});

			describe('when true', () => {
				let server: Server;
				before(async () => {
					server = await createTestServer(fixtures, {});
				});
				after(done => {
					server.close(done);
				});
				it('should include Last-Modifed', async () => {
					await request(server)
						.get('/nums')
						.expect('Last-Modified', /^\w{3}, \d+ \w+ \d+ \d+:\d+:\d+ \w+$/u)
						.expect(200, '123456789');
				});
			});
		});

		describe('when traversing past root', () => {
			let server: Server;
			before(async () => {
				server = await createTestServer(fixtures, {});
			});
			after(done => {
				server.close(done);
			});
			it('should catch urlencoded ../', async () => {
				await rawRequest(server)
					.get('/users/%2e%2e/%2e%2e/todo.txt')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});

			it('should not allow root path disclosure', async () => {
				await rawRequest(server)
					.get('/users/../../fixtures/todo.txt')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});

			it('should catch urlencoded ../ bis', async () => {
				await rawRequest(server)
					.get('/users/%2e%2e/%2e%2e/static.spec.ts')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});

			it('should not allow root path disclosure bis', async () => {
				await rawRequest(server)
					.get('/users/../../fixtures/static.spec.ts')
					.expect('X-Send-Stream-Error', 'NotNormalizedError')
					.expect(404);
			});
		});

		describe('when request has "Range" header', () => {
			let server: Server;
			before(async () => {
				server = await createTestServer();
			});
			after(done => {
				server.close(done);
			});
			it('should support byte ranges', async () => {
				await request(server)
					.get('/nums')
					.set('Range', 'bytes=0-4')
					.expect('12345');
			});

			it('should be inclusive', async () => {
				await request(server)
					.get('/nums')
					.set('Range', 'bytes=0-0')
					.expect('1');
			});

			it('should set Content-Range', async () => {
				await request(server)
					.get('/nums')
					.set('Range', 'bytes=2-5')
					.expect('Content-Range', 'bytes 2-5/9');
			});

			it('should support -n', async () => {
				await request(server)
					.get('/nums')
					.set('Range', 'bytes=-3')
					.expect('789');
			});

			it('should support n-', async () => {
				await request(server)
					.get('/nums')
					.set('Range', 'bytes=3-')
					.expect('456789');
			});

			it('should respond with 206 "Partial Content"', async () => {
				await request(server)
					.get('/nums')
					.set('Range', 'bytes=0-4')
					.expect(206);
			});

			it('should set Content-Length to the # of octets transferred', async () => {
				await request(server)
					.get('/nums')
					.set('Range', 'bytes=2-3')
					.expect('Content-Length', '2')
					.expect(206, '34');
			});

			describe('when last-byte-pos of the range is greater than current length', () => {
				it('is taken to be equal to one less than the current length', async () => {
					await request(server)
						.get('/nums')
						.set('Range', 'bytes=2-50')
						.expect('Content-Range', 'bytes 2-8/9');
				});

				it('should adapt the Content-Length accordingly', async () => {
					await request(server)
						.get('/nums')
						.set('Range', 'bytes=2-50')
						.expect('Content-Length', '7')
						.expect(206);
				});
			});

			describe('when the first- byte-pos of the range is greater than the current length', () => {
				it('should respond with 416', async () => {
					await request(server)
						.get('/nums')
						.set('Range', 'bytes=9-50')
						.expect('X-Send-Stream-Error', 'RangeNotSatisfiableStorageError')
						.expect(416);
				});

				it('should include a Content-Range header of complete length', async () => {
					await request(server)
						.get('/nums')
						.set('Range', 'bytes=9-50')
						.expect('Content-Range', 'bytes */9')
						.expect('X-Send-Stream-Error', 'RangeNotSatisfiableStorageError')
						.expect(416);
				});
			});

			describe('when syntactically invalid', () => {
				it('should respond with 200 and the entire contents', async () => {
					await request(server)
						.get('/nums')
						.set('Range', 'asdf')
						.expect('123456789');
				});
			});
		});
	});
});
