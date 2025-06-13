/**
 * This example shows how to use this library with Express using HTTP
 */

import { join } from 'node:path';

import express from 'express';

import { FileSystemStorage } from '../src/send-stream';

const app = express();
app.disable('x-powered-by');

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.get(/(?<path>.*)/u, async (req, res, next) => {
	const result = await storage.prepareResponse(req.url, req);
	if (result.statusCode === 404) {
		next();
		return;
	}
	await result.send(res);
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
