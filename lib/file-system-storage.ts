
import * as fs from 'fs';
import { basename, join } from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';

import { Storage, StorageRequestHeaders, StorageOptions } from './storage';
import { acceptEncodings } from './utils';
import { StorageError, StorageInfo } from './response';

/**
 * File data used by storage
 */
export interface FileData {
	/**
	 * Path parts used from root
	 */
	pathParts: string[];
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
	open(
		path: string,
		flags: number,
		callback: (err: NodeJS.ErrnoException | null, fd: number) => void
	): void;
	fstat(fd: number, callback: (err: NodeJS.ErrnoException | null, stats: fs.Stats) => void): void;
	close(fd: number, callback: (err: NodeJS.ErrnoException | null) => void): void;
	createReadStream(
		path: string,
		options: {
			fd: number;
			start: number;
			end: number;
			autoClose: boolean;
		}
	): Readable;
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
	encodings: ContentEncodingPath[];
}

/**
 * FileSystemStorage options
 */
export interface FileSystemStorageOptions extends StorageOptions {
	/**
	 * Content encoding mapping, e.g. [{ matcher: /^(.+\\.json)$/, encodings: [{ name: 'gzip', path: '$1.gz' }] }]
	 */
	contentEncodingMappings?: ContentEncodingMapping[];
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
export type FilePath = string | string[];

/**
 * File system storage error
 */
export class FileSystemStorageError extends StorageError<FilePath> {
	/**
	 * Path parts relative to root
	 */
	pathParts: string[];
	/**
	 * Resolved path
	 */
	resolvedPath?: string;
	/**
	 * Create file system storage error
	 * @param code error code
	 * @param message error message
	 * @param path encoded path or path parts
	 * @param pathParts path parts
	 * @param resolvedPath resolved path
	 */
	constructor(code: string, message: string, path: FilePath, pathParts: string[], resolvedPath?: string) {
		super(code, message, path);
		this.pathParts = pathParts;
		this.resolvedPath = resolvedPath;
	}
}

/**
 * File system storage
 */
export class FileSystemStorage extends Storage<FilePath, FileData> {
	readonly root: string;
	readonly contentEncodingMappings?: ContentEncodingMapping[];
	readonly ignorePattern?: RegExp | false;
	readonly fsOpen: (path: string, flags: number) => Promise<number>;
	readonly fsFstat: (fd: number) => Promise<fs.Stats>;
	readonly fsClose: (fd: number) => Promise<void>;
	readonly fsCreateReadStream: FSModule['createReadStream'];
	readonly fsConstants: FSModule['constants'];

	/**
	 * Create file system storage
	 * @param root root folder path
	 * @param opts file system storage options
	 */
	constructor(
		root: string,
		opts: FileSystemStorageOptions = { }
	) {
		super(opts);
		this.root = root;
		const encodingsMap = opts.contentEncodingMappings;
		if (encodingsMap) {
			for (const encodingConfig of encodingsMap) {
				if (!encodingConfig.encodings.find(e => e.name === 'identity')) {
					encodingConfig.encodings.push({ name: 'identity', path: '$1' });
				}
			}
			this.contentEncodingMappings = encodingsMap;
		}
		this.ignorePattern = opts.ignorePattern !== undefined ? opts.ignorePattern : /^\../;
		const fsModule = opts.fsModule !== undefined ? opts.fsModule : fs;
		this.fsOpen = promisify(fsModule.open);
		this.fsFstat = promisify(fsModule.fstat);
		this.fsClose = promisify(fsModule.close);
		this.fsCreateReadStream = fsModule.createReadStream;
		this.fsConstants = fsModule.constants;
	}

	/**
	 * Parse and check url encoded path or path array
	 * @param path url encoded path or path array to be accessed from root
	 * @returns path array
	 */
	parsePath(path: FilePath) {
		let pathParts;
		let notNormalized = false;
		try {
			if (Array.isArray(path)) {
				pathParts = path;
				if (pathParts.includes('.') || pathParts.includes('..')) {
					notNormalized = true;
				}
			} else {
				const pathname = new URL(path, 'http://localhost').pathname;
				if (!path.startsWith(pathname)) {
					notNormalized = true;
				}
				pathParts = pathname.split('/').map(decodeURIComponent);
			}
		} catch (err) {
			throw new StorageError(
				'malformed_path',
				`${path} is malformed: ${err}`,
				path
			);
		}

		// ignore first slash
		if (pathParts.length > 0 && pathParts[0] === '') {
			pathParts.splice(0, 1);
		}

		if (notNormalized) {
			throw new FileSystemStorageError(
				'not_normalized_path',
				`${path} is not normalized`,
				path,
				pathParts
			);
		}

		// slashes or null bytes
		if (pathParts.find(v => /[/\\\u0000]/.test(v))) {
			throw new FileSystemStorageError(
				'forbidden_characters',
				`${path} has forbidden characters`,
				path,
				pathParts
			);
		}

		const emptyPartIndex = pathParts.indexOf('');
		// trailing slash
		if (emptyPartIndex === pathParts.length - 1) {
			throw new FileSystemStorageError(
				'trailing_slash',
				`${path} have a trailing slash`,
				path,
				pathParts
			);
		}
		// consecutive slashes
		if (emptyPartIndex !== -1) {
			throw new FileSystemStorageError(
				'consecutive_slashes',
				`${path} have two consecutive slashes`,
				path,
				pathParts
			);
		}

		// ignored files
		const ignorePattern = this.ignorePattern;
		if (ignorePattern && pathParts.find(v => ignorePattern.test(v))) {
			throw new FileSystemStorageError(
				'ignored_files',
				`${path} is ignored`,
				path,
				pathParts
			);
		}

		return pathParts;
	}

