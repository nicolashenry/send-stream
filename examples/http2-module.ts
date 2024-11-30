/**
 * This example shows how to use this library with vanilla NodeJS http2 module
 */

import { readFileSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import { join } from 'node:path';

import { FileSystemStorage } from '../src/send-stream';

const storage = new FileSystemStorage(join(__dirname, 'assets'));

const app = createSecureServer({
	// eslint-disable-next-line n/no-sync
	key: readFileSync(join(__dirname, 'cert', 'localhost.key')),
	// eslint-disable-next-line n/no-sync
	cert: readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	allowHTTP1: true,
});

app.on('error', err => {
	console.error(err);
});

app.on('stream', (stream, headers) => {
	(async () => {
		if (headers[':path'] === undefined) {
			throw new Error('path not set');
		}
		const result = await storage.prepareResponse(headers[':path'], headers);
		await result.send(stream);
	})().catch((err: unknown) => {
		console.error(err);
		if (stream.headersSent) {
			stream.destroy(err instanceof Error ? err : new Error(String(err)));
			return;
		}
		const message = 'Internal Server Error';
		stream.respond({
			// eslint-disable-next-line @typescript-eslint/naming-convention
			':status': 500,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'Content-Type': 'text/plain; charset=UTF-8',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'Content-Length': String(Buffer.byteLength(message)),
		});
		stream.end(message);
	});
});

app.listen(3001, () => {
	console.info('listening on https://localhost:3001');
});
