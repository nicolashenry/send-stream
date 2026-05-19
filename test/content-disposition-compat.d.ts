import type { CreateOptions } from 'content-disposition';

// Keep @types/koa's legacy `contentDisposition.Options` reference working with content-disposition v2.
declare module 'content-disposition' {
	export type Options = CreateOptions;
}
