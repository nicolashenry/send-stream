
import { join } from 'path';

import express from 'express';

import { FileSystemStorage, FileSystemStorageError } from '../src/send-stream';

const app = express();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.get('*', async (req, res, next) => {
	try {
		let result = await storage.prepareResponse(req.url, req);
		const { error } = result;
		// if the path is not found and the reason is a trailing slash then try to load matching index.html
		if (error && error instanceof FileSystemStorageError && error.code === 'trailing_slash') {
			result.stream.destroy();
			result = await storage.prepareResponse([...error.pathParts.slice(0, -1), 'index.html'], req);
		}
		result.send(res);
	} catch (err) {
		// eslint-disable-next-line node/callback-return
		next(err);
	}
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
