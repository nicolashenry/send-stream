
import * as assert from 'assert';
import * as fs from 'fs';
// tslint:disable-next-line:no-implicit-dependencies
import { decompressStream } from 'iltorb';
// tslint:disable-next-line:no-implicit-dependencies
import Koa from 'koa';
import Mime from 'mime/Mime';
import { join } from 'path';
import { Readable } from 'stream';
// tslint:disable-next-line:no-implicit-dependencies
import request from 'supertest';
// tslint:disable-next-line:no-implicit-dependencies
import * as memfs from 'memfs';

import {
	PrepareResponseOptions,
	Storage,
	FileSystemStorage,
	StorageInfo,
	FileSystemStorageOptions,
	StreamResponse,
	FileData
} from '../lib';

// tslint:disable:no-identical-functions

function brotliParser(res: request.Response, cb: (err: Error | null, body: unknown) => void) {
	const decompress = res.pipe(decompressStream());

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
	opts: PrepareResponseOptions = { }
) {
	const result = await storage.prepareResponse(
		reference,
		ctx.req,
		opts
	);
	ctx.response.status = result.statusCode;
	ctx.response.set(<{ [key: string]: string }> result.headers);
	result.stream.on('error', err => {
		console.error(err);
		if (ctx.res.connection.destroyed) {
			return;
		}
		if (!ctx.headerSent) {
			ctx.response.status = 500;
			ctx.response.set({});
			ctx.response.body = 'Internal Server Error';
			return;
		}
		ctx.res.destroy(err);
	});
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
	ctx.response.status = result.statusCode;
	ctx.response.set(<{ [key: string]: string }> result.headers);
	result.stream.on('error', err => {
		console.error(err);
		if (ctx.res.connection.destroyed) {
			return;
		}
		if (!ctx.headerSent) {
			ctx.response.status = 500;
			ctx.response.set({});
			ctx.response.body = 'Internal Server Error';
			return;
		}
		ctx.res.destroy(err);
	});
	ctx.body = result.stream;
	return result;
}

