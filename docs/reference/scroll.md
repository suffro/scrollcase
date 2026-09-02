---
title: The Scroll (scroll.json)
description: Every field of a Scrollcase scroll — identity, target, dependencies, assets, self-test, parity.
---

# The Scroll

A scroll is the only input a build accepts. It is a `scroll.json` checked into your repository,
next to the `pixi.toml` that declares its dependencies and the `pixi.lock` that pins them:

```text
scrolls/
└── my-model/
    └── macos-aarch64-metal/
        ├── scroll.json     # this document
        ├── pixi.toml       # dependency declaration, solved by `scrollcase lock`
        └── pixi.lock       # the pinned result — committed, reviewed, and installed verbatim
```

The parent directory is the scroll's declared `boxId`; the child is the canonical ID computed from
its declared `target`. Scrollcase checks both, so the path cannot mislabel the scroll, but neither
value is written twice inside `scroll.json`. Flat source directories are not accepted.

The machine-readable definition is [`scroll.schema.json`](/schema/v3/scroll.schema.json), also shipped
through the package export. See [JSON Schemas](/reference/schemas).

Create a new target-specific input with `scrollcase new scroll`. Interactively it asks for the
target, the [runtime](#choosing-a-runtime), the box id, the upstream revision, and — optionally —
where boxes will be published, then derives everything else and generates the matching `pixi.toml`
plus a starter self-test where the runtime has one. It refuses to overwrite an existing scroll.

## The shortest scroll that builds

Anything the target or the identity already determines may be left out; it is filled in when the
scroll is read. Write the decisions, not the restatements:

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
  "publishBaseUrl": "https://boxes.example.org",
  "selfTest": { "imports": ["json", "sqlite3"] }
}
```

## The same scroll, fully spelled out

Identical in every respect — this is what the file above becomes when it is read. Declaring a
derived field is never wrong; `runtime.entryPoint` is still checked against the target either way.

```json
{
  "$schema": "https://scrollcase.dev/schema/v3/scroll.schema.json",
  "schemaVersion": 3,
  "scrollVersion": "1.0.0",
  "boxId": "hello-box",
  "version": "1.0.0",
  "sourceRevision": "example-hello-v1",
  "target": { "platform": "macos", "arch": "aarch64", "accelerator": "metal" },
  "compatibility": { "minHostAppVersion": "1.0.0", "minMacosVersion": "13.0", "minRamGb": 1 },
  "runtime": { "id": "python", "version": "3.14", "entryPoint": "venv/bin/python" },
  "pixiVersion": "0.73.0",
  "cacheSubdir": "cache/hello-box",
  "environment": { "MODEL_ROOT": "cache/hello-box", "HF_HUB_OFFLINE": "1" },
  "publishBaseUrl": "https://boxes.example.org",
  "assets": [],
  "selfTest": { "imports": ["json", "sqlite3"], "files": [] }
}
```

## Identity

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | yes | Always `3`. See [versioning](/reference/box-format#versioning) |
| `scrollId` | no | Provenance identity. When omitted, Scrollcase derives `<boxId>-<targetId>` |
| `scrollVersion` | no | Version of the scroll itself — bump it when you change how the box is built. Defaults to `1.0.0` |
| `boxId` | yes | Identity of the box across versions. Appears in archive names, object keys, and the channel pointer |
| `labels` | no | Free-form annotations, carried into the signed release and never read by Scrollcase |
| `version` | yes | Version of the box this scroll produces, as it appears in the release manifest |
| `sourceRevision` | yes | Upstream revision of the packaged source, recorded verbatim into provenance |
| `extends` | no | `"../scroll.json"`, marking this file as one target's half of a [split scroll](#one-box-several-targets) |

"Required" here means required of the scroll a build reads. In a split scroll that is the two halves
joined, so either half may carry any given field.

`boxId` is a lowercase identifier (`^[a-z0-9]+(?:[-.][a-z0-9]+)*$`) in the published manifests, and
so is every `labels` key — keep them to that shape.

An explicit `scrollId` lets a project choose its source identity. It may be omitted because `boxId`
and `target` already contain the meaningful identity and the derived value is deterministic.

### Labels

```jsonc
"labels": {
  "model": "example-org/example-model",
  "owner": "platform-team"
}
```

Whatever the project needs recorded and the format has no business defining: the upstream model a
box packages, the team that owns it, the ticket it came from. Labels are signed and carried through
untouched, and **Scrollcase never reads one** — a consumer that reads a label is reading its own
project's convention.

::: tip Why this replaced two required fields
Version 2 required `modelId` and `runtimeId`, and no code path ever read either. They were a
consumer's vocabulary written into the format: a box that packaged a library rather than a model
still had to name a model, so most scrolls set `modelId` to the `boxId` and moved on.

A label says the same thing when there is something to say, and says nothing when there is not.
:::

## Target

```jsonc
"target": { "platform": "linux", "arch": "x86_64", "accelerator": "cuda", "cudaVersion": "12.4" }
```

The supported combinations are closed — a target outside this matrix has no defined identifier
and cannot be built, signed, or routed:

| `platform` | `arch` | `accelerator` |
| --- | --- | --- |
| `macos` | `aarch64` | `metal`, `cpu` |
| `linux` | `x86_64` | `cpu`, `cuda` |
| `windows` | `x86_64` | `cpu`, `cuda` |

`cudaVersion` (a `major.minor` string) is **required for and only for** CUDA targets: it is part
of the box's identity, so a CUDA 12.4 build can never be mistaken for a 12.8 one. See
[The Box Format](/reference/box-format#targets) for the resulting target IDs, and
[Packaging CUDA Boxes](/guides/packaging-cuda) for what a CUDA scroll declares.

Every scroll a build reads declares a target. The one exception is the base of a split scroll,
below, which holds what its targets share and so names none of them.

## One box, several targets

The targets of a box agree about almost everything and differ in a handful of lines. Repeating the
agreement in each of them means every change has to be made three times, correctly, and a
divergence nobody intended is invisible until a user finds it.

A scroll may therefore be split. `scrolls/<boxId>/scroll.json` holds what the targets share, and
each `scrolls/<boxId>/<targetId>/scroll.json` declares `extends` plus its own differences:

```text
scrolls/hello-box/
  scroll.json                     ← everything the targets share
  macos-aarch64-metal/scroll.json ← extends + what this target changes
  linux-x86_64-cpu/scroll.json
  windows-x86_64-cpu/scroll.json
