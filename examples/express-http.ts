
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
		result.send(res);
	} catch (err: unknown) {
		// eslint-disable-next-line node/callback-return
		next(err);
	}
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
