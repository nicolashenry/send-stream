import { Readable } from 'stream';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { createServer } from 'http';

import type { Storage, FileSystemStorageOptions, PrepareResponseOptions, StreamResponse } from '../../src/send-stream';
import { FileSystemStorage } from '../../src/send-stream';

import type { ServerWrapper } from './server.wrapper';

export class VanillaServerWrapper implements ServerWrapper {
	server?: Server;
	context: { lastResult?: StreamResponse<unknown> | true | undefined };
	listener?: (req: IncomingMessage, res: ServerResponse) => Promise<void>;

	constructor(context: { lastResult?: StreamResponse<unknown> | true | undefined }) {
		this.server = createServer((req, res) => {
			(async () => {
				if (req.url === undefined) {
					throw new Error('url not set');
				}
				if (this.listener) {
					await this.listener(req, res);
				}
			})().catch(err => {
				console.error(err);
				if (res.headersSent) {
					res.destroy(err instanceof Error ? err : new Error(String(err)));
					return;
				}
				const message = 'Internal Server Error';
				res.writeHead(500, {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					'Content-Type': 'text/plain; charset=UTF-8',
					// eslint-disable-next-line @typescript-eslint/naming-convention
					'Content-Length': String(Buffer.byteLength(message)),
				});
				res.end(message);
			});
		});
		this.context = context;
	}

	async listen() {
		await new Promise(resolve => {
			this.server = this.server?.listen(() => {
				resolve(undefined);
			});
		});
	}

	async close() {
		await new Promise((resolve, reject) => {
			if (this.server) {
				this.server.close(err => {
					if (err) {
						reject(err);
						return;
					}
					resolve(undefined);
				});
			} else {
				throw new Error('cannot close server (not existing)');
			}
		});
	}

	sendStorage<Reference, AttachedData>(
		storage: Storage<Reference, AttachedData>,
		reference: Reference,
		opts: PrepareResponseOptions & { noResult?: boolean } = {},
	) {
		this.listener = async (req, res) => {
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
			await result.send(res);
		};
	}

	send(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean; removeHeader?: string },
	) {
		this.listener = async (req, res) => {
			if (opts?.noResult) {
				this.context.lastResult = true;
			}
			if (opts?.removeHeader) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete (<Record<string, string>> req.headers)[opts.removeHeader];
			}
			const storage = new FileSystemStorage(root, opts);
			const result = await storage.prepareResponse(
				path ?? req.url ?? '/',
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
			await result.send(res);
		};
	}

	sendWithError(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean },
	) {
		this.listener = async (req, res) => {
			if (opts?.noResult) {
				this.context.lastResult = true;
			}
			class FileSystemStorageWithError extends FileSystemStorage {
				// eslint-disable-next-line class-methods-use-this
				createReadableStream() {
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
				path ?? req.url ?? '/',
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
			await result.send(res);
		};
	}
}
