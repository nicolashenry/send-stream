
import * as https from 'https';
import * as fs from 'fs';
import { join } from 'path';

import Koa from 'koa';

import { FileSystemStorage } from '../src/send-stream';

const app = new Koa<object>();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.use(async ctx => {
	const result = await storage.prepareResponse(ctx.request.path, ctx.req);
	ctx.response.status = result.statusCode;
	ctx.response.set(<{ [key: string]: string }> result.headers);
	ctx.body = result.stream;
});

const server = https.createServer(
	{
		// eslint-disable-next-line node/no-sync
		key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
		// eslint-disable-next-line node/no-sync
		cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	},
	(req, res) => {
		app.callback()(req, res).catch(err => {
			console.error(err);
		});
	},
);

server.listen(3001, () => {
	console.info('listening on https://localhost:3001');
});