	/**
	 * Open file, return undefined if does not exist
	 * @param path file path
	 * @returns file handle
	 */
	async safeOpen(path: string) {
		let fd;
		try {
			fd = await this.fsOpen(path, this.fsConstants.O_RDONLY);
		} catch (err) {
			const error = <NodeJS.ErrnoException> err;
			if (error.code !== 'ENOENT') {
				throw error;
			}
		}
		return fd;
	}

	/**
	 * Get Stat object from file descriptor
	 * @param fd file descriptor
	 * @param _path file path (unused but can be useful for caching on override)
	 * @returns Stat object
	 */
	async stat(fd: number, _path: string) {
		return this.fsFstat(fd);
	}

	/**
	 * Close file descriptor
	 * @param fd file descriptor
	 * @param _path file path (unused but can be useful for caching on override)
	 * @returns Stat object
	 */
	async earlyClose(fd: number, _path: string) {
		return this.fsClose(fd);
	}

	/**
	 * Open file and retrieve storage information (filename, modification date, size, ...)
	 * @param path file path
	 * @param requestHeaders request headers
	 * @returns StorageInfo object
	 */
	async open(path: FilePath, requestHeaders: StorageRequestHeaders): Promise<StorageInfo<FileData>> {
		let fd: number | undefined;
		const pathParts = this.parsePath(path);
		let resolvedPath = join(this.root, ...pathParts);
		let stats;
		let vary;
		let contentEncoding = 'identity';
		const fileName = basename(resolvedPath);
		const encodingsMappings = this.contentEncodingMappings;
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
				const selectedEncodings = selectedEncodingMapping.encodings;
				// if path can have encoded version
				vary = 'Accept-Encoding';
				const acceptableEncodings = acceptEncodings(
					requestHeaders,
					selectedEncodings.map(e => e.name)
				)
				// tslint:disable-next-line: no-non-null-assertion
				.map(e => selectedEncodings.find(v => v.name === e)!);
				for (const acceptableEncoding of acceptableEncodings) {
					const encodedPath = resolvedPath.replace(
						selectedEncodingMapping.matcher,
						acceptableEncoding.path
					);
					fd = await this.safeOpen(encodedPath);
					if (!fd) {
						continue;
					}
					stats = await this.stat(fd, encodedPath);
					if (stats.isDirectory()) {
						if (acceptableEncoding.name === 'identity') {
							throw new FileSystemStorageError(
								'is_directory',
								`${ resolvedPath } is a directory`,
								path,
								pathParts,
								resolvedPath
							);
						}
						const directoryFd = fd;
						fd = undefined;
						stats = undefined;
						await this.earlyClose(directoryFd, encodedPath);
						continue;
					}
					contentEncoding = acceptableEncoding.name;
					resolvedPath = encodedPath;
					break;
				}
				if (!fd || !stats) {
					throw new FileSystemStorageError(
						'does_not_exist',
						`${resolvedPath} does not exist`,
						path,
						pathParts,
						resolvedPath
					);
				}
			} else {
				// if path can not have encoded version
				fd = await this.safeOpen(resolvedPath);
				if (!fd) {
					throw new FileSystemStorageError(
						'does_not_exist',
						`${resolvedPath} does not exist`,
						path,
						pathParts,
						resolvedPath
					);
				}
				stats = await this.stat(fd, resolvedPath);
				if (stats.isDirectory()) {
					throw new FileSystemStorageError(
						'is_directory',
						`${resolvedPath} is a directory`,
						path,
						pathParts,
						resolvedPath
					);
				}
			}
		} catch (err) {
			if (fd) {
				await this.earlyClose(fd, resolvedPath);
			}
			throw err;
		}

		return {
			attachedData: {
				pathParts,
				resolvedPath,
				fd,
				stats
			},
			fileName,
			mtimeMs: stats.mtimeMs,
			size: stats.size,
			vary,
			contentEncoding
		};
	}

	/**
	 * Create readable stream from storage information
	 * @param storageInfo storage information
	 * @param start start index
	 * @param end end index
	 * @param autoClose true if stream should close itself
	 * @returns readable stream
	 */
	createReadableStream(
		storageInfo: StorageInfo<FileData>,
		start: number,
		end: number,
		autoClose: boolean
	): Readable {
		const attachedData = storageInfo.attachedData;
		return this.fsCreateReadStream(
			attachedData.resolvedPath,
			{
				fd: attachedData.fd,
				autoClose,
				start,
				end
			}
		);
	}

	/**
	 * Close storage information
	 * @param storageInfo storage information
	 * @returns void
	 */
	async close(storageInfo: StorageInfo<FileData>): Promise<void> {
		return this.fsClose(storageInfo.attachedData.fd);
	}
}
