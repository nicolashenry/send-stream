
import * as fs from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';

import { Storage, StorageRequestHeaders, StorageOptions } from './storage';
import { acceptEncodings, StreamRange } from './utils';
import { StorageError, StorageInfo, StreamResponse } from './response';
import { EmptyStream, BufferStream } from './streams';

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
	stats: fs.Stats;
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
		O_RDONLY: number;
	};
	open: (
		path: string,
		flags: number,
		callback: (err: NodeJS.ErrnoException | null, fd: number) => void
	) => void;
	fstat: (fd: number, callback: (err: NodeJS.ErrnoException | null, stats: fs.Stats) => void) => void;
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
	matcher: RegExp;
	/**
	 * Encodings to search once file path is matched
	 */
	encodings: readonly ContentEncodingPath[];
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
	ignorePattern?: RegExp | false;
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
	/**
	 * Path parts relative to root
	 */
	readonly pathParts: readonly string[];

	/**
	 * Resolved path
	 */
	readonly resolvedPath?: string;

	/**
	 * Create file system storage error
	 *
	 * @param code - error code
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts
	 * @param resolvedPath - resolved path
	 */
	constructor(code: string, message: string, path: FilePath, pathParts: readonly string[], resolvedPath?: string) {
		super(code, message, path);
		this.name = 'FileSystemStorageError';
		this.pathParts = pathParts;
		this.resolvedPath = resolvedPath;
	}
}

/**
 * File system storage error which ask for redirection
 */
export class RedirectFileSystemStorageError extends FileSystemStorageError {
	readonly redirectionPath: string;

	/**
	 * Create file system storage error which ask for redirection
	 *
	 * @param code - error code
	 * @param message - error message
	 * @param path - encoded path or path parts
	 * @param pathParts - path parts
	 * @param redirectionPath - the required redirected path
	 */
	constructor(code: string, message: string, path: FilePath, pathParts: readonly string[], redirectionPath: string) {
		super(code, message, path, pathParts);
		this.name = 'RedirectFileSystemStorageError';
		this.redirectionPath = redirectionPath;
	}
}

/**
 * File system storage
 */
export class FileSystemStorage extends Storage<FilePath, FileData> {
	readonly root: string;

	readonly contentEncodingMappings?: readonly ContentEncodingMapping[];

	readonly ignorePattern?: RegExp | false;

	readonly fsOpen: (path: string, flags: number) => Promise<number>;

	readonly fsFstat: (fd: number) => Promise<fs.Stats>;

	readonly fsClose: (fd: number) => Promise<void>;

	readonly fsCreateReadStream: FSModule['createReadStream'];

	readonly fsConstants: FSModule['constants'];

	/**
	 * Create file system storage
	 *
	 * @param root - root folder path
	 * @param opts - file system storage options
	 */
	constructor(
		root: string,
		opts: FileSystemStorageOptions = { },
	) {
		super(opts);
		this.root = root;
		const { contentEncodingMappings: encodingsMap } = opts;
		if (encodingsMap) {
			this.contentEncodingMappings = encodingsMap.map(encodingConfig => {
				const encodings = [...encodingConfig.encodings];
				if (!encodings.find(e => e.name === 'identity')) {
					encodings.push({ name: 'identity', path: '$1' });
				}
				return { ...encodingConfig, encodings };
			});
		}
		this.ignorePattern = opts.ignorePattern === undefined ? /^\./u : opts.ignorePattern;
		const fsModule = opts.fsModule === undefined ? fs : opts.fsModule;
		this.fsOpen = promisify(fsModule.open);
		this.fsFstat = promisify(fsModule.fstat);
		this.fsClose = promisify(fsModule.close);
		this.fsCreateReadStream = fsModule.createReadStream;
		this.fsConstants = fsModule.constants;
	}

