import type { Server } from 'http';

import type { Storage, FileSystemStorageOptions, PrepareResponseOptions } from '../../src/send-stream';

export interface ServerWrapper {
	server: Server | undefined;

	listen(): Promise<void>;

	close(): Promise<void>;

	sendStorage<Reference, AttachedData>(
		storage: Storage<Reference, AttachedData>,
		reference: Reference,
		opts?: PrepareResponseOptions & { noResult?: boolean },
	): void;

	send(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean; removeHeader?: string },
	): void;

	sendWithError(
		root: string,
		path?: string | string[],
		opts?: PrepareResponseOptions & FileSystemStorageOptions & { noResult?: boolean },
	): void;
}
