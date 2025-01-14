/**
 * This example shows how to use this library with Fastify using HTTPS
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fastify } from 'fastify';

import { FileSystemStorage } from '../src/send-stream';

const app = fastify({
	exposeHeadRoutes: true,
	https: {
		// eslint-disable-next-line n/no-sync
		key: readFileSync(join(__dirname, 'cert', 'localhost.key')),
		// eslint-disable-next-line n/no-sync
		cert: readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	},
});

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.get('*', async (request, reply) => {
	const result = await storage.prepareResponse(request.url, request.raw);
	if (result.statusCode === 404) {
		reply.callNotFound();
		return;
	}
	await result.send(reply.raw);
});

app.listen({ port: 3001 })
	.then(() => {
		console.info('listening on https://localhost:3001');
	})
	.catch((err: unknown) => {
		console.error(err);
	});
