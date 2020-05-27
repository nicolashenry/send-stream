
import { join, extname } from 'path';

import express from 'express';

import { FileSystemStorage, FileSystemStorageError } from '../src/send-stream';

const app = express();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.use(async (req, res, next) => {
	try {
		let result = await storage.prepareResponse(req.url, req);
		// if a path is not found and does not have extension then return root index.html
		if (
			result.error instanceof FileSystemStorageError
			&& extname(result.error.pathParts[result.error.pathParts.length - 1]) === ''
		) {
			result.stream.destroy();
			result = await storage.prepareResponse(['', 'index.html'], req);
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
