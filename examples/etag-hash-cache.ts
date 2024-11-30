/**
 * This example shows how to extend FileSystemStorage to add SHA1 ETag cache
 */

import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import { readdir as syncReaddir, createReadStream } from 'node:fs';
import { promisify } from 'node:util';

import { fastify } from 'fastify';

import { FileSystemStorage } from '../src/send-stream';
import type {
	FileData,
	StorageInfo,
	FileSystemStorageOptions,
} from '../src/send-stream';

const readdir = promisify(syncReaddir);

const app = fastify({ exposeHeadRoutes: true });

class EtagHashCacheStorage extends FileSystemStorage {
	etagCache = new Map<string, string>();
	etagsCached: Promise<void>;

	constructor(
		root: string,
		opts: FileSystemStorageOptions = {},
	) {
		super(root, opts);
		this.etagsCached = this.addAllFilesInEtagCache(root);
	}

	async addAllFilesInEtagCache(dir: string) {
		const files = await readdir(dir);
		await Promise.all(files.map(async file => {
			const filePath = join(dir, file);
			const fd = await this.fsOpen(filePath, this.fsConstants.O_RDONLY);
			const fileStats = await this.fsFstat(fd);
			if (fileStats.isDirectory()) {
				await this.addAllFilesInEtagCache(filePath);
			} else {
				const etag = await this.addFileInEtagCache(filePath, fileStats, fd);
				console.info('hash etag calculated', filePath, etag);
			}
		}));
	}

	async addFileInEtagCache(filePath: string, stats: Stats, fd: number) {
		const stream = createReadStream(
			filePath,
			{ start: 0, end: stats.size - 1, fd },
		);
		// eslint-disable-next-line sonarjs/hashing
		const hash = createHash('sha1');
		hash.setEncoding('hex');
		stream.pipe(hash);
		return new Promise<string>((resolve, reject) => {
			stream.on('end', () => {
				hash.end();
				const etagStr = <unknown> hash.read();
				if (typeof etagStr !== 'string') {
					reject(new Error('hash calculation failed'));
					return;
				}
				const etag = `"${ etagStr }"`;
				this.etagCache.set(filePath, etag);
				resolve(etag);
			});
			stream.on('error', err => {
				reject(err);
			});
		});
	}

	override createEtag(storageInfo: StorageInfo<FileData>) {
		const cached = this.etagCache.get(storageInfo.attachedData.resolvedPath);
		// recalculate hash if file seems to have been modified
		if (cached) {
			return cached;
		}
		return super.createEtag(storageInfo);
	}
}

const storage = new EtagHashCacheStorage(join(__dirname, 'assets'));

app.get('*', async (request, reply) => {
	const result = await storage.prepareResponse(request.url, request.raw);
	if (result.statusCode === 404) {
		reply.callNotFound();
		return;
	}
	await result.send(reply.raw);
});

storage.etagsCached
	.then(async () => {
		console.info('all files have their hash etag cached');
		return app.listen({ port: 3000 })
			.then(() => {
				console.info('listening on http://localhost:3000');
			});
	})
	.catch((err: unknown) => {
		console.error(err);
	});
