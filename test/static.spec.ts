
import * as assert from 'assert';
import * as http from 'http';
import * as path from 'path';
// tslint:disable-next-line: no-implicit-dependencies
import request from 'supertest';

import {
	FileSystemStorageOptions,
	FileSystemStorage,
	PrepareResponseOptions,
	FileSystemStorageError
} from '../lib';

// tslint:disable:no-identical-functions

const fixtures = path.join(__dirname, '/fixtures-static');

describe('serveStatic()', () => {
	describe('basic operations', () => {
		let server: http.Server;
		before(() => {
			server = createServer();
		});

		it('should serve static files', done => {
			request(server)
				.get('/todo.txt')
				.expect(200, '- groceries', done);
		});

		it('should support nesting', done => {
			request(server)
				.get('/users/tobi.txt')
				.expect(200, 'ferret', done);
		});

		it('should set Content-Type', done => {
			request(server)
				.get('/todo.txt')
				.expect('Content-Type', 'text/plain; charset=UTF-8')
				.expect(200, done);
		});

		it('should set Last-Modified', done => {
			request(server)
				.get('/todo.txt')
				.expect('Last-Modified', /\d{2} \w{3} \d{4}/)
				.expect(200, done);
		});

		it('should default max-age=0', done => {
			request(server)
				.get('/todo.txt')
				.expect('Cache-Control', 'public, max-age=0')
				.expect(200, done);
		});

		it('should support urlencoded pathnames', done => {
			request(server)
				.get('/foo%20bar')
				.expect(200, 'baz', done);
		});

		it('should not choke on auth-looking URL', done => {
			request(server)
				.get('//todo@txt')
				.expect(404, done);
		});

		it('should support index.html', done => {
			request(server)
				.get('/users/')
				.expect(200)
				.expect('Content-Type', /html/)
				.expect('<p>tobi, loki, jane</p>', done);
		});

		it('should support HEAD', done => {
			request(server)
				.head('/todo.txt')
				.expect(res => {
					// tslint:disable-next-line: strict-type-predicates
					assert.ok(res.text === undefined, 'should not have body');
				})
				.expect(200, done);
		});

		it('should skip POST requests', done => {
			request(server)
				.post('/todo.txt')
				.expect(405, done);
		});

		it('should support conditional requests', done => {
			request(server)
				.get('/todo.txt')
				.end((err, res) => {
					if (err) {
						throw err;
					}
					request(server)
						.get('/todo.txt')
						// tslint:disable-next-line: no-unsafe-any
						.set('If-None-Match', res.header.etag)
						.expect(304, done);
				});
		});

		it('should support precondition checks', done => {
			request(server)
				.get('/todo.txt')
				.set('If-Match', '"foo"')
				.expect(412, done);
		});

		it('should serve zero-length files', done => {
			request(server)
				.get('/empty.txt')
				.expect(200, '', done);
		});

		it('should ignore hidden files', done => {
			request(server)
				.get('/.hidden')
				.expect(404, done);
		});
	});

	describe('acceptRanges', () => {
		describe('when false', () => {
			it('should include Accept-Ranges none', done => {
				request(createServer(fixtures, { maxRanges: 0 }))
					.get('/nums')
					.expect('Accept-Ranges', 'none')
					.expect(200, '123456789', done);
			});

			it('should ignore Range request header', done => {
				request(createServer(fixtures, { maxRanges: 0 }))
					.get('/nums')
					.set('Range', 'bytes=0-3')
					.expect('Accept-Ranges', 'none')
					.expect(shouldNotHaveHeader('Content-Range'))
					.expect(200, '123456789', done);
			});
		});

		describe('when true', () => {
			it('should include Accept-Ranges', done => {
				request(createServer(fixtures, { maxRanges: 1 }))
					.get('/nums')
					.expect('Accept-Ranges', 'bytes')
					.expect(200, '123456789', done);
			});

			it('should obey Rage request header', done => {
				request(createServer(fixtures, { maxRanges: 1 }))
					.get('/nums')
					.set('Range', 'bytes=0-3')
					.expect('Accept-Ranges', 'bytes')
					.expect('Content-Range', 'bytes 0-3/9')
					.expect(206, '1234', done);
			});
		});
	});

	describe('cacheControl', () => {
		describe('when false', () => {
			it('should not include Cache-Control', done => {
				request(createServer(fixtures, { cacheControl: false }))
					.get('/nums')
					.expect(shouldNotHaveHeader('Cache-Control'))
					.expect(200, '123456789', done);
			});
		});

		describe('when true', () => {
			it('should include Cache-Control', done => {
				request(createServer(fixtures, { cacheControl: 'public, max-age=0' }))
					.get('/nums')
					.expect('Cache-Control', 'public, max-age=0')
					.expect(200, '123456789', done);
			});
		});
	});

	describe('fallthrough', () => {
		describe('when false', () => {
			let server: http.Server;
			before(() => {
				server = createServer(fixtures, { });
			});

			it('should 405 when OPTIONS request', done => {
				request(server)
					.options('/todo.txt')
					.expect('Allow', 'GET, HEAD')
					.expect(405, done);
			});

			it('should 404 when URL malformed', done => {
				request(server)
					.get('/%')
					.expect(404, done);
			});

			it('should 404 when traversing past root', done => {
				request(server)
					.get('/users/../../todo.txt')
					.expect(404, done);
			});
		});
	});

	describe('hidden files', () => {
		let server: http.Server;
		before(() => {
			server = createServer(fixtures, { ignorePattern: false });
		});

		it('should be served when dotfiles: "allow" is given', done => {
			request(server)
				.get('/.hidden')
				.expect(200, 'I am hidden', done);
		});
	});

	describe('lastModified', () => {
		describe('when false', () => {
			it('should not include Last-Modifed', done => {
				request(createServer(fixtures, { lastModified: false }))
					.get('/nums')
					.expect(shouldNotHaveHeader('Last-Modified'))
					.expect(200, '123456789', done);
			});
		});

		describe('when true', () => {
			it('should include Last-Modifed', done => {
				request(createServer(fixtures, { }))
					.get('/nums')
					.expect('Last-Modified', /^\w{3}, \d+ \w+ \d+ \d+:\d+:\d+ \w+$/)
					.expect(200, '123456789', done);
			});
		});
	});

	describe('when traversing past root', () => {
		let server: http.Server;
		before(() => {
			server = createServer(fixtures, { });
		});

		it('should catch urlencoded ../', done => {
			request(server)
				.get('/users/%2e%2e/%2e%2e/todo.txt')
				.expect(404, done);
		});

		it('should not allow root path disclosure', done => {
			request(server)
				.get('/users/../../fixtures/todo.txt')
				.expect(404, done);
		});

		it('should catch urlencoded ../ bis', done => {
			request(server)
				.get('/users/%2e%2e/%2e%2e/static.spec.ts')
				.expect(404, done);
		});

		it('should not allow root path disclosure bis', done => {
			request(server)
				.get('/users/../../fixtures/static.spec.ts')
				.expect(404, done);
		});
	});

	describe('when request has "Range" header', () => {
		let server: http.Server;
		before(() => {
			server = createServer();
		});

		it('should support byte ranges', done => {
			request(server)
				.get('/nums')
				.set('Range', 'bytes=0-4')
				.expect('12345', done);
		});

		it('should be inclusive', done => {
			request(server)
				.get('/nums')
				.set('Range', 'bytes=0-0')
				.expect('1', done);
		});

		it('should set Content-Range', done => {
			request(server)
				.get('/nums')
				.set('Range', 'bytes=2-5')
				.expect('Content-Range', 'bytes 2-5/9', done);
		});

		it('should support -n', done => {
			request(server)
				.get('/nums')
				.set('Range', 'bytes=-3')
				.expect('789', done);
		});

		it('should support n-', done => {
			request(server)
				.get('/nums')
				.set('Range', 'bytes=3-')
				.expect('456789', done);
		});

		it('should respond with 206 "Partial Content"', done => {
			request(server)
				.get('/nums')
				.set('Range', 'bytes=0-4')
				.expect(206, done);
		});

		it('should set Content-Length to the # of octets transferred', done => {
			request(server)
				.get('/nums')
				.set('Range', 'bytes=2-3')
				.expect('Content-Length', '2')
				.expect(206, '34', done);
		});

		describe('when last-byte-pos of the range is greater than current length', () => {
			it('is taken to be equal to one less than the current length', done => {
				request(server)
					.get('/nums')
					.set('Range', 'bytes=2-50')
					.expect('Content-Range', 'bytes 2-8/9', done);
			});

			it('should adapt the Content-Length accordingly', done => {
				request(server)
					.get('/nums')
					.set('Range', 'bytes=2-50')
					.expect('Content-Length', '7')
					.expect(206, done);
			});
		});

		describe('when the first- byte-pos of the range is greater than the current length', () => {
			it('should respond with 416', done => {
				request(server)
					.get('/nums')
					.set('Range', 'bytes=9-50')
					.expect(416, done);
			});

			it('should include a Content-Range header of complete length', done => {
				request(server)
					.get('/nums')
					.set('Range', 'bytes=9-50')
					.expect('Content-Range', 'bytes */9')
					.expect(416, done);
			});
		});

		describe('when syntactically invalid', () => {
			it('should respond with 200 and the entire contents', done => {
				request(server)
					.get('/nums')
					.set('Range', 'asdf')
					.expect('123456789', done);
			});
		});
	});
});

function createServer(
	dir?: string,
	opts?: PrepareResponseOptions & FileSystemStorageOptions,
	fn?: (req: http.IncomingMessage, res: http.ServerResponse) => void
) {
	const direct = dir || fixtures;

	const storage = new FileSystemStorage(direct, opts);

	return http.createServer(async (req, res) => {
		try {
			if (fn) {
				fn(req, res);
			}
			// tslint:disable-next-line: no-non-null-assertion
			let result = await storage.prepareResponse(req.url!, req, opts);
			if (result.error
				&& result.error instanceof FileSystemStorageError
				&& result.error.code === 'trailing_slash'
			) {
				result.stream.destroy();
				result = await storage.prepareResponse(
					[...result.error.pathParts.slice(0, -1), 'index.html'],
					req,
					opts
				);
			}
			result.send(res);
		} catch (err) {
			console.error(err);
			if (!res.headersSent) {
				res.statusCode = 500;
				res.end('Internal Server Error');
			}
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
