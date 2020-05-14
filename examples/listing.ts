
import { join } from 'path';
import * as fs from 'fs';
import * as util from 'util';

import express from 'express';

import { FileSystemStorage, FileSystemStorageError } from '../src/send-stream';

const readdir = util.promisify(fs.readdir);

const app = express();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.get('*', async (req, res, next) => {
	try {
		const result = await storage.prepareResponse(req.url, req);
		// if the path is not found and the reason is a trailing slash then try to load files in folder
		if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
			const { error: { pathParts } } = result;
			let files;
			try {
				files = await readdir(join(storage.root, ...pathParts), { withFileTypes: true });
			} catch (err) {
				if ((<NodeJS.ErrnoException> err).code !== 'ENOENT') {
					console.error(err);
				}
				// return the original error
				result.send(res);
				return;
			}
			result.stream.destroy();

			const display = pathParts.length > 2 ? pathParts[pathParts.length - 2] : '/';

			let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${ display }</title>`;
			html += '<meta name="viewport" content="width=device-width"></head>';
			html += `<body><h1>Directory: ${ pathParts.join('/') }</h1><ul>`;

			if (pathParts.length > 2) {
				html += '<li><a href="..">..</a></li>';
			}

			for (const file of files) {
				const { ignorePattern } = storage;
				if (ignorePattern && ignorePattern.test(file.name)) {
					continue;
				}
				const filename = file.name + (file.isDirectory() ? '/' : '');
				html += `<li><a href="./${ filename }">${ filename }</a></li>`;
			}

			html += '</ul></body></html>';

			res.setHeader('Cache-Control', 'max-age=0');
			res.send(html);
			return;
		}
		result.send(res);
	} catch (err) {
		// eslint-disable-next-line node/callback-return
		next(err);
	}
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
