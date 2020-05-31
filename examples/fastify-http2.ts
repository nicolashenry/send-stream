
import * as fs from 'fs';
import { join } from 'path';

import fastify from 'fastify';

import { FileSystemStorage } from '../src/send-stream';

const app = fastify({
	http2: true,
	https: {
		// eslint-disable-next-line node/no-sync
		key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
		// eslint-disable-next-line node/no-sync
		cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	},
});

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.route({
	method: ['HEAD', 'GET'],
	url: '*',
	handler: async ({ req }, { res }) => {
		const result = await storage.prepareResponse(req.url, req);
		result.send(res);
	},
});

app.listen(3001)
	.then(() => {
		console.info('listening on https://localhost:3001');
	})
	.catch(err => {
		console.error(err);
	});
