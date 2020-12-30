
import { join } from 'path';

import { fastify } from 'fastify';

import { FileSystemStorage } from '../src/send-stream';

const app = fastify();

const storage = new FileSystemStorage(join(__dirname, 'assets'), { dynamicCompression: true });

app.route({
	method: ['HEAD', 'GET'],
	url: '*',
	handler: async ({ raw: req }, { raw: res }) => {
		if (req.url === undefined) {
			throw new Error('url not set');
		}
		const result = await storage.prepareResponse(req.url, req);
		result.send(res);
	},
});

app.listen(3000)
	.then(() => {
		console.info('listening on http://localhost:3000');
	})
	.catch(err => {
		console.error(err);
	});
