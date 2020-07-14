
# send-stream

[![NPM](https://img.shields.io/npm/v/send-stream.svg)](https://www.npmjs.com/package/send-stream)
[![Build Status](https://github.com/nicolashenry/send-stream/workflows/CI/badge.svg?branch=master)](https://github.com/nicolashenry/send-stream/actions?query=workflow%3ACI+branch%3Amaster)
[![Coverage Status](https://coveralls.io/repos/github/nicolashenry/send-stream/badge.svg?branch=master)](https://coveralls.io/github/nicolashenry/send-stream?branch=master)

`send-stream` is a library for streaming files from the file system or any other source.

It supports partial responses (Ranges including multipart), conditional-GET negotiation (If-Match, If-Unmodified-Since, If-None-Match, If-Modified-Since) and precompressed content
encoding negociation.

It also have high test coverage, typescript typings
and has [multiple examples](examples/) using Express, Koa, Fastify or pure NodeJS http/http2 modules.

## Installation

This is a [Node.js](https://nodejs.org/en/) module available through the
[npm registry](https://www.npmjs.com/). Installation is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```bash
$ npm install send-stream
```

## Getting start

Serve all files from a directory (also serve index.html from directories on trailing slash) with Fastify, Koa or Express

See [examples](#examples) for more advanced usages.

Using Fastify (v3.x.x):
```js
const path = require('path');
const fastify = require('fastify');
const { FileSystemStorage } = require('send-stream');

const app = fastify();
const storage = new FileSystemStorage(path.join(__dirname, 'assets'), { onDirectory: 'serve-index' });

app.route({
  method: ['HEAD', 'GET'],
  url: '*',
  handler: async ({ raw: req }, { raw: res }) => {
    const result = await storage.prepareResponse(req.url, req);
    result.send(res);
  }
});

app.listen(3000)
  .then(() => {
    console.info('listening on http://localhost:3000');
  });
```

Using Koa (v2.x.x):
```js
const path = require('path');
const Koa = require('koa');
const { FileSystemStorage } = require('send-stream');

const app = new Koa<object>();
const storage = new FileSystemStorage(path.join(__dirname, 'assets'), { onDirectory: 'serve-index' });

app.use(async ctx => {
  let result = await storage.prepareResponse(ctx.request.path, ctx.req);
  ctx.response.status = result.statusCode;
  ctx.response.set(result.headers);
  ctx.body = result.stream;
});

app.listen(3000, () => {
  console.info('listening on http://localhost:3000');
});
```

Using Express (v4.x.x):
```js
const path = require("path");
const express = require("express");
const { FileSystemStorage } = require('send-stream');

const app = express();
const storage = new FileSystemStorage(path.join(__dirname, 'assets'), { onDirectory: 'serve-index' });

app.get('*', async (req, res, next) => {
  try {
    let result = await storage.prepareResponse(req.url, req);
    result.send(res);
  } catch (err) {
    next(err);
  }
});
app.listen(3000, () => {
  console.info('listening on http://localhost:3000');
});
```

## API

### `new FileSystemStorage(root, [options])`

Create a new `FileSystemStorage` which is a stream storage giving access to the files inside the given root folder.

The **`root`** parameter is a the absolute path from which the storage takes the files.

The **`options`** parameter let you add some addition options.

#### Options

##### mimeTypesLookup

In order to return the content type, the storage will try to guess the mime type thanks to the `mime-types` module
(see [mime-types module documentation](https://github.com/broofa/node-mime)).
This option override the mime-types lookup function which will be used for this purpose.

Example:

```js
new FileSystemStorage(
  directory,
  {
    mimeTypesLookup: filename => {
      if (filename.endsWith('.abc')) {
        return 'text/abc';
      }
      return undefined;
    }
  }
)
```

---
##### mimeTypesCharset

In order to return the content type, the storage will try to guess the mime type charset thanks to the `mime-types`
module (see [mime-types module documentation](https://github.com/broofa/node-mime)).
This option override the mime-types charset function which will be used for this purpose.

Example:

```js
new FileSystemStorage(
  directory,
  {
    mimeTypesCharset: mimeType => {
      if (mimeType === 'text/abc') {
        return 'UTF-8';
      }
      return undefined;
    }
  }
)
```

---
##### defaultMimeType

Configures the default content type (without charset) that will be used if the content type is unknown.

`undefined` by default

Example:

```js
new FileSystemStorage(directory, { defaultMimeType: 'application/octet-stream' })
```

---
##### maxRanges

Configure how many ranges can be accessed in one request.

Defaults to `200`

Setting it to `1` will disable multipart/byteranges

Setting it to `0` or less will disable range requests

Example:

```js
new FileSystemStorage(directory, { maxRanges: 10 })
```

---
##### weakEtags

The storage will generate strong etags by default, when set to true the storage will generate weak etags instead.

`false` by default

Example:

```js
new FileSystemStorage(directory, { weakEtags: true })
```

---
##### contentEncodingMappings

Configure content encoding file mappings.

`undefined` by default

Example:

```js
new FileSystemStorage(
  directory,
  {
    contentEncodingMappings: [
      {
        matcher: /^(.+\.(?:html|js|css))$/,
        encodings: [
          { name: 'br', path: '$1.br' },
          { name: 'gzip', path: '$1.gz' }
        ]
      }
    ]
  }
)
```

---
##### ignorePattern

The storage will ignore files which have any parts of the path matching this pattern.

`false` will disable it

Defaults to `/^\./` (files/folders beginning with a dot)

Example:

```js
new FileSystemStorage(directory, { ignorePattern: /^myPrivateFolder$/ })
```

---
##### fsModule

Let you override the `fs` module that will be used to retrieve files.

Example:

```js
const memfs = require('memfs');
memfs.fs.writeFileSync('/hello.txt', 'world');
new FileSystemStorage(directory, { fsModule: memfs })
```
---
##### directory

Determine what should happen on directory requests (trailing slash)
 - `false` to return an error
 - `'list-files'` to list the files of directories
 - `'serve-index'` to serve the index.html file of directories

Default to false

Note that you can customize the html template used for `'list-files'` by overiding `getDirectoryListing` method.

Example:

```js
new FileSystemStorage(directory, { directory: 'list-files' })
```
---

### `storage.prepareResponse(path, req, [options])`

Create asynchronously a new `StreamResponse` for the given path relative to root ready to be sent to a server response.

The **`path`** parameter is a urlencoded path (urlencoded) or an array of path parts (should always start with '').

For example, `'/my%20directory/index.html'` is the equivalent of `['', 'my directory', 'index.html']`.

Query params will be ignored if present.

The **`req`** is the related request, it can be a `http.IncomingMessage` or a `http2.Http2ServerRequest` or a `http2.IncomingHttpHeaders`.

The **`options`** parameter let you add some addition options.

#### Options

##### cacheControl

Custom cache-control header value, overrides storage value (`public, max-age=0` by default)

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { cacheControl: 'public, max-age=31536000' })
```

---
##### lastModified

Custom last-modified header value, overrides storage value (defaults to mtimeMs converted to UTC)

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT' })
```

---
##### etag

Custom etag header value, overrides storage value (defaults to size + mtimeMs + content encoding)

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { etag: '"123"' })
```

---
##### mimeType

Custom mime type for content-type header value, overrides storage value (defaults to storage content type)

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { mimeType: 'text/plain' })
```

---
##### mimeTypeCharset

Custom content-type charset value, overrides storage value (defaults to storage content type charset mapping)

`false` to remove charset

Example:

```js
await storage.prepareResponse(req.url, req, { mimeTypeCharset: 'UTF-8' })
```

---
##### contentDispositionType

Custom content-disposition header type value, overrides storage value

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { contentDispositionType: 'attachment' })
```

---
##### contentDispositionFilename

Custom content-disposition header filename value, overrides storage value

`false` to remove filename from header

Example:

```js
await storage.prepareResponse(req.url, req, { contentDispositionFilename: 'file.txt' })
```

---
##### statusCode

Defines the statusCode that will be used in response (instead of 200/206)
Setting this will disable conditional GET and partial responses

`undefined` by default

Example:

```js
await storage.prepareResponse(req.url, req, { statusCode: 404 })
```

---
##### allowedMethods

By default GET and HEAD are the only allowed http methods, set this parameter to change allowed methods

`['GET', 'HEAD']` by default

Example:

```js
await storage.prepareResponse(req.url, req, { allowedMethods: ['POST'] })
```

---
### `streamResponse.statusCode`

The status code that match the required resource.

For example, it can be 200 if the file is found, 206 for a range request, 404 if the file does not exists, ...

---
### `streamResponse.headers`

The headers that match the required resource.

---
### `streamResponse.error`

If an error occured while reading (e.g. if the file is not found),
a 404 status is returned and this property will contains the error
which have been returned by the storage. See [errors](#errors)

---
### `streamResponse.send(res)`

Send the current response through the response in parameter

The `res` is the related response, it can be a `http.ServerResponse` or a `http2.Http2ServerResponse` or a `http2.ServerHttp2Stream`.

## Errors
---
### `StorageError`

All errors inherits from this one.

The following property is available:
- `reference`: the storage reference linked to the error

---
### `FileSystemStorageError` (extends StorageError)

All errors from FileSystemStorage inherits from this one.

The following additional property is available:
- `pathParts`: the path parts linked to the error

---
### `MalformedPathError` (extends FileSystemStorageError)

The path cannot be parsed for some reason.

---
### `NotNormalizedPathError` (extends FileSystemStorageError)

Storages only accept normalized paths for security reasons.

For example, `'/../index.html'` access will be refused.

The following additional property is available:
- `normalizedPath`: the encoded normalized path (you can redirect to it if you want to)

---
### `ForbiddenCharacterError` (extends FileSystemStorageError)

Storages refuse some forbidden characters like encoded slashes.

---
### `ConsecutiveSlashesError` (extends FileSystemStorageError)

Storages refuse pathes like `'/dir//index.html'` because it should not contain two consecutive slashes.

---
### `TrailingSlashError` (extends FileSystemStorageError)

Storages refuse pathes like `'/dir/'` because it is probably pointing to a directory.

---
### `IgnoredFileError` (extends FileSystemStorageError)

Storages can ignore some files/folders composing the path (see [ignorePattern](#ignorePattern)).

---
### `IsDirectoryError` (extends FileSystemStorageError)

Storages refuse pathes matching directories.

The following additional property is available:
- `resolvedPath`: the resolved file system path

---
### `DoesNotExistError` (extends FileSystemStorageError)

When the file can not be found.


The following additional property is available:
- `resolvedPath`: the resolved file system path

---
## Examples

See [examples](./examples) folder in this repository for full examples

### Serve files

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse(req.url, req);
result.send(res);
```

### Serve files with directory index.html

```js
const storage = new FileSystemStorage(directory, { onDirectory: 'serve-index' });

...

let result = await storage.prepareResponse(req.url, req);
result.send(res);
```

### Serve files with directory listing

```js
const storage = new FileSystemStorage(directory, { onDirectory: 'list-files' });

...

let result = await storage.prepareResponse(req.url, req);
result.send(res);
```

### Serve files and add CORS headers 

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse(req.url, req);
result.headers['Access-Control-Allow-Origin'] = '*';
result.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Range';
result.send(res);
```

### Serve one file specifically

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse('/index.html', req);
result.send(res);
```

### Serve index.html instead of 404 for history.pushState applications

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse(req.url, req);
// if path is not found then rewrite to root index.html
if (result.error instanceof FileSystemStorageError) {
  result = await storage.prepareResponse('/index.html', req);
}
result.send(res);
```

### Serve files and add CSP (Content-Security-Policy) header when content is html

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse(req.url, req);
if (result.storageInfo?.mimeType === 'text/html') {
  result.headers['Content-Security-Policy'] = "script-src 'self'";
  // you can also add some other security headers:
  // result.headers['X-Frame-Options'] = "SAMEORIGIN";
  // result.headers['Referrer-Policy'] = "no-referrer";
  // result.headers['Feature-Policy'] = "...";
}
result.send(res);
```

## License

[MIT](LICENSE)
