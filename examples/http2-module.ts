
import * as fs from 'fs';
import * as http2 from 'http2';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { FileSystemStorage } from '../src/send-stream.js';

const storage = new FileSystemStorage(join(dirname(fileURLToPath(import.meta.url)), 'assets'));

const app = http2.createSecureServer({
	// eslint-disable-next-line node/no-sync
	key: fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cert', 'localhost.key')),
	// eslint-disable-next-line node/no-sync
	cert: fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cert', 'localhost.crt')),
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
