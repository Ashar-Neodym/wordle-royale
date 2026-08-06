# Third-party Practice word list attribution

The generated Practice guess list at
`apps/web/src/lib/generated/practice-five-letter-words.ts` is derived from
[`an-array-of-english-words` version 2.0.0](https://www.npmjs.com/package/an-array-of-english-words/v/2.0.0),
which in turn documents that it is derived from the Letterpress word list. The
source package is used only to generate the checked-in static five-letter list;
it is not an application dependency and no runtime network request is made.

Pinned npm package integrity:

```text
sha512-FXnNvZSOI27kkKXeLSquhaTGP7z198UOQ4txaYO9fCfrjCh+D5SV7G7XqzEH0229+pAi4cjBEZ4WIQYgjKtO7Q==
```

To reproduce after explicitly acquiring and extracting that exact package:

```sh
node apps/web/scripts/generate-practice-word-list.mjs /path/to/extracted/an-array-of-english-words-2.0.0
```

The generator does not access the network. It verifies the package name,
version, MIT declaration, source-list SHA-256, and license SHA-256 before
writing normalized, unique, lowercase ASCII words of exactly five letters in
sorted order.

## MIT License from `an-array-of-english-words@2.0.0`

Copyright (c) 2014 Zeke Sikelianos <zeke@sikelianos.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
