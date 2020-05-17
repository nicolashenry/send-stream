/* eslint-disable max-classes-per-file, max-lines, max-lines-per-function */
/* eslint-env node, mocha */

import * as assert from 'assert';
import * as http from 'http';
import * as http2 from 'http2';
import { normalize, join } from 'path';
import { Readable } from 'stream';
import { AddressInfo } from 'net';

import request from 'supertest';

import {
	FileSystemStorageOptions,
	FileSystemStorage,
	PrepareResponseOptions,
	getFreshStatus,
	StorageInfo,
	FileData,
	StreamRange,
} from '../src/send-stream';

// test server

const dateRegExp = /^\w{3}, \d+ \w+ \d+ \d+:\d+:\d+ \w+$/u;
const fixtures = join(__dirname, 'fixtures-http');
const mainStorage = new FileSystemStorage(fixtures);

function createServer(opts: PrepareResponseOptions & FileSystemStorageOptions & { root: string }) {
	const storage = new FileSystemStorage(opts.root, opts);
	return http.createServer((req, res) => {
		(async () => {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const response = await storage.prepareResponse(req.url!, req, opts);
			if (response.error) {
				response.headers['X-Send-Stream-Error'] = response.error.code;
			}
			response.send(res);
		})().catch(err => {
			res.statusCode = 500;
			res.end(String(err));
		});
	});
}

function shouldNotHaveHeader(header: string) {
	return (res: request.Response) => {
		const { [header.toLowerCase()]: value } = <{ [key: string]: string }> res.header;
		assert.strictEqual(
			value,
			undefined,
			`should not have header ${ header } (actual value: "${ value }")`,
		);
	};
}

function shouldHaveHeader(header: string) {
	return (res: request.Response) => {
		const { [header.toLowerCase()]: value } = <{ [key: string]: string }> res.header;
		assert.notStrictEqual(
			value,
			undefined,
			`should not have header ${ header } (actual value: "${ value }")`,
		);
	};
}

