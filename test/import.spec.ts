/* eslint-env node, mocha */

import { notStrictEqual } from 'node:assert';

import {
	StreamRange,
	randomBytes,
	statsToEtag,
	millisecondsToUTCString,
	isRangeFresh,
	contentRange,
	acceptEncodings,
	getFreshStatus,
	BufferStream,
	MultiStream,
	StorageError,
	MethodNotAllowedStorageError,
	PreconditionFailedStorageError,
	RangeNotSatisfiableStorageError,
	StreamResponse,
	Storage,
	FileSystemStorageError,
	MalformedPathError,
	NotNormalizedError,
	InvalidPathError,
	ConsecutiveSlashesError,
	IgnoredFileError,
	ForbiddenCharacterError,
	TrailingSlashError,
	IsDirectoryError,
	DoesNotExistError,
	escapeHTMLInPath,
	FORBIDDEN_CHARACTERS,
	GenericFileSystemStorage,
	FileSystemStorage,
} from '../src/send-stream';

// test that all exports are present
describe('exports', () => {
	it('should have FileSystemStorage', () => {
		notStrictEqual(FileSystemStorage, undefined);
	});
	it('should have Storage', () => {
		notStrictEqual(Storage, undefined);
	});
	it('should have StreamRange', () => {
		notStrictEqual(StreamRange, undefined);
	});
	it('should have randomBytes', () => {
		notStrictEqual(randomBytes, undefined);
	});
	it('should have statsToEtag', () => {
		notStrictEqual(statsToEtag, undefined);
	});
	it('should have millisecondsToUTCString', () => {
		notStrictEqual(millisecondsToUTCString, undefined);
	});
	it('should have isRangeFresh', () => {
		notStrictEqual(isRangeFresh, undefined);
	});
	it('should have contentRange', () => {
		notStrictEqual(contentRange, undefined);
	});
	it('should have acceptEncodings', () => {
		notStrictEqual(acceptEncodings, undefined);
	});
	it('should have getFreshStatus', () => {
		notStrictEqual(getFreshStatus, undefined);
	});
	it('should have BufferStream', () => {
		notStrictEqual(BufferStream, undefined);
	});
	it('should have MultiStream', () => {
		notStrictEqual(MultiStream, undefined);
	});
	it('should have StorageError', () => {
		notStrictEqual(StorageError, undefined);
	});
	it('should have MethodNotAllowedStorageError', () => {
		notStrictEqual(MethodNotAllowedStorageError, undefined);
	});
	it('should have PreconditionFailedStorageError', () => {
		notStrictEqual(PreconditionFailedStorageError, undefined);
	});
	it('should have RangeNotSatisfiableStorageError', () => {
		notStrictEqual(RangeNotSatisfiableStorageError, undefined);
	});
	it('should have StreamResponse', () => {
		notStrictEqual(StreamResponse, undefined);
	});
	it('should have FileSystemStorageError', () => {
		notStrictEqual(FileSystemStorageError, undefined);
	});
	it('should have MalformedPathError', () => {
		notStrictEqual(MalformedPathError, undefined);
	});
	it('should have NotNormalizedError', () => {
		notStrictEqual(NotNormalizedError, undefined);
	});
	it('should have InvalidPathError', () => {
		notStrictEqual(InvalidPathError, undefined);
	});
	it('should have ConsecutiveSlashesError', () => {
		notStrictEqual(ConsecutiveSlashesError, undefined);
	});
	it('should have IgnoredFileError', () => {
		notStrictEqual(IgnoredFileError, undefined);
	});
	it('should have ForbiddenCharacterError', () => {
		notStrictEqual(ForbiddenCharacterError, undefined);
	});
	it('should have TrailingSlashError', () => {
		notStrictEqual(TrailingSlashError, undefined);
	});
	it('should have IsDirectoryError', () => {
		notStrictEqual(IsDirectoryError, undefined);
	});
	it('should have DoesNotExistError', () => {
		notStrictEqual(DoesNotExistError, undefined);
	});
	it('should have escapeHTMLInPath', () => {
		notStrictEqual(escapeHTMLInPath, undefined);
	});
	it('should have FORBIDDEN_CHARACTERS', () => {
		notStrictEqual(FORBIDDEN_CHARACTERS, undefined);
	});
	it('should have GenericFileSystemStorage', () => {
		notStrictEqual(GenericFileSystemStorage, undefined);
	});
	it('should have FileSystemStorage', () => {
		notStrictEqual(FileSystemStorage, undefined);
	});
});
