
import { join } from 'path';
import Koa from 'koa';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const app = new Koa<object>();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.use(async ctx => {
	let result = await storage.prepareResponse(ctx.request.path, ctx.req);
	if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
		result.stream.destroy();
		result = await storage.prepareResponse([...result.error.pathParts.slice(0, -1), 'index.html'], ctx.req);
	}
	ctx.response.status = result.statusCode;
	ctx.response.set(<{ [key: string]: string }> result.headers);
	ctx.body = result.stream;
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
