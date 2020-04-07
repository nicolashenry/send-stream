import { Readable, PassThrough } from 'stream';

import { BufferOrStreamRange } from './utils';

/**
 * Single buffer stream
 */
export class BufferStream extends Readable {
	private buffer?: Buffer;
	constructor(buffer: Buffer) {
		super();
		this.buffer = buffer;
	}
	// tslint:disable-next-line: function-name
	_read() {
		const buffer = this.buffer;
		this.buffer = undefined;
		this.push(buffer);
		this.push(null);
	}
}

/**
 * Empty stream
 */
export class EmptyStream extends Readable {
	constructor() {
		super();
	}
	// tslint:disable-next-line: function-name
	_read() {
		this.push(null);
	}
}

/**
 * Multi stream
 */
export class MultiStream extends PassThrough {
	constructor(
		private readonly ranges: BufferOrStreamRange[],
		private readonly onNextStream: (range: BufferOrStreamRange) => Readable,
		private readonly onDestroy: () => Promise<void>
	) {
		super({ allowHalfOpen: false });

		this.sendNextRange();
	}

	// tslint:disable-next-line: function-name
	_destroy(error: Error | null, callback: (error: Error | null) => void) {
		this.onDestroy()
			.then(() => {
				super._destroy(error, callback);
			})
			.catch((closeError: Error) => {
				super._destroy(error ? new Error(`${error.stack}\nthen\n${closeError.stack}`) : closeError, callback);
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

		let onClose: () => void;
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

		onClose = () => {
			// tslint:disable-next-line: no-commented-code
			// stream.off('error', onError);
			stream.off('end', onEnd);
			stream.off('close', onClose);
		};

		stream.on('error', onError);
		stream.on('end', onEnd);
		stream.on('close', onClose);

		stream.pipe(this, { end: false });
	}
}
