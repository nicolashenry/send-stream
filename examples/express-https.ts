
import * as https from 'https';
import * as fs from 'fs';
import { join } from 'path';

import express from 'express';

import { FileSystemStorage } from '../src/send-stream';

const app = express();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.get('*', async (req, res, next) => {
	try {
		const result = await storage.prepareResponse(req.url, req);
		if (result.statusCode === 404) {
			next();
			return;
		}
		await result.send(res);
	} catch (err: unknown) {
		// eslint-disable-next-line node/callback-return
		next(err);
	}
});

const server = https.createServer(
	{
		// eslint-disable-next-line node/no-sync
		key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
		// eslint-disable-next-line node/no-sync
		cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	},
	app,
);

server.listen(3001, () => {
	console.info('listening on https://localhost:3001');
});
