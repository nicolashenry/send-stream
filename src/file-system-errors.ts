import { StorageError } from './errors';
import type { FilePath } from './file-system-types';

/**
 * File system storage error
 */
export class FileSystemStorageError extends StorageError<FilePath> {
	/**
	 * Path parts
	 */
	readonly pathParts: readonly string[];

	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts relative to root
	 */
	constructor(message: string, path: FilePath, pathParts: readonly string[]) {
		super(message, path);
		this.name = 'FileSystemStorageError';
		this.pathParts = pathParts;
	}
}

/**
 * File system storage error
 */
export class MalformedPathError extends FileSystemStorageError {
	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts relative to root
	 */
	constructor(message: string, path: FilePath, pathParts: readonly string[]) {
		super(message, path, pathParts);
		this.name = 'MalformedPathError';
	}
}

/**
 * File system storage error
 */
export class NotNormalizedError extends FileSystemStorageError {
	/**
	 * Normalized path
	 */
	normalizedPath: string;
	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path
	 * @param pathParts - path parts relative to root
	 * @param normalizedPath - encoded path or path parts
	 */
	constructor(message: string, path: string, pathParts: readonly string[], normalizedPath: string) {
		super(message, path, pathParts);
		this.name = 'NotNormalizedError';
		this.normalizedPath = normalizedPath;
	}
}

/**
 * File system storage error
 */
export class InvalidPathError extends FileSystemStorageError {
	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts relative to root
	 */
	constructor(message: string, path: FilePath, pathParts: readonly string[]) {
		super(message, path, pathParts);
		this.name = 'InvalidPathError';
	}
}

/**
 * File system storage error
 */
export class ConsecutiveSlashesError extends FileSystemStorageError {
	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts relative to root
	 */
	constructor(message: string, path: FilePath, pathParts: readonly string[]) {
		super(message, path, pathParts);
		this.name = 'ConsecutiveSlashesError';
	}
}

/**
 * File system storage error
 */
export class IgnoredFileError extends FileSystemStorageError {
	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts relative to root
	 */
	constructor(message: string, path: FilePath, pathParts: readonly string[]) {
		super(message, path, pathParts);
		this.name = 'IgnoredFileError';
	}
}

/**
 * File system storage error
 */
export class ForbiddenCharacterError extends FileSystemStorageError {
	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts relative to root
	 */
	constructor(message: string, path: FilePath, pathParts: readonly string[]) {
		super(message, path, pathParts);
		this.name = 'ForbiddenCharacterError';
	}
}

/**
 * File system storage error
 */
export class TrailingSlashError extends FileSystemStorageError {
	/**
	 * Path parts (without trailing slash)
	 */
	untrailedPathParts: readonly string[];
	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts relative to root
	 * @param untrailedPathParts - path parts relative to root (without trailing slash)
	 */
	constructor(message: string, path: FilePath, pathParts: readonly string[], untrailedPathParts: readonly string[]) {
		super(message, path, pathParts);
		this.name = 'TrailingSlashError';
		this.untrailedPathParts = untrailedPathParts;
	}
}

/**
 * File system storage error
 */
export class IsDirectoryError extends FileSystemStorageError {
	/**
	 * Resolved path
	 */
	readonly resolvedPath: string;

	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts
	 * @param resolvedPath - resolved path
	 */
	constructor(message: string, path: FilePath, pathParts: readonly string[], resolvedPath: string) {
		super(message, path, pathParts);
		this.name = 'IsDirectoryError';
		this.resolvedPath = resolvedPath;
	}
}

/**
 * File system storage error
 */
export class DoesNotExistError extends FileSystemStorageError {
	/**
	 * Resolved path
	 */
	readonly resolvedPath: string;

	/**
	 * Create file system storage error
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts
	 * @param resolvedPath - resolved path
	 */
	constructor(message: string, path: FilePath, pathParts: readonly string[], resolvedPath: string) {
		super(message, path, pathParts);
		this.name = 'DoesNotExistError';
		this.resolvedPath = resolvedPath;
	}
}
