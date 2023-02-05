/**
 * This example shows how to implement a storage using MongoDB/GridFS as a datasource
 *
 * See ./mongodb-gridfs-util.ts to have an example of file/directory upload to MongoDB/GridFS
 */

import type { Readable } from 'stream';
import { posix } from 'path';
// eslint-disable-next-line node/prefer-global/url
import { URL } from 'url';

import { fastify } from 'fastify';
import * as mongodb from 'mongodb';

import type { StorageOptions, StorageInfo, StreamRange } from '../src/send-stream';
import { Storage, StorageError } from '../src/send-stream';

const uri = 'mongodb://localhost:27017';
const dbName = 'test';

interface FileWithMetadata {
	metadata?: {
		mtimeMs?: number;
		mimeType?: string;
		mimeTypeCharset?: string;
		etag?: string;
		lastModified?: string;
	};
}

type File = mongodb.GridFSFile & FileWithMetadata;

class GridFSStorage extends Storage<string, File> {
	constructor(readonly bucket: mongodb.GridFSBucket, readonly opts?: StorageOptions) {
		super(opts);
	}

	async open(path: string) {
		const filename = posix.relative('/', decodeURIComponent(new URL(`http://localhost${ path }`).pathname));
		const files = await (<mongodb.FindCursor<File>> this.bucket.find({ filename }, { limit: 1 })).toArray();
		if (files.length === 0) {
			throw new StorageError(`filename ${ filename } not found`, path);
		}
		const [file] = files;
		return {
			attachedData: file,
			fileName: file.filename,
			mtimeMs: file.metadata?.mtimeMs ?? file.uploadDate.getTime(),
			size: file.length,
			mimeType: file.metadata?.mimeType,
			mimeTypeCharset: file.metadata?.mimeTypeCharset,
			lastModified: file.metadata?.lastModified,
			etag: file.metadata?.etag,
		};
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

	async close() {
		// noop
	}
}

const client = new mongodb.MongoClient(uri);

const app = fastify({ exposeHeadRoutes: true });

client.connect()
	.then(async () => {
		const db = client.db(dbName);

		const bucket = new mongodb.GridFSBucket(db);

		const storage = new GridFSStorage(bucket);

		app.get('*', async (request, reply) => {
			const result = await storage.prepareResponse(request.url, request.raw);
			if (result.statusCode === 404) {
				reply.callNotFound();
				return;
			}
			await result.send(reply.raw);
		});

		await app.listen(3000);
		console.info('listening on http://localhost:3000');
	})
	.catch(err => {
		console.error(err);
	});

