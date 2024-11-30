/**
 * This example shows how to use this library with Koa using HTTPS
 */

import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
	const headers = Object.fromEntries(
		Object.entries(result.headers).map(([key, value]) => [key, String(value)]),
	);
	ctx.set(headers);
	ctx.body = result.stream;
});

const server = createServer(
	{
		// eslint-disable-next-line n/no-sync
		key: readFileSync(join(__dirname, 'cert', 'localhost.key')),
		// eslint-disable-next-line n/no-sync
		cert: readFileSync(join(__dirname, 'cert', 'localhost.crt')),
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
