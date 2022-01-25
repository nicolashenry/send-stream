/**
 * This example shows how to use this library with Express using HTTP
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import express from 'express';

import { FileSystemStorage } from '../src/send-stream.js';

const app = express();

const storage = new FileSystemStorage(join(dirname(fileURLToPath(import.meta.url)), 'assets'));

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

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
