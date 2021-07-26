/**
 * This example shows how to use this library with Koa using HTTPS
 */

import * as https from 'https';
import * as fs from 'fs';
import { join } from 'path';

import Koa from 'koa';

import { FileSystemStorage } from '../src/send-stream';

const app = new Koa();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

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

const server = https.createServer(
	{
		// eslint-disable-next-line node/no-sync
		key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
		// eslint-disable-next-line node/no-sync
		cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	},
	(req, res) => {
		app.callback()(req, res);
	},
);

server.listen(3001, () => {
	console.info('listening on https://localhost:3001');
});
