# Changelog

## 2.7.0

* Add support for Node 20
* Drop support for Node 14

## 2.6.0

* Add support for Node 18
* Drop support for Node 12

## 2.5.5

* Fix: while sending treat all errors as premature close errors (fix for NodeJS 17.3.0)

## 2.5.4

* Fix: set more precise optional property types
* Refactor: small enhancements

## 2.5.3

* Fix: add explicit errors for 405/412/416 statuses
* Docs: add CONTRIBUTING.md file
* Docs: add issue / pull request templates
* Docs: enhance examples
* Build: run linting after tests

## 2.5.2

* Fix: differentiate optional properties and undefined properties
* Docs: add LICENCE and CODE_OF_CONDUCT.md file
* Docs: simplify fastify examples
* Docs: add json and buffer examples
* Docs: enhance contentEncodingMappings documentation

## 2.5.1

* Fix: do not log errors coming from dynamic compression pipeline (errors should be managed by the stream itself)
* Bump typescript from 4.2.x to 4.3.x
* Use typescript override keyword and incremental option

## 2.5.0

* Feature: add send method in Storage to send directly a file without having to prepare the response before
* Feature: add dispose method in StreamResponse to dispose stream response resources
* Refactor: rename BufferOrStreamRange as Uint8ArrayOrStreamRange
* Fix: call super._destroy in BufferStream._destroy
* Docs: add better path example
* Docs: add missing ignorePrematureClose documentation
* Docs: add some missing jsdocs
* Docs: enhance doc display

## 2.4.0

* Feature: add abstract class GenericFileSystemStorage as intermediate implementation for file system storage

## 2.3.2

* Docs: Revert use of fastify send in example (not safe to use)
* Docs: Fix onDirectory parameter documentation

## 2.3.1

* Fix: NodeJS 12 sometimes not destroyed

## 2.3.0

* Feature: send method is now returning a promise and is not anymore an event emitter
* Feature: send method have a new option to ignore premature close errors (true by default)
* Test: test all frameworks instead of only koa
* Docs: update/fix examples

## 2.2.0

* Fix: node 15.x on dynamic compression error
* Fix: remove useless destroyed checks
* Refactor: merge EmptyStream into BufferStream
* Refactor: add/update lint rules

## 2.1.0

* Feature: Add dynamicCompressionMinLength option
* Fix: Add missing documentation on `dynamicCompression` and `mimeTypeCompressible`

## 2.0.0

* Breaking change: rename `contentType` prepare option to `mimeType` and `contentTypeCharset` to `mimeTypeCharset`
* Breaking change: rename storage option `defaultContentType` to `defaultMimeType`
* Breaking change: replace `defaultCharsets` and `mimeModule` storage options with `mimeTypeLookup` and
`mimeTypeDefaultCharset` functions
* Breaking change: `contentEncoding` in storage information is now (and needs to be) undefined when identity is used
* Feature: `mime` package is replaced by `mime-types` for charset lookups
* Feature: Add `dynamicCompression` and `mimeTypeCompressible` storage options
* Feature: Add `cacheControl`, `contentDispositionType` and `contentDispositionType` in storage information
* Use fastify v3 in examples
* Use typescript project references
* Bump typescript from 3.9.x to 4.0.x

## 1.1.0

* Feature: Add a way to define ETag and Last-Modified headers directly from the storage

## 1.0.0

* Breaking change: Each error now have a specific class instead of a code
* Breaking change: Encoded path must start with / now
* Breaking change: contentType values are now splitted into contentType (without charset) and contentTypeCharset
* Not normalized paths are now a 404 instead of 301 like other errors (redirects was unsafe depending on use)
* Fix some content encoding edge cases
* Multiple refactoring
* Feature: add onDirectory option
* Feature: storages can now emit contentType/contentTypeCharset values directly

## 0.4.0

* Enhance CI ans tests
* Replace `tslint` with `eslint`
* Enhance documentation and examples
* Change default ignore pattern from `/^\../` to `/^\./`
* Rename error code `forbidden_characters` to `forbidden_character`
* Rename error code `ignored_files` to `ignored_file`
* Restore `malformed_path` error
* Throw `ignored_file` error before `trailing_slash`
* Drop `responseClose` event
* Add textual regexp support in options

## 0.3.0

* Fix multi-range streams on error
* Create multi-range streams when needed only
* Fix mongodb example
* Update dependencies

## 0.2.1

* Remove node 10 support

## 0.2.0

* Breaking change: storage now takes a range object (which can be undefined) instead of start/end parameter
* File size/modification date/name are now optional in storage result
* 100% code coverage
* All file opening errors are now 404
* A parameter have been added to allow http methods different than GET and HEAD

## 0.1.1

* Add new linting rules
* Update dependencies

## 0.1.0

* Remove 1 minute freshness condition
* Add badges in documentation

## 0.0.11

* Fix some examples
* Enhance code coverage
* Fix minor issues

## 0.0.10

* Remove max-age on error
* Enhance examples

## 0.0.9

* Add some documentation on response and errors

## 0.0.8

* Change fullReponse option to statusCode option
* Add clarification on query params in path
* Enhance mongodb/gridfs example

## 0.0.7

* Change default charset from utf-8 to UTF-8
* Add public in cache control by default
* Remove options method handling

## 0.0.6

* Add weakEtags option
* Add path parts documentation
* Add pre compressed example

## 0.0.5

* Fix content-encoding when pre-compressed files do not exist
* Fix crypto warning

## 0.0.4

* Keep compatibility with disabled allowSyntheticDefaultImports

## 0.0.3

* Relax StreamResponse typings

## 0.0.2

* Add fullResponse option

## 0.0.1

* First release
