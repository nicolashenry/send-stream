/**
 * This file is an example of file/directory upload to MongoDB/GridFS to use with ./mongodb-gridfs.ts example
 */

import * as assert from 'assert';
import * as crypto from 'crypto';
import fs from 'fs';
import { join, relative, sep } from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';

import { charset, contentType } from 'mime-types';
import * as mongodb from 'mongodb';

const promisifiedStreamPipeline = promisify(pipeline);

async function uploadToGridFS(rootPath: string, directoryPath: string, bucket: mongodb.GridFSBucket) {
	const directoryFiles = await fs.promises.readdir(directoryPath, { withFileTypes: true });
	await Promise.all(directoryFiles.map(async file => {
		const filepath = join(directoryPath, file.name);
		const stat = await fs.promises.stat(filepath);
		if (stat.isDirectory()) {
			await uploadToGridFS(rootPath, filepath, bucket);
			return;
		}
		if (!stat.isFile()) {
			return;
		}
		const mimeType = contentType(file.name);
		const mimeTypeCharset = mimeType ? charset(mimeType) : undefined;
		const hashCopy = fs.createReadStream(filepath);
		const hash = crypto.createHash('sha1');
		hash.setEncoding('hex');
		await promisifiedStreamPipeline(
			hashCopy,
			hash,
		);
		const etag = `"${ <string> hash.read() }"`;
		const uploadCopy = fs.createReadStream(filepath);
		await promisifiedStreamPipeline(
			uploadCopy,
			<NodeJS.WritableStream> <unknown> bucket.openUploadStream(
				relative(rootPath, filepath)
					.split(sep)
					.join('/'),
				{
					metadata: {
						mimeType,
						mimeTypeCharset,
						mtimeMs: stat.mtimeMs,
						lastModified: new Date(stat.mtimeMs).toUTCString(),
						etag,
					},
				},
			),
		);
	}));
}

const uri = 'mongodb://localhost:27017';
const dbName = 'test';

const client = new mongodb.MongoClient(uri);

client.connect(error => {
	assert.ifError(error);

	const db = client.db(dbName);

	const bucket = new mongodb.GridFSBucket(db);

	const directory = join(__dirname, 'assets');

	uploadToGridFS(directory, directory, bucket)
		.then(async () => {
			console.info('files have been uploaded');
			await client.close();
		})
		.catch(err => {
			console.error('error:', err);
		});
});
