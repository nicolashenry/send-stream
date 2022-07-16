/**
 * This example shows how to use this library with vanilla NodeJS http2 module
 */

import * as fs from 'fs';
import * as http2 from 'http2';
import { join } from 'path';

import { FileSystemStorage } from '../src/send-stream';

const storage = new FileSystemStorage(join(__dirname, 'assets'));

const app = http2.createSecureServer({
	// eslint-disable-next-line node/no-sync
	key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
	// eslint-disable-next-line node/no-sync
	cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
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
	})().catch(err => {
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
