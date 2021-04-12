/* eslint-disable max-lines, max-lines-per-function, sonarjs/no-identical-functions */
/* eslint-env node, mocha */

import * as assert from 'assert';
import * as fs from 'fs';
import { createBrotliDecompress } from 'zlib';
import { join } from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';

import request from 'supertest';
import * as memfs from 'memfs';

import type {
	StorageInfo,
	FileData,
	StreamRange,
	FilePath,
	StorageRequestHeaders,
	StreamResponse,
} from '../src/send-stream';
import { Storage, FileSystemStorage, BufferStream } from '../src/send-stream';

import type { ServerWrapper } from './wrappers/server.wrapper';
import { FastifyServerWrapper } from './wrappers/fastify.wrapper';
import { KoaServerWrapper } from './wrappers/koa.wrapper';
import { ExpressServerWrapper } from './wrappers/express.wrapper';
import { VanillaServerWrapper } from './wrappers/vanilla.wrapper';

function brotliParser(res: request.Response, cb: (err: Error | null, body: unknown) => void) {
	const decompress = res.pipe(createBrotliDecompress());

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
		cb(null, Buffer.isEncoding(res.charset)
			? concatChunks.toString(res.charset)
			: concatChunks.toString());
	});
}

function multipartHandler(res: request.Response, cb: (err: Error | null, body: unknown) => void) {
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
		const concatChunks = Buffer.concat(chunks, length);
		res.text = Buffer.isEncoding(res.charset)
			? concatChunks.toString(res.charset)
			: concatChunks.toString();
		cb(null, res.text);
	});
	res.on('close', () => {
		if (end) {
			return;
		}
		cb(new Error('incomplete data'), null);
	});
}

function shouldNotHaveHeader(header: string) {
	return (res: request.Response) => {
		const { [header.toLowerCase()]: value } = <Record<string, string>> res.header;
		assert.strictEqual(
			value,
			undefined,
			`should not have header ${ header } (actual value: "${ value }")`,
		);
	};
}

interface Context {
	lastResult: StreamResponse<unknown> | true | undefined;
}

const frameworks = <const> [
	[
		'fastify',
		(context: Context) => new FastifyServerWrapper(context),
	],
	[
		'koa',
		(context: Context) => new KoaServerWrapper(context),
	],
	[
		'express',
		(context: Context) => new ExpressServerWrapper(context),
	],
	[
		'vanilla',
		(context: Context) => new VanillaServerWrapper(context),
	],
];