```

```json
{
  "extends": "../scroll.json",
  "target": { "platform": "macos", "arch": "aarch64", "accelerator": "metal" },
  "compatibility": { "minMacosVersion": "13.0" },
  "condaDependencyLicenseAudit": "scrolls/hello-box/macos-aarch64-metal/conda-licenses.json"
}
```

`extends` has exactly one legal value, `"../scroll.json"`. A base is always the box directory's own
`scroll.json` — there is no path to get wrong, nothing to point outside the workspace, and no chain
of bases to follow. A base declares no `target` (it holds what its targets share) and no `extends`
of its own (joining is one level, not a hierarchy); both are refused.

Only `scroll.json` is split. `pixi.toml` and `pixi.lock` stay in each target directory, because the
solved environment is what differs most between targets.

### How the two halves are joined

The rule is stated per field, because a single blanket rule is wrong in both directions. Replacing
everything would make a fragment that adds one asset lose the shared ones; merging everything would
leave `execution` half from each half, producing a `python-script` that inherited a `module`.

| Fields | Rule |
| --- | --- |
| Scalars, and the cohesive objects `target`, `execution`, `parity` | The fragment replaces the base |
| `assets`, `assetArchives`, `localFiles` | Joined, base entries first. Two entries claiming one `relativePath` is an **error** |
| `prunePaths`, `uncompressedPaths`, `selfTest.imports`, `selfTest.files` | Joined, base first, repeats dropped |
| `compatibility`, `environment` | Joined key by key; on a shared key the fragment wins |
| `selfTest.code` / `selfTest.script` | One slot: a fragment naming either replaces both |
| `extends` | Dropped — the joined scroll extends nothing |

The distinction between the two list rules is deliberate. A repeated prune path or import is the
same instruction twice and is harmless, so it is dropped. A repeated `relativePath` means two
different sources claiming one file in the box, which is a conflict — the second would silently
overwrite the first — so it is refused rather than resolved by a precedence rule nobody would
remember. That is why a file each target ships its own copy of belongs in the **fragments**, not the
base: three sources for `entrypoint.py` cannot be one declaration.

Order is declaration order, base first — for the joined lists and for a joined map's keys. Nothing
is sorted, and nothing needs to be: one pair of files always produces one result, which is what
rebuilding byte-identically requires. A split scroll and a hand-written whole one hold the same
entries; a joined map may serialise its keys in a different order.

The result of the join is the **effective scroll** — the object schema validation runs against, the
build reads, and provenance records. Nothing downstream can tell which half a value came from.

## Environment

| Field | Required | Meaning |
| --- | --- | --- |
| `runtime.id` | yes | `python`, `node` or `native`. All three are implemented; see [Choosing a runtime](#choosing-a-runtime) |
| `runtime.version` | for `python` and `node` | The runtime version the box carries, recorded into provenance. A `native` box has no interpreter, so it declares none |
| `pixiVersion` | yes | The exact pixi release used to solve and install. `lock` and `build` refuse any other version |
| `runtime.entryPoint` | no | The runtime's own executable relative to the box root. Fixed per (runtime, target): `venv/bin/python` or `venv/bin/node` on macOS and Linux, `venv/python.exe` or `venv/node.exe` on Windows. Derived when omitted, and a mismatch is still rejected when declared. A `native` box has none, and declaring one there is refused |
| `cacheSubdir` | no | Directory relative to the box root holding model assets. Defaults to `cache/<boxId>` |
| `environment` | no | String environment variables required whenever Scrollcase runs the box interpreter |
| `condaDependencyLicenseAudit` | no | Path (from the project root) to the reviewed licence inventory, written and declared by [`audit --write`](/reference/cli#audit). When declared, the build fails if the lock no longer matches what was reviewed |
| `bundledLicenseDeclaration` | no | Path (from the project root) to the licences of dependencies compiled *inside* a binary this box ships. See [Bundled licences](#bundled-licences) |

The dependencies themselves live in `pixi.toml`, not here:

```toml
[workspace]
name = "hello-box-macos-aarch64-metal"
channels = ["conda-forge"]
platforms = ["osx-arm64"]

