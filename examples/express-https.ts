
// tslint:disable-next-line:no-implicit-dependencies
import express from 'express';
import * as https from 'https';
import * as fs from 'fs';
import { join } from 'path';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const app = express();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.get('*', async (req, res, next) => {
	try {
		let result = await storage.prepareResponse(req.url, req);
		if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
			result.stream.destroy();
			result = await storage.prepareResponse([...result.error.pathParts.slice(0, -1), 'index.html'], req);
		}
		result.send(res);
	} catch (err) {
		next(err);
	}
});

const server = https.createServer(
	{
		key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
		cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	},
	app
);

server.listen(3000, () => {
	console.info('listening on https://localhost:3000');
});
