/**
 * This example shows how to use this library with Koa using HTTP
 */

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

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
