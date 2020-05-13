
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
	FileSystemStorageError,
} from '../lib';

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
		const files = await promisify(fs.readdir)(dir);
		await Promise.all(files.map(async file => {
			const filePath = join(dir, file);
			const fileStats = await promisify(fs.stat)(filePath);
			if (fileStats.isDirectory()) {
				await this.addAllFilesInEtagCache(filePath);
			} else {
				await this.addFileInEtagCache(filePath, fileStats);
			}
		}));
	}

	async addFileInEtagCache(filePath: string, stats: fs.Stats, fd?: number) {
		const stream = fs.createReadStream(
			filePath,
			{ start: 0, end: stats.size - 1, fd, autoClose: fd === undefined },
		);
		const hash = crypto.createHash('sha1');
		hash.setEncoding('hex');
		stream.pipe(hash);
		return new Promise<string>((resolve, reject) => {
			stream.on('end', () => {
				hash.end();
				const newEtag = `"${ <string> hash.read() }"`;
				console.info('hash etag calculated', filePath, newEtag);
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
		let result = await storage.prepareResponse(req.url, req);
		if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
			result.stream.destroy();
			result = await storage.prepareResponse([...result.error.pathParts.slice(0, -1), 'index.html'], req);
		}
		result.send(res);
	} catch (err) {
		// eslint-disable-next-line node/callback-return
		next(err);
	}
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
