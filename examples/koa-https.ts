
// tslint:disable-next-line:no-implicit-dependencies
import Koa from 'koa';
import * as https from 'https';
import * as fs from 'fs';
import { join } from 'path';

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
	result.stream.on('error', err => {
		console.error(err);
		if (ctx.res.connection.destroyed) {
			return;
		}
		if (!ctx.headerSent) {
			ctx.response.status = 500;
			ctx.response.set({});
			ctx.response.body = 'Internal Server Error';
			return;
		}
		ctx.res.destroy(err);
	});
	ctx.body = result.stream;
});

const server = https.createServer(
	{
		key: fs.readFileSync(join(__dirname, 'cert', 'localhost.key')),
		cert: fs.readFileSync(join(__dirname, 'cert', 'localhost.crt')),
	},
	app.callback()
);

server.listen(3000, () => {
	console.info('listening on https://localhost:3000');
});
