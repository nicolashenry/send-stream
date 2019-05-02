
// tslint:disable-next-line:no-implicit-dependencies
import express from 'express';
import { join, extname } from 'path';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const app = express();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.use(async (req, res, next) => {
	try {
		let result = await storage.prepareResponse(req.url, req);
		if (result.error
				&& result.error instanceof FileSystemStorageError
				&& (
					result.error.pathParts.length === 0
					|| extname(result.error.pathParts[result.error.pathParts.length - 1]) === ''
				)
		) {
			result.stream.destroy();
			result = await storage.prepareResponse(['', 'index.html'], req);
		}
		result.send(res);
	} catch (err) {
		next(err);
	}
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
