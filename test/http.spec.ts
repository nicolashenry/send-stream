
import * as assert from 'assert';
import * as http from 'http';
import * as http2 from 'http2';
import { normalize, join } from 'path';
// tslint:disable-next-line:no-implicit-dependencies
import request from 'supertest';

import {
	FileSystemStorageOptions,
	FileSystemStorage,
	PrepareResponseOptions,
	getFreshStatus
} from '../lib';

// tslint:disable:no-identical-functions

function after(count: number, callback: (err?: unknown, body?: unknown) => void) {
	let bail = false;
	let currentCount = count;

	return (count === 0) ? callback : proxy;

	function proxy(err?: unknown, result?: unknown) {
		if (currentCount <= 0) {
			throw new Error('after called too many times');
		}
		--currentCount;

		// after first error, rest are passed to err_cb
		// tslint:disable-next-line: strict-boolean-expressions
		if (err) {
			bail = true;
			callback(err, result);
		} else if (currentCount === 0 && !bail) {
			callback(null, result);
		}
	}
}

// test server

const dateRegExp = /^\w{3}, \d+ \w+ \d+ \d+:\d+:\d+ \w+$/;
const fixtures = join(__dirname, 'fixtures-http');
const mainStorage = new FileSystemStorage(fixtures);
const mainApp = http.createServer(async (req, res) => {
	try {
		// tslint:disable-next-line: no-non-null-assertion
		(await mainStorage.prepareResponse(req.url!, req)).send(res);
	} catch (err) {
		res.statusCode = 500;
		res.end(String(err));
	}
});

