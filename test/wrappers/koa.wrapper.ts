import { Readable } from 'stream';
import type { Server } from 'http';

import Koa from 'koa';

import type { Storage, FileSystemStorageOptions, PrepareResponseOptions, StreamResponse } from '../../src/send-stream';
import { FileSystemStorage } from '../../src/send-stream';

import type { ServerWrapper } from './server.wrapper';

export class KoaServerWrapper implements ServerWrapper {
	app: Koa;
	serverInstance: Server | undefined;
	context: { lastResult?: StreamResponse<unknown> | true | undefined };

	constructor(context: { lastResult?: StreamResponse<unknown> | true | undefined }) {
		this.app = new Koa();
		this.context = context;
	}

	get server() {
		if (!this.serverInstance) {
			throw new Error('server not existing');
		}
		return this.serverInstance;
	}

	async listen() {
		await new Promise(resolve => {
			this.serverInstance = this.app.listen(() => {
				resolve(undefined);
			});
		});
	}

	async close() {
		await new Promise((resolve, reject) => {
			this.server.close(err => {
				if (err) {
					reject(err);
					return;
				}
				resolve(undefined);
			});
		});
	}

	sendStorage<Reference, AttachedData>(
		storage: Storage<Reference, AttachedData>,
		reference: Reference,
		opts: PrepareResponseOptions & { noResult?: boolean } = {},
	) {
		this.app.use(async ctx => {
			if (opts.noResult) {
				this.context.lastResult = true;
			}
			const result = await storage.prepareResponse(
				reference,
				ctx.req,
				opts,
			);
			this.context.lastResult = result;
			if (result.error) {
				result.headers['X-Send-Stream-Error'] = result.error.name;
			}
			ctx.status = result.statusCode;
			ctx.set(<Record<string, string>> result.headers);
			ctx.body = result.stream;
		});
	}

	send(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean; removeHeader?: string },
	) {
		this.app.use(async ctx => {
			if (opts?.noResult) {
				this.context.lastResult = true;
			}
			if (opts?.removeHeader) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete (<Record<string, string>> ctx.request.header)[opts.removeHeader];
			}
			const storage = new FileSystemStorage(root, opts);
			const result = await storage.prepareResponse(
				path ?? ctx.path,
				ctx.req,
				opts,
			);
			this.context.lastResult = result;
			if (result.error) {
				result.headers['X-Send-Stream-Error'] = result.error.name;
			}
			if (result.storageInfo?.attachedData.resolvedPath) {
				result.headers['X-Send-Stream-Resolved-Path'] = result.storageInfo.attachedData.resolvedPath;
			}
			ctx.status = result.statusCode;
			ctx.set(<Record<string, string>> result.headers);
			ctx.body = result.stream;
		});
	}

	sendWithError(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean },
	) {
		this.app.use(async ctx => {
			if (opts?.noResult) {
				this.context.lastResult = true;
			}
			class FileSystemStorageWithError extends FileSystemStorage {
				override createReadableStream() {
					return new Readable({
						read() {
							process.nextTick(() => {
								this.destroy(new Error('ooops'));
							});
						},
					});
				}
			}
			const storage = new FileSystemStorageWithError(root, opts);
			const result = await storage.prepareResponse(
				path ?? ctx.path,
				ctx.req,
				opts,
			);
			this.context.lastResult = result;
			if (result.error) {
				result.headers['X-Send-Stream-Error'] = result.error.name;
			}
			if (result.storageInfo?.attachedData.resolvedPath) {
				result.headers['X-Send-Stream-Resolved-Path'] = result.storageInfo.attachedData.resolvedPath;
			}
			ctx.status = result.statusCode;
			ctx.set(<Record<string, string>> result.headers);
			ctx.body = result.stream;
		});
	}
}
