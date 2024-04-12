import type { Dir, Dirent, Stats } from 'fs';
import { open, fstat, close, createReadStream, opendir, readdir, constants } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';
// eslint-disable-next-line n/prefer-global/url
import { URL } from 'url';

import { Storage } from './storage';
import type { StorageRequestHeaders, StorageInfo } from './types';
import { StorageError } from './errors';
import type { StreamRange } from './utils';
import { acceptEncodings } from './utils';
import type {
	FilePath,
	FileSystemStorageOptions,
	RegexpContentEncodingMapping,
	GenericFileSystemStorageOptions,
	GenericFileData,
	GenericFSModule,
} from './file-system-types';
import {
	MalformedPathError,
	NotNormalizedError,
	InvalidPathError,
	ConsecutiveSlashesError,
	ForbiddenCharacterError,
	IgnoredFileError,
	TrailingSlashError,
	IsDirectoryError,
	DoesNotExistError,
} from './file-system-errors';

/**
 * Escape HTML in path for this library (only replace & character since ", < and > are already excluded)
 * @param path - the path to escape
 * @returns the escaped path
 */
export function escapeHTMLInPath(path: string) {
	// & is the only character to escape. '<', '>' and '"' are already excluded from listing
	return path.replace(/&/ug, '&amp;');
}

