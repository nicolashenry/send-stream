
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { fastify } from 'fastify';

import { FileSystemStorage, FileSystemStorageError } from '../src/send-stream.js';

const app = fastify({ exposeHeadRoutes: true });

const storage = new FileSystemStorage(join(dirname(fileURLToPath(import.meta.url)), 'assets'));

app.get('*', async (request, reply) => {
	let result = await storage.prepareResponse(request.url, request.raw);
	// if path is not found then rewrite to root index.html
	if (result.error instanceof FileSystemStorageError) {
		result.stream.destroy();
		const { error: { pathParts } } = result;
		result = await storage.prepareResponse(
			['', 'index.html'],
			request.raw,
			// if the mime type can be determined from path then this is probably an error so add 404 status
			storage.mimeTypeLookup(pathParts[pathParts.length - 1])
				? { statusCode: 404 }
				: {},
		);
	}
	await result.send(reply.raw);
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
