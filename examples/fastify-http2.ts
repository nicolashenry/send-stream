/**
 * This example shows how to use this library with Fastify using HTTP 2
 */

import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { fastify } from 'fastify';

import { FileSystemStorage } from '../src/send-stream.js';

const app = fastify({
	exposeHeadRoutes: true,
	http2: true,
	https: {
		// eslint-disable-next-line node/no-sync
		key: fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cert', 'localhost.key')),
		// eslint-disable-next-line node/no-sync
		cert: fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cert', 'localhost.crt')),
	},
});

const storage = new FileSystemStorage(join(dirname(fileURLToPath(import.meta.url)), 'assets'));

app.get('*', async (request, reply) => {
	const result = await storage.prepareResponse(request.url, request.raw);
	if (result.statusCode === 404) {
		reply.callNotFound();
		return;
	}
	await result.send(reply.raw);
});

app.listen(3001)
	.then(() => {
		console.info('listening on https://localhost:3001');
	})
	.catch(err => {
		console.error(err);
	});