describe('send(file).pipe(res)', () => {
	it('should stream the file contents', done => {
		request(mainApp)
			.get('/name.txt')
			.expect('Content-Length', '4')
			.expect(200, 'tobi', done);
	});

	it('should stream a zero-length file', done => {
		request(mainApp)
			.get('/empty.txt')
			.expect('Content-Length', '0')
			.expect(200, '', done);
	});

	it('should decode the given path as a URI', done => {
		request(mainApp)
			.get('/some%20thing.txt')
			.expect(200, 'hey', done);
	});

	it('should serve files with dots in name', done => {
		request(mainApp)
			.get('/do..ts.txt')
			.expect(200, '...', done);
	});

	it('should serve files with unicode character', done => {
		request(mainApp)
			.get('/%E2%AD%90.txt')
			.expect('Content-Disposition', 'inline; filename="?.txt"; filename*=UTF-8\'\'%E2%AD%90.txt')
			.expect(200, '⭐', done);
	});

	it('should serve files in folder with unicode character', done => {
		request(mainApp)
			.get('/snow%20%E2%98%83/index.html')
			.expect(200, done);
	});

	it('should treat a malformed URI as a bad request', done => {
		request(mainApp)
			.get('/some%99thing.txt')
			.expect(404, done);
	});

	it('should 404 on NULL bytes', done => {
		request(mainApp)
			.get('/some%00thing.txt')
			.expect(404, done);
	});

	it('should treat an ENAMETOOLONG as a 404', done => {
		const path = Array(100).join('foobar');
		request(mainApp)
			.get(`/${ path }`)
			.expect(404, done);
	});

	it('should support HEAD', done => {
		request(mainApp)
			.head('/name.txt')
			.expect(200)
			.expect('Content-Length', '4')
			.expect(res => {
				// tslint:disable-next-line: strict-type-predicates
				assert.ok(res.text === undefined, 'should not have body');
			})
			.end(done);
	});

	it('should add a strong ETag header field', done => {
		request(mainApp)
			.get('/name.txt')
			.expect('etag', /^"[^"]+"$/)
			.end(done);
	});

	it('should add a weak ETag header field when weakEtags is set to true', done => {
		const storage = new FileSystemStorage(fixtures, { weakEtags: true });
		const app = http.createServer(async (req, res) => {
			try {
				// tslint:disable-next-line: no-non-null-assertion
				(await storage.prepareResponse(req.url!, req)).send(res);
			} catch (err) {
				res.statusCode = 500;
				res.end(String(err));
			}
		});
		request(app)
			.get('/name.txt')
			.expect('etag', /^W\/"[^"]+"$/)
			.end(done);
	});

	it('should add a Date header field', done => {
		request(mainApp)
			.get('/name.txt')
			.expect('date', dateRegExp, done);
	});

	it('should add a Last-Modified header field', done => {
		request(mainApp)
			.get('/name.txt')
			.expect('last-modified', dateRegExp, done);
	});

	it('should add a Accept-Ranges header field', done => {
		request(mainApp)
			.get('/name.txt')
			.expect('Accept-Ranges', 'bytes', done);
	});

	it('should 404 if the file does not exist', done => {
		request(mainApp)
			.get('/meow')
			.expect(404, done);
	});

	it('should set Content-Type via mime map', done => {
		request(mainApp)
			.get('/name.txt')
			.expect('Content-Type', 'text/plain; charset=UTF-8')
			.expect(200, err => {
				if (err) {
					done(err);
					return;
				}
				request(mainApp)
					.get('/tobi.html')
					.expect('Content-Type', 'text/html; charset=UTF-8')
					.expect(200, done);
			});
	});

	it('should hang up on file stream error', done => {
		const app = http.createServer(async (req, res) => {
			try {
				// tslint:disable-next-line: no-non-null-assertion
				const result = (await mainStorage.prepareResponse(req.url!, req)).send(res);
				process.nextTick(() => {
					result.stream.destroy(new Error('boom!'));
				});
			} catch (err) {
				res.statusCode = 500;
				res.end(String(err));
			}
		});

		request(app)
			.get('/name.txt')
			.catch(() => {
				done();
			});
	});

	describe('send result', () => {
		it('should have headers when sending file', done => {
			const cb = after(2, done);
			const server = http.createServer(async (req, res) => {
				try {
					// tslint:disable-next-line: no-non-null-assertion
					const result = await mainStorage.prepareResponse(req.url!, req);
					if (result.headers['Content-Length']) {
						cb();
					} else {
						cb(new Error('missing Content-Length header before sending'));
					}
					result.send(res);
				} catch (err) {
					res.statusCode = 500;
					res.end(String(err));
				}
			});

			request(server)
				.get('/name.txt')
				.expect(200, 'tobi', cb);
		});

		it('should have headers on 404', done => {
			const cb = after(2, done);
			const server = http.createServer(async (req, res) => {
				try {
					// tslint:disable-next-line: no-non-null-assertion
					const result = await mainStorage.prepareResponse(req.url!, req);
					if (result.headers['Content-Length']) {
						cb();
					} else {
						cb(new Error('missing Content-Length header before sending'));
					}
					result.send(res);
				} catch (err) {
					res.statusCode = 500;
					res.end(String(err));
				}
			});

			request(server)
				.get('/bogus')
				.expect(404, cb);
		});

		it('should provide path', done => {
			const cb = after(2, done);
			const server = http.createServer(async (req, res) => {
				try {
					// tslint:disable-next-line: no-non-null-assertion
					const result = await mainStorage.prepareResponse(req.url!, req);
					assert.ok(result.storageInfo);
					if (result.storageInfo) {
						assert.ok(result.storageInfo.attachedData.resolvedPath);
						assert.strictEqual(
							result.storageInfo.attachedData.resolvedPath,
							normalize(join(fixtures, 'name.txt'))
						);
						cb();
					}
					result.send(res);
				} catch (err) {
					res.statusCode = 500;
					res.end(String(err));
				}
			});

			request(server)
				.get('/name.txt')
				.expect(200, 'tobi', cb);
		});

		it('should provide stat', done => {
			const cb = after(2, done);
			const server = http.createServer(async (req, res) => {
				try {
					// tslint:disable-next-line: no-non-null-assertion
					const result = await mainStorage.prepareResponse(req.url!, req);
					assert.ok(result.storageInfo);
					if (result.storageInfo) {
						assert.ok('mtimeMs' in result.storageInfo);
						assert.ok('size' in result.storageInfo);
						assert.ok(result.storageInfo.attachedData.stats);
						assert.ok('ctime' in result.storageInfo.attachedData.stats);
						assert.ok('mtime' in result.storageInfo.attachedData.stats);
						cb();
					}
					result.send(res);
				} catch (err) {
					res.statusCode = 500;
					res.end(String(err));
				}
			});

			request(server)
				.get('/name.txt')
				.expect(200, 'tobi', cb);
		});

		it('should allow altering headers', done => {
			const server = http.createServer(async (req, res) => {
				try {
					// tslint:disable-next-line: no-non-null-assertion
					const result = await mainStorage.prepareResponse(req.url!, req);
					result.headers['Cache-Control'] = 'no-cache';
					result.headers['Content-Type'] = 'text/x-custom';
					result.headers['ETag'] = 'W/"everything"';
					result.send(res);
				} catch (err) {
					res.statusCode = 500;
					res.end(String(err));
				}
			});

			request(server)
				.get('/name.txt')
				.expect(200)
				.expect('Cache-Control', 'no-cache')
				.expect('Content-Type', 'text/x-custom')
				.expect('ETag', 'W/"everything"')
				.expect('tobi')
				.end(done);
		});
	});

	describe('when no "error" listeners are present', () => {
		it('should respond to errors directly', done => {
			request(createServer({ root: fixtures }))
				.get('/foobar')
				.expect(404, /Not Found/, done);
		});
	});

	describe('with conditional-GET', () => {
		it('should remove Content headers with 304', done => {
			const server = createServer({ root: fixtures });

			request(server)
				.get('/name.txt')
				.expect(200, (err, res) => {
					if (err) {
						done(err);
						return;
					}
					request(server)
						.get('/name.txt')
						// tslint:disable-next-line: no-unsafe-any
						.set('If-None-Match', res.header.etag)
						.expect(shouldNotHaveHeader('Content-Length'))
						.expect(shouldNotHaveHeader('Content-Type'))
						.expect(304, done);
				});
		});

		describe('where "If-Match" is set', () => {
			it('should respond with 200 when "*"', done => {
				request(mainApp)
					.get('/name.txt')
					.set('If-Match', '*')
					.expect(200, done);
			});

			it('should respond with 412 when ETag unmatched', done => {
				request(mainApp)
					.get('/name.txt')
					.set('If-Match', ' "foo", "bar" ')
					.expect(412, done);
			});

			it('should respond with 412 when weak ETag matched', done => {
				const storage = new FileSystemStorage(fixtures, { weakEtags: true });
				const app = http.createServer(async (req, res) => {
					try {
						// tslint:disable-next-line: no-non-null-assertion
						(await storage.prepareResponse(req.url!, req)).send(res);
					} catch (err) {
						res.statusCode = 500;
						res.end(String(err));
					}
				});
				request(app)
					.get('/name.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						request(app)
							.get('/name.txt')
									// tslint:disable-next-line: no-unsafe-any
									.set('If-Match', `"foo", "bar", ${ res.header.etag }`)
							.expect(412, done);
					});
			});

			it('should respond with 200 when strong ETag matched', done => {
				request(mainApp)
					.get('/name.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						request(mainApp)
							.get('/name.txt')
									// tslint:disable-next-line: no-unsafe-any
									.set('If-Match', `"foo", "bar", ${ res.header.etag }`)
							.expect(200, done);
					});
			});
		});

		describe('where "If-Modified-Since" is set', () => {
			it('should respond with 304 when unmodified', done => {
				request(mainApp)
					.get('/name.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						request(mainApp)
							.get('/name.txt')
							// tslint:disable-next-line: no-unsafe-any
							.set('If-Modified-Since', res.header['last-modified'])
							.expect(304, done);
					});
			});

			it('should respond with 200 when modified', done => {
				request(mainApp)
					.get('/name.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						// tslint:disable-next-line: no-unsafe-any
						const lmod = Date.parse(res.header['last-modified']);
						const date = new Date(lmod - 60000);
						request(mainApp)
							.get('/name.txt')
							.set('If-Modified-Since', date.toUTCString())
							.expect(200, 'tobi', done);
					});
			});
		});

		describe('where "If-None-Match" is set', () => {
			it('should respond with 304 when ETag matched', done => {
				request(mainApp)
					.get('/name.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						request(mainApp)
							.get('/name.txt')
							// tslint:disable-next-line: no-unsafe-any
							.set('If-None-Match', res.header.etag)
							.expect(304, done);
					});
			});

			it('should respond with 200 when ETag unmatched', done => {
				request(mainApp)
					.get('/name.txt')
					.expect(200, err => {
						if (err) {
							done(err);
							return;
						}
						request(mainApp)
							.get('/name.txt')
							.set('If-None-Match', '"123"')
							.expect(200, 'tobi', done);
					});
			});

			it('should respond with 412 when ETag matched on not GET or HEAD', done => {
				assert.strictEqual(getFreshStatus('POST', { 'if-none-match': '"123"' }, { ETag: '"123"' }), 412);
				done();
			});
		});

		describe('where "If-Unmodified-Since" is set', () => {
			it('should respond with 200 when unmodified', done => {
				request(mainApp)
					.get('/name.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						request(mainApp)
							.get('/name.txt')
							// tslint:disable-next-line: no-unsafe-any
							.set('If-Unmodified-Since', res.header['last-modified'])
							.expect(200, done);
					});
			});

			it('should respond with 412 when modified', done => {
				request(mainApp)
					.get('/name.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						// tslint:disable-next-line: no-unsafe-any
						const lmod = Date.parse(res.header['last-modified']);
						const date = new Date(lmod - 60000).toUTCString();
						request(mainApp)
							.get('/name.txt')
							.set('If-Unmodified-Since', date)
							.expect(412, done);
					});
			});

			it('should respond with 200 when invalid date', done => {
				request(mainApp)
					.get('/name.txt')
					.set('If-Unmodified-Since', 'foo')
					.expect(200, done);
			});
		});

		it('fullResponse option should disable 304', done => {
			const server = createServer({ root: fixtures, fullResponse: true });

			request(server)
				.get('/name.txt')
				.expect(shouldNotHaveHeader('ETag'))
				.expect(shouldNotHaveHeader('Last-Modified'))
				.expect(200, err => {
					if (err) {
						done(err);
						return;
					}
					request(mainApp)
					.get('/name.txt')
					.expect(200, (mainErr, res) => {
						if (mainErr) {
							done(mainErr);
							return;
						}
						request(server)
							.get('/name.txt')
							// tslint:disable-next-line: no-unsafe-any
							.set('If-None-Match', res.header.etag)
							.expect(200, done);
					});
				});
		});
	});

	describe('with Range request', () => {
		it('should support byte ranges', done => {
			request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=0-4')
				.expect(206, '12345', done);
		});

		it('should ignore non-byte ranges', done => {
			request(mainApp)
				.get('/nums.txt')
				.set('Range', 'items=0-4')
				.expect(200, '123456789', done);
		});

		it('should be inclusive', done => {
			request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=0-0')
				.expect(206, '1', done);
		});

		it('should set Content-Range', done => {
			request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=2-5')
				.expect('Content-Range', 'bytes 2-5/9')
				.expect(206, done);
		});

		it('should support -n', done => {
			request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=-3')
				.expect(206, '789', done);
		});

		it('should support n-', done => {
			request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=3-')
				.expect(206, '456789', done);
		});

		it('should respond with 206 "Partial Content"', done => {
			request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=0-4')
				.expect(206, done);
		});

		it('should set Content-Length to the # of octets transferred', done => {
			request(mainApp)
				.get('/nums.txt')
				.set('Range', 'bytes=2-3')
				.expect('Content-Length', '2')
				.expect(206, '34', done);
		});

		describe('when last-byte-pos of the range is greater the length', () => {
			it('is taken to be equal to one less than the length', done => {
				request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=2-50')
					.expect('Content-Range', 'bytes 2-8/9')
					.expect(206, done);
			});

			it('should adapt the Content-Length accordingly', done => {
				request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=2-50')
					.expect('Content-Length', '7')
					.expect(206, done);
			});
		});

		describe('when the first- byte-pos of the range is greater length', () => {
			it('should respond with 416', done => {
				request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=9-50')
					.expect('Content-Range', 'bytes */9')
					.expect(416, done);
			});
		});

		describe('when syntactically invalid', () => {
			it('should respond with 200 and the entire contents', done => {
				request(mainApp)
					.get('/nums.txt')
					.set('Range', 'asdf')
					.expect(200, '123456789', done);
			});
		});

		describe('when multiple ranges', () => {
			it('should respond with 206 with the multiple parts', done => {
				request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=1-1,3-')
					.expect(shouldNotHaveHeader('Content-Range'))
					.expect('Content-Type', /^multipart\/byteranges/)
					.parse((res: request.Response, cb: (err: Error | null, body: unknown) => void) => {
						const chunks: Buffer[] = [];
						res.on('data', chunk => {
							chunks.push(<Buffer> chunk);
						});
						res.on('error', err => {
							cb(<Error> err, Buffer.concat(chunks).toString());
						});
						res.on('end', () => {
							cb(null, Buffer.concat(chunks).toString());
						});
					})
					.expect(res => {
						if (// tslint:disable-next-line:max-line-length ter-max-len
							!/^--[^\r\n]+\r\ncontent-type: text\/plain; charset=UTF-8\r\ncontent-range: bytes 1-1\/9\r\n\r\n2\r\n--[^\r\n]+\r\ncontent-type: text\/plain; charset=UTF-8\r\ncontent-range: bytes 3-8\/9\r\n\r\n456789\r\n--[^\r\n]+--$/
							.test(<string> res.body)
						) {
							throw new Error('multipart/byteranges seems invalid');
						}
					})
					.end(done);
			});

			it('should respond with 206 is all ranges can be combined', done => {
				request(mainApp)
					.get('/nums.txt')
					.set('Range', 'bytes=1-2,3-5')
					.expect('Content-Range', 'bytes 1-5/9')
					.expect(206, '23456', done);
			});
		});

		describe('when if-range present', () => {
			it('should not respond with parts when weak etag unchanged', done => {
				const storage = new FileSystemStorage(fixtures, { weakEtags: true });
				const app = http.createServer(async (req, res) => {
					try {
						// tslint:disable-next-line: no-non-null-assertion
						(await storage.prepareResponse(req.url!, req)).send(res);
					} catch (err) {
						res.statusCode = 500;
						res.end(String(err));
					}
				});
				request(app)
					.get('/nums.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						// tslint:disable-next-line: no-unsafe-any
						const etag = <string> res.header.etag;

						request(app)
							.get('/nums.txt')
							.set('If-Range', etag)
							.set('Range', 'bytes=0-0')
							.expect(200, '123456789', done);
					});
			});

			it('should respond with parts when strong etag unchanged', done => {
				request(mainApp)
					.get('/nums.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						// tslint:disable-next-line: no-unsafe-any
						const etag = <string> res.header.etag;

						request(mainApp)
							.get('/nums.txt')
							.set('If-Range', etag)
							.set('Range', 'bytes=0-0')
							.expect(206, '1', done);
					});
			});

			it('should respond with 200 when etag changed', done => {
				request(mainApp)
					.get('/nums.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						// tslint:disable-next-line: no-unsafe-any
						const etag = (<string> res.header.etag).replace(/"(.)/, '"0$1');

						request(mainApp)
							.get('/nums.txt')
							.set('If-Range', etag)
							.set('Range', 'bytes=0-0')
							.expect(200, '123456789', done);
					});
			});

			it('should respond with parts when modified unchanged', done => {
				request(mainApp)
					.get('/nums.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						// tslint:disable-next-line: no-unsafe-any
						const modified = <string> res.header['last-modified'];

						request(mainApp)
							.get('/nums.txt')
							.set('If-Range', modified)
							.set('Range', 'bytes=0-0')
							.expect(206, '1', done);
					});
			});

			it('should respond with 200 when modified changed', done => {
				request(mainApp)
					.get('/nums.txt')
					.expect(200, (err, res) => {
						if (err) {
							done(err);
							return;
						}
						// tslint:disable-next-line: no-unsafe-any
						const modified = Date.parse(res.header['last-modified']) - 20000;

						request(mainApp)
							.get('/nums.txt')
							.set('If-Range', new Date(modified).toUTCString())
							.set('Range', 'bytes=0-0')
							.expect(200, '123456789', done);
					});
			});

			it('should respond with 200 when invalid value', done => {
				request(mainApp)
					.get('/nums.txt')
					.set('If-Range', 'foo')
					.set('Range', 'bytes=0-0')
					.expect(200, '123456789', done);
			});
		});

		it('fullResponse should disable byte ranges', done => {
			const server = createServer({ root: fixtures, fullResponse: true });
			request(server)
				.get('/nums.txt')
				.set('Range', 'bytes=0-4')
				.expect(200, '123456789', done);
		});
	});

	describe('.etag()', () => {
		it('should support disabling etags', done => {
			const app = http.createServer(async (req, res) => {
				try {
					// tslint:disable-next-line: no-non-null-assertion
					(await mainStorage.prepareResponse(req.url!, req, { etag: false })).send(res);
				} catch (err) {
					res.statusCode = 500;
					res.end(String(err));
				}
			});

			request(app)
				.get('/name.txt')
				.expect(shouldNotHaveHeader('ETag'))
				.expect(200, done);
		});
	});

	describe('.maxage()', () => {
		it('should default to 0', done => {
			request(mainApp)
				.get('/name.txt')
				.expect('Cache-Control', 'public, max-age=0', done);
		});

		it('should be configurable', done => {
			const app = http.createServer(async (req, res) => {
				try {
					// tslint:disable-next-line: no-non-null-assertion
					(await mainStorage.prepareResponse(req.url!, req, { cacheControl: 'public, max-age=1' }))
						.send(res);
				} catch (err) {
					res.statusCode = 500;
					res.end(String(err));
				}
			});

			request(app)
				.get('/name.txt')
				.expect('Cache-Control', 'public, max-age=1', done);
		});
	});

	describe('.root()', () => {
		it('should not set root', done => {
			request(mainApp)
				.get('/pets/../name.txt')
				.expect(404, done);
		});
	});
});

