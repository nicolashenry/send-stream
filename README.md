
# send-stream

[![NPM](https://img.shields.io/npm/v/send-stream.svg)](https://www.npmjs.com/package/send-stream)
[![Build Status](https://github.com/nicolashenry/send-stream/workflows/CI/badge.svg?branch=master)](https://github.com/nicolashenry/send-stream/actions?query=workflow%3ACI+branch%3Amaster)
[![Coverage Status](https://codecov.io/gh/nicolashenry/send-stream/branch/master/graph/badge.svg?token=qR0aX2U7oM)](https://codecov.io/gh/nicolashenry/send-stream)

`send-stream` is a library for streaming files from the [file system](#getting-start) or any [other source of data](#other-source-of-data).

It supports partial responses (Ranges including multipart), conditional-GET negotiation (If-Match, If-Unmodified-Since, If-None-Match, If-Modified-Since) and precompressed content
encoding negociation.

It also have high test coverage, typescript typings
and has [multiple examples](examples/) using Fastify, Koa, Express or pure NodeJS http/http2 modules.

## Installation

This is a [Node.js](https://nodejs.org/en/) module available through the
[npm registry](https://www.npmjs.com/). Installation is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```bash
npm install send-stream
```

## Getting start

Serve all files from a directory (also serve index.html from directories on trailing slash) with Fastify, Koa or Express

See [examples](#examples) for more advanced usages.

Using Fastify (v3.x.x):

```js
const path = require('path');
const fastify = require('fastify');
const { FileSystemStorage } = require('send-stream');

const app = fastify({ exposeHeadRoutes: true });
const storage = new FileSystemStorage(path.join(__dirname, 'assets'), { onDirectory: 'serve-index' });

app.get('*', async (request, reply) => {
  const result = await storage.prepareResponse(request.url, request.raw);
  if (result.statusCode === 404) {
    reply.callNotFound(); // let fastify handle 404
    return;
  }
  await result.send(reply.raw);
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

const app = new Koa();
const storage = new FileSystemStorage(path.join(__dirname, 'assets'), { onDirectory: 'serve-index' });

app.use(async (ctx, next) => {
  let result = await storage.prepareResponse(ctx.request.path, ctx.req);
  if (result.statusCode === 404) {
    await next(); // let koa handle 404
    return;
  }
  ctx.status = result.statusCode;
  ctx.set(result.headers);
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
    if (result.statusCode === 404) {
      next(); // let express handle 404
      return;
    }
    await result.send(res);
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

- The **`root`** parameter is a the absolute path from which the storage takes the files.

- The **`options`** parameter let you add some addition options:

#### **mimeTypeLookup**

In order to return the content type, the storage will try to guess the mime type thanks to the `mime-types` module
(see [mime-types module documentation](https://github.com/broofa/node-mime)).
This option override the mime-types lookup function which will be used for this purpose.

Example:

```js
new FileSystemStorage(
  directory,
  {
    mimeTypeLookup: filename => {
      if (filename.endsWith('.abc')) {
        return 'text/abc';
      }
      return undefined;
    }
  }
)
```

#### **mimeTypeDefaultCharset**

In order to return the content type, the storage will try to guess the mime type charset thanks to the `mime-types`
module (see [mime-types module documentation](https://github.com/broofa/node-mime)).
This option override the mime-types charset function which will be used for this purpose.

Example:

```js
new FileSystemStorage(
  directory,
  {
    mimeTypeDefaultCharset: mimeType => {
      if (mimeType === 'text/abc') {
        return 'UTF-8';
      }
      return undefined;
    }
  }
)
```

#### **dynamicCompression**

Enable dynamic compression of file content.
This can be a boolean or a list of encodings ordered by priority, `['br', 'gzip']` if `true` is used.
Activating this option will automatically compress content as brotli or gzip
if the content is detected as compressible and supported by the client.

Note that this is highly recommended to use this option only if you can not use pre-compressed files with
the [contentEncodingMappings](#contentencodingmappings) option.

Also when dynamic compression is active, `Content-Length` header will be removed
and range requests will be disabled as content length is unknown

Defaults to `false`

Example:

```js
new FileSystemStorage(
  directory,
  {
    dynamicCompression: true
  }
)
```

#### **mimeTypeCompressible**

Function used to determine if a type is compressible (for dynamic compression only)
`compressible` module will be used by default

Example:

```js
new FileSystemStorage(
  directory,
  {
    dynamicCompression: true,
    mimeTypeCompressible: mimeType => mimeType === 'text/plain'
  }
)
```

#### **dynamicCompressionMinLength**

Sets the minimum length of a response that will be dynamically compressed (only when the length is known)

Defaults to 20

Example:

```js
new FileSystemStorage(
  directory,
  {
    dynamicCompression: true,
    dynamicCompressionMinLength: 100
  }
)
```

#### **defaultMimeType**

Configures the default content type (without charset) that will be used if the content type is unknown.

`undefined` by default

Example:

```js
new FileSystemStorage(directory, { defaultMimeType: 'application/octet-stream' })
```

#### **maxRanges**

Configure how many ranges can be accessed in one request.

Defaults to `200`

Setting it to `1` will disable multipart/byteranges

Setting it to `0` or less will disable range requests

Example:

```js
new FileSystemStorage(directory, { maxRanges: 10 })
```

#### **weakEtags**

The storage will generate strong etags by default, when set to true the storage will generate weak etags instead.

`false` by default

Example:

```js
new FileSystemStorage(directory, { weakEtags: true })
```

#### **contentEncodingMappings**

Configure content encoding file mappings.

You can use this option to serve pre-compressed files.
(see this [this example](./examples/pre-compressed.ts) to precompress files with NodeJS)

This is a list of objects containing the following properties:
- `matcher`: a regular expression used to detect which files have a pre-compressed version
- `encodings`: a list of objets with a `name` property which is the encoding name and `path` property
which is a string (or function returning a string) containing the path of the compressed file 
(the regular expression groups from `matcher` will be replaced in the string).

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

#### **ignorePattern**

The storage will ignore files which have any parts of the path matching this pattern.

`false` will disable it

Defaults to `/^\./` (files/folders beginning with a dot)

Example:

```js
new FileSystemStorage(directory, { ignorePattern: /^myPrivateFolder$/ })
```

#### **fsModule**

Let you override the `fs` module that will be used to retrieve files.

Example:

```js
const memfs = require('memfs');
memfs.fs.writeFileSync('/hello.txt', 'world');
new FileSystemStorage(directory, { fsModule: memfs })
```

#### **onDirectory**

Determine what should happen on directory requests (trailing slash)

- `false` to return an error
- `'list-files'` to list the files of directories
- `'serve-index'` to serve the index.html file of directories

Defaults to false

Note that you can customize the html template used for `'list-files'` by overiding `getDirectoryListing` method.

Example:

```js
new FileSystemStorage(directory, { onDirectory: 'list-files' })
```

---

### `storage.prepareResponse(path, req, [options])`

Create asynchronously a new `StreamResponse` for the given path relative to root ready to be sent to a server response.

Note that you can use `storage.send(path, req, res, [options])` instead if you don't need to treat the response before sending.

- The **`path`** parameter is a urlencoded path (urlencoded) or an array of path parts (should always start with '').

  Query params will be ignored if present.

  For example, `'/my%20directory/index.html?param=value'` is the equivalent of `['', 'my directory', 'index.html']`.

- The **`req`** is the related request, it can be a `http.IncomingMessage` or a `http2.Http2ServerRequest` or a `http2.IncomingHttpHeaders`.

- The **`options`** parameter let you add some addition options:

#### **cacheControl**

Custom cache-control header value, overrides storage value (`public, max-age=0` by default)

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { cacheControl: 'public, max-age=31536000' })
```

#### **lastModified**

Custom last-modified header value, overrides storage value (defaults to mtimeMs converted to UTC)

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT' })
```

#### **etag**

Custom etag header value, overrides storage value (defaults to size + mtimeMs + content encoding)

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { etag: '"123"' })
```

#### **mimeType**

Custom mime type for content-type header value, overrides storage value (defaults to storage content type)

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { mimeType: 'text/plain' })
```

#### **mimeTypeCharset**

Custom content-type charset value, overrides storage value (defaults to storage content type charset mapping)

`false` to remove charset

Example:

```js
await storage.prepareResponse(req.url, req, { mimeTypeCharset: 'UTF-8' })
```

#### **contentDispositionType**

Custom content-disposition header type value, overrides storage value

`false` to remove header

Example:

```js
await storage.prepareResponse(req.url, req, { contentDispositionType: 'attachment' })
```

#### **contentDispositionFilename**

Custom content-disposition header filename value, overrides storage value

`false` to remove filename from header

Example:

```js
await storage.prepareResponse(req.url, req, { contentDispositionFilename: 'file.txt' })
```

#### **statusCode**

Defines the statusCode that will be used in response (instead of 200/206)
Setting this will disable conditional GET and partial responses

`undefined` by default

Example:

```js
await storage.prepareResponse(req.url, req, { statusCode: 404 })
```

#### **allowedMethods**

By default GET and HEAD are the only allowed http methods, set this parameter to change allowed methods

`['GET', 'HEAD']` by default

Example:

```js
await storage.prepareResponse(req.url, req, { allowedMethods: ['POST'] })
```

---

### `storage.send(path, req, res, [options])`

The parameters are the same as for `storage.prepareResponse(path, req, [options])` and `streamResponse.send(res, [options])`
and the result is the same as if you call the two methods consecutively.

You may prefer to use this method if you don't need to use the stream response.

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

### `streamResponse.send(res, [options])`

Send the current response through the response in parameter

- The **`res`** parameter is the related response, it can be a `http.ServerResponse` or a `http2.Http2ServerResponse` or a `http2.ServerHttp2Stream`.

- The **`options`** parameter let you add some addition options:

#### **ignorePrematureClose**

Ignore premature close errors

---

### `streamResponse.dispose()`

Disposes of resources within the stream response object

---

## Errors

### `StorageError`

All errors inherits from this one.

The following property is available:

- `reference`: the storage reference linked to the error

---

### `MethodNotAllowedStorageError` (extends StorageError)

The HTTP method is not allowed (405 HTTP code)

---

### `PreconditionFailedStorageError` (extends StorageError)

The precondition set in headers have failed (412 HTTP code)

---

### `RangeNotSatisfiableStorageError` (extends StorageError)

The ranges set in headers are not statisfiable (416 HTTP code)

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

Storages can ignore some files/folders composing the path (see [ignorePattern](#ignorepattern)).

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

## Other source of data

You can extend the class `Storage` if you want to stream files from something else than the file system.
Take a look at [this MongoDB/GridFS storage example](./examples/mongodb-gridfs.ts) to have an example.

You can also take a look to this [this Buffer storage example](./examples/buffer.ts) or
[this JSON storage example](./examples/json.ts) to serve data directly from your current route.

If you want to implement something nearer from file system you can also take a look at the `GenericFileSystemStorage`
class. Take a look at [this memory cache storage example](./examples/memory-cache.ts) to have an example.

---

## Examples

See [examples](./examples) folder in this repository for full examples

### [Serve files](./examples/fastify-http.ts)

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse(req.url, req);
await result.send(res);
```

### [Serve files with directory index.html](./examples/serve-indexes.ts)

```js
const storage = new FileSystemStorage(directory, { onDirectory: 'serve-index' });

...

let result = await storage.prepareResponse(req.url, req);
await result.send(res);
```

### [Serve files with directory listing](./examples/directory-listing.ts)

```js
const storage = new FileSystemStorage(directory, { onDirectory: 'list-files' });

...

let result = await storage.prepareResponse(req.url, req);
await result.send(res);
```

### Serve files and add CORS headers

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse(req.url, req);
result.headers['Access-Control-Allow-Origin'] = '*';
result.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Range';
await result.send(res);
```

### Serve one file specifically

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse('/index.html', req);
await result.send(res);
```

### [Serve index.html instead of 404 for history.pushState applications](./examples/pushstate-server.ts)

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse(req.url, req);
// if path is not found then rewrite to root index.html
if (result.error instanceof FileSystemStorageError) {
  result = await storage.prepareResponse('/index.html', req);
}
await result.send(res);
```

### Serve files and add CSP (Content-Security-Policy) header when content is html

```js
const storage = new FileSystemStorage(directory);

...

let result = await storage.prepareResponse(req.url, req);
if (!result.error && result.storageInfo?.mimeType === 'text/html') {
  result.headers['Content-Security-Policy'] = "script-src 'self'";
  // you can also add some other security headers:
  // result.headers['X-Frame-Options'] = "SAMEORIGIN";
  // result.headers['Referrer-Policy'] = "no-referrer";
  // result.headers['Feature-Policy'] = "...";
}
await result.send(res);
```

## License

[MIT](LICENSE)
