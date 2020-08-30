
import { join } from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { promisify } from 'util';

import express from 'express';

import {
	FileSystemStorage,
	FileData,
	StorageInfo,
	FileSystemStorageOptions,
} from '../src/send-stream';

const readdir = promisify(fs.readdir);

const app = express();

class EtagHashCacheStorage extends FileSystemStorage {
	etagCache = new Map<string, string>();

	constructor(
		root: string,
		opts: FileSystemStorageOptions = { },
	) {
		super(root, opts);
		this.addAllFilesInEtagCache(root)
			.then(() => {
				console.info('all files have their hash etag cached');
			})
			.catch(error => {
				console.error(error);
			});
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

	async addFileInEtagCache(filePath: string, stats: fs.Stats, fd: number) {
		const stream = fs.createReadStream(
			filePath,
			{ start: 0, end: stats.size - 1, fd },
		);
		const hash = crypto.createHash('sha1');
		hash.setEncoding('hex');
		stream.pipe(hash);
		return new Promise<string>((resolve, reject) => {
			stream.on('end', () => {
				hash.end();
				const newEtag = `"${ <string> hash.read() }"`;
				this.etagCache.set(filePath, newEtag);
				resolve(newEtag);
			});
			stream.on('error', err => {
				reject(err);
			});
		});
	}

	createEtag(storageInfo: StorageInfo<FileData>) {
		const cached = this.etagCache.get(storageInfo.attachedData.resolvedPath);
		// recalculate hash if file seems to have been modified
		if (cached) {
			return cached;
		}
		return super.createEtag(storageInfo);
	}
}

const storage = new EtagHashCacheStorage(join(__dirname, 'assets'));

app.get('*', async (req, res, next) => {
	try {
		const result = await storage.prepareResponse(req.url, req);
		result.send(res);
	} catch (err: unknown) {
		// eslint-disable-next-line node/callback-return
		next(err);
	}
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
