
import * as assert from 'assert';
import * as fs from 'fs';
import { createBrotliDecompress } from 'zlib';
import Koa from 'koa';
import Mime from 'mime/Mime';
import { join } from 'path';
import { Readable } from 'stream';
import request from 'supertest';
import * as memfs from 'memfs';
import * as http from 'http';

import {
	PrepareResponseOptions,
	Storage,
	FileSystemStorage,
	StorageInfo,
	FileSystemStorageOptions,
	FileData,
	StreamRange,
	FilePath,
	StorageRequestHeaders,
	BufferStream
} from '../lib';

// tslint:disable:no-identical-functions max-classes-per-file

function brotliParser(res: request.Response, cb: (err: Error | null, body: unknown) => void) {
	const decompress = res.pipe(createBrotliDecompress());

	const chunks: Buffer[] = [];
	decompress.on('data', chunk => {
		chunks.push(<Buffer> chunk);
	});
	decompress.on('error', err => {
		cb(err, Buffer.concat(chunks).toString());
	});
	decompress.on('end', () => {
		cb(null, Buffer.concat(chunks).toString());
	});
}

export async function sendStorage<Reference, AttachedData>(
	ctx: Koa.Context,
	storage: Storage<Reference, AttachedData>,
	reference: Reference,
	opts: PrepareResponseOptions = {}
) {
	const result = await storage.prepareResponse(
		reference,
		ctx.req,
		opts
	);
	ctx.status = result.statusCode;
	ctx.set(<{ [key: string]: string }> result.headers);
	ctx.body = result.stream;
	return result;
}

async function send(
	ctx: Koa.Context,
	root: string,
	path: string | string[],
	opts?: PrepareResponseOptions & FileSystemStorageOptions
) {
	const storage = new FileSystemStorage(root, opts);
	const result = await storage.prepareResponse(
		path,
		ctx.req,
		opts
	);
	ctx.status = result.statusCode;
	ctx.set(<{ [key: string]: string }> result.headers);
	ctx.body = result.stream;
	return result;
}

