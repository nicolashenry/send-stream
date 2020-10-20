
import { EventEmitter } from 'events';
import { ServerResponse } from 'http';
import type { ServerHttp2Stream } from 'http2';
import { Http2ServerResponse } from 'http2';
import type { Readable } from 'stream';
import { pipeline } from 'stream';

import type { ResponseHeaders } from './utils';
import type { StorageInfo, StorageError } from './storage-models';

/**
 * Stream response
 */
export class StreamResponse<AttachedData> extends EventEmitter {
	/**
	 * Create stream response
	 *
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
	) {
		super();
	}

	/**
	 * Send response to http response
	 *
	 * @param res - http response
	 * @returns self
	 */
	send(res: ServerResponse | Http2ServerResponse | ServerHttp2Stream) {
		const { statusCode } = this;
		const { headers: responseHeaders, stream: readStream } = this;

		if (res.headersSent) {
			readStream.destroy();
			this.emit('responseError', new Error('response headers already sent'));
			return this;
		}
		// eslint-disable-next-line unicorn/consistent-function-scoping
		const pipelineEnd = (err: NodeJS.ErrnoException | null) => {
			if (err) {
				this.emit('readError', err);
			}
		};
		if (res instanceof ServerResponse) {
			const { socket } = res;
			if (res.destroyed || !socket || socket.destroyed) {
				readStream.destroy();
				this.emit('responseError', new Error('response already closed'));
				return this;
			}
			res.writeHead(statusCode, responseHeaders);
			pipeline(readStream, res, pipelineEnd);
		} else {
			const resStream = res instanceof Http2ServerResponse ? res.stream : res;
			if (resStream.destroyed || resStream.closed) {
				readStream.destroy();
				this.emit('responseError', new Error('response already closed'));
				return this;
			}
			resStream.respond({
				':status': statusCode,
				...responseHeaders,
			});
			pipeline(readStream, resStream, pipelineEnd);
		}

		return this;
	}
}
