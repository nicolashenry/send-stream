
import * as http2 from 'http2';
import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import Koa from 'koa';

import { FileSystemStorage } from '../src/send-stream.js';

const app = new Koa();

const storage = new FileSystemStorage(join(dirname(fileURLToPath(import.meta.url)), 'assets'));

app.use(async (ctx, next) => {
	const result = await storage.prepareResponse(ctx.request.path, ctx.req);
	if (result.statusCode === 404) {
		// eslint-disable-next-line node/callback-return
		await next();
		return;
	}
	ctx.status = result.statusCode;
	ctx.set(<Record<string, string>> result.headers);
	ctx.body = result.stream;
});

const server = http2.createSecureServer(
	{
		// eslint-disable-next-line node/no-sync
		key: fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cert', 'localhost.key')),
		// eslint-disable-next-line node/no-sync
		cert: fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cert', 'localhost.crt')),
		allowHTTP1: true,
	},
	(req, res) => {
		app.callback()(req, res);
	},
);

server.listen(3001, () => {
	console.info('listening on https://localhost:3001');
});
