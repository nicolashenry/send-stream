
import { join } from 'path';

import express from 'express';

import { FileSystemStorage } from '../src/send-stream';

const app = express();

const storage = new FileSystemStorage(
	join(__dirname, 'assets'),
	{
		contentEncodingMappings: [
			{
				matcher: /^(?<path>.+\.(?:html|js|css|json))$/u,
				encodings: [{ name: 'br', path: '$<path>.br' }, { name: 'gzip', path: '$<path>.gz' }],
			},
		],
	},
);

app.get('*', async (req, res, next) => {
	try {
		const result = await storage.prepareResponse(req.url, req);
		result.send(res);
	} catch (err) {
		// eslint-disable-next-line node/callback-return
		next(err);
	}
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