describe('send(file).pipe(res)', () => {
	let mainApp: http.Server;
	before(() => {
		mainApp = http.createServer((req, res) => {
			(async () => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const response = await mainStorage.prepareResponse(req.url!, req);
				if (response.error) {
					response.headers['X-Send-Stream-Error'] = response.error.code;
				}
				response.send(res);
			})().catch(err => {
				res.statusCode = 500;
				res.end(String(err));
			});
		});
	});

	it('should stream the file contents', async () => {
		await request(mainApp)
			.get('/name.txt')
			.expect('Content-Length', '4')
			.expect(200, 'tobi');
	});

	it('should stream the file contents when there is query string', async () => {
		await request(mainApp)
			.get('/name.txt?foo=bar')
			.expect('Content-Length', '4')
			.expect(200, 'tobi');
	});

	it('should stream a zero-length file', async () => {
		await request(mainApp)
			.get('/empty.txt')
			.expect('Content-Length', '0')
			.expect(200, '');
	});

	it('should decode the given path as a URI', async () => {
		await request(mainApp)
			.get('/some%20thing.txt')
			.expect(200, 'hey');
	});

	it('should serve files with dots in name', async () => {
		await request(mainApp)
			.get('/do..ts.txt')
			.expect(200, '...');
	});

	it('should serve files with unicode character', async () => {
		await request(mainApp)
			.get('/%E2%AD%90.txt')
			.expect('Content-Disposition', 'inline; filename="?.txt"; filename*=UTF-8\'\'%E2%AD%90.txt')
			.expect(200, '⭐');
	});

	it('should serve files in folder with unicode character', async () => {
		await request(mainApp)
			.get('/snow%20%E2%98%83/index.html')
			.expect(200);
	});

	it('should treat a malformed URI as a bad request', async () => {
		await request(mainApp)
			.get('/some%99thing.txt')
			.expect('X-Send-Stream-Error', 'malformed_path')
			.expect(404);
	});

	it('should 404 on NULL bytes', async () => {
		await request(mainApp)
			.get('/some%00thing.txt')
			.expect('X-Send-Stream-Error', 'forbidden_character')
			.expect(404);
	});

	it('should treat an ENAMETOOLONG as a 404', async () => {
		const path = new Array(1000).join('foobar');
		await request(mainApp)
			.get(`/${ path }`)
			.expect('X-Send-Stream-Error', 'does_not_exist')
			.expect(404);
	});

	it('should support HEAD', async () => {
		await request(mainApp)
			.head('/name.txt')
			.expect(200)
			.expect('Content-Length', '4')
			.expect(res => {
				assert.ok(res.text === undefined, 'should not have body');
			});
	});

	it('should add a strong ETag header field', async () => {
		await request(mainApp)
			.get('/name.txt')
			.expect('etag', /^"[^"]+"$/u);
	});

	describe('should add a weak ETag header field when weakEtags is set to true', () => {
		let app: http.Server;
		before(() => {
			const storage = new FileSystemStorage(fixtures, { weakEtags: true });
			app = http.createServer((req, res) => {
				(async () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					(await storage.prepareResponse(req.url!, req)).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});
		it('should add a weak ETag header field when weakEtags is set to true', async () => {
			await request(app)
				.get('/name.txt')
				.expect('etag', /^W\/"[^"]+"$/u);
		});
	});

	describe('should error if no method', () => {
		let app: http.Server;
		before(() => {
			const storage = new FileSystemStorage(fixtures, { weakEtags: true });
			app = http.createServer((req, res) => {
				(async () => {
					req.method = '';
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					(await storage.prepareResponse(req.url!, req)).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});
		it('should error if no method', async () => {
			await request(app)
				.get('/name.txt')
				.expect(500);
		});
	});

	it('should add a Date header field', async () => {
		await request(mainApp)
			.get('/name.txt')
			.expect('date', dateRegExp);
	});

	it('should add a Last-Modified header field', async () => {
		await request(mainApp)
			.get('/name.txt')
			.expect('last-modified', dateRegExp);
	});

	it('should add a Accept-Ranges header field', async () => {
		await request(mainApp)
			.get('/name.txt')
			.expect('Accept-Ranges', 'bytes');
	});

	it('should 404 if the file does not exist', async () => {
		await request(mainApp)
			.get('/meow')
			.expect('X-Send-Stream-Error', 'does_not_exist')
			.expect(404);
	});

	it('should 404 if the file does not exist (HEAD)', async () => {
		await request(mainApp)
			.head('/meow')
			.expect('X-Send-Stream-Error', 'does_not_exist')
			.expect(404);
	});

	it('should set Content-Type via mime map', async () => {
		await request(mainApp)
			.get('/name.txt')
			.expect('Content-Type', 'text/plain; charset=UTF-8')
			.expect(200);
		await request(mainApp)
			.get('/tobi.html')
			.expect('Content-Type', 'text/html; charset=UTF-8')
			.expect(200);
	});

	describe('should hang up on file stream error', () => {
		let app: http.Server;
		class ErrorStorage extends FileSystemStorage {
			// eslint-disable-next-line class-methods-use-this
			createReadableStream() {
				return new Readable({
					read() {
						process.nextTick(() => {
							this.destroy(new Error('boom!'));
						});
					},
				});
			}
		}
		before(() => {
			const storage = new ErrorStorage(fixtures);
			app = http.createServer((req, res) => {
				(async () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					(await storage.prepareResponse(req.url!, req)).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});
		it('should hang up on file stream error', async () => {
			try {
				await request(app).get('/name.txt');
				assert.fail();
			} catch {
				// noop
			}
		});
	});

	describe('send result', () => {
		describe('should have headers when sending file', () => {
			let app: http.Server;
			before(() => {
				app = http.createServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await mainStorage.prepareResponse(req.url!, req);
						result.send(res);
					})().catch(err => {
						res.statusCode = 500;
						res.end(String(err));
					});
				});
			});
			it('should have headers when sending file', async () => {
				await request(app)
					.get('/name.txt')
					.expect(shouldHaveHeader('Content-Length'))
					.expect(200, 'tobi');
			});
		});

		describe('should have headers on 404', () => {
			let app: http.Server;
			before(() => {
				app = http.createServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await mainStorage.prepareResponse(req.url!, req);
						result.send(res);
					})().catch(err => {
						res.statusCode = 500;
						res.end(String(err));
					});
				});
			});
			it('should have headers on 404', async () => {
				await request(app)
					.get('/bogus')
					.expect(shouldHaveHeader('Content-Length'))
					.expect(404);
			});
		});

		describe('should provide path', () => {
			let app: http.Server;
			before(() => {
				app = http.createServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await mainStorage.prepareResponse(req.url!, req);
						assert.ok(result.storageInfo);
						assert.ok(result.storageInfo.attachedData.resolvedPath);
						assert.strictEqual(
							result.storageInfo.attachedData.resolvedPath,
							normalize(join(fixtures, 'name.txt')),
						);
						result.send(res);
					})().catch(err => {
						res.statusCode = 500;
						res.end(String(err));
					});
				});
			});
			it('should provide path', async () => {
				await request(app)
					.get('/name.txt')
					.expect(200, 'tobi');
			});
		});

		describe('should provide stat', () => {
			let app: http.Server;
			before(() => {
				app = http.createServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await mainStorage.prepareResponse(req.url!, req);
						assert.ok(result.storageInfo);
						assert.ok('mtimeMs' in result.storageInfo);
						assert.ok('size' in result.storageInfo);
						assert.ok(result.storageInfo.attachedData.stats);
						assert.ok('ctime' in result.storageInfo.attachedData.stats);
						assert.ok('mtime' in result.storageInfo.attachedData.stats);
						result.send(res);
					})().catch(err => {
						res.statusCode = 500;
						res.end(String(err));
					});
				});
			});
			it('should provide stat', async () => {
				await request(app)
					.get('/name.txt')
					.expect(200, 'tobi');
			});
		});

		describe('should allow altering headers', () => {
			let app: http.Server;
			before(() => {
				app = http.createServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const result = await mainStorage.prepareResponse(req.url!, req);
						result.headers['Cache-Control'] = 'no-cache';
						result.headers['Content-Type'] = 'text/x-custom';
						result.headers['ETag'] = 'W/"everything"';
						result.send(res);
					})().catch(err => {
						res.statusCode = 500;
						res.end(String(err));
					});
				});
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
		describe('should remove Content headers with 304', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ root: fixtures });
			});
			it('should remove Content headers with 304', async () => {
				const res = await request(server)
					.get('/name.txt')
					.expect(200);
				await request(server)
					.get('/name.txt')
					.set('If-None-Match', (<{ [key: string]: string }> res.header).etag)
					.expect(shouldNotHaveHeader('Content-Length'))
					.expect(shouldNotHaveHeader('Content-Type'))
					.expect(304);
			});
		});

		describe('where "If-Match" is set', () => {
			it('should respond with 200 when "*"', async () => {
				await request(mainApp)
					.get('/name.txt')
					.set('If-Match', '*')
					.expect(200);
			});

			it('should respond with 412 when ETag unmatched', async () => {
				await request(mainApp)
					.get('/name.txt')
					.set('If-Match', ' "foo", "bar" ')
					.expect(412);
			});

			it('should respond with 412 when ETag unmatched (HEAD)', async () => {
				await request(mainApp)
					.head('/name.txt')
					.set('If-Match', ' "foo", "bar" ')
					.expect(412);
			});

			describe('should respond with 412 when weak ETag matched', () => {
				let app: http.Server;
				before(() => {
					const storage = new FileSystemStorage(fixtures, { weakEtags: true });
					app = http.createServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							(await storage.prepareResponse(req.url!, req)).send(res);
						})().catch(err => {
							res.statusCode = 500;
							res.end(String(err));
						});
					});
				});
				it('should respond with 412 when weak ETag matched', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					await request(app)
						.get('/name.txt')
						.set('If-Match', `"foo", "bar", ${ (<{ [key: string]: string }> res.header).etag }`)
						.expect(412);
				});
			});

			it('should respond with 200 when strong ETag matched', async () => {
				const res = await request(mainApp)
					.get('/name.txt')
					.expect(200);
				await request(mainApp)
					.get('/name.txt')
					.set('If-Match', `"foo", "bar", ${ (<{ [key: string]: string }> res.header).etag }`)
					.expect(200);
			});
		});

		describe('where "If-Modified-Since" is set', () => {
			it('should respond with 304 when unmodified', async () => {
				const res = await request(mainApp)
					.get('/name.txt')
					.expect(200);
				await request(mainApp)
					.get('/name.txt')
					.set('If-Modified-Since', (<{ [key: string]: string }> res.header)['last-modified'])
					.expect(304);
			});

			it('should respond with 200 when modified', async () => {
				const res = await request(mainApp)
					.get('/name.txt')
					.expect(200);
				const lmod = Date.parse((<{ [key: string]: string }> res.header)['last-modified']);
				const date = new Date(lmod - 60000);
				await request(mainApp)
					.get('/name.txt')
					.set('If-Modified-Since', date.toUTCString())
					.expect(200, 'tobi');
			});
		});

		describe('where "If-None-Match" is set', () => {
			it('should respond with 304 when ETag matched', async () => {
				const res = await request(mainApp)
					.get('/name.txt')
					.expect(200);
				await request(mainApp)
					.get('/name.txt')
					.set('If-None-Match', (<{ [key: string]: string }> res.header).etag)
					.expect(304);
			});

			describe('should respond with 304 when weak ETag matched', () => {
				let app: http.Server;
				before(() => {
					const storage = new FileSystemStorage(fixtures, { weakEtags: true });
					app = http.createServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							(await storage.prepareResponse(req.url!, req)).send(res);
						})().catch(err => {
							res.statusCode = 500;
							res.end(String(err));
						});
					});
				});
				it('should respond with 304 when weak ETag matched', async () => {
					const res = await request(app)
						.get('/name.txt')
						.expect(200);
					await request(mainApp)
						.get('/name.txt')
						.set('If-None-Match', (<{ [key: string]: string }> res.header).etag)
						.expect(304);
				});
			});

			it('should respond with 200 when ETag unmatched', async () => {
				await request(mainApp)
					.get('/name.txt')
					.set('If-None-Match', '"123"')
					.expect(200, 'tobi');
			});

			it('should respond with 412 when ETag matched on not GET or HEAD', done => {
				assert.strictEqual(getFreshStatus(false, { 'if-none-match': '"123"' }, '"123"', false), 412);
				done();
			});
		});

		describe('where "If-Unmodified-Since" is set', () => {
			it('should respond with 200 when unmodified', async () => {
				const res = await request(mainApp)
					.get('/name.txt')
					.expect(200);
				await request(mainApp)
					.get('/name.txt')
					.set('If-Unmodified-Since', (<{ [key: string]: string }> res.header)['last-modified'])
					.expect(200);
			});

			it('should respond with 412 when modified', async () => {
				const res = await request(mainApp)
					.get('/name.txt')
					.expect(200);
				const lmod = Date.parse((<{ [key: string]: string }> res.header)['last-modified']);
				const date = new Date(lmod - 60000).toUTCString();
				await request(mainApp)
					.get('/name.txt')
					.set('If-Unmodified-Since', date)
					.expect(412);
			});

			it('should respond with 200 when invalid date', async () => {
				await request(mainApp)
					.get('/name.txt')
					.set('If-Unmodified-Since', 'foo')
					.expect(200);
			});
		});

		describe('statusCode option should disable 304 and always return statusCode', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ root: fixtures, statusCode: 418 });
			});
			it('statusCode option should disable 304 and always return statusCode', async () => {
				await request(server)
					.get('/name.txt')
					.expect(shouldNotHaveHeader('ETag'))
					.expect(shouldNotHaveHeader('Last-Modified'))
					.expect(418);
				const res = await request(mainApp)
					.get('/name.txt')
					.expect(200);
				await request(server)
					.get('/name.txt')
					.set('If-None-Match', (<{ [key: string]: string }> res.header).etag)
					.expect(418);
			});
		});
	});

	describe('with Range request', () => {
		it('should support byte ranges', async () => {
			await request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=0-4')
				.expect(206, '12345');
		});

		it('should ignore non-byte ranges', async () => {
			await request(mainApp)
				.get('/nums.txt')
				.set('Range', 'items=0-4')
				.expect(200, '123456789');
		});

		it('should be inclusive', async () => {
			await request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=0-0')
				.expect(206, '1');
		});

		it('should set Content-Range', async () => {
			await request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=2-5')
				.expect('Content-Range', 'bytes 2-5/9')
				.expect(206);
		});

		it('should support -n', async () => {
			await request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=-3')
				.expect(206, '789');
		});

		it('should support n-', async () => {
			await request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=3-')
				.expect(206, '456789');
		});

		it('should respond with 206 "Partial Content"', async () => {
			await request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=0-4')
				.expect(206);
		});

		it('should set Content-Length to the # of octets transferred', async () => {
			await request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=2-3')
				.expect('Content-Length', '2')
				.expect(206, '34');
		});

		describe('when last-byte-pos of the range is greater the length', () => {
			it('is taken to be equal to one less than the length', async () => {
				await request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=2-50')
					.expect('Content-Range', 'bytes 2-8/9')
					.expect(206);
			});

			it('should adapt the Content-Length accordingly', async () => {
				await request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=2-50')
					.expect('Content-Length', '7')
					.expect(206);
			});
		});

		describe('when the first- byte-pos of the range is greater length', () => {
			it('should respond with 416', async () => {
				await request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=9-50')
					.expect('Content-Range', 'bytes */9')
					.expect(416);
			});

			it('should respond with 416 for head request', async () => {
				await request(mainApp)
					.head('/nums.txt')
					.set('Range', 'bytes=9-50')
					.expect('Content-Range', 'bytes */9')
					.expect(416);
			});
		});

		describe('when syntactically invalid', () => {
			it('should respond with 200 and the entire contents', async () => {
				await request(mainApp)
					.get('/nums.txt')
					.set('Range', 'asdf')
					.expect(200, '123456789');
			});
		});

		describe('when multiple ranges', () => {
			it('should respond with 206 with the multiple parts', async () => {
				await request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=1-1,3-')
					.expect(shouldNotHaveHeader('Content-Range'))
					.expect('Content-Type', /^multipart\/byteranges/u)
					.parse((res, cb) => {
						const chunks: Buffer[] = [];
						res.on('data', chunk => {
							chunks.push(<Buffer> chunk);
						});
						res.on('error', (err: Error) => {
							cb(err, Buffer.concat(chunks).toString());
						});
						res.on('end', () => {
							cb(null, Buffer.concat(chunks).toString());
						});
					})
					.expect(res => {
						if (
							// eslint-disable-next-line max-len
							!/^--[^\r\n]+\r\ncontent-type: text\/plain; charset=UTF-8\r\ncontent-range: bytes 1-1\/9\r\n\r\n2\r\n--[^\r\n]+\r\ncontent-type: text\/plain; charset=UTF-8\r\ncontent-range: bytes 3-8\/9\r\n\r\n456789\r\n--[^\r\n]+--$/u
								.test(<string> res.body)
						) {
							throw new Error('multipart/byteranges seems invalid');
						}
					});
			});

			it('should respond with 206 is all ranges can be combined', async () => {
				await request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=1-2,3-5')
					.expect('Content-Range', 'bytes 1-5/9')
					.expect(206, '23456');
			});
		});

		describe('when if-range present', () => {
			describe('should not respond with parts when weak etag unchanged', () => {
				let app: http.Server;
				before(() => {
					const storage = new FileSystemStorage(fixtures, { weakEtags: true });
					app = http.createServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							(await storage.prepareResponse(req.url!, req)).send(res);
						})().catch(err => {
							res.statusCode = 500;
							res.end(String(err));
						});
					});
				});
				it('should not respond with parts when weak etag unchanged', async () => {
					const res = await request(app)
						.get('/nums.txt')
						.expect(200);
					const { etag } = <{ [key: string]: string }> res.header;

					await request(app)
						.get('/nums.txt')
						.set('If-Range', etag)
						.set('Range', 'bytes=0-0')
						.expect(200, '123456789');
				});
			});

			it('should respond with parts when strong etag unchanged', async () => {
				const res = await request(mainApp)
					.get('/nums.txt')
					.expect(200);
				const { etag } = <{ [key: string]: string }> res.header;

				await request(mainApp)
					.get('/nums.txt')
					.set('If-Range', etag)
					.set('Range', 'bytes=0-0')
					.expect(206, '1');
			});

			it('should respond with 200 when etag changed', async () => {
				const res = await request(mainApp)
					.get('/nums.txt')
					.expect(200);
				const etag = (<{ [key: string]: string }> res.header).etag.replace(/"(?<c>.)/u, '"0$<c>');

				await request(mainApp)
					.get('/nums.txt')
					.set('If-Range', etag)
					.set('Range', 'bytes=0-0')
					.expect(200, '123456789');
			});

			it('should respond with parts when modified unchanged', async () => {
				const res = await request(mainApp)
					.get('/nums.txt')
					.expect(200);
				const { 'last-modified': modified } = <{ [key: string]: string }> res.header;

				await request(mainApp)
					.get('/nums.txt')
					.set('If-Range', modified)
					.set('Range', 'bytes=0-0')
					.expect(206, '1');
			});

			it('should respond with 200 when modified changed', async () => {
				const res = await request(mainApp)
					.get('/nums.txt')
					.expect(200);
				const modified = Date.parse((<{ [key: string]: string }> res.header)['last-modified']) - 20000;

				await request(mainApp)
					.get('/nums.txt')
					.set('If-Range', new Date(modified).toUTCString())
					.set('Range', 'bytes=0-0')
					.expect(200, '123456789');
			});

			it('should respond with 200 when invalid value', async () => {
				await request(mainApp)
					.get('/nums.txt')
					.set('If-Range', 'foo')
					.set('Range', 'bytes=0-0')
					.expect(200, '123456789');
			});
		});

		describe('statusCode should disable byte ranges', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ root: fixtures, statusCode: 418 });
			});
			it('statusCode should disable byte ranges', async () => {
				await request(server)
					.get('/nums.txt')
					.set('Range', 'bytes=0-4')
					.expect(418, '123456789');
			});
		});
	});

	describe('.etag()', () => {
		let app: http.Server;
		before(() => {
			app = http.createServer((req, res) => {
				(async () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					(await mainStorage.prepareResponse(req.url!, req, { etag: false })).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});
		it('should support disabling etags', async () => {
			await request(app)
				.get('/name.txt')
				.expect(shouldNotHaveHeader('ETag'))
				.expect(200);
		});
	});

	describe('.maxage()', () => {
		it('should default to 0', async () => {
			await request(mainApp)
				.get('/name.txt')
				.expect('Cache-Control', 'public, max-age=0');
		});

		describe('should be configurable', () => {
			let app: http.Server;
			before(() => {
				app = http.createServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						(await mainStorage.prepareResponse(req.url!, req, { cacheControl: 'public, max-age=1' }))
							.send(res);
					})().catch(err => {
						res.statusCode = 500;
						res.end(String(err));
					});
				});
			});
			it('should be configurable', async () => {
				await request(app)
					.get('/name.txt')
					.expect('Cache-Control', 'public, max-age=1');
			});
		});
	});

	describe('relative paths', () => {
		it('should redirect on relative path', async () => {
			await request(mainApp)
				.get('/pets/../name.txt')
				.expect('Location', '/name.txt')
				.expect(301);
		});

		it('should redirect on relative path on head', async () => {
			await request(mainApp)
				.head('/pets/../name.txt')
				.expect('Location', '/name.txt')
				.expect(301);
		});

		it('should redirect on relative path with query params', async () => {
			await request(mainApp)
				.get('/pets/../name.txt?foo=bar')
				.expect('Location', '/name.txt?foo=bar')
				.expect(301);
		});

		it('should redirect on relative path with dot', async () => {
			await request(mainApp)
				.get('/name.txt/.')
				.expect('Location', '/name.txt/')
				.expect(301);
		});

		it('should redirect on relative path with dot and query params', async () => {
			await request(mainApp)
				.get('/name.txt/.?foo=bar')
				.expect('Location', '/name.txt/?foo=bar')
				.expect(301);
		});

		it('should redirect on relative path with dot bis', async () => {
			await request(mainApp)
				.get('/./name.txt')
				.expect('Location', '/name.txt')
				.expect(301);
		});

		it('should redirect on relative path with dot and query params bis', async () => {
			await request(mainApp)
				.get('/./name.txt?foo=bar')
				.expect('Location', '/name.txt?foo=bar')
				.expect(301);
		});
	});
});

