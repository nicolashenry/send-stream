
import http from 'http';
import { join } from 'path';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const storage = new FileSystemStorage(join(__dirname, 'assets'));

const app = http.createServer(async (req, res) => {
	try {
		if (!req.url) {
			throw new Error('url not set');
		}
		let result = await storage.prepareResponse(req.url, req);
		if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
			result.stream.destroy();
			result = await storage.prepareResponse([...result.error.pathParts.slice(0, -1), 'index.html'], req);
		}
		result.send(res);
	} catch (err) {
		console.error(err);
		if (!res.headersSent) {
			res.statusCode = 500;
			res.end('Internal Server Error');
		}
	}
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
