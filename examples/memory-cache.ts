
import { join } from 'path';
import * as crypto from 'crypto';
import type { Stats } from 'fs';
import { fstat, close, createReadStream, readdir, constants, open as openFn, opendir as opendirFn } from 'fs';
import { promisify } from 'util';
import { Readable } from 'stream';

import { fastify } from 'fastify';

import type { GenericFileData, GenericFileSystemStorageOptions, StorageInfo } from '../src/send-stream';
import { GenericFileSystemStorage } from '../src/send-stream';

const open = promisify(openFn);
const opendir = promisify(opendirFn);

const app = fastify();

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
						flags: number,
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
							.catch((err: Error) => {
								callback(err, Number.NaN);
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
						if (!fd || typeof fd === 'number') {
							return createReadStream(path, { fd, start, end, autoClose });
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
		this.cached = this.addAllFilesInCache(root);
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
			const hash = crypto.createHash('sha1');
			hash.setEncoding('hex');
			stream.on('data', chunk => {
				chunks.push(<Buffer> chunk);
				hash.write(chunk);
			});
			stream.on('error', reject);
			stream.on('end', () => {
				hash.end();
				const newEtag = `"${ <string> hash.read() }"`;
				const cache = { etag: newEtag, stats, chunks, size: chunks.reduce((p, c) => p + c.byteLength, 0) };
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

app.route({
	method: ['HEAD', 'GET'],
	url: '*',
	handler: async (request, reply) => {
		const result = await storage.prepareResponse(request.url, request.raw);
		if (result.statusCode === 404) {
			reply.callNotFound();
			return;
		}
		await result.send(reply.raw);
	},
});

storage.cached
	.then(async () => {
		console.info('all files are cached');
		return app.listen(3000)
			.then(() => {
				console.info('listening on http://localhost:3000');
			});
	})
	.catch(err => {
		console.error(err);
	});
