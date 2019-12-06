
0.2.0
==================

* Breaking change: storage now takes a range object (which can be undefined) instead of start/end parameter
* File size/modification date/name are now optional in storage result
* 100% code coverage
* All file opening errors are now 404
* A parameter have been added to allow http methods different than GET and HEAD

0.1.1
==================

* Add new linting rules
* Update dependencies

0.1.0
==================

* Remove 1 minute freshness condition
* Add badges in documentation

0.0.11
==================

* Fix some examples
* Enhance code coverage
* Fix minor issues

0.0.10
==================

* Remove max-age on error
* Enhance examples

0.0.9
==================

* Add some documentation on response and errors

0.0.8
==================

* Change fullReponse option to statusCode option
* Add clarification on query params in path
* Enhance mongodb/gridfs example

0.0.7
==================

* Change default charset from utf-8 to UTF-8
* Add public in cache control by default
* Remove options method handling

0.0.6
==================

* Add weakEtags option
* Add path parts documentation
* Add pre compressed example

0.0.5
==================

 * Fix content-encoding when pre-compressed files do not exist
 * Fix crypto warning

0.0.4
==================

 * Keep compatibility with disabled allowSyntheticDefaultImports

0.0.3
==================

 * Relax StreamResponse typings

0.0.2
==================

 * Add fullResponse option

0.0.1
==================

 * First release
