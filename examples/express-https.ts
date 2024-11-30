/**
 * This example shows how to use this library with Express using HTTPS
 */

import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import express from 'express';

import { FileSystemStorage } from '../src/send-stream';

const app = express();
app.disable('x-powered-by');

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
		// eslint-disable-next-line n/callback-return
		next(err);
	}
});

const server = createServer(
	{
		// eslint-disable-next-line n/no-sync
		key: readFileSync(join(__dirname, 'cert', 'localhost.key')),
		// eslint-disable-next-line n/no-sync
		cert: readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	},
	app,
);

server.listen(3001, () => {
	console.info('listening on https://localhost:3001');
});
