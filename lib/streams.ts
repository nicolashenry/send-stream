import { Readable, PassThrough } from 'stream';

/**
 * Single buffer stream
 */
export class BufferStream extends Readable {
	private str?: Buffer;
	constructor(str: Buffer) {
		super();
		this.str = str;
		const end = () => {
			this.destroy();
		};
		this.on('end', end);
		this.once('close', () => {
			this.off('end', end);
		});
	}
	// tslint:disable-next-line: function-name
	_read() {
		if (!this.str) {
			this.push(null);
		}
		const str = this.str;
		this.str = undefined;
		if (this.push(str)) {
			this.push(null);
		}
	}
}

/**
 * Empty stream
 */
export class EmptyStream extends Readable {
	constructor() {
		super();
		const end = () => {
			this.destroy();
		};
		this.on('end', end);
		this.once('close', () => {
			this.off('end', end);
		});
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
	private currentStream?: Readable;
	constructor(
		private readonly streams: Readable[],
		private readonly onDestroy: () => Promise<void>
	) {
		super({ allowHalfOpen: false });

		this.sendNextRange();
	}

	// tslint:disable-next-line: function-name
	_destroy(error: Error | null, callback: (error: Error | null) => void) {
		if (this.currentStream) {
			this.currentStream.unpipe(this);
		}
		this.onDestroy()
			.then(() => {
				super._destroy(error, callback);
			})
			.catch((closeError: Error) => {
				super._destroy(error ? new Error(`${error.stack}\nthen\n${closeError.stack}`) : closeError, callback);
			});
	}

	private sendNextRange() {
		const stream = this.currentStream = this.streams.shift();
		if (!stream) {
			this.end(() => {
				this.destroy();
			});
			return;
		}

		let onClose: () => void;
		const onError = (error: Error) => {
			onClose();
			this.destroy(error);
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
