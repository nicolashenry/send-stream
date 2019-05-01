
import fs from 'fs';
import http2 from 'http2';
import { join } from 'path';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const storage = new FileSystemStorage(join(__dirname, 'assets'));

const app = http2.createSecureServer({
	key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
	cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	allowHTTP1: true
});

app.on('error', err => {
	console.error(err);
});

app.on('stream', async (stream, headers) => {
	try {
		if (!headers[':path']) {
			throw new Error('path not set');
		}
		let result = await storage.prepareResponse(headers[':path'], headers);
		if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
			result.stream.destroy();
			result = await storage.prepareResponse([...result.error.pathParts.slice(0, -1), 'index.html'], headers);
		}
		result.send(stream);
	} catch (err) {
		console.error(err);
		if (!stream.headersSent) {
			stream.respond({
				':status': 500
			});
			stream.end('Internal Server Error');
		}
	}
});

app.listen(3000, () => {
	console.info('listening on https://localhost:3000');
});
