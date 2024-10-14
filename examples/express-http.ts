/**
 * This example shows how to use this library with Express using HTTP
 */

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

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
