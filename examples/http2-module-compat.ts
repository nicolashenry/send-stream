/**
 * This example shows how to use this library with vanilla NodeJS http2 module (compat API)
 */

import * as fs from 'fs';
import * as http2 from 'http2';
import { join } from 'path';

import { FileSystemStorage } from '../src/send-stream';

const storage = new FileSystemStorage(join(__dirname, 'assets'));

const options = {
	// eslint-disable-next-line node/no-sync
	key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
	// eslint-disable-next-line node/no-sync
	cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	allowHTTP1: true,
};

const app = http2.createSecureServer(options, (req, res) => {
	(async () => {
		const result = await storage.prepareResponse(req.url, req);
		await result.send(res);
	})().catch(err => {
		console.error(err);
		if (res.headersSent) {
			res.stream.destroy(err instanceof Error ? err : new Error(String(err)));
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