describe('send(file, options)', () => {
	describe('maxRanges', () => {
		it('should support disabling accept-ranges', done => {
			request(createServer({ maxRanges: 0, root: fixtures }))
				.get('/nums.txt')
				.expect('Accept-Ranges', 'none')
				.expect(200, done);
		});

		it('should ignore requested range when maxRange is zero', done => {
			request(createServer({ maxRanges: 0, root: fixtures }))
				.get('/nums.txt')
				.set('Range', 'bytes=0-2')
				.expect('Accept-Ranges', 'none')
				.expect(shouldNotHaveHeader('Content-Range'))
				.expect(200, '123456789', done);
		});

		it('should ignore requested range when maxRange below', done => {
			request(createServer({ maxRanges: 1, root: fixtures }))
				.get('/nums.txt')
				.set('Range', 'bytes=0-2,4-5')
				.expect('Accept-Ranges', 'bytes')
				.expect(shouldNotHaveHeader('Content-Range'))
				.expect(200, '123456789', done);
		});
	});

	describe('cacheControl', () => {
		it('should support disabling cache-control', done => {
			request(createServer({ cacheControl: false, root: fixtures }))
				.get('/name.txt')
				.expect(shouldNotHaveHeader('Cache-Control'))
				.expect(200, done);
		});

		it('should ignore maxAge option', done => {
			request(createServer({ cacheControl: false, root: fixtures }))
				.get('/name.txt')
				.expect(shouldNotHaveHeader('Cache-Control'))
				.expect(200, done);
		});
	});

	describe('etag', () => {
		it('should support disabling etags', done => {
			request(createServer({ etag: false, root: fixtures }))
				.get('/name.txt')
				.expect(shouldNotHaveHeader('ETag'))
				.expect(200, done);
		});
	});

	describe('extensions', () => {
		it('should be not be enabled by default', done => {
			request(createServer({ root: fixtures }))
				.get('/tobi')
				.expect(404, done);
		});
	});

	describe('lastModified', () => {
		it('should support disabling last-modified', done => {
			request(createServer({ lastModified: false, root: fixtures }))
				.get('/name.txt')
				.expect(shouldNotHaveHeader('Last-Modified'))
				.expect(200, done);
		});
	});

	describe('dotfiles', () => {
		it('should default to "ignore"', done => {
			request(createServer({ root: fixtures }))
				.get('/.hidden.txt')
				.expect(404, done);
		});

		it('should ignore folder too', done => {
			request(createServer({ root: fixtures }))
				.get('/.mine/name.txt')
				.expect(404, done);
		});

		describe('when "allow"', () => {
			it('should send dotfile', done => {
				request(createServer({ ignorePattern: false, root: fixtures }))
					.get('/.hidden.txt')
					.expect(200, 'secret', done);
			});

			it('should send within dotfile directory', done => {
				request(createServer({ ignorePattern: false, root: fixtures }))
					.get('/.mine/name.txt')
					.expect(200, /tobi/, done);
			});

			it('should 404 for non-existent dotfile', done => {
				request(createServer({ ignorePattern: false, root: fixtures }))
					.get('/.nothere')
					.expect(404, done);
			});
		});

		describe('when "ignore"', () => {
			it('should 404 for dotfile', done => {
				request(createServer({ ignorePattern: /^\.[^.]/, root: fixtures }))
					.get('/.hidden.txt')
					.expect(404, done);
			});

			it('should 404 for dotfile directory', done => {
				request(createServer({ ignorePattern: /^\.[^.]/, root: fixtures }))
					.get('/.mine')
					.expect(404, done);
			});

			it('should 404 for dotfile directory with trailing slash', done => {
				request(createServer({ ignorePattern: /^\.[^.]/, root: fixtures }))
					.get('/.mine/')
					.expect(404, done);
			});

			it('should 404 for file within dotfile directory', done => {
				request(createServer({ ignorePattern: /^\.[^.]/, root: fixtures }))
					.get('/.mine/name.txt')
					.expect(404, done);
			});

			it('should 404 for non-existent dotfile', done => {
				request(createServer({ ignorePattern: /^\.[^.]/, root: fixtures }))
					.get('/.nothere')
					.expect(404, done);
			});

			it('should 404 for non-existent dotfile directory', done => {
				request(createServer({ ignorePattern: /^\.[^.]/, root: fixtures }))
					.get('/.what/name.txt')
					.expect(404, done);
			});

			it('should send files in root dotfile directory', done => {
				request(createServer({ ignorePattern: /^\.[^.]/, root: join(fixtures, '.mine') }))
					.get('/name.txt')
					.expect(200, /tobi/, done);
			});
		});
	});

	describe('root', () => {
		describe('when given', () => {
			it('should not join root', done => {
				request(createServer({ root: fixtures }))
					.get('/pets/../name.txt')
					.expect(404, done);
			});

			it('double slash should be ignored', done => {
				request(createServer({ root: fixtures }))
					.get('//name.txt')
					.expect(404, done);
			});

			it('double slash in sub path should be ignored', done => {
				request(createServer({ root: fixtures }))
					.get('/pets//index.html')
					.expect(404, done);
			});

			it('should work with trailing slash', done => {
				request(createServer({ root: `${ fixtures }/` }))
					.get('/name.txt')
					.expect(200, 'tobi', done);
			});

			it('should 404 on empty path', done => {
				request(createServer({ root: join(fixtures, 'name.txt') }))
					.get('')
					.expect(404, done);
			});

			it('should restrict paths to within root', done => {
				request(createServer({ root: fixtures }))
					.get('/pets/../../send.js')
					.expect(404, done);
			});

			it('should allow .. in root', done => {
				request(createServer({ root: `${ fixtures }/../fixtures-http` }))
					.get('/pets/../../send.js')
					.expect(404, done);
			});

			it('should not allow root transversal', done => {
				request(createServer({ root: join(fixtures, 'name.d') }))
					.get('/../name.dir/name.txt')
					.expect(404, done);
			});

			it('should not allow root path disclosure', done => {
				request(createServer({ root: fixtures }))
					.get('/pets/../../fixtures-http/name.txt')
					.expect(404, done);
			});
		});

		describe('when missing', () => {
			it('should consider .. malicious', done => {
				request(mainApp)
					.get('/../send.js')
					.expect(404, done);
			});

			it('should still serve files with dots in name', done => {
				request(mainApp)
					.get('/do..ts.txt')
					.expect(200, '...', done);
			});
		});
	});
	describe('other methods', () => {
		it('should 405 when OPTIONS request', done => {
			request(mainApp)
				.options('/name.txt')
				.expect('Allow', 'GET, HEAD')
				.expect(405, done);
		});

		it('should 405 on post', done => {
			request(mainApp)
				.post('/name.txt')
				.expect('Allow', 'GET, HEAD')
				.expect(405, done);
		});
	});
});

