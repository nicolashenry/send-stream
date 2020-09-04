

import { Readable } from 'stream';

import { Storage } from './storage';
import type { StorageRequestHeaders, StorageInfo, StorageOptions } from './storage-models';
import type { StreamRange } from './utils';

export interface MemoryFile {
	// eslint-disable-next-line @typescript-eslint/ban-types
	content: string | Uint8Array | Uint8Array[];
	/**
	 * File name
	 */
	fileName?: string;
	/**
	 * File last modification time in milliseconds
	 */
	mtimeMs?: number;
	/**
	 * File size
	 */
	size?: number;
	/**
	 * Vary header
	 */
	vary?: string;
	/**
	 * Content encoding (undefined when `identity` is used)
	 */
	contentEncoding?: string;
	/**
	 * Mime type
	 */
	mimeType?: string;
	/**
	 * Mime type charset
	 */
	mimeTypeCharset?: string;
	/**
	 * Last-Modified header
	 */
	lastModified?: string;
	/**
	 * ETag header
	 */
	etag?: string;
	/**
	 * Cache-Control header ('public, max-age=0' by default)
	 */
	cacheControl?: string;
	/**
	 * Content-Disposition header type ('inline' by default)
	 */
	contentDispositionType?: 'inline' | 'attachment';
	/**
	 * Content-Disposition header filename (filename by default)
	 */
	contentDispositionFilename?: string;
}

/**
 * File system storage
 */
export class MemoryStorage extends Storage<MemoryFile, MemoryFile> {
	/**
	 * Create memory storage
	 *
	 * @param opts - file system storage options
	 */
	constructor(
		opts: StorageOptions = { },
	) {
		super(opts);
	}

	/**
	 * Open file and retrieve storage information (filename, modification date, size, ...)
	 *
	 * @param file - file data
	 * @param _requestHeaders - request headers
	 * @returns StorageInfo object
	 * @throws when the file can not be opened
	 */
	// eslint-disable-next-line class-methods-use-this,@typescript-eslint/require-await
	async open(file: MemoryFile, _requestHeaders: StorageRequestHeaders): Promise<StorageInfo<MemoryFile>> {
		return {
			attachedData: file,
			fileName: file.fileName,
			mtimeMs: file.mtimeMs,
			size: file.size,
			vary: file.vary,
			contentEncoding: file.contentEncoding,
			mimeType: file.mimeType,
			mimeTypeCharset: file.mimeTypeCharset,
			lastModified: file.lastModified,
			etag: file.etag,
			cacheControl: file.cacheControl,
			contentDispositionType: file.contentDispositionType,
			contentDispositionFilename: file.contentDispositionFilename,
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
	// eslint-disable-next-line class-methods-use-this
	createReadableStream(
		storageInfo: StorageInfo<MemoryFile>,
		range: StreamRange | undefined,
		autoClose: boolean,
	): Readable {
		const content = storageInfo.attachedData.content;
		return new Readable({
			read() {
				if (typeof content === 'string') {
					this.push(content);
				} else if (content instanceof Uint8Array) {
					this.push(content);
				}
			}
		});
	}

	/**
	 * Close storage information
	 *
	 * @param storageInfo - storage information
	 * @returns void
	 */
	async close(storageInfo: StorageInfo<MemoryFile>): Promise<void> {
		return;
	}
}