for (const [frameworkName, frameworkServer] of frameworks) {
	describe(frameworkName, () => {
		const context: Context = { lastResult: undefined };

		beforeEach('init check', () => {
			context.lastResult = undefined;
		});

		afterEach('destroy check', function checkDestroy() {
			// eslint-disable-next-line @typescript-eslint/no-invalid-this
			if (this.currentTest?.state === 'failed') {
				context.lastResult = undefined;
				return;
			}
			assert.notStrictEqual(context.lastResult, undefined);
			if (context.lastResult && context.lastResult !== true) {
				assert.strictEqual(context.lastResult.stream.destroyed, true);
			}
			context.lastResult = undefined;
		});

		describe('send(ctx, file)', () => {
			describe('when simple path', () => {
				describe('should 200 on plain text', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 200 on plain text', async () => {
						await request(app.server)
							.get('/')
							.expect(200)
							.expect('world');
					});
				});
				describe('should 200 on html', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/world/index.html');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 200 on html', async () => {
						await request(app.server)
							.get('/')
							.expect('content-type', 'text/html; charset=UTF-8')
							.expect('content-length', '10')
							.expect(200);
					});
				});
				describe('should 404 when does not exist', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/not-existing.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 when does not exist', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'DoesNotExistError')
							.expect(404);
					});
				});
			});

			describe('when path contains ..', () => {
				describe('should 404 when existing outside root', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/../package.json');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 when existing outside root', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'NotNormalizedError')
							.expect(404);
					});
				});
				describe('should 404 when path existing inside root', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(
							join(__dirname, 'fixtures-frameworks'),
							'/../../test/fixtures-frameworks/world/index.html',
						);

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 when path existing inside root', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'NotNormalizedError')
							.expect(404);
					});
				});
				describe('should 404 when path does not start with /', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(join(__dirname, 'fixtures-frameworks'), 'index.html');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 when path existing inside root', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'StorageError')
							.expect(404);
					});
				});
			});

			describe('when path is a directory', () => {
				describe('should 404 with /', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 with /', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'TrailingSlashError')
							.expect(404);
					});
				});
				describe('should 404 without /', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 without /', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'IsDirectoryError')
							.expect(404);
					});
				});
				describe('when onDirectory = list-files is used', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, undefined, { onDirectory: 'list-files' });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 200 with /', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/')
							.expect('Content-Type', 'text/html; charset=UTF-8')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, 'fixtures-frameworks', ''))
							.expect(200);
					});
					it('should 404 without /', async () => {
						await request(app.server)
							.get('/fixtures-frameworks')
							.expect('X-Send-Stream-Error', 'IsDirectoryError')
							.expect(404);
					});
					it('should 404 if file with /', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/gzip.json/')
							.expect('X-Send-Stream-Error', 'TrailingSlashError')
							.expect(404);
					});
				});

				describe('when onDirectory = serve-index is used', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, undefined, { onDirectory: 'serve-index' });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 200 with /', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/world/')
							.expect('Content-Type', 'text/html; charset=UTF-8')
							.expect(
								'X-Send-Stream-Resolved-Path',
								join(__dirname, 'fixtures-frameworks', 'world', 'index.html'),
							)
							.expect(200, 'html index');
					});
					it('should 404 without /', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/world')
							.expect('X-Send-Stream-Error', 'IsDirectoryError')
							.expect(404);
					});
					it('should 404 if file with /', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/gzip.json/')
							.expect('X-Send-Stream-Error', 'DoesNotExistError')
							.expect(404);
					});
					it('should 404 if not existing index with /', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/')
							.expect('X-Send-Stream-Error', 'DoesNotExistError')
							.expect(404);
					});
				});
			});

			describe('when path is malformed', () => {
				let app: ServerWrapper;
				before(async () => {
					app = frameworkServer(context);

					app.send(__dirname, '/%');

					await app.listen();
				});
				after(async () => {
					await app.close();
				});
				it('should 404', async () => {
					await request(app.server)
						.get('/')
						.expect('X-Send-Stream-Error', 'MalformedPathError')
						.expect(404);
				});
			});

			describe('when path is malicious', () => {
				describe('should 404 on null bytes', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/%00');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 on null bytes', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'ForbiddenCharacterError')
							.expect(404);
					});
				});
				describe('should 404 on encoded slash', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/%2F');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 on encoded slash', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'ForbiddenCharacterError')
							.expect(404);
					});
				});
				describe('should 404 on back slash', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/\\');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 on back slash', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'NotNormalizedError')
							.expect(404);
					});
				});
			});

			describe('when dynamic compression is activated', () => {
				describe('should compress', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, undefined, { dynamicCompression: true });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('return compressed text', async () => {
						const { body } = <{ body: string }> await request(app.server)
							.get('/fixtures-frameworks/some.path/index.json')
							.parse(brotliParser)
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect(
								'X-Send-Stream-Resolved-Path',
								join(__dirname, '/fixtures-frameworks/some.path/index.json'),
							)
							.expect(shouldNotHaveHeader('Content-Length'))
							.expect('Content-Encoding', 'br')
							.expect(200);
						assert.deepStrictEqual(body, '{\n\t"foo": 123,\n\t"bar": 456\n}\n');
					});
					it('not return compressed text when identity is required', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/some.path/index.json')
							.set('Accept-Encoding', 'br;q=0.8, gzip;q=0.8, identity')
							.expect(
								'X-Send-Stream-Resolved-Path',
								join(__dirname, '/fixtures-frameworks/some.path/index.json'),
							)
							.expect('Content-Length', '29')
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('{\n\t"foo": 123,\n\t"bar": 456\n}\n')
							.expect(200);
					});
					it('not return compressed text when length < 20', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/user.json')
							.set('Accept-Encoding', 'br;q=0.8, gzip;q=0.8, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/user.json'))
							.expect('Content-Length', '18')
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
					it('return png without compression', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/test.png')
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/test.png'))
							.expect('Content-Length', '538')
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect(200);
					});
				});

				describe('should compress with dynamicCompressionMinLength', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(
							__dirname,
							undefined,
							{ dynamicCompression: true, dynamicCompressionMinLength: 10 },
						);

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('return compressed text', async () => {
						const { body } = <{ body: string }> await request(app.server)
							.get('/fixtures-frameworks/some.path/index.json')
							.parse(brotliParser)
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect(
								'X-Send-Stream-Resolved-Path',
								join(__dirname, '/fixtures-frameworks/some.path/index.json'),
							)
							.expect(shouldNotHaveHeader('Content-Length'))
							.expect('Content-Encoding', 'br')
							.expect(200);
						assert.deepStrictEqual(body, '{\n\t"foo": 123,\n\t"bar": 456\n}\n');
					});
					it('return compressed text when length >= dynamicCompressionMinLength', async () => {
						const { body } = <{ body: string }> await request(app.server)
							.get('/fixtures-frameworks/user.json')
							.parse(brotliParser)
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/user.json'))
							.expect(shouldNotHaveHeader('Content-Length'))
							.expect('Content-Encoding', 'br')
							.expect(200);
						assert.deepStrictEqual(body, '{ "name": "tobi" }');
					});

					it('not return compressed text when length < dynamicCompressionMinLength', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/hello.txt')
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/hello.txt'))
							.expect('Content-Length', '5')
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('world')
							.expect(200);
					});
				});

				describe('should compress file listing', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, undefined, { dynamicCompression: true, onDirectory: 'list-files' });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('return compressed text', async () => {
						const { body } = <{ body: string }> await request(app.server)
							.get('/fixtures-frameworks/')
							.parse(brotliParser)
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect(shouldNotHaveHeader('Content-Length'))
							.expect('Content-Encoding', 'br')
							.expect(200);
						assert.ok(body.startsWith('<!DOCTYPE html>'));
					});
				});

				describe('should compress when custom compressible filter is set', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, undefined, {
							dynamicCompression: true,
							mimeTypeCompressible: () => true,
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('return compressed text', async () => {
						const { body } = <{ body: string }> await request(app.server)
							.get('/fixtures-frameworks/some.path/index.json')
							.parse(brotliParser)
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect(
								'X-Send-Stream-Resolved-Path',
								join(__dirname, '/fixtures-frameworks/some.path/index.json'),
							)
							.expect(shouldNotHaveHeader('Content-Length'))
							.expect('Content-Encoding', 'br')
							.expect(200);
						assert.deepStrictEqual(body, '{\n\t"foo": 123,\n\t"bar": 456\n}\n');
					});
					it('return png without compression', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/test.png')
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/test.png'))
							.expect(shouldNotHaveHeader('Content-Length'))
							.expect('Content-Encoding', 'br')
							.expect(200);
					});
				});

				describe('should compress with restricted list of encodings', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, undefined, { dynamicCompression: ['gzip'] });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('return compressed text', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/some.path/index.json')
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect(
								'X-Send-Stream-Resolved-Path',
								join(__dirname, '/fixtures-frameworks/some.path/index.json'),
							)
							.expect(shouldNotHaveHeader('Content-Length'))
							.expect('Content-Encoding', 'gzip')
							.expect('{\n\t"foo": 123,\n\t"bar": 456\n}\n')
							.expect(200);
					});
				});

				describe('should not work for unsupported encodings', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, undefined, { dynamicCompression: ['deflate'], noResult: true });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('throw error', async () => {
						await request(app.server)
							.get('/fixtures-frameworks/some.path/index.json')
							.set('Accept-Encoding', 'deflate, identity')
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect(500);
					});
				});

				describe('should handle errors', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.sendWithError(__dirname, undefined, { dynamicCompression: true });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should throw error', async () => {
						try {
							await request(app.server)
								.get('/fixtures-frameworks/some.path/index.json')
								.set('Accept-Encoding', 'br, gzip, identity');
							assert.fail();
						} catch {
							await new Promise(resolve => {
								resolve(undefined);
							});
						}
					});
					it('should throw error', async () => {
						try {
							await request(app.server)
								.get('/fixtures-frameworks/some.path/index.json')
								.set('Accept-Encoding', 'gzip, identity');
							assert.fail();
						} catch {
							await new Promise(resolve => {
								resolve(undefined);
							});
						}
					});
				});
			});

			describe('when path have precompressed files', () => {
				describe('should return the path when no file is available', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return the path when no file is available', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/user.json'))
							.expect('Content-Length', '18')
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should 404 when not any file is available', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/notexisting.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 when not any file is available', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('X-Send-Stream-Error', 'DoesNotExistError')
							.expect(404);
					});
				});

				describe('should 404 when identity is not accepted', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.txt)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 when identity is not accepted', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'br, gzip, identity;q=0')
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('X-Send-Stream-Error', 'DoesNotExistError')
							.expect(404);
					});
				});

				describe('should return the path when a directory have the encoding extension', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.txt)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return the path when a directory have the encoding extension', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/hello.txt'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '5')
							.expect('world')
							.expect(200);
					});
				});

				describe(
					'should return the path when a directory have the encoding extension (with regexp as text)',
					() => {
						let app: ServerWrapper;
						before(async () => {
							app = frameworkServer(context);

							app.send(__dirname, '/fixtures-frameworks/hello.txt', {
								contentEncodingMappings: [
									{
										matcher: '^(?<path>.*\\.txt)$',
										encodings: [
											{
												name: 'br',
												path: '$<path>.br',
											},
											{
												name: 'gzip',
												path: '$<path>.gz',
											},
										],
									},
								],
							});

							await app.listen();
						});
						after(async () => {
							await app.close();
						});
						it('should return the path when a directory have the encoding extension', async () => {
							await request(app.server)
								.get('/')
								.set('Accept-Encoding', 'br, gzip, identity')
								.expect(
									'X-Send-Stream-Resolved-Path',
									join(__dirname, '/fixtures-frameworks/hello.txt'),
								)
								.expect(shouldNotHaveHeader('Content-Encoding'))
								.expect('Content-Length', '5')
								.expect('world')
								.expect(200);
						});
					},
				);

				describe(
					'should not return the path when directory have the encoding extension but matcher not ok',
					() => {
						let app: ServerWrapper;
						before(async () => {
							app = frameworkServer(context);

							app.send(__dirname, '/fixtures-frameworks/hello.txt', {
								contentEncodingMappings: [
									{
										matcher: /^(?<path>.*\.json)$/u,
										encodings: [
											{
												name: 'br',
												path: '$<path>.br',
											},
											{
												name: 'gzip',
												path: '$<path>.gz',
											},
										],
									},
								],
							});

							await app.listen();
						});
						after(async () => {
							await app.close();
						});
						it(
							'should not return the path when directory have the encoding extension but matcher not ok',
							async () => {
								await request(app.server)
									.get('/')
									.set('Accept-Encoding', 'br, gzip, identity')
									.expect(
										'X-Send-Stream-Resolved-Path',
										join(__dirname, '/fixtures-frameworks/hello.txt'),
									)
									.expect(shouldNotHaveHeader('Content-Encoding'))
									.expect('Content-Length', '5')
									.expect('world')
									.expect(200);
							},
						);
					},
				);

				describe('should return path if .gz path exists and gzip not requested', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return path if .gz path exists and gzip not requested', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'deflate, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
					it('should return path if .gz path exists and Content-Encoding not set', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', '')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return path if .gz path exists and identity is the priority', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'identity',
											path: '$<path>',
										},
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return path if .gz path exists and identity is the priority', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'gzip, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return path if .gz path exists and accept encoding is not valid', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return path if .gz path exists and accept encoding is not valid', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'gzip, ùù')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
					it(
						'should return path if .gz path exists and accept encoding is multiple empty encodings',
						async () => {
							await request(app.server)
								.get('/')
								.set('Accept-Encoding', ',')
								.expect(
									'X-Send-Stream-Resolved-Path',
									join(__dirname, '/fixtures-frameworks/gzip.json'),
								)
								.expect(shouldNotHaveHeader('Content-Encoding'))
								.expect('Content-Length', '18')
								.expect('{ "name": "tobi" }')
								.expect(200);
						},
					);
				});

				describe('should return .gz path if .gz path exists and gzip requested', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return .gz path if .gz path exists and gzip requested', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'gzip, deflate, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json.gz'))
							.expect('Content-Encoding', 'gzip')
							.expect('Content-Disposition', 'inline; filename="gzip.json"')
							.expect('Content-Length', '48')
							.expect('Content-Type', /^application\/json/u)
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
					it('should return path if .gz path exists and first accept encoding is empty', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', ', gzip')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json.gz'))
							.expect('Content-Encoding', 'gzip')
							.expect('Content-Length', '48')
							.expect('Content-Type', /^application\/json/u)
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
					it('should return path if .gz path exists and first accept encodings are empty', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', ' , , gzip')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json.gz'))
							.expect('Content-Encoding', 'gzip')
							.expect('Content-Length', '48')
							.expect('Content-Type', /^application\/json/u)
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return path when .br path exists and brotli not requested', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return path when .br path exists and brotli not requested', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'deflate, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
					it('should return path if .gz path exists and gzip and brotli weight is set to 0', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'gzip;q=0,br;q=0,*')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('Content-Type', /^application\/json/u)
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return .br path when .br path exists and brotli requested', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return .br path when .br path exists and brotli requested', async () => {
						const { body } = <{ body: string }> await request(app.server)
							.get('/')
							.parse(brotliParser)
							.set('Accept-Encoding', 'br, deflate, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json.br'))
							.expect('Content-Encoding', 'br')
							.expect('Content-Length', '22')
							.expect('Content-Type', /^application\/json/u)
							.expect(200);
						assert.deepStrictEqual(body, '{ "name": "tobi" }');
					});

					it('should return brotli if .gz path exists and gzip weight is set to 0', async () => {
						const { body } = <{ body: string }> await request(app.server)
							.get('/')
							.parse(brotliParser)
							.set('Accept-Encoding', 'gzip;q=0,*')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json.br'))
							.expect('Content-Encoding', 'br')
							.expect('Content-Length', '22')
							.expect('Content-Type', /^application\/json/u)
							.expect(200);
						assert.deepStrictEqual(body, '{ "name": "tobi" }');
					});
				});

				describe('should return .gz path when brotli not configured', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return .gz path when brotli not configured', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'br, gzip, deflate, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json.gz'))
							.expect('Content-Encoding', 'gzip')
							.expect('Content-Length', '48')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return path when identity encoding has more weight', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return path when identity encoding has more weight', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'br;q=0.2, gzip;q=0.2, deflate;q=0.2, identity')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return path when no acceptable encoding', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return path when no acceptable encoding', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'br;q=0.2')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return gz path when x-gzip is set', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return gz path when x-gzip is set', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'x-gzip;q=0.2')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json.gz'))
							.expect('Content-Encoding', 'gzip')
							.expect('Content-Length', '48')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return path when x-compress is set', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return path when x-compress is set', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'x-compress;q=0.2')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return gz path when asterisk encoding has more weight and gz available', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
										{
											name: 'br',
											path: '$<path>.br',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return gz path when asterisk encoding has more weight and gz available', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'br;q=0.2, *;q=0.3, deflate;q=0.2, identity;q=0.2')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json.gz'))
							.expect('Content-Encoding', 'gzip')
							.expect('Content-Length', '48')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return path when empty content-encoding', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
										{
											name: 'br',
											path: '$<path>.br',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return path when empty content-encoding', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', '')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should return path when no content-encoding', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/gzip.json', {
							// hack because superagent always add accept-encoding
							removeHeader: 'accept-encoding',
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*\.json)$/u,
									encodings: [
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
										{
											name: 'br',
											path: '$<path>.br',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should return path when no content-encoding', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/gzip.json'))
							.expect('Content-Length', '18')
							.expect('{ "name": "tobi" }')
							.expect(200);
					});
				});

				describe('should 404 when is directory', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/world', {
							contentEncodingMappings: [
								{
									matcher: /^(?<path>.*)$/u,
									encodings: [
										{
											name: 'br',
											path: '$<path>.br',
										},
										{
											name: 'gzip',
											path: '$<path>.gz',
										},
									],
								},
							],
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 404 when is directory', async () => {
						await request(app.server)
							.get('/')
							.set('Accept-Encoding', 'br, gzip, identity')
							.expect(shouldNotHaveHeader('Content-Encoding'))
							.expect('X-Send-Stream-Error', 'IsDirectoryError')
							.expect(404);
					});
				});
			});

			describe('when cacheControl is specified', () => {
				describe('should set cache-control', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json', { cacheControl: 'max-age=5' });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set cache-control', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Resolved-Path', join(__dirname, '/fixtures-frameworks/user.json'))
							.expect('Cache-Control', 'max-age=5')
							.expect(200);
					});
				});

				describe('be unset through false option', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt', {
							cacheControl: false,
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('be unset through false option', async () => {
						await request(app.server)
							.get('/')
							.expect(200)
							.expect(res => {
								if (res.get('Cache-Control')) {
									throw new Error('Cache-Control should not be set');
								}
							});
					});
				});
			});

			describe('when content-type is used', () => {
				describe('should set the Content-Type', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set the Content-Type', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Type', /application\/json/u);
					});
				});

				describe('should set the Content-Type with UTF-8 charset for html', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/world/index.html');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set the Content-Type with UTF-8 charset for html', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Type', 'text/html; charset=UTF-8');
					});
				});

				describe(
					'should not set Content-Type when type is unknown, (frameworks force to application/octet-stream)',
					() => {
						let app: ServerWrapper;
						before(async () => {
							app = frameworkServer(context);

							app.send(__dirname, '/fixtures-frameworks/unknown');

							await app.listen();
						});
						after(async () => {
							await app.close();
						});
						it(
							'should not set Content-Type when type is unknown,'
							+ ' (frameworks force to application/octet-stream)',
							async () => {
								await request(app.server)
									.get('/')
									.expect('Content-Type', 'application/octet-stream');
							},
						);
					},
				);

				describe('should not set the Content-Type when type is not text', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/test.png');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should not set the Content-Type when type is not text', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Type', 'image/png');
					});
				});

				describe('be unset with false mimeType option', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json', { mimeType: false });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('be unset with false mimeType option', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Type', 'application/octet-stream');
					});
				});

				describe('be charset unset with false mimeType option', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/world/index.html', { mimeTypeCharset: false });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('be unset with false mimeTypeCharset option', async () => {
						await request(app.server)
							.get('/')
							.expect(
								'Content-Type',
								frameworkName === 'express' ? 'text/html; charset=utf-8' : 'text/html',
							);
					});
				});

				describe('should set to default the Content-Type when type is unknown', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/unknown', { defaultMimeType: 'application/x-test' });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set to default the Content-Type when type is unknown', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Type', 'application/x-test');
					});
				});

				describe('should use mime mimeTypeLookup when set', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(
							__dirname,
							'/fixtures-frameworks/user.json',
							{ mimeTypeLookup: () => 'application/x-test' },
						);

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should use mimeTypeLookup when set', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Type', 'application/x-test');
					});
				});

				describe('should 500 when mimeTypeLookup throw', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(
							__dirname,
							'/fixtures-frameworks/user.json',
							{
								noResult: true,
								mimeTypeLookup: () => {
									throw new Error('oops');
								},
							},
						);

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 500 when mimeTypeLookup throw', async () => {
						await request(app.server)
							.get('/')
							.expect(500);
					});
				});

				describe('should use mime mimeTypeDefaultCharset when set', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(
							__dirname,
							'/fixtures-frameworks/user.json',
							{ noResult: true, mimeTypeDefaultCharset: () => 'iso-8859-1' },
						);

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should use mimeTypeDefaultCharset when set', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Type', 'application/json; charset=iso-8859-1');
					});
				});

				describe('should 500 when mimeTypeDefaultCharset throw', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(
							__dirname,
							'/fixtures-frameworks/user.json',
							{
								noResult: true,
								mimeTypeDefaultCharset: () => {
									throw new Error('oops');
								},
							},
						);

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 500 when mimeTypeDefaultCharset throw', async () => {
						await request(app.server)
							.get('/')
							.expect(500);
					});
				});
			});

			describe('when content-disposition is used', () => {
				describe('should set the inline Content-Disposition by default', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set the inline Content-Disposition by default', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Disposition', 'inline; filename="user.json"');
					});
				});

				describe('should set the attachment with content-disposition module option', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json', {
							contentDispositionType: 'attachment',
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set the attachment with content-disposition module option', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Disposition', 'attachment; filename="user.json"');
					});
				});

				describe('should set the attachment with content-disposition module option and filename', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json', {
							contentDispositionType: 'attachment',
							contentDispositionFilename: 'plop.json',
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set the attachment with content-disposition module option and filename', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Disposition', 'attachment; filename="plop.json"');
					});
				});

				describe('should set the attachment with content-disposition module option and no filename', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json', {
							contentDispositionType: 'attachment',
							contentDispositionFilename: false,
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set the attachment with content-disposition module option and no filename', async () => {
						await request(app.server)
							.get('/')
							.expect('Content-Disposition', 'attachment');
					});
				});

				describe('should unset content-disposition with false option', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json', {
							contentDispositionType: false,
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should unset content-disposition with false option', async () => {
						await request(app.server)
							.get('/')
							.expect(res => {
								if (res.get('Content-Disposition')) {
									throw new Error('Content-Disposition should not be set');
								}
							});
					});
				});
			});

			describe('should set the Content-Length', () => {
				let app: ServerWrapper;
				before(async () => {
					app = frameworkServer(context);

					app.send(__dirname, '/fixtures-frameworks/user.json');

					await app.listen();
				});
				after(async () => {
					await app.close();
				});
				it('should set the Content-Length', async () => {
					await request(app.server)
						.get('/')
						.expect('Content-Length', '18');
				});
			});

			describe('when last-modified is used', () => {
				describe('should set Last-Modified', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set Last-Modified', async () => {
						await request(app.server)
							.get('/')
							.expect('Last-Modified', /GMT/u);
					});
				});

				describe('should not set Last-Modified when false option', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json', { lastModified: false });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should not set Last-Modified when false option', async () => {
						await request(app.server)
							.get('/')
							.expect(res => {
								if (res.get('Last-Modified')) {
									throw new Error('Last-Modified should not be set');
								}
							});
					});
				});
			});

			describe('should answer 304 when data is fresh', () => {
				let app: ServerWrapper;
				before(async () => {
					app = frameworkServer(context);

					app.send(__dirname, '/fixtures-frameworks/user.json');

					await app.listen();
				});
				after(async () => {
					await app.close();
				});
				it('should answer 304 when data is fresh', async () => {
					const stats = await promisify(fs.stat)(join(__dirname, '/fixtures-frameworks/user.json'));
					await request(app.server)
						.get('/')
						.set('If-Modified-Since', new Date(stats.mtimeMs).toUTCString())
						.expect(304);
				});
			});

			describe('when range header is used', () => {
				describe('should respond 206 to a range request', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should respond 206 to a range request', async () => {
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=0-0')
							.expect(206)
							.expect('Content-Range', 'bytes 0-0/5')
							.expect('Content-Length', '1');
					});
				});

				describe('should respond 206 to a range request if range fresh (last modified)', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should respond 206 to a range request if range fresh (last modified)', async () => {
						const stats = await promisify(fs.stat)(join(__dirname, '/fixtures-frameworks/hello.txt'));
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=0-0')
							.set('If-Range', new Date(stats.mtimeMs).toUTCString())
							.expect(206)
							.expect('Content-Range', 'bytes 0-0/5')
							.expect('Content-Length', '1');
					});
				});

				describe('should respond 200 to a range request if range not fresh (last modified)', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should respond 200 to a range request if range not fresh (last modified)', async () => {
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=0-0')
							.set('If-Range', new Date().toUTCString())
							.expect(200);
					});
				});

				describe('should respond 200 to a range request if range not fresh (etag)', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should respond 200 to a range request if range not fresh (etag)', async () => {
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=0-0')
							.set('If-Range', '"test"')
							.expect(200);
					});
				});

				describe('should respond 206 to a range request if range fresh (empty last modified)', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt', { lastModified: false });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should respond 206 to a range request if range fresh (empty last modified)', async () => {
						const stats = await promisify(fs.stat)(join(__dirname, '/fixtures-frameworks/hello.txt'));
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=0-0')
							.set('If-Range', new Date(stats.mtimeMs).toUTCString())
							.expect(200);
					});
				});

				describe('should respond 206 to a range request if range fresh (empty etag)', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt', { etag: false });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should respond 206 to a range request if range fresh (empty etag)', async () => {
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=0-0')
							.set('If-Range', '"test"')
							.expect(200);
					});
				});

				describe('should respond 206 to a multiple range request', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should respond 206 to a multiple range request', async () => {
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=0-0,2-2')
							.parse(multipartHandler)
							.expect(206)
							.expect('Content-Type', /^multipart\/byteranges/u)
							.expect(res => {
								if (
									// eslint-disable-next-line max-len
									!/^--[^\r\n]+\r\ncontent-type: text\/plain; charset=UTF-8\r\ncontent-range: bytes 0-0\/5\r\n\r\nw\r\n--[^\r\n]+\r\ncontent-type: text\/plain; charset=UTF-8\r\ncontent-range: bytes 2-2\/5\r\n\r\nr\r\n--[^\r\n]+--$/u
										.test(<string> res.body)
								) {
									throw new Error('multipart/byteranges seems invalid');
								}
							});
					});
				});

				describe('should respond to a multiple range request with unknown content type', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/unknown');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should respond to a multiple range request with unknown content type', async () => {
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=0-0,2-2')
							.parse(multipartHandler)
							.expect(206)
							.expect('Content-Type', /^multipart\/byteranges/u);
					});
				});

				describe('should respond 416 when cannot be satisfied', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should respond 416 when cannot be satisfied', async () => {
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=7-7')
							.expect(416)
							.expect('Content-Range', 'bytes */5');
					});
				});

				describe('should 416 not bytes ranges', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should 416 not bytes ranges', async () => {
						await request(app.server)
							.get('/')
							.set('Range', 'test=1-1')
							.expect(200);
					});
				});
			});

			describe('when etag option is set', () => {
				describe('should set ETag', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/user.json');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should set ETag', async () => {
						await request(app.server)
							.get('/')
							.expect('Etag', /"/u);
					});
				});

				describe('be unset through etag false option', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						app.send(__dirname, '/fixtures-frameworks/hello.txt', {
							etag: false,
						});

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('be unset through etag false option', async () => {
						await request(app.server)
							.get('/')
							.expect(200)
							.expect(res => {
								if (res.get('ETag')) {
									throw new Error('ETag should not be set');
								}
							});
					});
				});
			});

			describe('when error occurs on stream', () => {
				describe('should handle read errors to a simple request', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						class ErrorStorage extends FileSystemStorage {
							// eslint-disable-next-line class-methods-use-this
							createReadableStream() {
								return new Readable({
									read() {
										process.nextTick(() => {
											this.destroy(new Error('ooops'));
										});
									},
								});
							}
						}
						const storage = new ErrorStorage(__dirname);

						app.sendStorage(storage, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should handle read errors to a simple request', async () => {
						if (frameworkName === 'koa') {
							await request(app.server)
								.get('/')
								.expect(500);
						} else {
							try {
								await request(app.server)
									.get('/');
								assert.fail();
							} catch {
								await new Promise(resolve => {
									resolve(undefined);
								});
							}
						}
					});
				});

				describe('should handle stream creation error', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						class ErrorStorage extends FileSystemStorage {
							// eslint-disable-next-line class-methods-use-this
							createReadableStream(): Readable {
								throw new Error('oops');
							}
						}
						const storage = new ErrorStorage(__dirname);

						app.sendStorage(storage, '/fixtures-frameworks/hello.txt', { noResult: true });

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should handle stream creation error', async () => {
						await request(app.server)
							.get('/')
							.expect(500);
					});
				});

				describe('should handle read errors to a multiple range request', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						class ErrorStorage extends FileSystemStorage {
							// eslint-disable-next-line class-methods-use-this
							createReadableStream() {
								return new Readable({
									read() {
										process.nextTick(() => {
											this.destroy(new Error('ooops'));
										});
									},
								});
							}
						}
						const storage = new ErrorStorage(__dirname);

						app.sendStorage(storage, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should handle read errors to a multiple range request', async () => {
						try {
							await request(app.server)
								.get('/')
								.set('Range', 'bytes=0-0,2-2')
								.parse(multipartHandler);
							assert.fail();
						} catch {
							await new Promise(resolve => {
								resolve(undefined);
							});
						}
					});
				});

				describe('should handle read errors to a multiple range request on second stream', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						let first = true;
						class ErrorStorage extends FileSystemStorage {
							createReadableStream(
								si: StorageInfo<FileData>,
								range: StreamRange | undefined,
								autoclose: boolean,
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
									},
								});
							}
						}
						const storage = new ErrorStorage(__dirname);

						app.sendStorage(storage, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should handle read errors to a multiple range request on second stream', async () => {
						try {
							await request(app.server)
								.get('/')
								.set('Range', 'bytes=0-0,2-2')
								.parse(multipartHandler);
							assert.fail();
						} catch {
							await new Promise(resolve => {
								resolve(undefined);
							});
						}
					});
				});

				describe('should handle close error', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						class ErrorStorage extends FileSystemStorage {
							// eslint-disable-next-line @typescript-eslint/require-await,class-methods-use-this
							async close() {
								throw new Error('oops');
							}
						}
						const storage = new ErrorStorage(__dirname);

						app.sendStorage(storage, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should handle close error', async () => {
						await request(app.server)
							.get('/')
							.set('Range', 'bytes=0-0,2-2')
							.parse(multipartHandler)
							.expect(206);
					});
				});

				describe('should handle close error after read error', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);

						class ErrorStorage extends FileSystemStorage {
							// eslint-disable-next-line class-methods-use-this
							createReadableStream() {
								return new Readable({
									read() {
										process.nextTick(() => {
											this.destroy(new Error('ooops'));
										});
									},
								});
							}

							// eslint-disable-next-line @typescript-eslint/require-await,class-methods-use-this
							async close() {
								throw new Error('oops');
							}
						}
						const storage = new ErrorStorage(__dirname);

						app.sendStorage(storage, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should handle close error after read error', async () => {
						try {
							await request(app.server)
								.get('/')
								.set('Range', 'bytes=0-0,2-2')
								.parse(multipartHandler);
							assert.fail();
						} catch {
							await new Promise(resolve => {
								resolve(undefined);
							});
						}
					});
				});

				describe('should handle unknown streams', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);
						class UnknownStorage extends FileSystemStorage {
							async open(path: FilePath, requestHeaders: StorageRequestHeaders) {
								const res = await super.open(path, requestHeaders);
								res.size = undefined;
								res.fileName = undefined;
								res.mtimeMs = undefined;
								return res;
							}
						}
						const storage = new UnknownStorage(__dirname);

						app.sendStorage(storage, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should handle unknown streams', async () => {
						await request(app.server)
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
							.expect(200);
					});
				});
				describe('should handle custom streams', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);
						class CustomStorage extends Storage<undefined, undefined> {
							// eslint-disable-next-line @typescript-eslint/require-await,class-methods-use-this
							async open() {
								return {
									attachedData: undefined,
								};
							}

							// eslint-disable-next-line class-methods-use-this
							createReadableStream() {
								return new BufferStream(Buffer.from('hello world'));
							}

							// eslint-disable-next-line class-methods-use-this
							async close() {
								// noop
							}
						}
						const storage = new CustomStorage();

						app.sendStorage(storage, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should handle custom streams', async () => {
						await request(app.server)
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
							.expect(200);
					});
				});

				describe('should handle custom streams open errors as 404', () => {
					let app: ServerWrapper;
					before(async () => {
						app = frameworkServer(context);
						class CustomStorage extends Storage<undefined, undefined> {
							// eslint-disable-next-line @typescript-eslint/require-await,class-methods-use-this
							async open():
							Promise<StorageInfo<undefined>> {
								throw new Error('oops');
							}

							// eslint-disable-next-line class-methods-use-this
							createReadableStream() {
								return new BufferStream(Buffer.from('hello world'));
							}

							// eslint-disable-next-line class-methods-use-this
							async close() {
								// noop
							}
						}
						const storage = new CustomStorage();

						app.sendStorage(storage, '/fixtures-frameworks/hello.txt');

						await app.listen();
					});
					after(async () => {
						await app.close();
					});
					it('should handle custom streams open errors as 404', async () => {
						await request(app.server)
							.get('/')
							.expect('X-Send-Stream-Error', 'StorageError')
							.expect(404);
					});
				});
			});

			describe('when fsModule option used', () => {
				let app: ServerWrapper;
				before(async () => {
					app = frameworkServer(context);
					await memfs.fs.promises.writeFile('/foo.txt', 'bar');

					app.send('/', '/foo.txt', { fsModule: <typeof fs> <unknown> memfs.fs });

					await app.listen();
				});
				after(async () => {
					await app.close();
				});
				it('should handle memfs as fsModule option', async () => {
					await request(app.server)
						.get('/')
						.expect(200, 'bar');
				});
			});

			describe('when fsModule option used with onDirectory = list-files', () => {
				let app: ServerWrapper;
				before(async () => {
					app = frameworkServer(context);
					await memfs.fs.promises.writeFile('/foo.txt', 'bar');

					app.send('/', '/', { fsModule: <typeof fs> <unknown> memfs.fs, onDirectory: 'list-files' });

					await app.listen();
				});
				after(async () => {
					await app.close();
				});
				it('should handle memfs as fsModule option with directory = listing', async () => {
					await request(app.server)
						.get('/')
						.expect('Content-Type', 'text/html; charset=UTF-8')
						// eslint-disable-next-line max-len
						.expect(200, '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>/</title><meta name="viewport" content="width=device-width"><meta name="description" content="Content of / directory"></head><body><h1>Directory: /</h1><ul><li><a href="./foo.txt">foo.txt</a></li></ul></body></html>');
				});
			});

			describe('when path array is used', () => {
				let app: ServerWrapper;
				before(async () => {
					app = frameworkServer(context);

					app.send(__dirname, ['', 'fixtures-frameworks', 'hello.txt']);

					await app.listen();
				});
				after(async () => {
					await app.close();
				});
				it('should handle path array', async () => {
					await request(app.server)
						.get('/')
						.expect(200, 'world');
				});
			});
		});
	});
}