describe('send(ctx, file)', () => {
	describe('when simple path', () => {
		describe('should 200 on plain text', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 200 on plain text', done => {
				request(server)
					.get('/')
					.expect(200)
					.expect('world', done);
			});
		});
		describe('should 200 on html', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/world/index.html');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 200 on html', done => {
				request(server)
					.get('/')
					.expect('content-type', 'text/html; charset=UTF-8')
					.expect('content-length', '10')
					.expect(200, done);
			});
		});
		describe('should 404 when does not exist', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, 'fixtures-koa/not-existing.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 when does not exist', done => {
				request(server)
					.get('/')
					.expect(404, done);
			});
		});
	});

	describe('when path contains ..', () => {
		describe('should 404 when existing outside root', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/../package.json');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 when existing outside root', done => {
				request(server)
					.get('/')
					.expect(404, done);
			});
		});
		describe('should 404 when path existing inside root', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, join(__dirname, 'fixtures-koa'), '../../test/fixtures-koa/world/index.html');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 when path existing inside root', done => {
				request(server)
					.get('/')
					.expect(404, done);
			});
		});
	});

	describe('when path is a directory', () => {
		describe('should 404 with /', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 with /', done => {
				request(server)
					.get('/')
					.expect(404, done);
			});
		});
		describe('should 404 without /', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 without /', done => {
				request(server)
					.get('/')
					.expect(404, done);
			});
		});
	});

	describe('when path is malformed', () => {
		let server: http.Server;
		before(() => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/%');
			});

			server = app.listen();
		});
		after(done => {
			server.close(done);
		});
		it('should 404', done => {
			request(server)
				.get('/')
				.expect(404, done);
		});
	});

	describe('when path is malicious', () => {
		describe('should 404 on null bytes', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/%00');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 on null bytes', done => {
				request(server)
					.get('/')
					.expect(404, done);
			});
		});
		describe('should 404 on encoded slash', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/%2F');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 on encoded slash', done => {
				request(server)
					.get('/')
					.expect(404, done);
			});
		});
		describe('should 404 on back slash', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/\\');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 on back slash', done => {
				request(server)
					.get('/')
					.expect(404, done);
			});
		});
	});

	describe('when path have precompressed files', () => {
		describe('should return the path when no file is available', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const p = '/fixtures-koa/user.json';
					const sent = await send(ctx, __dirname, p, {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/user.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return the path when no file is available', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br, gzip, identity')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should 404 when not any file is available', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const p = '/fixtures-koa/notexisting.json';
					await send(ctx, __dirname, p, {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 when not any file is available', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br, gzip, identity')
					.expect(404, done);
			});
		});

		describe('should 404 when identity is not accepted', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const p = '/fixtures-koa/hello.txt';
					await send(ctx, __dirname, p, {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.txt)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 when identity is not accepted', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br, gzip, identity;q=0')
					.expect(404, done);
			});
		});

		describe('should return the path when a directory have the encoding extension', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const p = '/fixtures-koa/hello.txt';
					const sent = await send(ctx, __dirname, p, {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.txt)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/hello.txt')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return the path when a directory have the encoding extension', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br, gzip, identity')
					.expect('Content-Length', '5')
					.expect('world')
					.expect(200, done);
			});
		});

		describe('should not return the path when a directory have the encoding extension but matcher not ok', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const p = '/fixtures-koa/hello.txt';
					const sent = await send(ctx, __dirname, p, {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/hello.txt')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should not return the path when a directory have the encoding extension but matcher not ok', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br, gzip, identity')
					.expect('Content-Length', '5')
					.expect('world')
					.expect(200, done);
			});
		});

		describe('should return path if .gz path exists and gzip not requested', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return path if .gz path exists and gzip not requested', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'deflate, identity')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return path if .gz path exists and identity is the priority', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'identity',
										path: '$1'
									},
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return path if .gz path exists and identity is the priority', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'gzip, identity')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return path if .gz path exists and accept encoding is not valid', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return path if .gz path exists and accept encoding is not valid', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'gzip, ùù')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return .gz path if .gz path exists and gzip requested', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json.gz')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return .gz path if .gz path exists and gzip requested', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'gzip, deflate, identity')
					.expect('Content-Length', '48')
					.expect('Content-Type', /^application\/json/)
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return path when .br path exists and brotli not requested', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return path when .br path exists and brotli not requested', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'deflate, identity')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return .br path when .br path exists and brotli requested', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json.br')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return .br path when .br path exists and brotli requested', done => {
				request(server)
					.get('/')
					.parse(brotliParser)
					.set('Accept-Encoding', 'br, deflate, identity')
					.expect('Content-Length', '22')
					.expect(200)
					.then(({ body }) => {
						assert.deepStrictEqual(body, '{ "name": "tobi" }');
						done();
					})
					.catch(done);
			});
		});

		describe('should return .gz path when brotli not configured', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json.gz')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return .gz path when brotli not configured', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br, gzip, deflate, identity')
					.expect('Content-Length', '48')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return path when identity encoding has more weight', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return path when identity encoding has more weight', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br;q=0.2, gzip;q=0.2, deflate;q=0.2, identity')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return path when no acceptable encoding', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return path when no acceptable encoding', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br;q=0.2')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return gz path when x-gzip is set', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json.gz')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return gz path when x-gzip is set', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'x-gzip;q=0.2')
					.expect('Content-Length', '48')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return path when x-compress is set', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return path when x-compress is set', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'x-compress;q=0.2')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return gz path when asterisk encoding has more weight and gz available', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'gzip',
										path: '$1.gz'
									},
									{
										name: 'br',
										path: '$1.br'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json.gz')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return gz path when asterisk encoding has more weight and gz available', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br;q=0.2, *;q=0.3, deflate;q=0.2, identity;q=0.2')
					.expect('Content-Length', '48')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return path when empty content-encoding', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'gzip',
										path: '$1.gz'
									},
									{
										name: 'br',
										path: '$1.br'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return path when empty content-encoding', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', '')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should return path when no content-encoding', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					// hack because superagent always add accept-encoding
					// tslint:disable-next-line: no-unsafe-any
					delete ctx.request.header['accept-encoding'];
					const sent = await send(ctx, __dirname, '/fixtures-koa/gzip.json', {
						contentEncodingMappings: [
							{
								matcher: /^(.*\.json)$/,
								encodings: [
									{
										name: 'gzip',
										path: '$1.gz'
									},
									{
										name: 'br',
										path: '$1.br'
									}
								]
							}
						]
					});
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/gzip.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should return path when no content-encoding', done => {
				request(server)
					.get('/')
					.expect('Content-Length', '18')
					.expect('{ "name": "tobi" }')
					.expect(200, done);
			});
		});

		describe('should 404 when is directory', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const p = '/fixtures-koa/world';
					await send(ctx, __dirname, p, {
						contentEncodingMappings: [
							{
								matcher: /^(.*)$/,
								encodings: [
									{
										name: 'br',
										path: '$1.br'
									},
									{
										name: 'gzip',
										path: '$1.gz'
									}
								]
							}
						]
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 404 when is directory', done => {
				request(server)
					.get('/')
					.set('Accept-Encoding', 'br, gzip, identity')
					.expect(404, done);
			});
		});
	});

	describe('when cacheControl is specified', () => {
		describe('should set cache-control', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					const p = '/fixtures-koa/user.json';
					const sent = await send(ctx, __dirname, p, { cacheControl: 'max-age=5' });
					assert.strictEqual(
						sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
						join(__dirname, '/fixtures-koa/user.json')
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set cache-control', done => {
				request(server)
					.get('/')
					.expect('Cache-Control', 'max-age=5')
					.expect(200, done);
			});
		});

		describe('be unset through false option', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt', {
						cacheControl: false
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('be unset through false option', done => {
				request(server)
					.get('/')
					.expect(200)
					.expect(res => {
						if (res.get('Cache-Control')) {
							throw new Error('Cache-Control should not be set');
						}
					})
					.end(done);
			});
		});
	});

	describe('when content-type is used', () => {
		describe('should set the Content-Type', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set the Content-Type', done => {
				request(server)
					.get('/')
					.expect('Content-Type', /application\/json/)
					.end(done);
			});
		});

		describe('should set the Content-Type with UTF-8 charset for html', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/world/index.html');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set the Content-Type with UTF-8 charset for html', done => {
				request(server)
					.get('/')
					.expect('Content-Type', 'text/html; charset=UTF-8')
					.end(done);
			});
		});

		describe('should set the Content-Type with no charset for html when disabled', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/world/index.html', { defaultCharsets: false });
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set the Content-Type with no charset for html when disabled', done => {
				request(server)
					.get('/')
					.expect('Content-Type', 'text/html')
					.end(done);
			});
		});

		describe('should set the Content-Type with a charset when option used', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/world/index.html', {
						defaultCharsets: [{ matcher: /^text\/.*/, charset: 'windows-1252' }]
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set the Content-Type with a charset when option used', done => {
				request(server)
					.get('/')
					.expect('Content-Type', 'text/html; charset=windows-1252')
					.end(done);
			});
		});

		describe('should not set the Content-Type with a charset when content type does not match', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json', {
						defaultCharsets: [{ matcher: /^text\/.*/, charset: 'windows-1252' }]
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should not set the Content-Type with a charset when content type does not match', done => {
				request(server)
					.get('/')
					.expect('Content-Type', 'application/json')
					.end(done);
			});
		});

		describe('should not set Content-Type when type is unknown, (koa force to application/octet-stream)', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/unknown');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should not set Content-Type when type is unknown, (koa force to application/octet-stream)', done => {
				request(server)
					.get('/')
					.expect('Content-Type', 'application/octet-stream')
					.end(done);
			});
		});

		describe('should not set the Content-Type when type is not text', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/test.png');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should not set the Content-Type when type is not text', done => {
				request(server)
					.get('/')
					.expect('Content-Type', 'image/png')
					.end(done);
			});
		});

		describe('be unset with false contentType option', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json', { contentType: false });
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('be unset with false contentType option', done => {
				request(server)
					.get('/')
					.expect('Content-Type', 'application/octet-stream')
					.end(done);
			});
		});

		describe('should set to default the Content-Type when type is unknown', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/unknown', { defaultContentType: 'application/x-test' });
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set to default the Content-Type when type is unknown', done => {
				request(server)
					.get('/')
					.expect('Content-Type', 'application/x-test')
					.end(done);
			});
		});

		describe('should use mime module instance when set', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(
						ctx,
						__dirname,
						'/fixtures-koa/user.json',
						{ mimeModule: new Mime({ 'application/x-test': ['json'] }) }
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should use mime module instance when set', done => {
				request(server)
					.get('/')
					.expect('Content-Type', 'application/x-test')
					.end(done);
			});
		});

		describe('should 500 when mime module instance throw', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(
						ctx,
						__dirname,
						'/fixtures-koa/user.json',
						{
							mimeModule: {
								getType() {
									throw new Error('oops');
								}
							}
						}
					);
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 500 when mime module instance throw', done => {
				request(server)
					.get('/')
					.expect(500, done);
			});
		});
	});

	describe('when content-disposition is used', () => {
		describe('should set the inline Content-Disposition by default', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set the inline Content-Disposition by default', done => {
				request(server)
					.get('/')
					.expect('Content-Disposition', 'inline; filename="user.json"')
					.end(done);
			});
		});

		describe('should set the attachment with content-disposition module option', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json', {
						contentDispositionType: 'attachment'
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set the attachment with content-disposition module option', done => {
				request(server)
					.get('/')
					.expect('Content-Disposition', 'attachment; filename="user.json"')
					.end(done);
			});
		});

		describe('should set the attachment with content-disposition module option and filename', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json', {
						contentDispositionType: 'attachment',
						contentDispositionFilename: 'plop.json'
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set the attachment with content-disposition module option and filename', done => {
				request(server)
					.get('/')
					.expect('Content-Disposition', 'attachment; filename="plop.json"')
					.end(done);
			});
		});

		describe('should set the attachment with content-disposition module option and no filename', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json', {
						contentDispositionType: 'attachment',
						contentDispositionFilename: false
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set the attachment with content-disposition module option and no filename', done => {
				request(server)
					.get('/')
					.expect('Content-Disposition', 'attachment')
					.end(done);
			});
		});

		describe('should unset content-disposition with false option', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json', {
						contentDispositionType: false
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should unset content-disposition with false option', done => {
				request(server)
					.get('/')
					.expect(res => {
						if (res.get('Content-Disposition')) {
							throw new Error('Content-Disposition should not be set');
						}
					})
					.end(done);
			});
		});
	});

	describe('should set the Content-Length', () => {
		let server: http.Server;
		before(() => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json');
			});

			server = app.listen();
		});
		after(done => {
			server.close(done);
		});
		it('should set the Content-Length', done => {
			request(server)
				.get('/')
				.expect('Content-Length', '18')
				.end(done);
		});
	});

	describe('when last-modified is used', () => {
		describe('should set Last-Modified', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set Last-Modified', done => {
				request(server)
					.get('/')
					.expect('Last-Modified', /GMT/)
					.end(done);
			});
		});

		describe('should not set Last-Modified when false option', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json', { lastModified: false });
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should not set Last-Modified when false option', done => {
				request(server)
					.get('/')
					.expect(res => {
						if (res.get('Last-Modified')) {
							throw new Error('Last-Modified should not be set');
						}
					})
					.end(done);
			});
		});
	});

	describe('should answer 304 when data is fresh', () => {
		let server: http.Server;
		before(() => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json');
			});

			server = app.listen();
		});
		after(done => {
			server.close(done);
		});
		it('should answer 304 when data is fresh', done => {
			const stats = fs.statSync(join(__dirname, '/fixtures-koa/user.json'));
			request(server)
				.get('/')
				.set('If-Modified-Since', stats.mtime.toUTCString())
				.expect(304, done);
		});
	});

	describe('when range header is used', () => {
		describe('should respond 206 to a range request', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should respond 206 to a range request', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0')
					.expect(206)
					.expect('Content-Range', 'bytes 0-0/5')
					.expect('Content-Length', '1')
					.end(done);
			});
		});

		describe('should respond 206 to a range request if range fresh (last modified)', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should respond 206 to a range request if range fresh (last modified)', done => {
				const stats = fs.statSync(join(__dirname, '/fixtures-koa/hello.txt'));
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0')
					.set('If-Range', stats.mtime.toUTCString())
					.expect(206)
					.expect('Content-Range', 'bytes 0-0/5')
					.expect('Content-Length', '1')
					.end(done);
			});
		});

		describe('should respond 200 to a range request if range not fresh (last modified)', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should respond 200 to a range request if range not fresh (last modified)', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0')
					.set('If-Range', new Date().toUTCString())
					.expect(200)
					.end(done);
			});
		});

		describe('should respond 200 to a range request if range not fresh (etag)', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should respond 200 to a range request if range not fresh (etag)', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0')
					.set('If-Range', '"test"')
					.expect(200)
					.end(done);
			});
		});

		describe('should respond 206 to a range request if range fresh (empty last modified)', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt', { lastModified: false });
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should respond 206 to a range request if range fresh (empty last modified)', done => {
				const stats = fs.statSync(join(__dirname, '/fixtures-koa/hello.txt'));
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0')
					.set('If-Range', stats.mtime.toUTCString())
					.expect(200)
					.end(done);
			});
		});

		describe('should respond 206 to a range request if range fresh (empty etag)', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt', { etag: false });
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should respond 206 to a range request if range fresh (empty etag)', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0')
					.set('If-Range', '"test"')
					.expect(200)
					.end(done);
			});
		});

		describe('should respond 206 to a multiple range request', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should respond 206 to a multiple range request', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0,2-2')
					.expect(206)
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
							!/^--[^\r\n]+\r\ncontent-type: text\/plain; charset=UTF-8\r\ncontent-range: bytes 0-0\/5\r\n\r\nw\r\n--[^\r\n]+\r\ncontent-type: text\/plain; charset=UTF-8\r\ncontent-range: bytes 2-2\/5\r\n\r\nr\r\n--[^\r\n]+--$/
								.test(<string> res.body)
						) {
							throw new Error('multipart/byteranges seems invalid');
						}
					})
					.end(done);
			});
		});

		describe('should respond to a multiple range request with unknown content type', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/unknown');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should respond to a multiple range request with unknown content type', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0,2-2')
					.expect(206)
					.expect('Content-Type', /^multipart\/byteranges/)
					.end(done);
			});
		});

		describe('should respond 416 when cannot be satisfied', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should respond 416 when cannot be satisfied', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=7-7')
					.expect(416)
					.expect('Content-Range', 'bytes */5')
					.end(done);
			});
		});

		describe('should 416 not bytes ranges', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should 416 not bytes ranges', done => {
				request(server)
					.get('/')
					.set('Range', 'test=1-1')
					.expect(200)
					.end(done);
			});
		});
	});

	describe('when etag option is set', () => {
		describe('should set ETag', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/user.json');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should set ETag', done => {
				request(server)
					.get('/')
					.expect('Etag', /"/)
					.end(done);
			});
		});

		describe('be unset through etag false option', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				app.use(async ctx => {
					await send(ctx, __dirname, '/fixtures-koa/hello.txt', {
						etag: false
					});
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('be unset through etag false option', done => {
				request(server)
					.get('/')
					.expect(200)
					.expect(res => {
						if (res.get('ETag')) {
							throw new Error('ETag should not be set');
						}
					})
					.end(done);
			});
		});
	});

	describe('when error occurs on stream', () => {
		describe('should handle read errors to a simple request', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				class ErrorStorage extends FileSystemStorage {
					createReadableStream(
						_si: StorageInfo<FileData>,
						_range: StreamRange | undefined,
						_autoclose: boolean
					) {
						return new Readable({
							read() {
								process.nextTick(() => {
									this.destroy(new Error('ooops'));
								});
							}
						});
					}
				}
				const storage = new ErrorStorage(__dirname);

				app.use(async ctx => {
					await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should handle read errors to a simple request', done => {
				request(server)
					.get('/')
					.expect(500)
					.end(done);
			});
		});

		describe('should handle stream creation error', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				class ErrorStorage extends FileSystemStorage {
					createReadableStream(
						_si: StorageInfo<FileData>,
						_range: StreamRange | undefined,
						_autoclose: boolean
					): Readable {
						throw new Error('oops');
					}
				}
				const storage = new ErrorStorage(__dirname);

				app.use(async ctx => {
					await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should handle stream creation error', done => {
				request(server)
					.get('/')
					.expect(500)
					.end(done);
			});
		});

		describe('should handle read errors to a multiple range request', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				class ErrorStorage extends FileSystemStorage {
					createReadableStream(
						_si: StorageInfo<FileData>,
						_range: StreamRange | undefined,
						_autoclose: boolean
					) {
						return new Readable({
							read() {
								process.nextTick(() => {
									this.destroy(new Error('ooops'));
								});
							}
						});
					}
				}
				const storage = new ErrorStorage(__dirname);

				app.use(async ctx => {
					await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should handle read errors to a multiple range request', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0,2-2')
					.expect(500)
					.catch(() => {
						done();
					});
			});
		});

		describe('should handle read errors to a multiple range request on second stream', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				let first = true;
				class ErrorStorage extends FileSystemStorage {
					createReadableStream(
						si: StorageInfo<FileData>,
						range: StreamRange | undefined,
						autoclose: boolean
					) {
						if (first) {
							first = false;
							return super.createReadableStream(si, range, autoclose);
						}
						return new Readable({
							read() {
								process.nextTick(() => {
									this.destroy(new Error('ooops'));
								});
							}
						});
					}
				}
				const storage = new ErrorStorage(__dirname);

				app.use(async ctx => {
					await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should handle read errors to a multiple range request on second stream', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0,2-2')
					.expect(500)
					.catch(() => {
						done();
					});
			});
		});

		describe('should handle close error', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				// tslint:disable-next-line: max-classes-per-file
				class ErrorStorage extends FileSystemStorage {
					// tslint:disable-next-line: no-async-without-await
					async close(
						_si: StorageInfo<FileData>
					) {
						throw new Error('oops');
					}
				}
				const storage = new ErrorStorage(__dirname);

				app.use(async ctx => {
					await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should handle close error', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0,2-2')
					.expect(206)
					.end(done);
			});
		});

		describe('should handle close error after read error', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();

				// tslint:disable-next-line: max-classes-per-file
				class ErrorStorage extends FileSystemStorage {
					createReadableStream(
						_si: StorageInfo<FileData>,
						_range: StreamRange | undefined,
						_autoclose: boolean
					) {
						return new Readable({
							read() {
								process.nextTick(() => {
									this.destroy(new Error('ooops'));
								});
							}
						});
					}
					// tslint:disable-next-line: no-async-without-await
					async close(
						_si: StorageInfo<FileData>
					) {
						throw new Error('oops');
					}
				}
				const storage = new ErrorStorage(__dirname);

				app.use(async ctx => {
					await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should handle close error after read error', done => {
				request(server)
					.get('/')
					.set('Range', 'bytes=0-0,2-2')
					.expect(500)
					.catch(() => {
						done();
					});
			});
		});

		describe('should handle unknown streams', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();
				class UnknownStorage extends FileSystemStorage {
					async open(path: FilePath, requestHeaders: StorageRequestHeaders): Promise<StorageInfo<FileData>> {
						const res = await super.open(path, requestHeaders);
						res.size = undefined;
						res.fileName = undefined;
						res.mtimeMs = undefined;
						return res;
					}
				}
				const storage = new UnknownStorage(__dirname);

				app.use(async ctx => {
					await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should handle unknown streams', done => {
				request(server)
					.get('/')
					.expect('Transfer-Encoding', 'chunked')
					.expect('Content-Disposition', 'inline')
					.expect(res => {
						if (res.get('Last-Modified')) {
							throw new Error('Last-Modified should not be set');
						}
						if (res.get('ETag')) {
							throw new Error('ETag should not be set');
						}
						if ((<Buffer> res.body).toString() !== 'world') {
							throw new Error('incorrect body');
						}
					})
					.expect(200)
					.end(done);
			});
		});
		describe('should handle custom streams', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();
				class CustomStorage extends Storage<undefined, undefined> {
					async open(_reference: undefined, _requestHeaders: StorageRequestHeaders) {
						return {
							attachedData: undefined
						};
					}
					createReadableStream(
						_storageInfo: StorageInfo<undefined>,
						_range: StreamRange | undefined,
						_autoClose: boolean
					) {
						return new BufferStream(Buffer.from('hello world'));
					}
					// tslint:disable-next-line: no-async-without-await
					async close(_storageInfo: StorageInfo<undefined>) {
						// noop
					}
				}
				const storage = new CustomStorage();

				app.use(async ctx => {
					await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should handle custom streams', done => {
				request(server)
					.get('/')
					.expect('Transfer-Encoding', 'chunked')
					.expect('Content-Disposition', 'inline')
					.expect(res => {
						if (res.get('Last-Modified')) {
							throw new Error('Last-Modified should not be set');
						}
						if (res.get('ETag')) {
							throw new Error('ETag should not be set');
						}
						if ((<Buffer> res.body).toString() !== 'hello world') {
							throw new Error('incorrect body');
						}
					})
					.expect(200)
					.end(done);
			});
		});

		describe('should handle custom streams open errors as 404', () => {
			let server: http.Server;
			before(() => {
				const app = new Koa<object>();
				class CustomStorage extends Storage<undefined, undefined> {
					// tslint:disable-next-line: no-async-without-await
					async open(_reference: undefined, _requestHeaders: StorageRequestHeaders)
						: Promise<StorageInfo<undefined>> {
						throw new Error('oops');
					}
					createReadableStream(
						_storageInfo: StorageInfo<undefined>,
						_range: StreamRange | undefined,
						_autoClose: boolean
					) {
						return new BufferStream(Buffer.from('hello world'));
					}
					// tslint:disable-next-line: no-async-without-await
					async close(_storageInfo: StorageInfo<undefined>) {
						// noop
					}
				}
				const storage = new CustomStorage();

				app.use(async ctx => {
					await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
				});

				server = app.listen();
			});
			after(done => {
				server.close(done);
			});
			it('should handle custom streams open errors as 404', done => {
				request(server)
					.get('/')
					.expect(404)
					.end(done);
			});
		});
	});

	describe('when fsModule option used', () => {
		let server: http.Server;
		before(() => {
			const app = new Koa<object>();

			memfs.fs.writeFileSync('/foo.txt', 'bar');

			app.use(async ctx => {
				await send(ctx, '/', '/foo.txt', { fsModule: <typeof fs> <unknown> memfs.fs });
			});

			server = app.listen();
		});
		after(done => {
			server.close(done);
		});
		it('should handle memfs as fsModule option', done => {
			request(server)
				.get('/')
				.expect(200, 'bar')
				.end(done);
		});
	});

	describe('when path array is used', () => {
		let server: http.Server;
		before(() => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, ['', 'fixtures-koa', 'hello.txt']);
			});

			server = app.listen();
		});
		after(done => {
			server.close(done);
		});
		it('should handle path array', done => {
			request(server)
				.get('/')
				.expect(200, 'world')
				.end(done);
		});
	});
});

// tslint:enable:no-identical-functions
