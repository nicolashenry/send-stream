import type { Readable } from 'node:stream';
import type { Dir, Stats, Dirent } from 'node:fs';

import type { StorageOptions } from './types';

/**
 * File data with generic file descriptor used by file
 * @template FileDescriptor - file descriptor type
 */
export interface GenericFileData<FileDescriptor> {
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
	stats: Stats;
	/**
	 * File descriptor
	 */
	fd: FileDescriptor;
}

/**
 * File data used by file storage
 */
export type FileData = GenericFileData<number>;

/**
 * "fs" module like type with generic file descriptor used by this library
 * @template FileDescriptor - file descriptor type
 */
export interface GenericFSModule<FileDescriptor> {
	constants: {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		O_RDONLY: number;
	};
	open: (
		path: string,
		flags: number,
		callback: (err: NodeJS.ErrnoException | null, fd: FileDescriptor) => void
	) => void;
	fstat: (fd: FileDescriptor, callback: (err: NodeJS.ErrnoException | null, stats: Stats) => void) => void;
	close: (fd: FileDescriptor, callback: (err: NodeJS.ErrnoException | null) => void) => void;
	createReadStream: (
		path: string,
		options: {
			fd?: FileDescriptor;
			start?: number;
			end?: number;
			autoClose: boolean;
		}
	) => Readable;
	opendir?: (
		path: string,
		callback: (err: NodeJS.ErrnoException | null, dir: Dir) => void
	) => void;
	readdir: (
		path: string,
		options: { withFileTypes: true },
		callback: (err: NodeJS.ErrnoException | null, files: Dirent[]) => void
	) => void;
}

/**
 * "fs" module like type used by this library
 */
export type FSModule = GenericFSModule<number>;

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
 * FileSystemStorage options with generic file descriptor
 * @template FileDescriptor - file descriptor type
 */
export interface GenericFileSystemStorageOptions<FileDescriptor> extends StorageOptions {
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
	fsModule: GenericFSModule<FileDescriptor>;
	/**
	 * Determine what should happen on directory requests (trailing slash)
	 * - `false` to return an error
	 * - `'list-files'` to list the files of directories
	 * - `'serve-index'` to serve the index.html file of directories
	 *
	 * Defaults to false
	 */
	onDirectory?: 'serve-index' | 'list-files' | false;
}

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

/**
 * FileSystemStorage options
 */
export type FileSystemStorageOptions = Optional<GenericFileSystemStorageOptions<number>, 'fsModule'>;

/**
 * URL encoded path or path parts
 */
export type FilePath = string | readonly string[];
