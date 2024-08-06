/**
 * This file is an example of file precompressing to use with ./pre-compressed.ts example
 */

import fs from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const promisifiedStreamPipeline = promisify(pipeline);

async function precompressWithGzipAndBrotli(directoryPath: string) {
	const directoryFiles = await fs.promises.readdir(directoryPath, { withFileTypes: true });
	await Promise.all(directoryFiles.map(async filename => {
		const filepath = join(directoryPath, filename.name);
		const stat = await fs.promises.stat(filepath);
		if (stat.isDirectory()) {
			await precompressWithGzipAndBrotli(filepath);
			return;
		}
		if (
			!stat.isFile()
			|| (
				!filename.name.endsWith('.js')
				&& !filename.name.endsWith('.css')
				&& !filename.name.endsWith('.html')
			)
		) {
			return;
		}
		const gzip = zlib.createGzip({
			level: zlib.constants.Z_BEST_COMPRESSION,
		});
		const gzWriteStream = fs.createWriteStream(`${ filepath }.gz`);
		const br = zlib.createBrotliCompress({ params: {
			[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			[zlib.constants.BROTLI_PARAM_SIZE_HINT]: stat.size,
			[zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
		} });
		const brWriteStream = fs.createWriteStream(`${ filepath }.br`);
		await Promise.all([
			promisifiedStreamPipeline(fs.createReadStream(filepath), gzip, gzWriteStream),
			promisifiedStreamPipeline(fs.createReadStream(filepath), br, brWriteStream),
		]);
	}));
}

precompressWithGzipAndBrotli(join(__dirname, 'assets'))
	.then(() => {
		console.info('files have been precompressed');
	})
	.catch((err: unknown) => {
		console.error('error:', err);
	});
