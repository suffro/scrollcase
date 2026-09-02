---
title: Migrating from v2 to v3
description: Every version 2 field, flag and document field, and what it becomes in version 3.
---

# Migrating from v2 to v3

Version 3 is a clean break, and the only one planned. There is no dual-read path and no migration
tool: **a box is rebuilt from its scroll**. Migrating therefore means editing one `scroll.json` per
box, running `scrollcase build` again, and publishing the result — the work is in the scroll, and
this page is the whole of it.

Everything below is a mapping. Nothing was renamed for tidiness; the reasoning behind each change is
in [what version 3 changed](/reference/box-format#what-version-3-changed) and, at length, in
[design decisions](/concepts/design-decisions).

## What does not migrate

**A published v2 box stays a v2 box.** Version 3 refuses one by name rather than reinterpreting it:

```text
Unsupported schemaVersion 2; rebuild this box with Scrollcase v3.
```

A v1 box is refused the same way, naming version 1. Whoever holds either is entitled to know which
rebuild is ahead of them, which is why neither is guessed at. If you need to keep reading an old
box rather than rebuilding it, keep the Scrollcase version that produced it — the
[version 2 documentation](/v2/) stays published for exactly that reason.

**Your signing keys carry over untouched.** The envelope changed only in its `schemaVersion`: the
payload encoding is still `base64-json-utf8`, the signature algorithm is still `ed25519`, and the
`kind` strings are still `<namespace>.release`, `.channel` and `.revocations` under the namespace
your project already publishes. There is no key rotation implied by this upgrade, and
`keygen --force` is never part of one — it would silently invalidate every document the old key
signed. See [signing and key custody](/guides/signing-and-custody).

**`payload-digest.v1` is untouched**, so an extracted v2 installation still identifies itself the
same way.

## The scroll, field by field

| Version 2 | Version 3 | Notes |
| --- | --- | --- |
| `pythonVersion` | `runtime.version` | Inside the new required `runtime` block |
| `pythonEntryPoint` | `runtime.entryPoint` | Still derived when omitted, still checked against the target when declared. Absent for `native`, which has no interpreter, and **declaring one there is refused** rather than ignored |
| — | `runtime.id` | New and required: `python`, `node` or `native`. A v2 scroll becomes `"id": "python"`. A version 2 box said *where its Python was* and never *that it was Python*, so a reader had to infer the runtime from the shape of a path |
| `modelId` (required) | `labels`, optional | Free-form and never read by Scrollcase. `"modelId": "example-org/m"` becomes `"labels": { "model": "example-org/m" }`, or nothing at all — both were required and neither was ever read by any code path, so a box packaging a library still had to name a model |
| `runtimeId` (required) | `labels`, optional | Same. It never named a runtime in the version 3 sense — that is `runtime.id` |
| `modelCacheSubdir` | `cacheSubdir` | Same meaning, same default shape (`cache/<boxId>`). The directory holds whatever the box's large files are, which need not be a model |
| `assetBaseUrl` | `publishBaseUrl`, and now optional | Renamed for what it does: it never touched an asset, only the two links between the signed documents. See [`publishBaseUrl`](/reference/scroll#publishbaseurl) |
| `weights: "embed"` | nothing — `embed` defaults to `true` | Delete the field |
| `weights: "on-demand"` | `"embed": false` on **each** asset entry | Per entry now, so one box may embed a small entry point and defer a large dataset — the case the box-wide switch existed for and could not serve |
| `selfTest.pythonCode` | `selfTest.code` | Extra source in the runtime's own language, still builder-only |
| `selfTest.pythonFile` | `selfTest.script` | Still a project path, still read at build time |
| `selfTest.imports` | `selfTest.imports` | Unchanged in the scroll — but see below, it is the *signed* subset that was renamed |
| `execution.kind: python-script` / `python-module` | unchanged | Joined by `node-script` and `native-binary` |

Everything not listed is unchanged: `boxId`, `scrollId`, `scrollVersion`, `version`,
`sourceRevision`, `target`, `compatibility`, `environment`, `assetArchives`, `prunePaths`,
`uncompressedPaths`, `pixiVersion`, `parity`, `condaDependencyLicenseAudit`, `extends`, and every
existing field of an `assets[]`, `localFiles[]` or `execution` entry. The three collections gained
fields rather than losing any: `embed` and `executable` on an asset, `executable` on a local file,
and two more `execution.kind` values.

Two removals with no replacement, because the case they existed for became impossible rather than
renamed:

- **`assetArchives` has no `embed`.** An archive is expanded at build time, so deferring one would
  name nothing that could happen. Version 2 refused that combination across fields; version 3 cannot
  express it.
- **`--weights` is gone from the CLI**, not renamed. See the flag table below.

## The signed documents

These are what a build emits, not what you write — they are here so a consumer reading a release
manifest or a `box.json` knows what moved. The two carry the same fields under the same names and
changed together; only the release has an `archive` block.

| Version 2 | Version 3 | Notes |
| --- | --- | --- |
| `pythonEntryPoint` | `runtime.entryPoint` | Inside `runtime`, beside `id` and `version` |
| `modelId`, `runtimeId` | `labels` | Optional, free-form, carried through untouched |
| `modelCacheSubdir` | `cacheSubdir` | |
| `weights` | `assets[].embed` | A deferred asset carries its descriptor in the release, exactly as before |
| `selfTest.pythonImports` | `selfTest.probe.imports` | `selfTest.probe` carries `imports`, `commands`, or both. The old name put Python syntax in the wire format and gave a runtime with no module system no way to state a check at all |
| — | `selfTest.probe.commands` | New: invocations of the box's own declared execution, each with the exit status it must produce. The only probe shape a `native` box can answer |
| `provenance.pythonVersion` | `provenance.runtimeVersion` | May be absent, for a runtime with no version to record |
| `archive.url` (required) | `archive.url` (optional) | See below |
| — | `bundledLicenses` | See below |

Every schema `$id` and `$ref` moved from `/schema/v2/` to `/schema/v3/`, so anything validating a
document against a pinned URL needs that URL changed too. The published copies are listed in
[JSON Schemas](/reference/schemas).

## The CLI

Five flags were renamed or removed. Nothing else that existed in version 2 changed; the rest of the
difference is flags that are new.

| Version 2 | Version 3 | Notes |
| --- | --- | --- |
| `new scroll --python-version <v>` | `new scroll --runtime-version <v>` | Refused for `--runtime native`, which installs no interpreter |
| `new scroll --model-id <id>`, `--runtime-id <id>` | `new scroll --labels '{"model":"…"}'` | One JSON object in place of two required identities Scrollcase never read |
| `new scroll --asset-base-url <url>` | `new scroll --publish-base-url <url>` | Optional now: press Enter past the prompt, and a box you only run locally never needs one |
| `build --asset-base-url <url>` | `build --publish-base-url <url>` | Overrides the scroll's `publishBaseUrl` |
| `new scroll --weights`, `build --weights` | **removed, not renamed** | A build-time override of a per-asset declaration repacks a box under an identity that no longer describes it. The scroll's `assets[].embed` is what a build uses, and the only place the choice is stated. At authoring time, `add asset --on-demand` writes `"embed": false` for one asset |

`new scroll` also gained `--runtime <id>`, which decides which execution kinds are offered, which
starter files are written and which dependency the generated `pixi.toml` declares; and `add` gained
`--executable`, `--pin`, and `--expect-exit-code` for the new declarations below. The full current
surface is the [CLI reference](/reference/cli).

## Three things version 2 could not say

These have no version 2 equivalent to map from. They are the reason a v2 scroll sometimes needs more
than a rename.

### `assets[].executable` and `localFiles[].executable`

Version 2 gave a payload file the executable bit through a `venv/bin` heuristic, which was the only
mechanism there was. HTTP carries content and not permissions, so a downloaded asset arrived with
none, and a local file is copied rather than moved — a box simply could not ship an asset that runs.
Declare it now:

```jsonc
"assets": [
  {
    "url": "https://tools.example.org/mytool-1.4.0-linux-x86_64",
    "relativePath": "bin/mytool",
    "sizeBytes": 8421376,
    "sha256": "…",
    "executable": true
  }
]
```

The bit is *synthesised* into the archive from this declaration, never read off the build machine,
so two builds of one commit stay byte-identical whatever umask each ran under. Whatever a box
actually starts is checked for it before the archive is written — a `native-binary` a scroll brought
in therefore needs `"executable": true`, or the build refuses.

### `bundledLicenseDeclaration`

`pixi.lock` declares a licence per conda package, but it cannot see what was linked *inside* a
binary your scroll supplies, and reading the binary would be guessing. So that half is declared:

```jsonc
"bundledLicenseDeclaration": "legal/bundled-dependencies.json"
```

pointing at a reviewed JSON array of `{ name, version, declaredLicense, linkedInto }` entries. The
build checks that every `linkedInto` path is a file the box really carries, signs the list into the
release and `box.json` as `bundledLicenses`, and writes it to
`THIRD_PARTY_NOTICES/bundled-dependencies.json`. It travels in the release because a licence
decision is made before an archive is downloaded. Its absence means the project declared none, never
that the box has none. See [bundled licences](/reference/scroll#bundled-licences).

### `archive.url` is optional

Version 2 required a URL in every release, so an author who only wanted to run a box on their own
machine had to invent an address — while Scrollcase declined to invent one itself, on the grounds
that a placeholder in a signed release is a false statement. Both could not be right.

A build given no publish location now omits `archive.url` and the channel entry's
`releaseManifestUrl` instead of refusing. Nothing is lost but the address: an archive is verified by
`sha256` and size, and all three consumers find it beside its release document rather than by
following a link. What an unpublished box gives up is the chain a downloader follows, which it has
no use for.

## A worked example

The shortest v2 scroll that built:

```json
{
  "$schema": "https://scrollcase.dev/schema/v2/scroll.schema.json",
  "schemaVersion": 2,
  "boxId": "hello-box",
  "modelId": "example-org-hello",
  "runtimeId": "hello-box-runtime",
  "version": "1.0.0",
  "sourceRevision": "example-hello-v1",
  "target": { "platform": "macos", "arch": "aarch64", "accelerator": "metal" },
  "pythonVersion": "3.14",
  "pixiVersion": "0.73.0",
  "assetBaseUrl": "https://assets.example.org/boxes",
  "selfTest": { "imports": ["json", "sqlite3"] }
}
```

The same box in version 3. Two fields are gone rather than renamed, because nothing ever read them:

```json
{
  "$schema": "https://scrollcase.dev/schema/v3/scroll.schema.json",
  "schemaVersion": 3,
  "boxId": "hello-box",
  "version": "1.0.0",
  "sourceRevision": "example-hello-v1",
  "target": { "platform": "macos", "arch": "aarch64", "accelerator": "metal" },
  "runtime": { "id": "python", "version": "3.14" },
  "pixiVersion": "0.73.0",
  "publishBaseUrl": "https://assets.example.org/boxes",
  "selfTest": { "imports": ["json", "sqlite3"] }
}
```

If `modelId` was carrying something a person needs — the upstream model a box packages, the team
that owns it — put it in `labels`, where it is signed into the release and still never read by
Scrollcase:

```jsonc
"labels": { "model": "example-org/hello", "owner": "platform-team" }
```

## The order to do it in

1. **Edit the scroll by hand**, using the first table. `edit scroll` is not the tool for this: it
   changes one existing field from a menu built out of the schema, and the fields you are moving
   away from are not in the v3 schema to be offered. It is worth running afterwards, though, for
   anything you now want to change.
2. **`scrollcase audit <ref>`** — the cheapest command that reads the scroll. Every command that
   reads one validates it against the v3 schema first and names the field it cannot accept, and
   `audit` derives its inventory from the committed lock without building anything or touching the
   network. Catching the renames here beats discovering them one build at a time.
3. **`scrollcase lock <ref>`**, if the dependency solve changed. It usually has not: version 3
   changed the format, not the substrate.
4. **`scrollcase audit <ref> --write`**, if you carry a reviewed licence audit — the inventory is
   derived from the lock, and a reviewed audit must still match it.
5. **`scrollcase build <ref>`**, then **`scrollcase verify`** on the result. A box that built under
   version 2 and refuses to build now is worth reading carefully rather than working around: the
   refusals version 3 added — a declared entry point on a `native` box, an `imports` probe on a
   runtime with no module system, a missing executable bit — each name something the box could not
   have done anyway.
6. **Publish, and leave the v2 documents where they are.** They are immutable and still valid for
   the Scrollcase version that produced them.
