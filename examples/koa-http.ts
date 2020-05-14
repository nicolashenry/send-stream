
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

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
