/**
 * This example shows how to use contentEncodingMappings option to serve pre-compressed files
 *
 * See ./pre-compressed-util.ts to have an example of file pre-compressing
 */

import { join } from 'node:path';

import { fastify } from 'fastify';

import { FileSystemStorage } from '../src/send-stream';

const app = fastify({ exposeHeadRoutes: true });

const storage = new FileSystemStorage(
	join(__dirname, 'assets'),
	{
		contentEncodingMappings: [
			{
				// configure .html/.js/.css/.json files to have precompressed versions matching .br/.gz extensions
				matcher: /^(?<path>.+\.(?:html|js|css|json))$/u,
				encodings: [{ name: 'br', path: '$<path>.br' }, { name: 'gzip', path: '$<path>.gz' }],
			},
		],
	},
);

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
