import { Readable, pipeline as streamPipeline } from 'node:stream';
import type { Server } from 'node:http';
import { promisify } from 'node:util';

import express from 'express';

import type { Storage, FileSystemStorageOptions, PrepareResponseOptions, StreamResponse } from '../../src/send-stream';
import { FileSystemStorage } from '../../src/send-stream';

import type { ServerWrapper } from './server.wrapper';

const pipeline = promisify(streamPipeline);

export class ExpressServerWrapper implements ServerWrapper {
	serverInstance: Server | undefined;
	context: { lastResult?: StreamResponse<unknown> | true | undefined };
	app: express.Express;

	constructor(context: { lastResult?: StreamResponse<unknown> | true | undefined }) {
		this.app = express();
		this.context = context;
	}

	get server(): Server {
		if (!this.serverInstance) {
			throw new Error('server not existing');
		}
		return this.serverInstance;
	}

	async listen(): Promise<void> {
		await new Promise(resolve => {
			this.serverInstance = this.app.listen(() => {
				resolve(undefined);
			});
		});
	}

	async close(): Promise<void> {
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
	): void {
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		this.app.get('*', async (req, res, next) => {
			try {
				if (opts.noResult) {
					this.context.lastResult = true;
				}
				const result = await storage.prepareResponse(
					reference,
					req,
					opts,
				);
				this.context.lastResult = result;
				if (result.error) {
					result.headers['X-Send-Stream-Error'] = result.error.name;
				}
				if (!result.headers['Content-Type']) {
					result.headers['Content-Type'] = 'application/octet-stream';
				}
				res.status(result.statusCode);
				res.set(result.headers);
				await pipeline(result.stream, res);
			} catch (err: unknown) {
				// eslint-disable-next-line n/callback-return
				next(err);
			}
		});
	}

	send(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean; removeHeader?: string },
	): void {
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		this.app.get('*', async (req, res, next) => {
			try {
				if (opts?.noResult) {
					this.context.lastResult = true;
				}
				if (opts?.removeHeader) {
					// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
					delete req.headers[opts.removeHeader];
				}
				const storage = new FileSystemStorage(root, opts);
				const result = await storage.prepareResponse(
					path ?? req.url,
					req,
					opts,
				);
				this.context.lastResult = result;
				if (result.error) {
					result.headers['X-Send-Stream-Error'] = result.error.name;
				}
				if (result.storageInfo?.attachedData.resolvedPath) {
					result.headers['X-Send-Stream-Resolved-Path'] = result.storageInfo.attachedData.resolvedPath;
				}
				if (!result.headers['Content-Type']) {
					result.headers['Content-Type'] = 'application/octet-stream';
				}
				res.status(result.statusCode);
				res.set(result.headers);
				await pipeline(result.stream, res);
			} catch (err: unknown) {
				// eslint-disable-next-line n/callback-return
				next(err);
			}
		});
	}

	sendWithError(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean },
	): void {
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		this.app.get('*', async (req, res, next) => {
			try {
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
					path ?? req.url,
					req,
					opts,
				);
				this.context.lastResult = result;
				if (result.error) {
					result.headers['X-Send-Stream-Error'] = result.error.name;
				}
				if (result.storageInfo?.attachedData.resolvedPath) {
					result.headers['X-Send-Stream-Resolved-Path'] = result.storageInfo.attachedData.resolvedPath;
				}
				if (!result.headers['Content-Type']) {
					result.headers['Content-Type'] = 'application/octet-stream';
				}
				res.status(result.statusCode);
				res.set(result.headers);
				await pipeline(result.stream, res);
			} catch (err: unknown) {
				// eslint-disable-next-line n/callback-return
				next(err);
			}
		});
	}
}