	/**
	 * Parse and check url encoded path or path array
	 *
	 * @param path - url encoded path or path array to be accessed from root
	 * @returns path array
	 */
	parsePath(path: FilePath) {
		let pathParts;

		if (typeof path === 'string') {
			const fullPath = path.startsWith('/') ? path : `/${ path }`;
			const url = new URL(`http://localhost${ fullPath }`);
			const { pathname } = url;
			const normalizedPath = pathname + url.search;
			pathParts = pathname.split('/').map(decodeURIComponent);
			if (fullPath !== normalizedPath) {
				throw new RedirectFileSystemStorageError(
					'not_normalized_path',
					`${ String(path) } is not normalized`,
					path,
					pathParts,
					normalizedPath,
				);
			}
		} else {
			pathParts = path;
			if (
				pathParts.length === 0
				|| pathParts[0] !== ''
				|| pathParts.findIndex(part => /^\.\.?$/u.test(part)) !== -1
			) {
				throw new FileSystemStorageError(
					'invalid_path',
					`[${
						String(path.join(', '))
					}] is not a valid path (should start with '' and not contain '..' or '.')`,
					path,
					pathParts,
				);
			}
		}

		// slashes or null bytes
		// eslint-disable-next-line no-control-regex
		if (pathParts.find(v => /[/?<>\\:*|":\u0000-\u001F\u0080-\u009F]/u.test(v))) {
			throw new FileSystemStorageError(
				'forbidden_characters',
				`${ String(path) } has forbidden characters`,
				path,
				pathParts,
			);
		}

		const emptyPartIndex = pathParts.indexOf('', 1);

		// trailing or consecutive slashes
		if (emptyPartIndex !== -1) {
			if (emptyPartIndex !== pathParts.length - 1) {
				throw new FileSystemStorageError(
					'consecutive_slashes',
					`${ String(path) } have two consecutive slashes`,
					path,
					pathParts,
				);
			}
			throw new FileSystemStorageError(
				'trailing_slash',
				`${ String(path) } have a trailing slash`,
				path,
				pathParts,
			);
		}

		// ignored files
		const { ignorePattern } = this;
		if (ignorePattern && pathParts.find(v => ignorePattern.test(v)) !== undefined) {
			throw new FileSystemStorageError(
				'ignored_files',
				`${ String(path) } is ignored`,
				path,
				pathParts,
			);
		}

		return pathParts;
	}

	/**
	 * Open file, return undefined if does not exist
	 *
	 * @param path - file path
	 * @returns file handle
	 */
	async safeOpen(path: string) {
		let fd;
		try {
			fd = await this.fsOpen(path, this.fsConstants.O_RDONLY);
		} catch {
			// noop if an error happens while trying to open file
		}
		return fd;
	}

	/**
	 * Get Stat object from file descriptor
	 *
	 * @param fd - file descriptor
	 * @param _path - file path (unused but can be useful for caching on override)
	 * @returns Stat object
	 */
	async stat(fd: number, _path: string) {
		return this.fsFstat(fd);
	}

	/**
	 * Close file descriptor
	 *
	 * @param fd - file descriptor
	 * @param _path - file path (unused but can be useful for caching on override)
	 * @returns Stat object
	 */
	async earlyClose(fd: number, _path: string) {
		return this.fsClose(fd);
	}

	/**
	 * Open file and retrieve storage information (filename, modification date, size, ...)
	 *
	 * @param path - file path
	 * @param requestHeaders - request headers
	 * @returns StorageInfo object
	 */
	async open(path: FilePath, requestHeaders: StorageRequestHeaders): Promise<StorageInfo<FileData>> {
		let fd: number | undefined;
		const pathParts = this.parsePath(path);
		let resolvedPath = join(this.root, ...pathParts);
		let stats;
		let vary;
		let contentEncoding = 'identity';
		const { [pathParts.length - 1]: fileName } = pathParts;
		const { contentEncodingMappings: encodingsMappings } = this;
		let selectedEncodingMapping;
		// test path against encoding map
		if (encodingsMappings) {
			for (const encodingMapping of encodingsMappings) {
				if (encodingMapping.matcher.test(resolvedPath)) {
					selectedEncodingMapping = encodingMapping;
					break;
				}
			}
		}
		try {
			if (selectedEncodingMapping) {
				const { encodings: selectedEncodings } = selectedEncodingMapping;
				// if path can have encoded version
				vary = 'Accept-Encoding';
				const acceptableEncodings = acceptEncodings(
					requestHeaders,
					selectedEncodings.map(e => e.name),
				)
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					.map(e => selectedEncodings.find(v => v.name === e)!);
				for (const acceptableEncoding of acceptableEncodings) {
					const encodedPath = resolvedPath.replace(
						selectedEncodingMapping.matcher,
						acceptableEncoding.path,
					);
					// eslint-disable-next-line no-await-in-loop
					fd = await this.safeOpen(encodedPath);
					if (fd === undefined) {
						continue;
					}
					// eslint-disable-next-line no-await-in-loop
					stats = await this.stat(fd, encodedPath);
					if (stats.isDirectory()) {
						if (acceptableEncoding.name === 'identity') {
							throw new FileSystemStorageError(
								'is_directory',
								`${ resolvedPath } is a directory`,
								path,
								pathParts,
								resolvedPath,
							);
						}
						const directoryFd = fd;
						fd = undefined;
						stats = undefined;
						// eslint-disable-next-line no-await-in-loop
						await this.earlyClose(directoryFd, encodedPath);
						continue;
					}
					contentEncoding = acceptableEncoding.name;
					resolvedPath = encodedPath;
					break;
				}
				if (fd === undefined || !stats) {
					throw new FileSystemStorageError(
						'does_not_exist',
						`${ resolvedPath } does not exist`,
						path,
						pathParts,
						resolvedPath,
					);
				}
			} else {
				// if path can not have encoded version
				fd = await this.safeOpen(resolvedPath);
				if (fd === undefined) {
					throw new FileSystemStorageError(
						'does_not_exist',
						`${ resolvedPath } does not exist`,
						path,
						pathParts,
						resolvedPath,
					);
				}
				stats = await this.stat(fd, resolvedPath);
				if (stats.isDirectory()) {
					throw new FileSystemStorageError(
						'is_directory',
						`${ resolvedPath } is a directory`,
						path,
						pathParts,
						resolvedPath,
					);
				}
			}
		} catch (err) {
			if (fd !== undefined) {
				await this.earlyClose(fd, resolvedPath);
			}
			throw err;
		}

		return {
			attachedData: {
				pathParts,
				resolvedPath,
				fd,
				stats,
			},
			fileName,
			mtimeMs: stats.mtimeMs,
			size: stats.size,
			vary,
			contentEncoding,
		};
	}

	/**
	 * Create readable stream from storage information
	 *
	 * @param storageInfo - storage information
	 * @param range - range to use or undefined if size is unknown
	 * @param autoClose - true if stream should close itself
	 * @returns readable stream
	 */
	createReadableStream(
		storageInfo: StorageInfo<FileData>,
		range: StreamRange | undefined,
		autoClose: boolean,
	): Readable {
		const { attachedData } = storageInfo;
		return this.fsCreateReadStream(
			attachedData.resolvedPath,
			range === undefined
				? {
					fd: attachedData.fd,
					autoClose,
				}
				: {
					fd: attachedData.fd,
					autoClose,
					start: range.start,
					end: range.end,
				},
		);
	}

	/**
	 * Close storage information
	 *
	 * @param storageInfo - storage information
	 * @returns void
	 */
	async close(storageInfo: StorageInfo<FileData>): Promise<void> {
		return this.fsClose(storageInfo.attachedData.fd);
	}

	/**
	 * Create storage error response (Not Found response usually, Moved Permanently to redirect on normalized path)
	 *
	 * @param isHeadMethod - true if HEAD method is used
	 * @param error - the error causing this response
	 * @returns the error response
	 */
	createStorageError(isHeadMethod: boolean, error: unknown) {
		if (error instanceof RedirectFileSystemStorageError) {
			// Moved Permanently
			const statusMessageBuffer = Buffer.from(`=> ${ error.redirectionPath }`);
			return new StreamResponse<FileData>(
				301,
				{
					'Content-Length': String(statusMessageBuffer.byteLength),
					'Content-Type': 'text/plain; charset=UTF-8',
					'X-Content-Type-Options': 'nosniff',
					Location: error.redirectionPath,
				},
				isHeadMethod ? new EmptyStream() : new BufferStream(statusMessageBuffer),
				undefined,
				error,
			);
		}
		return super.createStorageError(isHeadMethod, error);
	}
}
