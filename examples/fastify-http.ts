/**
 * This example shows how to use this library with Fastify using HTTP
 */

import { join } from 'node:path';

import { fastify } from 'fastify';

import { FileSystemStorage } from '../src/send-stream';

const app = fastify({ exposeHeadRoutes: true });

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.get('*', async (request, reply) => {
	const result = await storage.prepareResponse(request.url, request.raw);
	if (result.statusCode === 404) {
		reply.callNotFound();
		return;
	}
	await result.send(reply.raw);
});

app.listen({ port: 3000 })
	.then(() => {
		console.info('listening on http://localhost:3000');
	})
	.catch((err: unknown) => {
		console.error(err);
	});
