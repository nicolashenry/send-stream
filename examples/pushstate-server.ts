
import { join } from 'path';

import express from 'express';

import { FileSystemStorage, FileSystemStorageError } from '../src/send-stream';

const app = express();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.use(async (req, res, next) => {
	try {
		let result = await storage.prepareResponse(req.url, req);
		// if path is not found then rewrite to root index.html
		if (result.error instanceof FileSystemStorageError) {
			result.stream.destroy();
			const { error: { pathParts } } = result;
			result = await storage.prepareResponse(
				['', 'index.html'],
				req,
				// if the mime type can be determined from path then this is probably an error so add 404 status
				storage.mimeTypesCharset(pathParts[pathParts.length - 1])
					? { statusCode: 404 }
					: {},
			);
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
