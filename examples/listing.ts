
// tslint:disable-next-line:no-implicit-dependencies
import express from 'express';
import { join } from 'path';
import fs from 'fs';
import util from 'util';

import { FileSystemStorage, FileSystemStorageError } from '../lib';

const app = express();

const storage = new FileSystemStorage(join(__dirname, 'assets'));

app.get('*', async (req, res, next) => {
	try {
		const result = await storage.prepareResponse(req.url, req);
		if (result.error && result.error instanceof FileSystemStorageError && result.error.code === 'trailing_slash') {
			result.stream.destroy();
			const pathParts = result.error.pathParts;
			let files;
			try {
				files = await util.promisify(fs.readdir)(join(storage.root, ...pathParts), { withFileTypes: true });
			} catch (err) {
				if ((<NodeJS.ErrnoException> err).code === 'ENOENT') {
					next();
				} else {
					next(err);
				}
				return;
			}

			const display = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '/';

			let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${ display }</title>`;
			html += '<meta name="viewport" content="width=device-width"></head>';
			html += `<body><h1>Directory: /${ pathParts.join('/') }</h1><ul>`;

			if (pathParts.length > 1) {
				html += '<li><a href="..">..</a></li>';
			}

			for (const file of files) {
				const ignorePattern = storage.ignorePattern;
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
		next(err);
	}
});

app.listen(3000, () => {
	console.info('listening on http://localhost:3000');
});
