/**
 * This example shows how to implement a storage putting everything into memory (and calculating SHA1 etags)
 */

import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import { fstat, close, createReadStream, readdir, constants, open as openFn, opendir as opendirFn } from 'node:fs';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';

import { fastify } from 'fastify';

import type { GenericFileData, GenericFileSystemStorageOptions, StorageInfo } from '../src/send-stream';
import { GenericFileSystemStorage } from '../src/send-stream';

const open = promisify(openFn);
const opendir = promisify(opendirFn);

const app = fastify({ exposeHeadRoutes: true });

interface CachedFile {
	etag: string;
	stats: Stats;
	chunks: Buffer[];
	size: number;
}

type CachedFileDescriptor = number | CachedFile;

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

class FullCacheStorage extends GenericFileSystemStorage<CachedFileDescriptor> {
	cache = new Map<string, CachedFile>();
	cached: Promise<void>;

	constructor(
		root: string,
		opts: Optional<GenericFileSystemStorageOptions<CachedFileDescriptor>, 'fsModule'> = {},
	) {
		super(
			root,
			{
				fsModule: {

					constants,
					open: (
						path: string,
						_flags: number,
						// eslint-disable-next-line sonarjs/no-reference-error
						callback: (err: NodeJS.ErrnoException | null, fd: CachedFileDescriptor) => void,
					) => {
						const cached = this.cache.get(path);
						if (cached) {
							callback(null, cached);
							return;
						}
						this.addFileInCache(path)
							.then(cache => {
								callback(null, cache);
							})
							.catch((err: unknown) => {
								callback(err instanceof Error ? err : new Error(String(err)), Number.NaN);
							});
					},
					fstat: (
						fd: CachedFileDescriptor,
						callback: (err: NodeJS.ErrnoException | null, stats: Stats) => void,
					) => {
						if (typeof fd === 'number') {
							fstat(fd, callback);
							return;
						}
						callback(null, fd.stats);
					},
					close: (fd: CachedFileDescriptor, callback: (err: NodeJS.ErrnoException | null) => void) => {
						if (typeof fd === 'number') {
							close(fd, callback);
							return;
						}
						callback(null);
					},
					createReadStream: (
						path: string,
						{ fd, start, end, autoClose }: {
							fd?: CachedFileDescriptor;
							start?: number;
							end?: number;
							autoClose: boolean;
						},
					) => {
						if (!fd) {
							return start !== undefined && end !== undefined
								? createReadStream(path, { start, end, autoClose })
								: createReadStream(path, { autoClose });
						}
						if (typeof fd === 'number') {
							return start !== undefined && end !== undefined
								? createReadStream(path, { fd, start, end, autoClose })
								: createReadStream(path, { fd, autoClose });
						}
						const rangeStart = start ?? 0;
						const rangeEnd = end ?? fd.size - 1;
						const readable = new Readable();
						let currentStart = 0;
						for (const chunk of fd.chunks) {
							const { byteLength } = chunk;
							const currentEnd = currentStart + byteLength - 1;
							if (rangeEnd >= currentStart && rangeStart <= currentEnd) {
								const chunkStart = Math.max(rangeStart - currentStart, 0);
								const chunkEnd = Math.min(
									byteLength - Math.min(currentEnd - rangeEnd, byteLength),
									byteLength,
								);
								if (chunkStart === 0 && chunkEnd === byteLength) {
									readable.push(chunk);
								} else {
									const newChunk = chunk.subarray(
										chunkStart,
										chunkEnd,
									);
									readable.push(newChunk);
								}
							}
							currentStart = currentEnd + 1;
						}
						readable.push(null);
						return readable;
					},
					readdir,
				},
				...opts,
			},
		);
		this.cached = this.addAllFilesInCache(root)
			.catch((err: unknown) => {
				console.error(err);
			});
	}

	async addAllFilesInCache(dir: string) {
		const files = await opendir(dir);
		for await (const file of files) {
			const filePath = join(dir, file.name);
			await (file.isDirectory() ? this.addAllFilesInCache(filePath) : this.addFileInCache(filePath));
		}
	}

	async addFileInCache(filePath: string) {
		const fd = await open(filePath, this.fsConstants.O_RDONLY);
		const stats = await this.fsFstat(fd);
		return new Promise<CachedFile>((resolve, reject) => {
			const stream = this.fsCreateReadStream(
				filePath,
				{ start: 0, end: stats.size - 1, fd, autoClose: true },
			);
			const chunks: Buffer[] = [];
			// eslint-disable-next-line sonarjs/hashing
			const hash = createHash('sha1');
			hash.setEncoding('hex');
			stream.on('data', chunk => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				chunks.push(<Buffer> chunk);
				hash.write(chunk);
			});
			stream.on('error', reject);
			stream.on('end', () => {
				hash.end();
				const etagStr = <unknown> hash.read();
				if (typeof etagStr !== 'string') {
					reject(new Error('hash calculation failed'));
					return;
				}
				const etag = `"${ etagStr }"`;
				const cache = { etag, stats, chunks, size: chunks.reduce((p, c) => p + c.byteLength, 0) };
				this.cache.set(
					filePath,
					cache,
				);
				resolve(cache);
			});
		});
	}

	override createEtag(storageInfo: StorageInfo<GenericFileData<CachedFileDescriptor>>) {
		const { attachedData: { fd } } = storageInfo;
		if (typeof fd === 'number') {
			return super.createEtag(storageInfo);
		}
		return fd.etag;
	}
}

const storage = new FullCacheStorage(join(__dirname, 'assets'));

app.get('*', async (request, reply) => {
	const result = await storage.prepareResponse(request.url, request.raw);
	if (result.statusCode === 404) {
		reply.callNotFound();
		return;
	}
	await result.send(reply.raw);
});

storage.cached
	.then(async () => {
		console.info('all files are cached');
		return app.listen({ port: 3000 })
			.then(() => {
				console.info('listening on http://localhost:3000');
			});
	})
	.catch((err: unknown) => {
		console.error(err);
	});
