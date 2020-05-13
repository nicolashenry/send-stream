
import * as http from 'http';
import { join } from 'path';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const storage = new FileSystemStorage(join(__dirname, 'assets'));

const app = http.createServer((req, res) => {
	(async () => {
		if (!req.url) {
			throw new Error('url not set');
		}
		let result = await storage.prepareResponse(req.url, req);
		if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
			result.stream.destroy();
			result = await storage.prepareResponse([...result.error.pathParts.slice(0, -1), 'index.html'], req);
		}
		result.send(res);
	})().catch(err => {
		console.error(err);
		if (!res.headersSent) {
			const message = 'Internal Server Error';
			res.writeHead(500, {
				'Content-Type': 'text/plain; charset=UTF-8',
				'Content-Length': String(Buffer.byteLength(message)),
			});
			res.end(message);
			return;
		}
		res.destroy(err instanceof Error ? err : new Error(String(err)));
	});
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
