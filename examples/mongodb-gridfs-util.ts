/**
 * This file is an example of file/directory upload to MongoDB/GridFS to use with ./mongodb-gridfs.ts example
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';

import { charset, contentType } from 'mime-types';
import { MongoClient, GridFSBucket } from 'mongodb';

const promisifiedStreamPipeline = promisify(pipeline);

async function uploadToGridFS(rootPath: string, directoryPath: string, bucket: GridFSBucket) {
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
		// eslint-disable-next-line sonarjs/hashing
		const hash = createHash('sha1');
		hash.setEncoding('hex');
		await promisifiedStreamPipeline(
			hashCopy,
			hash,
		);
		const etag = `"${ <string> hash.read() }"`;
		const uploadCopy = fs.createReadStream(filepath);
		await promisifiedStreamPipeline(
			uploadCopy,
			// eslint-disable-next-line sonarjs/no-reference-error
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

const client = new MongoClient(uri);

client.connect()
	.then(async () => {
		const db = client.db(dbName);

		const bucket = new GridFSBucket(db);

		const directory = join(__dirname, 'assets');

		await uploadToGridFS(directory, directory, bucket);
		console.info('files have been uploaded');
		await client.close();
	})
	.catch((err: unknown) => {
		console.error('error:', err);
	});
