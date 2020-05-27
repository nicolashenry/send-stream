import { Readable } from 'stream';

import { StorageOptions, StorageError } from './storage-models';

export interface FileStats<T = number> {
	dev: T;
	ino: T;
	mode: T;
	nlink: T;
	uid: T;
	gid: T;
	rdev: T;
	size: T;
	blksize: T;
	blocks: T;
	atimeMs: T;
	mtimeMs: T;
	ctimeMs: T;
	birthtimeMs: T;
	atime: Date;
	mtime: Date;
	ctime: Date;
	birthtime: Date;
	isFile(): boolean;
	isDirectory(): boolean;
	isBlockDevice(): boolean;
	isCharacterDevice(): boolean;
	isSymbolicLink(): boolean;
	isFIFO(): boolean;
	isSocket(): boolean;
}

/**
 * File data used by storage
 */
export interface FileData {
	/**
	 * Path parts used from root
	 */
	pathParts: readonly string[];
	/**
	 * Resolved path with path parts joined with root
	 */
	resolvedPath: string;
	/**
	 * File stats
	 */
	stats: FileStats;
	/**
	 * File descriptor
	 */
	fd: number;
}

/**
 * "fs" module like type used by this library
 */
export interface FSModule {
	constants: {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		O_RDONLY: number;
	};
	open: (
		path: string,
		flags: number,
		callback: (err: NodeJS.ErrnoException | null, fd: number) => void
	) => void;
	fstat: (fd: number, callback: (err: NodeJS.ErrnoException | null, stats: FileStats) => void) => void;
	close: (fd: number, callback: (err: NodeJS.ErrnoException | null) => void) => void;
	createReadStream: (
		path: string,
		options: {
			fd: number;
			start?: number;
			end?: number;
			autoClose: boolean;
		}
	) => Readable;
}

/**
 * Content encoding path
 */
export interface ContentEncodingPath {
	/**
	 * Content encoding name (will be used in content-encoding header if the file is found)
	 */
	name: string;
	/**
	 * Path location (will replace $* groups from matched regexp)
	 */
	path: string;
}

/**
 * Content encoding mapping
 */
export interface ContentEncodingMapping {
	/**
	 * Regexp used to match file path
	 */
	matcher: RegExp | string;
	/**
	 * Encodings to search once file path is matched
	 */
	encodings: readonly ContentEncodingPath[];
}

/**
 * Content encoding preference
 */
export interface ContentEncodingPreference {
	/**
	 * Order of preference
	 */
	readonly order: number;
	/**
	 * Path to match
	 */
	readonly path: string;
}

/**
 * Content encoding mapping
 */
export interface RegexpContentEncodingMapping {
	/**
	 * Regexp used to match file path
	 */
	matcher: RegExp;
	/**
	 * Encodings to search once file path is matched
	 */
	encodingPreferences: ReadonlyMap<string, ContentEncodingPreference>;
	/**
	 * Identity encoding preference
	 */
	identityEncodingPreference: ContentEncodingPreference;
}

/**
 * FileSystemStorage options
 */
export interface FileSystemStorageOptions extends StorageOptions {
	/**
	 * Content encoding mapping, e.g. [{ matcher: /^(.+\\.json)$/, encodings: [{ name: 'gzip', path: '$1.gz' }] }]
	 */
	contentEncodingMappings?: readonly ContentEncodingMapping[];
	/**
	 * Ignore pattern, defaults to /^\../ (files/folders beginning with a dot)
	 */
	ignorePattern?: RegExp | string | false;
	/**
	 * "fs" module to use
	 */
	fsModule?: FSModule;
}

/**
 * URL encoded path or path parts
 */
export type FilePath = string | readonly string[];

/**
 * File system storage error
 */
export class FileSystemStorageError extends StorageError<FilePath> {
	readonly pathParts: readonly string[];

	/**
	 * Create file system storage error
	 *
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
	 *
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
	normalizedPath: string;
	/**
	 * Create file system storage error
	 *
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
	 *
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
	 *
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
	 *
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
	 *
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
	untrailedPathParts: readonly string[];
	/**
	 * Create file system storage error
	 *
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
	 *
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
	 *
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

