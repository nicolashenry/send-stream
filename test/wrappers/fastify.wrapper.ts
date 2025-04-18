import { Readable } from 'node:stream';
import type { Server } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { fastify } from 'fastify';

import type { Storage, FileSystemStorageOptions, PrepareResponseOptions, StreamResponse } from '../../src/send-stream';
import { FileSystemStorage } from '../../src/send-stream';

import type { ServerWrapper } from './server.wrapper';

export class FastifyServerWrapper implements ServerWrapper {
	server: Server;
	context: { lastResult?: StreamResponse<unknown> | true | undefined };
	app: FastifyInstance;

	constructor(context: { lastResult?: StreamResponse<unknown> | true | undefined }) {
		this.app = fastify({
			exposeHeadRoutes: true,
		});
		this.context = context;
		this.server = this.app.server;
	}

	async listen(): Promise<void> {
		await this.app.listen({ port: 0, host: '0.0.0.0' });
	}

	async close(): Promise<void> {
		await this.app.close();
	}

	sendStorage<Reference, AttachedData>(
		storage: Storage<Reference, AttachedData>,
		reference: Reference,
		opts: PrepareResponseOptions & { noResult?: boolean } = {},
	): void {
		this.app.get('*', async (request, reply) => {
			if (opts.noResult) {
				this.context.lastResult = true;
			}
			const result = await storage.prepareResponse(
				reference,
				request.raw,
				opts,
			);
			this.context.lastResult = result;
			if (result.error) {
				result.headers['X-Send-Stream-Error'] = result.error.name;
			}
			result.headers['Content-Type'] ??= 'application/octet-stream';
			await result.send(reply.raw);
		});
	}

	send(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean; removeHeader?: string },
	): void {
		this.app.get('*', async (request, reply) => {
			if (opts?.noResult) {
				this.context.lastResult = true;
			}
			if (opts?.removeHeader) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete request.raw.headers[opts.removeHeader];
			}
			const storage = new FileSystemStorage(root, opts);
			const result = await storage.prepareResponse(
				path ?? request.url,
				request.raw,
				opts,
			);
			this.context.lastResult = result;
			if (result.error) {
				result.headers['X-Send-Stream-Error'] = result.error.name;
			}
			if (result.storageInfo?.attachedData.resolvedPath) {
				result.headers['X-Send-Stream-Resolved-Path'] = result.storageInfo.attachedData.resolvedPath;
			}
			result.headers['Content-Type'] ??= 'application/octet-stream';
			await result.send(reply.raw);
		});
	}

	sendWithError(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean },
	): void {
		this.app.get('*', async (request, reply) => {
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
				path ?? request.url,
				request.raw,
				opts,
			);
			this.context.lastResult = result;
			if (result.error) {
				result.headers['X-Send-Stream-Error'] = result.error.name;
			}
			if (result.storageInfo?.attachedData.resolvedPath) {
				result.headers['X-Send-Stream-Resolved-Path'] = result.storageInfo.attachedData.resolvedPath;
			}
			result.headers['Content-Type'] ??= 'application/octet-stream';
			await result.send(reply.raw);
		});
	}
}