describe('send(file, options)', () => {
	describe('maxRanges', () => {
		describe('should support disabling accept-ranges', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ maxRanges: 0, root: fixtures });
			});
			it('should support disabling accept-ranges', async () => {
				await request(server)
					.get('/nums.txt')
					.expect('Accept-Ranges', 'none')
					.expect(200);
			});
		});

		describe('should ignore requested range when maxRange is zero', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ maxRanges: 0, root: fixtures });
			});
			it('should ignore requested range when maxRange is zero', async () => {
				await request(server)
					.get('/nums.txt')
					.set('Range', 'bytes=0-2')
					.expect('Accept-Ranges', 'none')
					.expect(shouldNotHaveHeader('Content-Range'))
					.expect(200, '123456789');
			});
		});

		describe('should ignore requested range when maxRange below', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ maxRanges: 1, root: fixtures });
			});
			it('should ignore requested range when maxRange below', async () => {
				await request(server)
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
			let server: http.Server;
			before(() => {
				server = createServer({ cacheControl: false, root: fixtures });
			});
			it('should support disabling cache-control', async () => {
				await request(server)
					.get('/name.txt')
					.expect(shouldNotHaveHeader('Cache-Control'))
					.expect(200);
			});
		});

		describe('should ignore maxAge option', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ cacheControl: false, root: fixtures });
			});
			it('should ignore maxAge option', async () => {
				await request(server)
					.get('/name.txt')
					.expect(shouldNotHaveHeader('Cache-Control'))
					.expect(200);
			});
		});
	});

	describe('etag', () => {
		let server: http.Server;
		before(() => {
			server = createServer({ etag: false, root: fixtures });
		});
		it('should support disabling etags', async () => {
			await request(server)
				.get('/name.txt')
				.expect(shouldNotHaveHeader('ETag'))
				.expect(200);
		});
	});

	describe('lastModified', () => {
		let server: http.Server;
		before(() => {
			server = createServer({ lastModified: false, root: fixtures });
		});
		it('should support disabling last-modified', async () => {
			await request(server)
				.get('/name.txt')
				.expect(shouldNotHaveHeader('Last-Modified'))
				.expect(200);
		});
	});

	describe('dotfiles', () => {
		describe('should default to "ignore"', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ root: fixtures });
			});
			it('should default to "ignore"', async () => {
				await request(server)
					.get('/.hidden.txt')
					.expect('X-Send-Stream-Error', 'ignored_file')
					.expect(404);
			});
		});

		describe('should ignore folder too', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ root: fixtures });
			});
			it('should ignore folder too', async () => {
				await request(server)
					.get('/.mine/name.txt')
					.expect('X-Send-Stream-Error', 'ignored_file')
					.expect(404);
			});
		});

		describe('when "allow"', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ ignorePattern: false, root: fixtures });
			});
			it('should send dotfile', async () => {
				await request(server)
					.get('/.hidden.txt')
					.expect(200, 'secret');
			});

			it('should send within dotfile directory', async () => {
				await request(server)
					.get('/.mine/name.txt')
					.expect(200, /tobi/u);
			});

			it('should 404 for non-existent dotfile', async () => {
				await request(server)
					.get('/.nothere')
					.expect('X-Send-Stream-Error', 'does_not_exist')
					.expect(404);
			});
		});

		describe('when "ignore"', () => {
			describe('when "ignore" 1', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ ignorePattern: /^\.[^.]/u, root: fixtures });
				});
				it('should 404 for dotfile', async () => {
					await request(server)
						.get('/.hidden.txt')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for dotfile directory', async () => {
					await request(server)
						.get('/.mine')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for dotfile directory with trailing slash', async () => {
					await request(server)
						.get('/.mine/')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for file within dotfile directory', async () => {
					await request(server)
						.get('/.mine/name.txt')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for non-existent dotfile', async () => {
					await request(server)
						.get('/.nothere')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for non-existent dotfile directory', async () => {
					await request(server)
						.get('/.what/name.txt')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});
			});

			describe('when "ignore" 1 (using regexp as text)', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ ignorePattern: '^\\.[^.]', root: fixtures });
				});
				it('should 404 for dotfile', async () => {
					await request(server)
						.get('/.hidden.txt')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for dotfile directory', async () => {
					await request(server)
						.get('/.mine')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for dotfile directory with trailing slash', async () => {
					await request(server)
						.get('/.mine/')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for file within dotfile directory', async () => {
					await request(server)
						.get('/.mine/name.txt')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for non-existent dotfile', async () => {
					await request(server)
						.get('/.nothere')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});

				it('should 404 for non-existent dotfile directory', async () => {
					await request(server)
						.get('/.what/name.txt')
						.expect('X-Send-Stream-Error', 'ignored_file')
						.expect(404);
				});
			});

			describe('when "ignore" 2', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ ignorePattern: /^\.[^.]/u, root: join(fixtures, '.mine') });
				});
				it('should send files in root dotfile directory', async () => {
					await request(server)
						.get('/name.txt')
						.expect(200, /tobi/u);
				});
			});
		});
	});

	describe('root', () => {
		describe('when given', () => {
			describe('should not join root', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ root: fixtures });
				});
				it('should not join root', async () => {
					await request(server)
						.get('/pets/../name.txt')
						.expect('Location', '/name.txt')
						.expect(301);
				});
			});

			describe('double slash should be ignored', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ root: fixtures });
				});
				it('double slash should be ignored', async () => {
					await request(server)
						.get('//name.txt')
						.expect('X-Send-Stream-Error', 'consecutive_slashes')
						.expect(404);
				});
			});

			describe('double slash in sub path should be ignored', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ root: fixtures });
				});
				it('double slash in sub path should be ignored', async () => {
					await request(server)
						.get('/pets//index.html')
						.expect('X-Send-Stream-Error', 'consecutive_slashes')
						.expect(404);
				});
			});

			describe('should work with trailing slash', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ root: `${ fixtures }/` });
				});
				it('should work with trailing slash', async () => {
					await request(server)
						.get('/name.txt')
						.expect(200, 'tobi');
				});
			});

			describe('should 404 on empty path', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ root: join(fixtures, 'name.txt') });
				});
				it('should 404 on empty path', async () => {
					await request(server)
						.get('')
						.expect('X-Send-Stream-Error', 'trailing_slash')
						.expect(404);
				});
			});

			describe('should restrict paths to within root', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ root: fixtures });
				});
				it('should restrict paths to within root', async () => {
					await request(server)
						.get('/pets/../../http.spec.ts')
						.expect('Location', '/http.spec.ts')
						.expect(301);
				});
			});

			describe('should restrict paths to within root with path parts', () => {
				let app: http.Server;
				before(() => {
					const storage = new FileSystemStorage(fixtures);
					app = http.createServer((req, res) => {
						(async () => {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const response = await storage.prepareResponse(req.url!.split('/'), req);
							if (response.error) {
								response.headers['X-Send-Stream-Error'] = response.error.code;
							}
							response.send(res);
						})().catch(err => {
							res.statusCode = 500;
							res.end(String(err));
						});
					});
				});
				it('should restrict paths to within root with path parts', async () => {
					await request(app)
						.get('/pets/../../http.spec.ts')
						.expect('X-Send-Stream-Error', 'invalid_path')
						.expect(404);
				});
			});

			describe('should allow .. in root', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ root: `${ fixtures }/../fixtures-http` });
				});
				it('should allow .. in root', async () => {
					await request(server)
						.get('/pets/../../http.spec.ts')
						.expect('Location', '/http.spec.ts')
						.expect(301);
				});
			});

			describe('should not allow root transversal', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ root: join(fixtures, 'name.d') });
				});
				it('should not allow root transversal', async () => {
					await request(server)
						.get('/../name.dir/name.txt')
						.expect('Location', '/name.dir/name.txt')
						.expect(301);
				});
			});

			describe('should not allow root path disclosure', () => {
				let server: http.Server;
				before(() => {
					server = createServer({ root: fixtures });
				});
				it('should not allow root path disclosure', async () => {
					await request(server)
						.get('/pets/../../fixtures-http/name.txt')
						.expect('Location', '/fixtures-http/name.txt')
						.expect(301);
				});
			});
		});

		describe('when missing', () => {
			let mainApp: http.Server;
			before(() => {
				mainApp = http.createServer((req, res) => {
					(async () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						(await mainStorage.prepareResponse(req.url!, req)).send(res);
					})().catch(err => {
						res.statusCode = 500;
						res.end(String(err));
					});
				});
			});

			it('should consider .. malicious', async () => {
				await request(mainApp)
					.get('/../http.spec.ts')
					.expect('Location', '/http.spec.ts')
					.expect(301);
			});

			it('should still serve files with dots in name', async () => {
				await request(mainApp)
					.get('/do..ts.txt')
					.expect(200, '...');
			});
		});
	});
	describe('other methods', () => {
		let mainApp: http.Server;
		before(() => {
			mainApp = http.createServer((req, res) => {
				(async () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					(await mainStorage.prepareResponse(req.url!, req)).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});

		it('should 405 when OPTIONS request', async () => {
			await request(mainApp)
				.options('/name.txt')
				.expect('Allow', 'GET, HEAD')
				.expect(405);
		});

		it('should 405 on post', async () => {
			await request(mainApp)
				.post('/name.txt')
				.expect('Allow', 'GET, HEAD')
				.expect(405);
		});

		describe('should not 405 on post allowed', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ root: fixtures, allowedMethods: ['POST'] });
			});
			it('should not 405 on post allowed', async () => {
				await request(server)
					.post('/name.txt')
					.expect(200);
			});
			it('should 405 on not head allowed', async () => {
				await request(server)
					.head('/name.txt')
					.expect(405);
			});
		});

		describe('should 405 on head not allowed', () => {
			let server: http.Server;
			before(() => {
				server = createServer({ root: fixtures, allowedMethods: ['GET'] });
			});
			it('should 405 on head not allowed', async () => {
				await request(server)
					.post('/name.txt')
					.expect('Allow', 'GET')
					.expect(405);
			});
		});
	});
});