[dependencies]
python = "3.14.*"
```

`platforms` must equal the target's conda subdirectory — `osx-arm64`, `linux-64`, or `win-64` —
or the solve produces an environment that cannot run on the machine the box is for.

[`scrollcase add dep <box> <name>`](/reference/cli#add) writes into every target's manifest at once,
so they cannot drift apart, and `--from-requirements` imports an existing pip file.

### Bundled licences

`condaDependencyLicenseAudit` is **derived**: `pixi.lock` already records an SPDX licence per conda
package, so Scrollcase computes the inventory and checks it against what you reviewed.

It cannot do that for a binary you supply. Whatever was linked into that binary was linked before
Scrollcase saw the file, nothing in the build records it, and reading the binary would be guessing —
which is worse than not answering. So that half is **declared**:

```jsonc
"bundledLicenseDeclaration": "legal/bundled-dependencies.json"
```

pointing at a JSON array your project reviews and keeps up to date:

```jsonc
[
  {
    "name": "zlib",
    "version": "1.3.1",
    "declaredLicense": "Zlib",
    "linkedInto": ["bin/my-tool"],
    "sourceUrl": "https://zlib.net/"
  }
]
```

`name`, `version`, `declaredLicense` and `linkedInto` are required; `sourceUrl` is optional, for a
licence that requires an offer of source. Scrollcase carries `declaredLicense` through as a string
and never parses it: what a licence permits is not a question a packaging tool answers.

What it *does* check is that every path in `linkedInto` is a file the built box actually carries —
deferred assets included, since leaving a large fetched binary out of the inventory would exempt
exactly the case this exists for. A licence file nobody can check is a licence file nobody
maintains: a path that stopped being in the box means the entry is stale, and the build says so
instead of signing a claim about a file that is not there.

The list is signed into the release manifest and `box.json`, and written into the payload beside the
derived audit at `THIRD_PARTY_NOTICES/bundled-dependencies.json`. It is in the release rather than
only in the payload because a licence decision is made **before** an archive is downloaded, and a
list only a downloaded archive reveals arrives too late to act on.

A box that declares none carries no such list. That means the project declared none — never that the
box has no bundled dependencies, which is not something Scrollcase is in a position to say.

### Choosing a runtime

`runtime.id` says what executes inside the box. It decides the payload layout, the execution kinds
the scroll may declare, how the box is started, and what its self-test is allowed to ask.

| | `python` | `node` | `native` |
| --- | --- | --- | --- |
| `pixi.toml` dependency | `python` | `nodejs` | none — you declare what your binary needs |
| `runtime.version` | required | required | not applicable |
| `execution.kind` | `python-script`, `python-module` | `node-script` | `native-binary` |
| Started by | the box's own `python` | the box's own `node` | the binary itself |
| `selfTest.imports` | yes | yes | **no** — there is no module system to ask |
| `selfTest.commands` | yes | yes | yes |
| `parity` | yes | yes | **no** — there is no interpreter to run a check with |
| Library-only | yes | yes | **no** |
| `scrollcase new scroll` starter | `entrypoint.py` | `entrypoint.js` | none — point at the binary you built |

Two things are worth knowing before you pick `native`:

**Scrollcase does not repair a binary's library paths.** A binary that finds its libraries through
an absolute path recorded when it was compiled will not find them inside a box, and fixing that is
per-format work — rpath on Linux, `install_name` on macOS, the DLL search order on Windows — that
this release deliberately does not attempt. A native box must ship a binary that already resolves:
statically linked, or built with a relative rpath. The self-test catches the rest at build time, on
your machine, rather than on a user's.

**A native box still has an environment.** `native` means "no interpreter", not "no dependencies":
it is built from a `pixi.lock` like every other box, its binary links against the shared libraries
that lock installed, and those libraries get the same derived licence audit. What it does *not*
declare for you is the dependency list — only you know what your binary needs.

For `node`, one thing happens on your behalf: the box is given its own `package.json` unless the
payload already carries one. Node decides whether a `.js` file is CommonJS or an ES module by
looking at the nearest `package.json` **above** it, and without one inside the box that walk leaves
the box entirely and asks whichever directory the box was extracted into. Ship your own
`package.json` as a `localFile` if you want ESM or anything else in it.

### Declared runtime environment

`environment` is a map of names to string values, one per
[`scrollcase add env <box> NAME=VALUE`](/reference/cli#add):

```jsonc
"environment": {
  "MODEL_ROOT": "cache/hello",
  "HF_HUB_OFFLINE": "1"
}
```

The builder copies the map unchanged into `box.json` and the signed release. It applies the same
values to the build self-test and every parity run, so a bad path or offline setting fails before a
box reaches a user. Consumers apply the declaration when they run the box or repeat its self-test.
On a name conflict, the signed release wins over the inherited host environment and caller-supplied
`env`; the small target-validation map still wins for its own accelerator controls, so a declared
variable cannot silently turn a CUDA or Metal check into a CPU check.

A variable only one target needs belongs in that target's fragment, because `extends` joins
`environment` key by key. That is how a `cpu` target switches off an accelerator backend its packed
library ships anyway — `"GGML_METAL_DEVICES": "0"` for llama.cpp on macOS. See
[Running a box](/guides/troubleshooting#running-a-box) for the failure that prevents.

This does **not** replace or filter the host environment. A box inherits it exactly as before.
Scrollcase reports the resulting provenance through its CLI and Node/Python consumer APIs; see
[Environment reports](/reference/api/node#environment-reports). Names must be non-empty and contain
neither `=` nor NUL; values are strings and may be empty but cannot contain NUL.

## Execution intent

### Why declare an execution

A box is an environment plus files. Nothing in it says which of those files is *the* thing to start
— so by default, whoever receives the box has to already know. `execution` is the box answering that
question about itself, and the answer is **signed into the release** along with everything else.

That is the whole difference. With it, `scrollcase run <release.json>` starts the box, and so does
any of the three consumers, without the caller knowing what is inside or deciding what to launch.
Without it, the caller extracts the box and drives it themselves.

It is a trust property before it is a convenience one. Because the command line is fixed at build
time and signed, nobody holding the box afterwards can change what it runs. A consumer that took a
path from its own configuration would be running whatever that configuration said; a consumer
reading a signed `execution` is running what the publisher built and proved.

### Which kind to declare

Each kind is a different way of naming the one thing to start, and each produces a shell-free command
line. These are the real ones:

| Kind | You declare | The command line becomes |
| --- | --- | --- |
| `python-script` | `script`, a file path inside the box | `venv/bin/python app/main.py --serve` |
| `python-module` | `module`, a dotted importable name | `venv/bin/python -m example_model.main --serve` |
| `node-script` | `script`, a file path inside the box | `venv/bin/node app.js` |
| `native-binary` | `binary`, a file path inside the box | `bin/tool --quiet` |
| *(omitted)* | nothing | there is none — the box is library-only |

**Script or module** is a question about how your code got into the box, not about style. A file you
shipped with [`localFiles`](#localfiles) sits at a path you chose, so name that path. A package that
was *installed* by the dependency solve lands in `site-packages` under a directory whose name
includes the interpreter version — a path you would not want to write down, and one that changes
when the interpreter does. Name it as a module and the box's own import system finds it. The builder
proves the module resolves by inspecting files, never by importing your application.

**Library-only** — omitting `execution` — is not "the box does nothing". It is a box whose purpose is
to be imported: your application prepares it with a consumer, then imports from the environment
inside it and calls whatever it likes. Pick it when there is no single entry point that would mean
anything, which is the normal case for a box that exists to provide a model and its dependencies to
an application that already knows how to use them. `scrollcase run` refuses such a box by name,
because there is nothing it could honestly start.

A `native` box cannot be library-only, for a reason worth stating: its only self-test shape is an
invocation of its own binary, so a native box with nothing to invoke could prove nothing about
itself at build time.

### The declarations

`execution` records how a consumer may start the box:

```jsonc
"execution": {
  "kind": "python-script",
  "script": "app/main.py",
  "defaultArgs": ["--serve"]
}
```

or:

```jsonc
"execution": {
  "kind": "python-module",
  "module": "example_model.main",
  "defaultArgs": []
}
```

or, for the other two runtimes:

```jsonc
"execution": {
  "kind": "node-script",
  "script": "app/main.js",
  "defaultArgs": []
}
```

```jsonc
"execution": {
  "kind": "native-binary",
  "binary": "bin/my-tool",
  "defaultArgs": []
}
```

Each kind is named `<runtime>-<shape>`, and the runtime half must be the one the box declares: a
`python-script` in a box whose runtime is `native` describes something that cannot be run, and is
refused rather than guessed at. `scrollcase new scroll` offers only the kinds the chosen runtime
defines — see [the CLI reference](/reference/cli#new).

### Where the entry point comes from

A file-naming execution has two possible origins, and `scrollcase new scroll` asks which:

- **The environment provides it.** A package the dependency solve installs already puts the program
  in the payload — conda-forge's `venv/bin/ffmpeg`, a console script the solve generated. The scroll
  names that path and nothing of the project is copied in, so there is no `localFiles` entry. Pass
  `--from-environment <payload path>` to say so without a terminal.
- **The project provides it.** A script you wrote or a binary you compiled, living in your
  repository. `--script <path>` records it in `localFiles`, and the build copies it into the box at
  the payload path you chose. For a `python` or `node` box, `--generate-script` writes a starter
  instead.

The distinction matters most for `native`, where both are common: packaging an existing program and
shipping one you built are different jobs, and only the second involves a file of yours.

A `native-binary` must additionally be declared `executable: true` on the asset or local file that
brings it in, unless it comes from the packed environment's own scripts directory. The executable
bit is synthesised into the archive from what the scroll declared, never read off the build machine,
so without the declaration the box ships a binary it cannot start — and the build refuses it rather
than signing one.

Script authoring either hashes an existing regular project file or generates a minimal starter.
The exact SHA-256 is recorded in `localFiles`, the payload path is traversal-checked, and neither an
existing source nor an existing scroll is overwritten.

The builder copies this object unchanged into both the signed release and `box.json`, then checks
that the script or module is present after staging and pruning. A script must be a safe relative
regular-file path. A module must use strict dotted syntax and resolve to runnable module content in
the box root or the target's Python environment; discovery inspects files and never imports the
application. `verify` repeats the schema, agreement, interpreter, and archive-presence checks
before an optional self-test can run box code.

## Compatibility

Constraints the installing host must satisfy. The whole object is optional — declaring no
constraint is a legitimate answer, and Scrollcase will not invent one on your behalf. What you do
declare is copied into the release manifest **verbatim and never interpreted**, so a project may
add its own fields alongside these:

| Field | Meaning |
| --- | --- |
| `minHostAppVersion` | Lowest version of the installing application this box supports |
| `maxHostAppVersionExclusive` | Upper bound, exclusive |
| `minMacosVersion` | Minimum macOS version |
| `minRamGb` | Installed memory in decimal GB (1 GB = 1,000,000,000 bytes) |
| `minNvidiaDriverVersion` | Minimum NVIDIA driver version |

A consumer that cannot evaluate a constraint must refuse the box rather than assume it passes.

## Assets and payload contents

### `assets`

Files fetched over the network during the build. Every entry is size- and hash-checked before it
enters the payload, so a moved or replaced upstream file fails the build instead of quietly
producing a different box under the same version. The list is optional and defaults to empty.

Do not write these by hand: [`scrollcase add asset <box> <url>`](/reference/cli#add) fetches the URL
once and records the `sizeBytes` and `sha256` it found, which are the only two fields here that
cannot be known without downloading the file.

```jsonc
"assets": [
  {
    "url": "https://huggingface.co/example-org/model/resolve/main/model.safetensors",
    "relativePath": "cache/hello/model.safetensors",
    "sizeBytes": 438012416,
    "sha256": "9f2b…c1",
    "embed": false,
    "executable": false
  }
]
```

| Field | Required | Meaning |
| --- | --- | --- |
| `url`, `relativePath`, `sizeBytes`, `sha256` | yes | Where the file comes from, where it lands, and the exact bytes expected |
| `embed` | no | Whether the file is packed into the archive. `true` by default |
| `executable` | no | Whether the file needs the executable bit. `false` by default |

`embed: false` leaves the file out of the archive and carries its descriptor in the signed release
instead, for your distribution layer to materialize. It is **per entry**, so one box can ship a
small entry point inside the archive and defer a 30 GB dataset beside it. Scrollcase consumers
verify a materialized file before execution and never download one. See [Managing
Assets](/guides/managing-assets).

`executable: true` is the only way a downloaded file can end up runnable: HTTP carries content, not
permissions, so an asset arrives with no mode at all. The bit is synthesised into the archive from
this declaration, never read off the build machine — which is what keeps two builds of one commit
byte-identical whatever umask each ran under.

Retries inside one download operation resume from a partial file, and a partial transfer is
renamed into place only after its size and hash match. The build scratch tree is recreated at
process start, so there is no cross-process cache.

### `assetArchives`

Downloaded archives to expand into the payload. Extraction preserves files already present and
refuses to overwrite them.

```jsonc
"assetArchives": [
  {
    "relativePath": "cache/hello/weights.tar.gz",
    "format": "tar.gz",
    "destination": "cache/hello",
    "stripComponents": 1,
    "removeAfterExtract": true
  }
]
```

`format` is `zip` or `tar.gz`. An archive is expanded at build time, so **it has no `embed` field**:
"leave it out and let the caller fetch it" names nothing that could happen. Version 2 refused that
combination with a cross-field check; version 3 makes it unspeakable.

### `localFiles`

Files copied from your own repository into the payload. Added and removed with
[`scrollcase add file`](/reference/cli#add) and [`remove file`](/reference/cli#remove).

```jsonc
"localFiles": [
  { "sourcePath": "runtime/entrypoint.py", "relativePath": "entrypoint.py" },
  { "sourcePath": "bin/launch.sh", "relativePath": "bin/launch.sh", "executable": true },
  { "sourcePath": "legal/MODEL_NOTICE.md", "relativePath": "THIRD_PARTY_NOTICES/MODEL_NOTICE.md", "sha256": "4c7e…9a" }
]
```

`executable` works exactly as it does for an asset, and for the same reason: a local file is
**copied** rather than moved, so it has no mode to inherit, and reading the source file's mode would
make the archive depend on the umask of whoever checked the project out.

`sha256` is an optional **pin**: when it is present, the build refuses a file whose contents no
longer match. Leave it off the files you are still writing — a script you edit every day would
otherwise fail its own build until you recomputed a digest by hand. Add it to the files that must
not change without review, such as a licence notice or a reviewed runtime shim. Either way, what
ships is hashed into the signed release, so the box's contents are always accounted for.

[`scrollcase refresh`](/reference/cli#refresh) recomputes a pin after a reviewed change, so keeping
one does not mean recomputing digests by hand.

A pin covers the file's bytes, so anything that rewrites them between commit and build breaks it.
The usual culprit is Git's line-ending conversion: on Windows a text file is checked out with CRLF
by default and no longer matches the hash the scroll declares, and the build stops on a checkout
that looks clean. Mark the pinned paths in `.gitattributes` so they are never converted:

```text
legal/MODEL_NOTICE.md -text
```

### `prunePaths`

Payload paths deleted before packing, to keep the box to what it actually needs at run time — a
box is a multi-gigabyte download for an end user, so pruning is a user-facing concern rather than
tidiness.

```jsonc
"prunePaths": ["venv/share/doc", "venv/lib/python3.11/site-packages/numpy/tests"]
```

Each entry is a **literal path** removed recursively — there is no glob support, and a path that
matches nothing is skipped silently. Over-pruning is caught by `selfTest.files`, below.

### `uncompressedPaths`

Payload paths stored in the archive rather than deflated, because their bytes are already
compressed — re-compressing them costs build time and makes the archive marginally larger.

```jsonc
"uncompressedPaths": ["cache/hello", "corpora/images"]
```

An entry matches that path **and everything beneath it**, so one line can name a weights file or
the directory an `assetArchives` entry expanded into. Every path declared in `assets` is stored
automatically and does not need repeating here.

The decision is taken from the scroll alone — nothing opens the file or reads its extension — which
is what keeps two builds of the same commit byte-identical.

::: warning Payload paths
Every path inside the payload (`relativePath`, `destination`, `prunePaths`, `uncompressedPaths`,
`selfTest.files`) is relative and may never escape the payload root. Absolute paths, `..` segments,
and drive letters are rejected.
:::

### `publishBaseUrl`

Base URL the built archive and its signed documents will be published under, so each can point at
the next: the channel names the release document, and the release names the archive.

It says nothing about the box's own assets — those carry a URL each — and nothing about what the box
does when it runs. A box that transcodes video on your laptop touches no network and needs no URL
anywhere.

**Optional, and genuinely so.** A box you build to run where you built it is never published, so
there is nowhere for its documents to point and no value here would be true. Omit it and the build
simply leaves both links out:

```jsonc
// with a publish base URL
"archive": { "format": "zip", "url": "https://boxes.example.org/…", "sha256": "…", "sizeBytes": 1234 }

