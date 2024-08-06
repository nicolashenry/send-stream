/**
 * This example shows how to implement a storage returning JSON
 */

import { Readable } from 'node:stream';

import { fastify } from 'fastify';

import type { StorageInfo, StreamRange } from '../src/send-stream';
import { Storage } from '../src/send-stream';

const app = fastify({ exposeHeadRoutes: true });

class JSONStorage extends Storage<StorageInfo<unknown>, Buffer> {
	// eslint-disable-next-line @typescript-eslint/require-await
	async open(data: StorageInfo<unknown>) {
		const buffer = Buffer.from(JSON.stringify(data.attachedData), 'utf8');
		return {
			...data,
			attachedData: buffer,
			size: buffer.byteLength,
			mimeType: 'application/json',
			mimeTypeCharset: 'UTF-8',
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

const storage = new JSONStorage({ dynamicCompression: true });

app.get('*', async (request, reply) => {
	await storage.send(
		{
			attachedData: { mydata: 'mydata' },
			mtimeMs: Date.now(),
		},
		request.raw,
		reply.raw,
	);
});

app.listen(3000)
	.then(() => {
		console.info('listening on http://localhost:3000');
	})
	.catch((err: unknown) => {
		console.error(err);
	});
