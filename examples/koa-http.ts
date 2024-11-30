/**
 * This example shows how to use this library with Koa using HTTP
 */

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

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
