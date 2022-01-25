/**
 * Storage error
 */
export class StorageError<T> extends Error {
	/**
	 * Storage reference
	 */
	readonly reference: T;

	/**
	 * Create a storage error
	 *
	 * @param message - error message
	 * @param reference - error storage reference
	 */
	constructor(message: string, reference: T) {
		super(message);
		this.name = 'StorageError';
		this.reference = reference;
	}
}

/**
 * Method not allowed storage error
 */
export class MethodNotAllowedStorageError extends StorageError<undefined> {
	/**
	 * Create method not allowed error
	 *
	 * @param message - error message
	 */
	constructor(message: string) {
		super(message, undefined);
		this.name = 'MethodNotAllowedStorageError';
	}
}

/**
 * Precondition failed storage error
 */
export class PreconditionFailedStorageError<T> extends StorageError<T> {
	/**
	 * Create precondition failed error
	 *
	 * @param message - error message
	 * @param reference - error storage reference
	 */
	constructor(message: string, reference: T) {
		super(message, reference);
		this.name = 'PreconditionFailedStorageError';
	}
}

/**
 * Range not satisfiable storage error
 */
export class RangeNotSatisfiableStorageError<T> extends StorageError<T> {
	/**
	 * Create range not satisfiable error
	 *
	 * @param message - error message
	 * @param reference - error storage reference
	 */
	constructor(message: string, reference: T) {
		super(message, reference);
		this.name = 'RangeNotSatisfiableStorageError';
	}
}
