/**
 * This example shows how to use this library with vanilla NodeJS http module
 */

import { createServer } from 'node:http';
import { join } from 'node:path';

import { FileSystemStorage } from '../src/send-stream';

const storage = new FileSystemStorage(join(__dirname, 'assets'));

const app = createServer((req, res) => {
	(async () => {
		if (!req.url) {
			throw new Error('url not set');
		}
		const result = await storage.prepareResponse(req.url, req);
		await result.send(res);
	})().catch((err: unknown) => {
		console.error(err);
		if (res.headersSent) {
			res.destroy(err instanceof Error ? err : new Error(String(err)));
			return;
		}
		const message = 'Internal Server Error';
		res.writeHead(500, {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'Content-Type': 'text/plain; charset=UTF-8',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'Content-Length': String(Buffer.byteLength(message)),
		});
		res.end(message);
	});
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
