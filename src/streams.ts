import { Readable, PassThrough } from 'stream';

import type { BufferOrStreamRange } from './utils';

/**
 * Single buffer stream
 */
export class BufferStream extends Readable {
	private buffer?: Uint8Array;

	/**
	 * Create a single buffer stream
	 *
	 * @param buffer - content buffer or undefined if stream need to be empty
	 */
	constructor(buffer?: Uint8Array) {
		super({ autoDestroy: true });
		this.buffer = buffer;
	}

	_read() {
		const { buffer } = this;
		if (buffer) {
			this.buffer = undefined;
			this.push(buffer);
		}
		this.push(null);
	}

	_destroy() {
		this.buffer = undefined;
	}
}

/**
 * Multi stream
 */
export class MultiStream extends PassThrough {
	/**
	 * Create a multi streams stream
	 *
	 * @param ranges - array of Buffer or StreamRange
	 * @param onNextStream - function creating the Readable when needed
	 * @param onDestroy - function called on close to release resources
	 */
	constructor(
		private readonly ranges: BufferOrStreamRange[],
		private readonly onNextStream: (range: BufferOrStreamRange) => Readable,
		private readonly onDestroy: () => Promise<void>,
	) {
		super({ allowHalfOpen: false });

		this.sendNextRange();
	}

	_destroy(error: Error | null, callback: (err: Error | null) => void) {
		this.onDestroy()
			.then(() => {
				// eslint-disable-next-line no-underscore-dangle
				super._destroy(error, callback);
			})
			.catch((closeError: Error) => {
				// eslint-disable-next-line no-underscore-dangle
				super._destroy(
					error
						? new Error(`${ String(error) }\nthen\n${ String(closeError) }`)
						: closeError,
					callback,
				);
			});
	}

	private sendNextRange() {
		const currentRange = this.ranges.shift();
		if (!currentRange) {
			this.end(() => {
				this.destroy();
			});
			return;
		}
		const stream = this.onNextStream(currentRange);

		const listenerMap = new Map<string, (() => void) | ((err: Error) => void)>();

		const onClose = () => {
			for (const [eventType, listener] of listenerMap.entries()) {
				stream.off(eventType, listener);
			}
		};

		const onError = (error: Error) => {
			onClose();
			this.end(() => {
				this.destroy(error);
			});
		};

		const onEnd = () => {
			onClose();
			this.sendNextRange();
		};

		listenerMap.set('error', onError);
		stream.on('error', onError);
		listenerMap.set('end', onEnd);
		stream.on('end', onEnd);

		stream.pipe(this, { end: false });
	}
}
