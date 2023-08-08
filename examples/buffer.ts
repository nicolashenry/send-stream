/**
 * This example shows how to implement a storage returning NodeJS Buffer
 */

import { Readable } from 'stream';

import { fastify } from 'fastify';

import type { StorageInfo, StreamRange } from '../src/send-stream';
import { Storage } from '../src/send-stream';

const app = fastify({ exposeHeadRoutes: true });

class BufferStorage extends Storage<StorageInfo<Buffer>, Buffer> {
	// eslint-disable-next-line @typescript-eslint/require-await
	async open(data: StorageInfo<Buffer>) {
		return {
			...data,
			size: data.attachedData.byteLength,
		};
	}

	createReadableStream(
		storageInfo: StorageInfo<Buffer>,
		range: StreamRange | undefined,
		autoClose: boolean,
	) {
		const buffer = range
			? storageInfo.attachedData.subarray(range.start, range.end + 1)
			: storageInfo.attachedData;
		return new Readable({
			autoDestroy: autoClose,
			read() {
				this.push(buffer);
				this.push(null);
			},
		});
	}

	async close() {
		// noop
	}
}

const storage = new BufferStorage();

const buf = Buffer.from('data i want to serve', 'utf8');
const mtimeMs = Date.now();

app.get('*', async (request, reply) => {
	await storage.send(
		{
			attachedData: buf,
			mtimeMs,
			mimeType: 'text/plain',
			mimeTypeCharset: 'UTF-8',
		},
		request.raw,
		reply.raw,
	);
});

app.listen(3000)
	.then(() => {
		console.info('listening on http://localhost:3000');
	})
	.catch(err => {
		console.error(err);
	});
