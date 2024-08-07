import { ServerResponse } from 'node:http';
import type { ServerHttp2Stream } from 'node:http2';
import { Http2ServerResponse } from 'node:http2';
import type { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream';
import { promisify } from 'node:util';

import type { ResponseHeaders } from './utils';
import type { StorageInfo, SendOptions } from './types';
import type { StorageError } from './errors';

const promisifiedStreamPipeline = promisify(streamPipeline);

async function pipeline(
	readStream: Readable,
	res: ServerResponse | ServerHttp2Stream,
	ignorePrematureClose: boolean,
) {
	try {
		await promisifiedStreamPipeline(readStream, res);
	} catch (err: unknown) {
		if (ignorePrematureClose) {
			return;
		}
		throw err;
	}
}

/**
 * Stream response
 * @template AttachedData - attached data type
 */
export class StreamResponse<AttachedData> {
	/**
	 * Create stream response
	 * @param statusCode - the status code matching the required resource
	 * @param headers - the response headers to be sent for the required resource
	 * @param stream - the response stream to be sent for the required resource
	 * @param storageInfo - the storage information for the required resource (if existing)
	 * @param error - the error if the resource can not be found or openned for any reason
	 */
	constructor(
		public statusCode: number,
		public headers: ResponseHeaders,
		public stream: Readable,
		public storageInfo?: StorageInfo<AttachedData>,
		public error?: StorageError<unknown>,
	) {}

	/**
	 * Send response to http response
	 * @param res - http response
	 * @param opts - options
	 * @param opts.ignorePrematureClose - ignore premature close errors
	 * @throws error when response is already closed
	 */
	async send(
		res: ServerResponse | Http2ServerResponse | ServerHttp2Stream,
		{ ignorePrematureClose = true }: SendOptions = {},
	): Promise<void> {
		const { statusCode } = this;
		const { headers: responseHeaders, stream: readStream } = this;

		if (res.headersSent) {
			readStream.destroy();
			throw new Error('response headers already sent');
		}
		if (res instanceof ServerResponse) {
			const { socket, destroyed } = res;
			if (destroyed || !socket || socket.destroyed) {
				readStream.destroy();
				return;
			}
			res.writeHead(statusCode, responseHeaders);
			await pipeline(readStream, res, ignorePrematureClose);
		} else {
			const resStream = res instanceof Http2ServerResponse ? res.stream : res;
			if (resStream.destroyed || resStream.closed) {
				readStream.destroy();
				return;
			}
			resStream.respond({
				// eslint-disable-next-line @typescript-eslint/naming-convention
				':status': statusCode,
				...responseHeaders,
			});
			await pipeline(readStream, resStream, ignorePrematureClose);
		}
	}

	/**
	 * Disposes of resources within the stream response object
	 */
	dispose(): void {
		this.stream.destroy();
	}
}
