import type { CreateOptions } from 'content-disposition';

declare module 'content-disposition' {
	export type Options = CreateOptions;
}
