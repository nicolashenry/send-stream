
import { join } from 'path';
import fastify from 'fastify';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const app = fastify();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.get('*', async ({ req }, { res }) => {
	if (req.url === undefined) {
		throw new Error('url not set');
	}
	let result = await storage.prepareResponse(req.url, req);
	if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
		result.stream.destroy();
		result = await storage.prepareResponse([...result.error.pathParts.slice(0, -1), 'index.html'], req);
	}
	result.send(res);
});

app.listen(3000)
	.then(() => {
		console.info('listening on http://localhost:3000');
	})
	.catch(err => {
		console.error(err);
	});
