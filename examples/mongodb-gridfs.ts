
import { Readable } from 'stream';
import { relative } from 'path';
import * as assert from 'assert';

import express from 'express';
import * as mongodb from 'mongodb';

import { Storage, StorageOptions, StorageInfo, StorageError, StreamRange } from '../src/send-stream';

const uri = 'mongodb://localhost:27017';
const dbName = 'test';

interface File {
	_id: mongodb.ObjectID;
	length: number;
	chunkSize: number;
	uploadDate: Date;
	filename: string;
	metadata?: {
		contentType?: string;
		etag?: string;
	};
}

class GridFSStorage extends Storage<string, File> {
	constructor(readonly bucket: mongodb.GridFSBucket, readonly opts?: StorageOptions) {
		super(opts);
	}

	async open(path: string) {
		const filename = relative('/', decodeURIComponent(new URL(`http://localhost${ path }`).pathname));
		const files = await (<mongodb.Cursor<File>> this.bucket.find({ filename }, { limit: 1 })).toArray();
		if (files.length === 0) {
			throw new StorageError(`filename ${ filename } not found`, path);
		}
		const [file] = files;
		return {
			attachedData: file,
			fileName: file.filename,
			mtimeMs: file.uploadDate.getTime(),
			size: file.length,
		};
	}

	createContentType(storageInfo: StorageInfo<File>) {
		if (storageInfo.attachedData.metadata && storageInfo.attachedData.metadata.contentType !== undefined) {
			return storageInfo.attachedData.metadata.contentType;
		}
		return super.createContentType(storageInfo);
	}

	createEtag(storageInfo: StorageInfo<File>) {
		if (storageInfo.attachedData.metadata && storageInfo.attachedData.metadata.etag !== undefined) {
			return storageInfo.attachedData.metadata.etag;
		}
		return super.createEtag(storageInfo);
	}

	createReadableStream(storageInfo: StorageInfo<File>, range: StreamRange | undefined, autoClose: boolean): Readable {
		const result = this.bucket.openDownloadStream(
			// eslint-disable-next-line no-underscore-dangle
			storageInfo.attachedData._id,
			range ? { start: range.start, end: range.end + 1 } : undefined,
		);
		if (autoClose) {
			const onClose = () => {
				result.off('end', onClose);
				result.off('error', onClose);
				result.destroy();
			};
			result.on('end', onClose);
			result.on('error', onClose);
		}
		return result;
	}

	// eslint-disable-next-line class-methods-use-this
	async close() {
		// noop
	}
}

const client = new mongodb.MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

const app = express();

client.connect(error => {
	assert.ifError(error);

	const db = client.db(dbName);

	const bucket = new mongodb.GridFSBucket(db);

	const storage = new GridFSStorage(bucket);

	app.get('*', async (req, res, next) => {
		try {
			(await storage.prepareResponse(req.url, req)).send(res);
		} catch (err) {
			// eslint-disable-next-line node/callback-return
			next(err);
		}
	});

	app.listen(3000, () => {
		console.info('listening on http://localhost:3000');
	});
});
