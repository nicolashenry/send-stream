
# send-stream

`send-stream` is a library for streaming files from the file system or any other source.

It supports partial responses (Ranges including multipart) and conditional-GET negotiation (If-Match, If-Unmodified-Since, If-None-Match, If-Modified-Since).

It also have high test coverage, typescript typings
and has multiple examples using Express, Koa, Fastify or pure NodeJS http/http2 modules.

## Installation

This is a [Node.js](https://nodejs.org/en/) module available through the
[npm registry](https://www.npmjs.com/). Installation is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```bash
$ npm install send-stream
```

## Getting start using express

Serve all files from a directory

```js
const { FileSystemStorage } = require('send-stream');

const express = require('express');
const app = express();

// create new storage
const storage = new FileSystemStorage(__dirname);

app.get('*', async (req, res, next) => {
    try {
        // prepare response from url path and transfert it to response
        (await storage.prepareResponse(req.url, req)).send(res);
    }
    catch (err) {
        next(err);
    }
});
app.listen(3000, () => {
    console.info('listening on http://localhost:3000');
});
```

See [examples](#examples) part for more advanced usages

## API

### new FileSystemStorage(root, [options])

Create a new `FileSystemStorage` which is a stream storage giving access to the files inside the given root folder.

The `root` parameter is a the absolute path from which the storage takes the files.

The `options` parameter let you add some addition options.

#### Options

##### mimeModule

In order to return the content type, the storage will try to guess the content type thanks to the `mime` module.
This option override the mime module instance which will be used for this purpose.

##### defaultContentType

Configures the default content type that will be used if the content type is unknown.

`undefined` by default

##### defaultCharsets

Configures the default charset that will be appended to the content type header.

`false` will disable it

The default is `[{ matcher: /^(?:text\/.+|application\/(?:javascript|json))$/, charset: 'utf-8' }]`

##### maxRanges

Configure how many ranges can be accessed in one request.

Defaults to `200`

Setting it to `1` will disable multipart/byteranges

Setting it to `0` or less will disable range requests

##### contentEncodingMappings

Configure content encoding file mappings, e.g. `[{ matcher: /^(.+\\.json)$/, encodings: [{ name: 'gzip', path: '$1.gz' }] }]`

`undefined` by default

##### ignorePattern

The storage will ignore files which have any parts of the path matching this pattern.

`false` will disable it

Defaults to `/^\../` (files/folders beginning with a dot)

##### fsModule

Let you override the `fs` module that will be used to retrieve files.

### storage.prepareResponse(path, req, [options])

Create asynchronously a new `StreamResponse` for the given path relative to root ready to be sent to a server response.

The `path` parameter is a urlencoded path (urlencoded) or an array of path parts.

The `req` is the related request, it can be a `http.IncomingMessage` or a `http2.Http2ServerRequest` or a `http2.IncomingHttpHeaders`.

The `options` parameter let you add some addition options.

#### Options

##### cacheControl

Custom cache-control header value, overrides storage value

`false` to remove header

##### lastModified

Custom last-modified header value, overrides storage value

`false` to remove header

##### etag

Custom etag header value, overrides storage value

`false` to remove header

##### contentType

Custom content-type header value, overrides storage value

`false` to remove header

##### contentDispositionType

Custom content-disposition header type value, overrides storage value

`false` to remove header

##### contentDispositionFilename

Custom content-disposition header filename value, overrides storage value

`false` to remove filename from header

### streamResponse.send(res)

Send the current response through the given response

The `res` is the related response, it can be a `http.ServerResponse` or a `http2.Http2ServerResponse` or a `http2.ServerHttp2Stream`.

## Examples

See `examples/` folder in this repository for full examples

### Directory index.html

```js
let result = (await storage.prepareResponse(req.url, req));
const error = result.error;
// instead of returning 404 on trailing slash
// search for index.html using the same path
if (
  error
  && error instanceof FileSystemStorageError
  && error.code === 'trailing_slash'
) {
  result.stream.destroy();
  result = await storage.prepareResponse(
    [...error.pathParts.slice(0, -1), 'index.html'],
    req
  );
}
result.send(res);
```

### Custom directory index listing files

```js
const { join } = require('path');
const fs = require('fs');
const util = require('util');

const result = await storage.prepareResponse(req.url, req);
if (
  result.error
  && result.error instanceof FileSystemStorageError
  && result.error.code === 'trailing_slash'
) {
  result.stream.destroy();
  const pathParts = result.error.pathParts;
  let files;
  try {
    files = await util.promisify(fs.readdir)(
      join(storage.root, ...pathParts),
      { withFileTypes: true }
    );
  } catch (err) {
    if (err.code === 'ENOENT') {
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
```

### pushState index.html

```js
const { extname } = require('path');

let result = await storage.prepareResponse(req.url, req);
const error = result.error;
// instead of returning 404 on error
// search for index.html in root unless path has extension
if (
  error
  && error instanceof FileSystemStorageError
  && (
    error.pathParts.length === 0
    || extname(error.pathParts[error.pathParts.length - 1]) === ''
  )
) {
  result.stream.destroy();
  result = await storage.prepareResponse(['index.html'], req);
}
result.send(res);
```

## License

[MIT](LICENSE)
