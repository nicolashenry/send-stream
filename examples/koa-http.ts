
import Koa from 'koa';
import { join } from 'path';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const app = new Koa<object>();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.use(async ctx => {
	const connection = ctx.res.connection;
	let result = await storage.prepareResponse(ctx.request.path, ctx.req);
	if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
		result.stream.destroy();
		result = await storage.prepareResponse([...result.error.pathParts.slice(0, -1), 'index.html'], ctx.req);
	}
	ctx.response.status = result.statusCode;
	ctx.response.set(<{ [key: string]: string }> result.headers);
	result.stream.on('error', err => {
		console.error(err);
		if (connection.destroyed) {
			return;
		}
		if (!ctx.headerSent) {
			const message = 'Internal Server Error';
			ctx.response.status = 500;
			ctx.response.set({
				'Content-Type': 'text/plain; charset=UTF-8',
				'Content-Length': String(Buffer.byteLength(message))
			});
			ctx.response.body = message;
			return;
		}
		ctx.res.destroy(err);
	});
	ctx.body = result.stream;
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
