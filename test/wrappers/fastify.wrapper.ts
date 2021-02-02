import { Readable } from 'stream';
import type { Server } from 'http';

import type { FastifyInstance } from 'fastify';
import { fastify } from 'fastify';

import type { Storage, FileSystemStorageOptions, PrepareResponseOptions, StreamResponse } from '../../src/send-stream';
import { FileSystemStorage } from '../../src/send-stream';

import type { ServerWrapper } from './server.wrapper';

export class FastifyServerWrapper implements ServerWrapper {
	server?: Server;
	context: { lastResult?: StreamResponse<unknown> | true | undefined };
	app: FastifyInstance;

	constructor(context: { lastResult?: StreamResponse<unknown> | true | undefined }) {
		this.app = fastify();
		this.context = context;
	}

	async listen() {
		await this.app.listen(0);
		this.server = this.app.server;
	}

	async close() {
		await this.app.close();
	}

	sendStorage<Reference, AttachedData>(
		storage: Storage<Reference, AttachedData>,
		reference: Reference,
		opts: PrepareResponseOptions & { noResult?: boolean } = {},
	) {
		this.app.route({
			method: ['HEAD', 'GET'],
			url: '*',
			handler: async (request, reply) => {
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
				if (!result.headers['Content-Type']) {
					result.headers['Content-Type'] = 'application/octet-stream';
				}
				await result.send(reply.raw);
			},
		});
	}

	send(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean; removeHeader?: string },
	) {
		this.app.route({
			method: ['HEAD', 'GET'],
			url: '*',
			handler: async (request, reply) => {
				if (opts?.noResult) {
					this.context.lastResult = true;
				}
				if (opts?.removeHeader) {
					// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
					delete (<Record<string, string>> request.raw.headers)[opts.removeHeader];
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
				if (!result.headers['Content-Type']) {
					result.headers['Content-Type'] = 'application/octet-stream';
				}
				await result.send(reply.raw);
			},
		});
	}

	sendWithError(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean },
	) {
		this.app.route({
			method: ['HEAD', 'GET'],
			url: '*',
			handler: async (request, reply) => {
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
				if (!result.headers['Content-Type']) {
					result.headers['Content-Type'] = 'application/octet-stream';
				}
				await result.send(reply.raw);
			},
		});
	}
}