describe('send(ctx, file)', () => {
	describe('when simple path', () => {
		it('should 200 on plain text', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.expect(200)
				.expect('world', done);
		});
		it('should 200 on html', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/world/index.html');
			});

			request(app.listen())
				.get('/')
				.expect('content-type', 'text/html; charset=utf-8')
				.expect('content-length', '10')
				.expect(200, done);
		});
		it('should 404 when does not exist', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, 'fixtures-koa/not-existing.txt');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
	});

	describe('when path contains ..', () => {
		it('should 404 when existing outside root', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/../package.json');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
		it('should 404 when path existing inside root', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, join(__dirname, 'fixtures-koa'), '../../test/fixtures-koa/world/index.html');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
	});

	describe('when path is a directory', () => {
		it('should 404 with /', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
		it('should 404 without /', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
	});

	describe('when path is malformed', () => {
		it('should 404', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/%');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
	});

	describe('when path is malicious', () => {
		it('should 404 on null bytes', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/%00');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
		it('should 404 on encoded slash', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/%2F');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
		it('should 404 on encoded slash', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/%2F');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
		it('should 404 on back slash', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/\\');
			});

			request(app.listen())
				.get('/')
				.expect(404, done);
		});
	});

	describe('when path have precompressed files', () => {
		it('should return the path when no file is available', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'br, gzip, identity')
				.expect('Content-Length', '18')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should 404 when not any file is available', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'br, gzip, identity')
				.expect(404, done);
		});

		it('should return the path when a directory have the encoding extension', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'br, gzip, identity')
				.expect('Content-Length', '5')
				.expect('world')
				.expect(200, done);
		});

		it('should return path if .gz path exists and gzip not requested', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'deflate, identity')
				.expect('Content-Length', '18')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return path if .gz path exists and identity is the priority', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'gzip, identity')
				.expect('Content-Length', '18')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return .gz path if .gz path exists and gzip requested', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'gzip, deflate, identity')
				.expect('Content-Length', '48')
				.expect('Content-Type', /^application\/json/)
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return path when .br path exists and brotli not requested', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'deflate, identity')
				.expect('Content-Length', '18')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return .br path when .br path exists and brotli requested', done => {
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

			request(app.listen())
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

		it('should return .gz path when brotli not configured', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'br, gzip, deflate, identity')
				.expect('Content-Length', '48')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return path when identity encoding has more weight', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'br;q=0.2, gzip;q=0.2, deflate;q=0.2, identity')
				.expect('Content-Length', '18')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return path when no acceptable encoding', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'br;q=0.2')
				.expect('Content-Length', '18')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return gz path when x-gzip is set', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'x-gzip;q=0.2')
				.expect('Content-Length', '48')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return path when x-compress is set', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'x-compress;q=0.2')
				.expect('Content-Length', '18')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return gz path when asterisk encoding has more weight and gz available', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'br;q=0.2, *;q=0.3, deflate;q=0.2, identity;q=0.2')
				.expect('Content-Length', '48')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return path when empty content-encoding', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', '')
				.expect('Content-Length', '18')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should return path when no content-encoding', done => {
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

			request(app.listen())
				.get('/')
				.expect('Content-Length', '18')
				.expect('{ "name": "tobi" }')
				.expect(200, done);
		});

		it('should 404 when is directory', done => {
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

			request(app.listen())
				.get('/')
				.set('Accept-Encoding', 'br, gzip, identity')
				.expect(404, done);
		});
	});

	describe('when cacheControl is specified', () => {
		it('should set cache-control', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				const p = '/fixtures-koa/user.json';
				const sent = await send(ctx, __dirname, p, { cacheControl: 'max-age=5' });
				assert.strictEqual(
					sent.storageInfo ? sent.storageInfo.attachedData.resolvedPath : undefined,
					join(__dirname, '/fixtures-koa/user.json')
				);
			});

			request(app.listen())
				.get('/')
				.expect('Cache-Control', 'max-age=5')
				.expect(200, done);
		});

		it('be unset through false option', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt', {
					cacheControl: false
				});
			});

			request(app.listen())
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

	describe('when content-type is used', () => {
		it('should set the Content-Type', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json');
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', /application\/json/)
				.end(done);
		});

		it('should set the Content-Type with utf-8 charset for html', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/world/index.html');
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', 'text/html; charset=utf-8')
				.end(done);
		});

		it('should set the Content-Type with no charset for html when disabled', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/world/index.html', { defaultCharsets: false });
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', 'text/html')
				.end(done);
		});

		it('should set the Content-Type with a charset when option used', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/world/index.html', {
					defaultCharsets: [{ matcher: /^text\/.*/, charset: 'windows-1252' }]
				});
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', 'text/html; charset=windows-1252')
				.end(done);
		});

		it('should not set the Content-Type with a charset when content type does not match', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json', {
					defaultCharsets: [{ matcher: /^text\/.*/, charset: 'windows-1252' }]
				});
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', 'application/json')
				.end(done);
		});

		it('should not set the Content-Type when type is unknown, (koa force to application/octet-stream)', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/unknown');
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', 'application/octet-stream')
				.end(done);
		});

		it('should not set the Content-Type when type is not text', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/test.png');
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', 'image/png')
				.end(done);
		});

		it('be unset with false contentType option', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json', { contentType: false });
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', 'application/octet-stream')
				.end(done);
		});

		it('should set to default the Content-Type when type is unknown', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/unknown', { defaultContentType: 'application/x-test' });
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', 'application/x-test')
				.end(done);
		});

		it('should use mime module instance when set', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(
					ctx,
					__dirname,
					'/fixtures-koa/user.json',
					{ mimeModule: new Mime({ 'application/x-test': ['json'] }) }
				);
			});

			request(app.listen())
				.get('/')
				.expect('Content-Type', 'application/x-test')
				.end(done);
		});

		it('should 500 when mime module instance throw', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(
					ctx,
					__dirname,
					'/fixtures-koa/user.json',
					{ mimeModule: {
						getType() {
							throw new Error('oops');
						}
					} }
				);
			});

			request(app.listen())
				.get('/')
				.expect(500, done);
		});
	});

	describe('when content-disposition is used', () => {
		it('should set the inline Content-Disposition by default', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json');
			});

			request(app.listen())
				.get('/')
				.expect('Content-Disposition', 'inline; filename="user.json"')
				.end(done);
		});

		it('should set the attachment with content-disposition module option', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json', {
					contentDispositionType: 'attachment'
				});
			});

			request(app.listen())
				.get('/')
				.expect('Content-Disposition', 'attachment; filename="user.json"')
				.end(done);
		});

		it('should unset content-disposition with false option', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json', {
					contentDispositionType: false
				});
			});

			request(app.listen())
				.get('/')
				.expect(res => {
					if (res.get('Content-Disposition')) {
						throw new Error('Content-Disposition should not be set');
					}
				})
				.end(done);
		});
	});

	it('should set the Content-Length', done => {
		const app = new Koa<object>();

		app.use(async ctx => {
			await send(ctx, __dirname, '/fixtures-koa/user.json');
		});

		request(app.listen())
			.get('/')
			.expect('Content-Length', '18')
			.end(done);
	});

	describe('when last-modified is used', () => {
		it('should set Last-Modified', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json');
			});

			request(app.listen())
				.get('/')
				.expect('Last-Modified', /GMT/)
				.end(done);
		});

		it('should not set Last-Modified when false option', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json', { lastModified: false });
			});

			request(app.listen())
				.get('/')
				.expect(res => {
					if (res.get('Last-Modified')) {
						throw new Error('Last-Modified should not be set');
					}
				})
				.end(done);
		});
	});

	it('should answer 304 when data is fresh', done => {
		const app = new Koa<object>();

		app.use(async ctx => {
			await send(ctx, __dirname, '/fixtures-koa/user.json');
		});

		const stats = fs.statSync(join(__dirname, '/fixtures-koa/user.json'));

		request(app.listen())
			.get('/')
			.set('If-Modified-Since', stats.mtime.toUTCString())
			.expect(304, done);
	});

	describe('when range header is used', () => {
		it('should respond 206 to a range request', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0')
				.expect(206)
				.expect('Content-Range', 'bytes 0-0/5')
				.expect('Content-Length', '1')
				.end(done);
		});

		it('should respond 206 to a range request if range fresh (last modified)', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt');
			});

			const stats = fs.statSync(join(__dirname, '/fixtures-koa/hello.txt'));

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0')
				.set('If-Range', stats.mtime.toUTCString())
				.expect(206)
				.expect('Content-Range', 'bytes 0-0/5')
				.expect('Content-Length', '1')
				.end(done);
		});

		it('should respond 200 to a range request if range not fresh (last modified)', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0')
				.set('If-Range', new Date().toUTCString())
				.expect(200)
				.end(done);
		});

		it('should respond 200 to a range request if range not fresh (etag)', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0')
				.set('If-Range', '"test"')
				.expect(200)
				.end(done);
		});

		it('should respond 206 to a range request if range fresh (empty last modified)', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt', { lastModified: false });
			});

			const stats = fs.statSync(join(__dirname, '/fixtures-koa/hello.txt'));

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0')
				.set('If-Range', stats.mtime.toUTCString())
				.expect(200)
				.end(done);
		});

		it('should respond 206 to a range request if range fresh (empty etag)', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt', { etag: false });
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0')
				.set('If-Range', '"test"')
				.expect(200)
				.end(done);
		});

		it('should respond 206 to a multiple range request', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
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
						!/^--[^\r\n]+\r\ncontent-type: text\/plain; charset=utf-8\r\ncontent-range: bytes 0-0\/5\r\n\r\nw\r\n--[^\r\n]+\r\ncontent-type: text\/plain; charset=utf-8\r\ncontent-range: bytes 2-2\/5\r\n\r\nr\r\n--[^\r\n]+--$/
						.test(<string> res.body)
					) {
						throw new Error('multipart/byteranges seems invalid');
					}
				})
				.end(done);
		});

		it('should respond to a multiple range request with unknown content type', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/unknown');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0,2-2')
				.expect(206)
				.expect('Content-Type', /^multipart\/byteranges/)
				.end(done);
		});

		it('should respond 416 when cannot be satisfied', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=7-7')
				.expect(416)
				.expect('Content-Range', 'bytes */5')
				.end(done);
		});

		it('should 416 not bytes ranges', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'test=1-1')
				.expect(200)
				.end(done);
		});
	});

	describe('when etag option is set', () => {
		it('should set ETag', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/user.json');
			});

			request(app.listen())
				.get('/')
				.expect('Etag', /"/)
				.end(done);
		});

		it('be unset through etag false option', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, '/fixtures-koa/hello.txt', {
					etag: false
				});
			});

			request(app.listen())
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

	describe('when error occurs on stream', () => {
		it('should handle errors to a simple request', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				const res = await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				ctx.flushHeaders();
				res.stream.destroy(new Error('oops'));
			});

			request(app.listen())
				.get('/')
				.expect(200)
				.end(done);
		});

		it('should handle errors to a simple range request', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				const res = await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				ctx.flushHeaders();
				res.stream.destroy(new Error('oops'));
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0')
				.expect(206)
				.end(done);
		});

		it('should handle errors to a multiple range request', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				const res = await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				ctx.flushHeaders();
				res.stream.destroy(new Error('oops'));
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0,2-2')
				.expect(206)
				.catch(() => {
					done();
				});
		});

		it('should handle errors to a simple request before headers', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				const res = await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				res.stream.destroy(new Error('oops'));
			});

			request(app.listen())
				.get('/')
				.expect(500)
				.end(done);
		});

		it('should handle errors to a simple range request before headers', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				const res = await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				res.stream.destroy(new Error('oops'));
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0')
				.expect(500)
				.end(done);
		});

		it('should handle errors to a multiple range request before headers', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				const res = await send(ctx, __dirname, '/fixtures-koa/hello.txt');
				res.stream.destroy(new Error('oops'));
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0,2-2')
				.expect(500)
				.end(done);
		});

		it('should handle read errors to a simple request', done => {
			const app = new Koa<object>();

			class ErrorStorage extends FileSystemStorage {
				createReadableStream(
					_si: StorageInfo<FileData>,
					_start: number,
					_end: number,
					_autoclose: boolean
				) {
					return new Readable({
						read() {
							process.nextTick(() => this.emit('error', new Error('ooops')));
						}
					});
				}
			}
			const storage = new ErrorStorage(__dirname);

			app.use(async ctx => {
				await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.expect(500)
				.end(done);
		});

		it('should handle read errors to a multiple range request', done => {
			const app = new Koa<object>();

			class ErrorStorage extends FileSystemStorage {
				createReadableStream(
					_si: StorageInfo<FileData>,
					_start: number,
					_end: number,
					_autoclose: boolean
				) {
					return new Readable({
						read() {
							process.nextTick(() => this.emit('error', new Error('ooops')));
						}
					});
				}
			}
			const storage = new ErrorStorage(__dirname);

			app.use(async ctx => {
				await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0,2-2')
				.expect(500)
				.catch(() => {
					done();
				});
		});

		it('should handle read errors to a multiple range request on second stream', done => {
			const app = new Koa<object>();

			let first = true;
			class ErrorStorage extends FileSystemStorage {
				createReadableStream(
					si: StorageInfo<FileData>,
					start: number,
					end: number,
					autoclose: boolean
				) {
					if (first) {
						first = false;
						return super.createReadableStream(si, start, end, autoclose);
					}
					return new Readable({
						read() {
							process.nextTick(() => this.emit('error', new Error('ooops')));
						}
					});
				}
			}
			const storage = new ErrorStorage(__dirname);

			app.use(async ctx => {
				await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0,2-2')
				.expect(500)
				.catch(() => {
					done();
				});
		});

		it('should handle read errors to a multiple range request after second stream', done => {
			const app = new Koa<object>();

			let first = true;
			class ErrorStorage extends FileSystemStorage {
				result?: StreamResponse<FileData>;
				createReadableStream(
					si: StorageInfo<FileData>,
					start: number,
					end: number,
					autoclose: boolean
				) {
					if (first) {
						first = false;
						return super.createReadableStream(si, start, end, autoclose);
					}
					if (this.result) {
						this.result.stream.emit('error', new Error('ooops'));
					}
					return super.createReadableStream(si, start, end, autoclose);
				}
			}
			const storage = new ErrorStorage(__dirname);

			app.use(async ctx => {
				storage.result = await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0,2-2')
				.expect(500)
				.catch(() => {
					done();
				});
		});

		it('should handle read errors to a multiple range request after first stream', done => {
			const app = new Koa<object>();

			class ErrorStorage extends FileSystemStorage {
				result?: StreamResponse<FileData>;
				createReadableStream(
					si: StorageInfo<FileData>,
					start: number,
					end: number,
					autoclose: boolean
				) {
					if (this.result) {
						this.result.stream.emit('error', new Error('ooops'));
					}
					return super.createReadableStream(si, start, end, autoclose);
				}
			}
			const storage = new ErrorStorage(__dirname);

			app.use(async ctx => {
				storage.result = await sendStorage(ctx, storage, '/fixtures-koa/hello.txt');
			});

			request(app.listen())
				.get('/')
				.set('Range', 'bytes=0-0,2-2')
				.expect(500)
				.catch(() => {
					done();
				});
		});
	});

	describe('when fsModule option used', () => {
		it('should handle memfs as fsModule option', done => {
			const app = new Koa<object>();

			memfs.fs.writeFileSync('/foo.txt', 'bar');

			app.use(async ctx => {
				await send(ctx, '/', '/foo.txt', { fsModule: <typeof fs> <unknown> memfs.fs });
			});

			request(app.listen())
				.get('/')
				.expect(200, 'bar')
				.end(done);
		});
	});

	describe('when path array is used', () => {
		it('should handle path array', done => {
			const app = new Koa<object>();

			app.use(async ctx => {
				await send(ctx, __dirname, ['fixtures-koa', 'hello.txt']);
			});

			request(app.listen())
				.get('/')
				.expect(200, 'world')
				.end(done);
		});
	});
});

// tslint:enable:no-identical-functions
