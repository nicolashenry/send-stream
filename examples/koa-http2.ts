/**
 * This example shows how to use this library with Koa using HTTP 2
 */

import * as http2 from 'http2';
import * as fs from 'fs';
import { join } from 'path';

import Koa from 'koa';

import { FileSystemStorage } from '../src/send-stream';

const app = new Koa();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.use(async (ctx, next) => {
	const result = await storage.prepareResponse(ctx.request.path, ctx.req);
	if (result.statusCode === 404) {
		// eslint-disable-next-line n/callback-return
		await next();
		return;
	}
	ctx.status = result.statusCode;
	ctx.set(<Record<string, string>> result.headers);
	ctx.body = result.stream;
});

const server = http2.createSecureServer(
	{
		// eslint-disable-next-line n/no-sync
		key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
		// eslint-disable-next-line n/no-sync
		cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
		allowHTTP1: true,
	},
	(req, res) => {
		app.callback()(req, res)
			.catch((err: unknown) => {
				console.error(err);
			});
	},
);

server.listen(3001, () => {
	console.info('listening on https://localhost:3001');
});
