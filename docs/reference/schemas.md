---
title: JSON Schemas
description: Public schema URLs, package imports, offline registration, generated types, and compatibility.
---

# JSON Schemas

The shipped JSON Schemas are available both from the package and at stable public URLs:

```text
https://scrollcase.dev/schema/v3/target.schema.json
https://scrollcase.dev/schema/v3/scroll.schema.json
https://scrollcase.dev/schema/v3/box-manifest.schema.json
https://scrollcase.dev/schema/v3/release-manifest.schema.json
https://scrollcase.dev/schema/v3/channel-manifest.schema.json
https://scrollcase.dev/schema/v3/revocations-manifest.schema.json
https://scrollcase.dev/schema/v3/signed-document.schema.json
```

The documentation build fails unless these public files are byte-identical to
`src/contract/schema/`, so the npm package remains the single source.

## Package imports

Node can import an individual schema through the package export:

```js
import scrollSchema from 'scrollcase/contract/schema/scroll.schema.json'
  with { type: 'json' };
```

Or resolve a shipped file without relying on JSON module syntax:

```js
import { readFile } from 'node:fs/promises';
import { schemaUrl } from 'scrollcase/contract';

const scrollSchema = JSON.parse(await readFile(schemaUrl('scroll'), 'utf8'));
```

## Offline validation

Absolute `$id` and `$ref` values identify the same schemas whether validation is online or offline.
An offline validator must register every referenced document locally under its published `$id`;
it must not fetch the network during validation.

```js
import Ajv2020 from 'ajv/dist/2020.js';
import targetSchema from 'scrollcase/contract/schema/target.schema.json'
  with { type: 'json' };
import scrollSchema from 'scrollcase/contract/schema/scroll.schema.json'
  with { type: 'json' };

const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(targetSchema);
const validateScroll = ajv.compile(scrollSchema);

if (!validateScroll(scroll)) throw new Error(ajv.errorsText(validateScroll.errors));
```

Register `release-manifest.schema.json` before `box-manifest.schema.json`, because the latter
references the release provenance definition. Fragment references after `#` resolve inside the
registered document.

## Generated TypeScript types

`scrollcase/contract/types` contains declarations generated from these schemas. Contributors run:

```sh
npm run types
npm test
```

Never hand-edit `src/contract/types/index.d.ts`; the drift test checks the generated output.

## Compatibility

All active schemas describe `schemaVersion: 3`, and are published under `/schema/v3/`. A v3 verifier
refuses a v1 or a v2 document **by name** rather than reinterpreting it: they are different
artefacts with different rebuilds ahead of them. Target IDs, document-kind strings, payload
encoding, signature algorithm and golden fixtures never change silently at an existing `$id`; a
breaking change gets a new schema version instead.

### Version 2 is still readable

The version 2 schemas remain served, verbatim, at
[`/schema/v2/`](https://scrollcase.dev/schema/v2/scroll.schema.json). Every scroll, release and box
built under version 2 carries one of those URLs in its own `$schema`, and an `$id` that stopped
resolving would break editor validation and any tool that dereferences it. "Immutable" is a promise
about the artefacts as much as about the format.

They are frozen: nothing generates or checks them, because there is nothing left to keep them in
step with. They are not an alternative to build against — a version 2 box is rebuilt from its scroll
under version 3 — and for that reason `/.well-known/api-catalog` lists version 3 only.
