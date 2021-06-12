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