describe('when something happenned too soon', () => {
	it('should ignore if headers already sent', done => {
		const app = http.createServer(async (req, res) => {
			res.write('the end');
			res.end();
			try {
				// tslint:disable-next-line: no-non-null-assertion
				(await mainStorage.prepareResponse(req.url!, req)).send(res);
			} catch (err) {
				res.statusCode = 500;
				res.end(String(err));
			}
		});
		request(app)
			.get('/nums.txt')
			.expect(200, done);
	});

	it('should ignore if connection already destroyed', done => {
		const app = http.createServer(async (req, res) => {
			res.destroy();
			try {
				// tslint:disable-next-line: no-non-null-assertion
				(await mainStorage.prepareResponse(req.url!, req)).send(res);
			} catch (err) {
				res.statusCode = 500;
				res.end(String(err));
			}
		});
		request(app)
			.get('/nums.txt')
			.catch(() => {
				done();
			});
	});
});

describe('http2 server', () => {
	it('should 200 on simple request', done => {
		const storage = new FileSystemStorage(fixtures);
		const app = http2.createServer();

		app.on('stream', async (stream, headers) => {
			(await storage.prepareResponse(
				// tslint:disable-next-line: no-non-null-assertion
				headers[':path']!,
				headers
			)).send(stream);
		});

		let hasError = false;
		app.on('error', err => {
			app.close();
			if (!hasError) {
				done(err);
				hasError = true;
			}
		});

		app.listen(0, () => {
			const address = app.address();
			if (!address || typeof address === 'string') {
				throw new Error('should not happen');
			}
			const client = http2.connect(`http://localhost:${ address.port }`);

			client.on('error', err => {
				client.close();
				app.close();
				if (!hasError) {
					done(err);
					hasError = true;
				}
			});

			const req = client.request({ ':path': '/name.txt' });

			req.on('response', headers => {
				if (headers[':status'] === 200) {
					return;
				}
				client.close();
				app.close();
				if (!hasError) {
					done(new Error(`status received ${ headers[':status'] } does not equals 200`));
					hasError = true;
				}
			});

			req.setEncoding('utf8');
			let data = '';
			req.on('data', chunk => {
				data += chunk;
			});
			req.on('end', () => {
				if (data !== 'tobi' && !hasError) {
					done(new Error(`body received ${ JSON.stringify(data) } does not equals "tobi"`));
					hasError = true;
				}
				client.close();
				app.close();
				if (!hasError) {
					done();
				}
			});
			req.end();
		});
	});

	it('should 200 on simple request with compatibility layer', done => {
		const storage = new FileSystemStorage(fixtures);
		const app = http2.createServer(async (req, res) => {
			(await storage.prepareResponse(
				req.url,
				req
			)).send(res);
		});

		let hasError = false;
		app.on('error', err => {
			app.close();
			if (!hasError) {
				done(err);
				hasError = true;
			}
		});

		app.listen(0, () => {
			const address = app.address();
			if (!address || typeof address === 'string') {
				throw new Error('should not happen');
			}
			const client = http2.connect(`http://localhost:${ address.port }`);

			client.on('error', err => {
				client.close();
				app.close();
				if (!hasError) {
					done(err);
					hasError = true;
				}
			});

			const req = client.request({ ':path': '/name.txt' });

			req.on('response', headers => {
				if (headers[':status'] === 200) {
					return;
				}
				client.close();
				app.close();
				if (!hasError) {
					done(new Error(`status received ${ headers[':status'] } does not equals 200`));
					hasError = true;
				}
			});

			req.setEncoding('utf8');
			let data = '';
			req.on('data', chunk => {
				data += chunk;
			});
			req.on('end', () => {
				if (data !== 'tobi' && !hasError) {
					done(new Error(`body received ${ JSON.stringify(data) } does not equals "tobi"`));
					hasError = true;
				}
				client.close();
				app.close();
				if (!hasError) {
					done();
				}
			});
			req.end();
		});
	});

	it('should ignore if connection already destroyed', done => {
		const storage = new FileSystemStorage(fixtures);

		const app = http2.createServer(async (req, res) => {
			res.stream.destroy();
			(await storage.prepareResponse(
				req.url,
				req
			)).send(res);
		});

		let hasError = false;
		app.on('error', err => {
			app.close();
			if (!hasError) {
				done(err);
				hasError = true;
			}
		});

		app.listen(0, () => {
			const address = app.address();
			if (!address || typeof address === 'string') {
				throw new Error('should not happen');
			}
			const client = http2.connect(`http://localhost:${ address.port }`);

			client.on('error', err => {
				client.close();
				app.close();
				if (!hasError) {
					done(err);
					hasError = true;
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

	it('should handle errors', done => {
		const storage = new FileSystemStorage(fixtures);
		const app = http2.createServer();

		app.on('stream', async (stream, headers) => {
			const result = await storage.prepareResponse(
				// tslint:disable-next-line: no-non-null-assertion
				headers[':path']!,
				headers
			);
			result.send(stream);
			process.nextTick(() => {
				result.stream.emit('error', new Error('oops'));
			});
		});

		let hasError = false;
		app.on('error', err => {
			app.close();
			if (!hasError) {
				done(err);
				hasError = true;
			}
		});

		app.listen(0, () => {
			const address = app.address();
			if (!address || typeof address === 'string') {
				throw new Error('should not happen');
			}
			const client = http2.connect(`http://localhost:${ address.port }`);

			client.on('error', err => {
				client.close();
				app.close();
				if (!hasError) {
					done(err);
					hasError = true;
				}
			});

			const req = client.request({ ':path': '/name.txt' });

			req.on('response', headers => {
				if (headers[':status'] === 200) {
					return;
				}
				client.close();
				app.close();
				if (!hasError) {
					done(new Error(`status received ${ headers[':status'] } does not equals 200`));
					hasError = true;
				}
			});

			req.on('error', () => {
				if (!hasError) {
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
					done(new Error(`body received ${ JSON.stringify(data) } does not equals "tobi"`));
					hasError = true;
				}
				client.close();
				app.close();
			});
			req.end();
		});
	});
});

function createServer(
	opts: PrepareResponseOptions & FileSystemStorageOptions & { root: string }
) {
	const storage = new FileSystemStorage(opts.root, opts);
	return http.createServer(async (req, res) => {
		try {
			// tslint:disable-next-line: no-non-null-assertion
			(await storage.prepareResponse(req.url!, req, opts)).send(res);
		} catch (err) {
			res.statusCode = 500;
			res.end(String(err));
		}
	});
}

function shouldNotHaveHeader(header: string) {
	return (res: request.Response) => {
		// tslint:disable-next-line: no-unsafe-any
		const value = res.header[header.toLowerCase()];
		assert.strictEqual(
			value, undefined,
			`should not have header ${ header } (actual value: "${ value }")`
		);
	};
}

// tslint:enable:no-identical-functions