// without one
"archive": { "format": "zip", "sha256": "…", "sizeBytes": 1234 }
```

**Nothing is lost but the address.** No guarantee depends on this URL: the archive is verified by
`sha256` and size, the documents are signed, `box.json` still has to agree with the release, and
`verify` passes either way. No Scrollcase consumer even reads it — all three find the archive beside
its release document and identify it by hash. It exists for the distribution layer that has to fetch
the bytes, and for nothing else.

That is also why an absent URL beats an invented one. Since nothing checks it, a wrong address is a
false statement inside a signed, immutable document, and it stays false forever. `new scroll` lets
you press Enter past it for the same reason.

Supply it later with [`edit scroll`](/reference/cli#edit-scroll), or per build with
`--publish-base-url`.

## Self-test

Builder checks run with the payload's **own runtime** before the box is archived. Schema
version 3 signs the probe for a consumer to repeat; it does not carry the richer file or
`code` assertions.

```jsonc
"selfTest": {
  "imports": ["torch", "transformers"],
  "files": ["cache/hello/model.safetensors"],
  "script": "scrolls/hello-box/macos-aarch64-metal/self_test.py"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `imports` | one of these two | Modules loaded with the box's runtime, added with [`add import`](/reference/cli#add). Signed, and repeated by `verify --self-test` |
| `commands` | one of these two | Invocations of the box's own `execution`, each with the exit status it must produce. Also signed and repeated |
| `files` | no | Files that must still exist after pruning — this is what stops an over-aggressive prune from shipping a broken box. Defaults to empty |
| `script` | no | Project path to a source file run after the imports succeed |
| `code` | no | The same thing inline, for a single assertion. Mutually exclusive with `script` |

At least one of `imports` and `commands` is required: a box that proves nothing about itself is not
a box worth signing. `imports` asks the runtime's loader a question and means something only to a
runtime that has one; `commands` asks the box's declared execution a question, which every runtime
can answer:

```jsonc
"selfTest": {
  "imports": ["json"],
  "commands": [{ "args": ["--version"], "expectExitCode": 0 }]
}
```

A `commands` entry needs `execution` to be declared — there is nothing else to invoke — and the
scroll is refused when it is not. `expectExitCode` defaults to `0`; a non-zero value suits a tool
whose `--help` deliberately exits otherwise.

Prefer `script` for anything longer than one line. A self-test is real code and deserves an
editor that knows it: in a file it keeps its syntax highlighting, its linter, and a readable diff,
where inline it is a JSON string with escaped newlines. `scrollcase new scroll` generates one next
to the scroll and points the field at it.

The target's own platform assertion is prepended automatically, and the run happens under the
accelerator's validation environment. The file is read at build time and executed from the payload
root, so it can read what the box ships and import what it packs. A file listed in `files` that is a
deliberately deferred asset is not required to be present. After pruning, the builder checks
required files, then runs the target assertion, the probe, the extra source, and finally optional
parity. A consumer runs the target assertion and the signed probe only.

## Parity (optional)

An optional numerical gate: run a check inside the box on more than one accelerator and require
the results to agree.

```jsonc
"parity": {
  "script": "checks/parity.py",
  "accelerators": ["cpu", "metal"],
  "tolerances": { "absolute": 1e-4, "relative": 1e-3, "minimumCosine": 0.9999 }
}
```

| Field | Meaning |
| --- | --- |
| `script` | Path inside the box, run with the box's own interpreter. Must print a JSON array of numbers, or an object with a `values` array |
| `accelerators` | At least two, each run under its target's validation environment. **The first is the reference** the others are compared against — conventionally `cpu` |
| `tolerances` | At least one bound. `absolute` and `relative` are finite numbers greater than zero; `minimumCosine` is finite and at most 1 |

Every declared threshold is enforced conjunctively: passing one never excuses breaching another.
Scrollcase runs the check and enforces the thresholds; what the check computes, and what closeness
is acceptable, belong to your project. Full treatment in
[Accelerator Parity](/guides/accelerator-parity).

## Validation summary

Validation is ordered so malformed input cannot trigger a process, fetch, or build-directory
mutation:

1. Parse `scroll.json` and, when it declares `extends`, read and join its base first — neither half
   of a split scroll is a complete document, so validating one alone would report the other half's
   fields as missing. Validate the joined result against the shipped scroll and target schemas.
2. Reject a runtime this build has no adapter for, an `execution` kind belonging to a different
   runtime, and a `selfTest.commands` with no `execution` to invoke.
3. For a nested scroll, require a target, and require the parent and child directories to match
   `boxId` and the canonical target; reject an entry point the runtime's layout does not admit.
4. Require a matching native host, discover the exact tools, and require `pixi.lock`.
5. Record Git provenance and reject a dirty tree unless `--allow-dirty` was explicit.
6. Only then recreate build state, install from the lock, download verified assets, and enforce
   semantic checks whose inputs appear later, including lock/audit agreement.