describe('when something happenned too soon', () => {
	describe('should ignore if headers already sent', () => {
		let app: http.Server;
		before(() => {
			app = http.createServer((req, res) => {
				(async () => {
					res.write('the end');
					res.end();
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					(await mainStorage.prepareResponse(req.url!, req)).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});
		it('should ignore if headers already sent', async () => {
			await request(app)
				.get('/nums.txt')
				.expect(200);
		});
	});

	describe('should ignore if connection already destroyed', () => {
		let app: http.Server;
		before(() => {
			app = http.createServer((req, res) => {
				(async () => {
					res.destroy();
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					(await mainStorage.prepareResponse(req.url!, req)).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});
		it('should ignore if connection already destroyed', async () => {
			try {
				await request(app)
					.get('/nums.txt');
				assert.fail();
			} catch {
				// noop
			}
		});
	});

	describe('should handle connection destroyed', () => {
		let app: http.Server;
		before(() => {
			app = http.createServer((req, res) => {
				(async () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					(await mainStorage.prepareResponse(req.url!, req)).send(res);
					res.destroy(new Error('olala'));
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});
		it('should handle connection destroyed', async () => {
			try {
				await request(app)
					.get('/nums.txt');
				assert.fail();
			} catch {
				// noop
			}
		});
	});

	describe('should handle stream pipe error', () => {
		let app: http.Server;
		before(() => {
			class ErrorStorage extends FileSystemStorage {
				createReadableStream(si: StorageInfo<FileData>): Readable {
					// eslint-disable-next-line @typescript-eslint/no-this-alias
					const st = this;
					return new class extends Readable {
						// eslint-disable-next-line class-methods-use-this
						pipe<T extends NodeJS.WritableStream>(): T {
							throw new Error('oops');
						}

						// eslint-disable-next-line class-methods-use-this
						async _destroy(error: Error | null, callback: (error?: Error | null) => void) {
							await st.close(si);
							callback(error);
						}
					}();
				}
			}

			const errorStorage = new ErrorStorage(fixtures);

			app = http.createServer((req, res) => {
				(async () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					(await errorStorage.prepareResponse(req.url!, req)).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});
		it('should handle stream pipe error', async () => {
			try {
				await request(app)
					.get('/nums.txt');
				assert.fail();
			} catch {
				// noop
			}
		});
	});

	describe('should handle stream read error on already closed stream', () => {
		let app: http.Server;
		before(() => {
			class ErrorStorage extends FileSystemStorage {
				createReadableStream(si: StorageInfo<FileData>): Readable {
					// eslint-disable-next-line @typescript-eslint/no-this-alias
					const st = this;
					return new class extends Readable {
						// eslint-disable-next-line class-methods-use-this
						pipe<T extends NodeJS.WritableStream>(): T {
							throw new Error('oops');
						}

						// eslint-disable-next-line class-methods-use-this
						async _destroy(error: Error | null, callback: (error?: Error | null) => void) {
							await st.close(si);
							callback(error);
						}
					}();
				}
			}

			const errorStorage = new ErrorStorage(fixtures);

			app = http.createServer((req, res) => {
				(async () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const resp = await errorStorage.prepareResponse(req.url!, req);
					const { stream: { pipe: p } } = resp;
					resp.stream.pipe = function pipe<T extends NodeJS.WritableStream>(
						this: ReadableStream,
						destination: T,
						options?: { end?: boolean },
					): T {
						res.destroy();
						return <T> p.call(this, destination, options);
					};
					resp.send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
				});
			});
		});
		it('should handle stream read error on already closed stream', async () => {
			try {
				await request(app)
					.get('/nums.txt');
				assert.fail();
			} catch {
				// noop
			}
		});
	});

	describe('should handle stream read error on already closed stream (http2)', () => {
		let app: http2.Http2Server;
		let address: AddressInfo;
		const sessions: http2.ServerHttp2Session[] = [];
		before(done => {
			class ErrorStorage extends FileSystemStorage {
				createReadableStream(si: StorageInfo<FileData>): Readable {
					// eslint-disable-next-line @typescript-eslint/no-this-alias
					const st = this;
					return new class extends Readable {
						// eslint-disable-next-line class-methods-use-this
						pipe<T extends NodeJS.WritableStream>(): T {
							throw new Error('oops');
						}

						// eslint-disable-next-line class-methods-use-this
						async _destroy(error: Error | null, callback: (error?: Error | null) => void) {
							await st.close(si);
							callback(error);
						}
					}();
				}
			}

			const errorStorage = new ErrorStorage(fixtures);

			app = http2.createServer((req, res) => {
				(async () => {
					const resp = await errorStorage.prepareResponse(req.url, req);
					const { stream: { pipe: p } } = resp;
					resp.stream.pipe = function pipe<T extends NodeJS.WritableStream>(
						this: ReadableStream,
						destination: T,
						options?: { end?: boolean },
					): T {
						res.stream.destroy();
						return <T> p.call(this, destination, options);
					};
					resp.send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
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
		it('should handle stream read error on already closed stream (http2)', done => {
			const client = http2.connect(`http://localhost:${ address.port }`);

			const req = client.request({ ':path': '/name.txt' });

			req.setEncoding('utf8');

			req.on('end', () => {
				client.close();
				done();
			});

			req.end();
		});
	});
});

describe('http2 server', () => {
	describe('should 200 on simple request', () => {
		let app: http2.Http2Server;
		let address: AddressInfo;
		const sessions: http2.ServerHttp2Session[] = [];
		before(done => {
			const storage = new FileSystemStorage(fixtures);
			app = http2.createServer();

			app.on('stream', (stream, headers) => {
				(async () => {
					(await storage.prepareResponse(
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						headers[':path']!,
						headers,
					)).send(stream);
				})().catch(err => {
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
		it('should 200 on simple request', done => {
			const client = http2.connect(`http://localhost:${ address.port }`);

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
					done();
				}
			});
			req.end();
		});
	});

	describe('should 200 on simple request with compatibility layer', () => {
		let app: http2.Http2Server;
		let address: AddressInfo;
		const sessions: http2.ServerHttp2Session[] = [];
		before(done => {
			const storage = new FileSystemStorage(fixtures);
			app = http2.createServer((req, res) => {
				(async () => {
					(await storage.prepareResponse(
						req.url,
						req,
					)).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
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
		it('should 200 on simple request with compatibility layer', done => {
			const client = http2.connect(`http://localhost:${ address.port }`);

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
					done();
				}
			});
			req.end();
		});
	});

	describe('should ignore if connection already destroyed', () => {
		let app: http2.Http2Server;
		let address: AddressInfo;
		const sessions: http2.ServerHttp2Session[] = [];
		before(done => {
			const storage = new FileSystemStorage(fixtures);

			app = http2.createServer((req, res) => {
				(async () => {
					res.stream.destroy();
					(await storage.prepareResponse(
						req.url,
						req,
					)).send(res);
				})().catch(err => {
					res.statusCode = 500;
					res.end(String(err));
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
		it('should ignore if connection already destroyed', done => {
			const client = http2.connect(`http://localhost:${ address.port }`);

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
				done();
			});

			req.end();
		});
	});

	describe('should handle errors', () => {
		let app: http2.Http2Server;
		let address: AddressInfo;
		const sessions: http2.ServerHttp2Session[] = [];
		before(done => {
			class ErrorStorage extends FileSystemStorage {
				// eslint-disable-next-line class-methods-use-this
				createReadableStream(
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
			app = http2.createServer();

			app.on('stream', (stream, headers) => {
				(async () => {
					const result = await storage.prepareResponse(
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						headers[':path']!,
						headers,
					);
					result.send(stream);
				})().catch(err => {
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
		it('should handle errors', done => {
			const client = http2.connect(`http://localhost:${ address.port }`);

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
				if (!hasError) {
					hasError = true;
					done();
				}
			});

			req.setEncoding('utf8');
			let data = '';
			req.on('data', chunk => {
				data += chunk;
			});
			req.on('end', () => {
				if (data !== '' && !hasError) {
					hasError = true;
					done(new Error(`body received ${ JSON.stringify(data) } does not equals "tobi"`));
				}
				client.close();
			});
			req.end();
		});
	});

	describe('should 500 on missing method', () => {
		let app: http2.Http2Server;
		let address: AddressInfo;
		const sessions: http2.ServerHttp2Session[] = [];
		before(done => {
			const storage = new FileSystemStorage(fixtures);
			app = http2.createServer();

			app.on('stream', (stream, headers) => {
				(async () => {
					headers[':method'] = '';
					(await storage.prepareResponse(
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						headers[':path']!,
						headers,
					)).send(stream);
				})().catch(err => {
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
			const client = http2.connect(`http://localhost:${ address.port }`);

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