// eslint-disable-next-line no-control-regex
export const FORBIDDEN_CHARACTERS = /[/?<>\\:*|":\u0000-\u001F\u0080-\u009F]/u;

/**
 * File system storage
 */
export class GenericFileSystemStorage<FileDescriptor> extends Storage<FilePath, GenericFileData<FileDescriptor>> {
	/**
	 * Root directory
	 */
	readonly root: string;

	/**
	 * Content encoding mappings array (or false if disabled)
	 */
	readonly contentEncodingMappings: readonly RegexpContentEncodingMapping[] | false;

	/**
	 * Ignore pattern (or false if disabled)
	 */
	readonly ignorePattern: RegExp | false;

	/**
	 * On directory action
	 *
	 * - 'serve-index' to serve directory's index.html
	 * - 'list-files' to list directory files
	 * - (or false if disabled)
	 */
	readonly onDirectory: 'serve-index' | 'list-files' | false;

	/**
	 * fs.open function
	 */
	readonly fsOpen: (path: string, flags: number) => Promise<FileDescriptor>;

	/**
	 * fs.fstat function
	 */
	readonly fsFstat: (fd: FileDescriptor) => Promise<Stats>;

	/**
	 * fs.close function
	 */
	readonly fsClose: (fd: FileDescriptor) => Promise<void>;

	/**
	 * fs.createReadStream function
	 */
	readonly fsCreateReadStream: GenericFSModule<FileDescriptor>['createReadStream'];

	/**
	 * fs.opendir function
	 */
	readonly fsOpendir: ((path: string) => Promise<Dir>) | undefined;

	/**
	 * fs.readdir function
	 */
	readonly fsReaddir: (path: string, options: { withFileTypes: true }) => Promise<Dirent[]>;

	/**
	 * fs.constants constants
	 */
	readonly fsConstants: GenericFSModule<FileDescriptor>['constants'];

	/**
	 * Create file system storage
	 * @param root - root folder path
	 * @param opts - file system storage options
	 */
	constructor(
		root: string,
		opts: GenericFileSystemStorageOptions<FileDescriptor>,
	) {
		super(opts);
		const { contentEncodingMappings, ignorePattern, onDirectory, fsModule } = opts;
		this.root = root;
		this.contentEncodingMappings = contentEncodingMappings
			? contentEncodingMappings.map(encodingConfig => {
				const encodingPreferences = new Map(
					encodingConfig.encodings.map(({ name, path }, order) => [name, { path, order }]),
				);
				let identityEncodingPreference = encodingPreferences.get('identity');
				if (!identityEncodingPreference) {
					identityEncodingPreference = { path: '$&', order: encodingConfig.encodings.length };
					encodingPreferences.set('identity', identityEncodingPreference);
				}
				const matcher = encodingConfig.matcher instanceof RegExp
					? encodingConfig.matcher
					: new RegExp(encodingConfig.matcher, 'u');
				return { matcher, encodingPreferences, identityEncodingPreference };
			})
			: false;
		this.ignorePattern = ignorePattern === undefined
			? /^\./u
			: ignorePattern === false || ignorePattern instanceof RegExp
				? ignorePattern
				: new RegExp(ignorePattern, 'u');
		this.onDirectory = onDirectory ?? false;
		this.fsOpen = promisify(fsModule.open);
		this.fsFstat = promisify(fsModule.fstat);
		this.fsClose = promisify(fsModule.close);
		this.fsCreateReadStream = fsModule.createReadStream;
		this.fsOpendir = fsModule.opendir ? promisify(fsModule.opendir) : undefined;
		this.fsReaddir = promisify(fsModule.readdir);
		this.fsConstants = fsModule.constants;
	}

	/**
	 * Parse and check url encoded path or path array
	 * @param path - url encoded path or path array to be accessed from root
	 * @returns path array
	 * @throws when the path can not be parsed
	 */
	parsePath(path: FilePath) {
		let pathParts;

		if (typeof path === 'string') {
			if (!path.startsWith('/')) {
				throw new StorageError(
					`'${ path }' is not a valid path (should start with '/')`,
					path,
				);
			}
			const { pathname, search } = new URL(`http://localhost${ path }`);
			pathParts = pathname.split('/');
			try {
				pathParts = pathParts.map(decodeURIComponent);
			} catch (err: unknown) {
				throw new MalformedPathError(
					String(err),
					path,
					pathParts,
				);
			}
			const normalizedPath = pathname + search;
			if (path !== normalizedPath) {
				throw new NotNormalizedError(
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
				const pathArray = String(path.map(v => `'${ v }'`).join(', '));
				throw new InvalidPathError(
					`[${ pathArray }] is not a valid path array (should start with '' and not contain '..' or '.')`,
					path,
					pathParts,
				);
			}
		}

		const emptyPartIndex = pathParts.indexOf('', 1);
		let haveTrailingSlash = false;

		// trailing or consecutive slashes
		if (emptyPartIndex !== -1) {
			if (emptyPartIndex !== pathParts.length - 1) {
				throw new ConsecutiveSlashesError(
					`${ String(path) } have two consecutive slashes`,
					path,
					pathParts,
				);
			}
			haveTrailingSlash = true;
		}

		// slashes or null bytes
		if (pathParts.some(v => FORBIDDEN_CHARACTERS.test(v))) {
			throw new ForbiddenCharacterError(
				`${ String(path) } has one or more forbidden characters`,
				path,
				pathParts,
			);
		}

		// ignored files
		const { ignorePattern } = this;
		if (ignorePattern && pathParts.some(v => ignorePattern.test(v))) {
			throw new IgnoredFileError(
				`${ String(path) } is ignored`,
				path,
				pathParts,
			);
		}

		// trailing slash
		if (haveTrailingSlash) {
			const untrailedPathParts = pathParts.slice(0, -1);
			const { onDirectory } = this;
			if (onDirectory === 'list-files') {
				pathParts = untrailedPathParts;
			} else if (onDirectory === 'serve-index') {
				pathParts = [...untrailedPathParts, 'index.html'];
				haveTrailingSlash = false;
			} else {
				throw new TrailingSlashError(
					`${ String(path) } have a trailing slash`,
					path,
					pathParts,
					untrailedPathParts,
				);
			}
		}

		return { pathParts, haveTrailingSlash };
	}

	/**
	 * Open file, return undefined if does not exist
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
	 * @param fd - file descriptor
	 * @param _path - file path (unused but can be useful for caching on override)
	 * @returns Stat object
	 */
	async stat(fd: FileDescriptor, _path: string) {
		return this.fsFstat(fd);
	}

	/**
	 * Close file descriptor
	 * @param fd - file descriptor
	 * @param _path - file path (unused but can be useful for caching on override)
	 * @returns Stat object
	 */
	async earlyClose(fd: FileDescriptor, _path: string) {
		return this.fsClose(fd);
	}

	/**
	 * Open file and retrieve storage information (filename, modification date, size, ...)
	 * @param path - file path
	 * @param requestHeaders - request headers
	 * @returns StorageInfo object
	 * @throws when the file can not be opened
	 */
	async open(
		path: FilePath,
		requestHeaders: StorageRequestHeaders,
	): Promise<StorageInfo<GenericFileData<FileDescriptor>>> {
		let fd: FileDescriptor | undefined;
		const { pathParts, haveTrailingSlash } = this.parsePath(path);
		let resolvedPath = join(this.root, ...pathParts);
		let stats;
		let vary;
		let contentEncoding;
		try {
			const { contentEncodingMappings: encodingsMappings } = this;
			let selectedEncodingMapping;
			// test path against encoding map
			if (!haveTrailingSlash && encodingsMappings) {
				selectedEncodingMapping = encodingsMappings.find(
					encodingMapping => encodingMapping.matcher.test(resolvedPath),
				);
			}
			if (selectedEncodingMapping) {
				const { encodingPreferences, identityEncodingPreference, matcher } = selectedEncodingMapping;
				// if path can have encoded version
				vary = 'Accept-Encoding';
				const acceptableEncodings = acceptEncodings(
					requestHeaders['accept-encoding'],
					encodingPreferences,
					identityEncodingPreference,
				);
				for (const [acceptableEncodingName, { path: acceptableEncodingPath }] of acceptableEncodings) {
					const encodedPath = resolvedPath.replace(
						matcher,
						acceptableEncodingPath,
					);
					// eslint-disable-next-line no-await-in-loop
					fd = await this.safeOpen(encodedPath);
					if (fd === undefined) {
						continue;
					}
					// eslint-disable-next-line no-await-in-loop
					stats = await this.stat(fd, encodedPath);
					if (stats.isDirectory()) {
						if (acceptableEncodingName === 'identity') {
							throw new IsDirectoryError(
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
					contentEncoding = acceptableEncodingName === 'identity' ? undefined : acceptableEncodingName;
					resolvedPath = encodedPath;
					break;
				}
				if (fd === undefined || !stats) {
					throw new DoesNotExistError(
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
					throw new DoesNotExistError(
						`${ resolvedPath } does not exist`,
						path,
						pathParts,
						resolvedPath,
					);
				}
				stats = await this.stat(fd, resolvedPath);
				if (stats.isDirectory()) {
					if (!haveTrailingSlash) {
						throw new IsDirectoryError(
							`${ resolvedPath } is a directory`,
							path,
							pathParts,
							resolvedPath,
						);
					}
					// fd cannot be used yet with opendir/readdir
					await this.earlyClose(fd, resolvedPath);
					return {
						attachedData: {
							pathParts,
							resolvedPath,
							fd,
							stats,
						},
						fileName: `${ pathParts.length > 1 ? pathParts[pathParts.length - 1] : '_' }.html`,
						mtimeMs: undefined,
						size: undefined,
						vary: undefined,
						contentEncoding: undefined,
						mimeType: 'text/html',
						mimeTypeCharset: 'UTF-8',
						lastModified: undefined,
						etag: undefined,
						cacheControl: undefined,
						contentDispositionType: undefined,
						contentDispositionFilename: undefined,
					};
				} else if (haveTrailingSlash) {
					throw new TrailingSlashError(
						`${ String(path) } have a trailing slash but is not a directory`,
						path,
						[...pathParts, ''],
						pathParts,
					);
				}
			}
		} catch (err: unknown) {
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
			fileName: pathParts[pathParts.length - 1],
			mtimeMs: stats.mtimeMs,
			size: stats.size,
			vary,
			contentEncoding,
			mimeType: undefined,
			mimeTypeCharset: undefined,
			lastModified: undefined,
			etag: undefined,
			cacheControl: undefined,
			contentDispositionType: undefined,
			contentDispositionFilename: undefined,
		};
	}

	/**
	 * Async generator method to return the directory listing as HTML
	 * @param storageInfo - storage information
	 * @yields html parts
	 */
	async *getDirectoryListing(storageInfo: StorageInfo<GenericFileData<FileDescriptor>>) {
		const { attachedData: { pathParts } } = storageInfo;

		const isNotRoot = pathParts.length > 1;
		const displayName = isNotRoot ? escapeHTMLInPath(pathParts[pathParts.length - 1]) : '/';
		const display = `${ isNotRoot ? escapeHTMLInPath(pathParts.join('/')) : '' }/`;

		yield `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${
			displayName
		}</title><meta name="viewport" content="width=device-width"><meta name="description" content="Content of ${
			display
		} directory"></head><body><h1>Directory: ${ display }</h1><ul>${
			isNotRoot ? '<li><a href="..">..</a></li>' : ''
		}`;

		const { ignorePattern } = this;
		const files = await this.opendir(storageInfo);

		for await (const file of files) {
			const { name: filename } = file;
			if (
				FORBIDDEN_CHARACTERS.test(filename)
				|| (ignorePattern && ignorePattern.test(filename))
			) {
				continue;
			}
			const escapedFilename = `${ escapeHTMLInPath(filename) }${ file.isDirectory() ? '/' : '' }`;
			yield `<li><a href="./${ escapedFilename }">${ escapedFilename }</a></li>`;
		}

		yield '</ul></body></html>';
	}

	/**
	 * Returns the list of files from a directory
	 * @param storageInfo - storage information
	 * @returns the list of files
	 */
	async opendir(storageInfo: StorageInfo<GenericFileData<FileDescriptor>>) {
		return this.fsOpendir
			? this.fsOpendir(storageInfo.attachedData.resolvedPath)
			: this.fsReaddir(storageInfo.attachedData.resolvedPath, { withFileTypes: true });
	}

	/**
	 * Create readable stream from storage information
	 * @param storageInfo - storage information
	 * @param range - range to use or undefined if size is unknown
	 * @param autoClose - true if stream should close itself
	 * @returns readable stream
	 */
	createReadableStream(
		storageInfo: StorageInfo<GenericFileData<FileDescriptor>>,
		range: StreamRange | undefined,
		autoClose: boolean,
	): Readable {
		const { attachedData } = storageInfo;
		if (attachedData.stats.isDirectory()) {
			return Readable.from(
				this.getDirectoryListing(storageInfo),
				{ objectMode: false, encoding: 'utf-8', highWaterMark: 16_384, autoDestroy: true },
			);
		}
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
	 * @param storageInfo - storage information
	 * @returns void
	 */
	async close(storageInfo: StorageInfo<GenericFileData<FileDescriptor>>): Promise<void> {
		await this.fsClose(storageInfo.attachedData.fd);
	}
}

export class FileSystemStorage extends GenericFileSystemStorage<number> {
	constructor(
		root: string,
		opts: FileSystemStorageOptions = {},
	) {
		super(root, {
			fsModule: { open, fstat, close, createReadStream, opendir, readdir, constants },
			...opts,
		});
	}
}
