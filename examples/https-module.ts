/**
 * This example shows how to use this library with vanilla NodeJS https module
 */

// eslint-disable-next-line n/no-sync
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { join } from 'node:path';

import { FileSystemStorage } from '../src/send-stream';

const storage = new FileSystemStorage(join(__dirname, 'assets'));

const options = {
	// eslint-disable-next-line n/no-sync
	key: readFileSync(join(__dirname, 'cert', 'localhost.key')),
	// eslint-disable-next-line n/no-sync
	cert: readFileSync(join(__dirname, 'cert', 'localhost.crt')),
};

const app = createServer(options, (req, res) => {
	(async () => {
		if (req.url === undefined) {
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

app.listen(3001, () => {
	console.info('listening on https://localhost:3001');
});
