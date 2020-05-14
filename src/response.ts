
import { EventEmitter } from 'events';
import * as http from 'http';
import * as http2 from 'http2';
import { Readable } from 'stream';

import { ResponseHeaders } from './utils';

/**
 * Storage error
 */
export class StorageError <T> extends Error {
	/**
	 * Error code
	 */
	readonly code: string;

	/**
	 * Storage reference
	 */
	readonly reference: T;

	/**
	 * Create a storage error
	 *
	 * @param code - error code
	 * @param message - error message
	 * @param reference - error storage reference
	 */
	constructor(code: string, message: string, reference: T) {
		super(message);
		this.name = 'StorageError';
		this.code = code;
		this.reference = reference;
	}
}

/**
 * Storage information
 */
export interface StorageInfo<AttachedData> {
	/**
	 * Attached data (depends on storage)
	 */
	attachedData: AttachedData;
	/**
	 * File name
	 */
	fileName?: string;
	/**
	 * File last modification time in milliseconds
	 */
	mtimeMs?: number;
	/**
	 * File size
	 */
	size?: number;
	/**
	 * Vary header
	 */
	vary?: string;
	/**
	 * Content encoding
	 */
	contentEncoding?: string;
}

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
	send(res: http.ServerResponse | http2.Http2ServerResponse | http2.ServerHttp2Stream) {
		const { statusCode } = this;
		const { headers: responseHeaders, stream: readStream } = this;

		if (res.headersSent) {
			readStream.destroy();
			this.emit('responseError', new Error('response headers already sent'));
			return this;
		}
		let endResponseOnError: () => void;
		if (res instanceof http.ServerResponse) {
			const { connection } = res;
			if (res.destroyed || connection.destroyed) {
				readStream.destroy();
				this.emit('responseError', new Error('response already closed'));
				return this;
			}
			res.writeHead(statusCode, responseHeaders);
			endResponseOnError = () => {
				res.destroy();
			};
			const responseClose = () => {
				res.off('error', responseClose);
				res.off('close', responseClose);
				if (!readStream.destroyed) {
					readStream.destroy();
				}
			};
			res.on('error', responseClose);
			res.on('close', responseClose);
			readStream.pipe(res);
		} else {
			const resStream = res instanceof http2.Http2ServerResponse ? res.stream : res;
			if (resStream.destroyed || resStream.closed) {
				readStream.destroy();
				this.emit('responseError', new Error('response already closed'));
				return this;
			}
			resStream.respond({
				':status': statusCode,
				...responseHeaders,
			});
			endResponseOnError = () => {
				resStream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
			};
			const responseClose = () => {
				resStream.off('error', responseClose);
				resStream.off('close', responseClose);
				if (!readStream.destroyed) {
					readStream.destroy();
				}
			};
			resStream.on('error', responseClose);
			resStream.on('close', responseClose);
			readStream.pipe(resStream);
		}
		// eslint-disable-next-line prefer-const
		let offReadableEvents: () => void;

		const readableError = (err: Error) => {
			offReadableEvents();
			endResponseOnError();
			this.emit('readError', err);
		};
		readStream.on('error', readableError);
		offReadableEvents = () => {
			readStream.off('error', readableError);
		};

		return this;
	}
}
