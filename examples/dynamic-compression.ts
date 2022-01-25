/**
 * This example shows how to use options to activate dynamic brotli/gzip compression
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { fastify } from 'fastify';

import { FileSystemStorage } from '../src/send-stream.js';

const app = fastify({ exposeHeadRoutes: true });

const storage = new FileSystemStorage(
	join(dirname(fileURLToPath(import.meta.url)), 'assets'),
	{ dynamicCompression: true },
);

app.get('*', async (request, reply) => {
	const result = await storage.prepareResponse(request.url, request.raw);
	if (result.statusCode === 404) {
		reply.callNotFound();
		return;
	}
	await result.send(reply.raw);
});

app.listen(3000)
	.then(() => {
		console.info('listening on http://localhost:3000');
	})
	.catch(err => {
		console.error(err);
	});
