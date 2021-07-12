import fs from 'fs';
import zlib from 'zlib';
import stream from 'stream';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleEvent(resolve: () => void, reject: (err: any) => void) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (err: any) => {
		if (err) {
			reject(err);
		} else {
			resolve();
		}
	};
}

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
		const fileContents = fs.createReadStream(filepath);
		const zip = zlib.createGzip({
			level: zlib.constants.Z_BEST_COMPRESSION,
		});
		const gzipCopy = new stream.PassThrough();
		fileContents.pipe(gzipCopy);
		const gzWriteStream = fs.createWriteStream(`${ filepath }.gz`);
		const br = zlib.createBrotliCompress({ params: {
			[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			[zlib.constants.BROTLI_PARAM_SIZE_HINT]: stat.size,
			[zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
		} });
		const brCopy = new stream.PassThrough();
		fileContents.pipe(brCopy);
		const brWriteStream = fs.createWriteStream(`${ filepath }.br`);
		await Promise.all([
			new Promise<void>((resolve, reject) => {
				gzipCopy.pipe(zip).pipe(gzWriteStream)
					.on('finish', handleEvent(resolve, reject));
			}),
			new Promise<void>((resolve, reject) => {
				brCopy.pipe(br).pipe(brWriteStream)
					.on('finish', handleEvent(resolve, reject));
			}),
		]);
	}));
}

precompressWithGzipAndBrotli(join(dirname(fileURLToPath(import.meta.url)), 'assets'))
	.then(() => {
		console.info('files have been precompressed');
	})
	.catch(err => {
		console.error(err);
	});
