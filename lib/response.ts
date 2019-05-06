
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
	code: string;
	/**
	 * Storage reference
	 */
	reference: T;
	constructor(code: string, message: string, reference: T) {
		super(message);
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
	fileName: string;
	/**
	 * File last modification time in milliseconds
	 */
	mtimeMs: number;
	/**
	 * File size
	 */
	size: number;
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
	 * @param statusCode the status code matching the required resource
	 * @param headers the response headers to be sent for the required resource
	 * @param stream the response stream to be sent for the required resource
	 * @param storageInfo the storage information for the required resource (if existing)
	 * @param error the error if the resource can not be found or openned for any reason
	 */
	constructor(
		public statusCode: number,
		public headers: ResponseHeaders,
		public stream: Readable,
		public storageInfo?: StorageInfo<AttachedData>,
		public error?: StorageError<unknown>
	) {
		super();
	}

	/**
	 * Send response to http response
	 * @param res http response
	 * @returns self
	 */
	send(
		res: http.ServerResponse | http2.Http2ServerResponse | http2.ServerHttp2Stream
	) {
		const statusCode = this.statusCode;
		const responseHeaders = this.headers;
		const readStream = this.stream;
		try {
			let readableClosed = false;
			let responseClosed = false;
			let readableError: (err: Error) => void;
			const responseError = (err: Error) => {
				this.emit('responseError', err);
			};
			const responseAborted = () => {
				this.emit('responseError', new Error('response aborted'));
			};
			let offResponseEvents: () => void;
			readStream.once('close', () => {
				readableClosed = true;
				if (!responseClosed) {
					return;
				}
				// tslint:disable-next-line: no-commented-code
				// readStream.off('error', readableError);
				offResponseEvents();
				this.emit('responseClose');
			});

			const resultClose = () => {
				responseClosed = true;
				if (!readableClosed) {
					readStream.destroy();
					return;
				}
				// tslint:disable-next-line: no-commented-code
				// readStream.off('error', readableError);
				offResponseEvents();
				this.emit('responseClose');
			};

			if (res.headersSent) {
				readStream.destroy();
				process.nextTick(() => {
					this.emit('responseError', new Error('response headers already sent'));
				});
				return this;
			}
			if (res instanceof http.ServerResponse) {
				const connection = res.connection;
				if (connection.destroyed) {
					readStream.destroy();
					process.nextTick(() => {
						this.emit('responseError', new Error('response already closed'));
					});
					return this;
				}
				res.writeHead(statusCode, responseHeaders);
				readableError = err => {
					this.emit('readError', err);
					if (connection.destroyed) {
						return;
					}
					res.destroy(err);
				};
				readStream.on('error', readableError);
				connection.on('error', responseError);
				res.on('close', resultClose);
				res.on('finish', resultClose);
				offResponseEvents = () => {
					connection.off('error', responseError);
					res.off('close', resultClose);
					res.off('finish', resultClose);
				};
				readStream.pipe(res);
			} else {
				const resStream = res instanceof http2.Http2ServerResponse ? res.stream : res;
				if (resStream.destroyed || resStream.closed) {
					readStream.destroy();
					process.nextTick(() => {
						this.emit('responseError', new Error('response already closed'));
					});
					return this;
				}
				resStream.respond({
					':status': statusCode,
					...responseHeaders
				});
				readableError = err => {
					this.emit('readError', err);
					if (resStream.destroyed || resStream.closed) {
						return;
					}
					resStream.destroy(err);
				};
				readStream.on('error', readableError);
				resStream.on('error', responseError);
				resStream.on('aborted', responseAborted);
				resStream.on('close', resultClose);
				offResponseEvents = () => {
					resStream.off('error', responseError);
					resStream.off('aborted', responseAborted);
					resStream.off('close', resultClose);
				};
				readStream.pipe(resStream);
			}
		} catch (err) {
			readStream.destroy();
			throw err;
		}
		return this;
	}
}
