
import fs from 'fs';
import https from 'https';
import { join } from 'path';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const storage = new FileSystemStorage(join(__dirname, 'assets'));

const options = {
	key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
	cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
};

const app = https.createServer(options, async (req, res) => {
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
	console.info('listening on https://localhost:3000');
});
