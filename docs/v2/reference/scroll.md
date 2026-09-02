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
value is written twice inside `scroll.json`. Flat source directories are not accepted in v2.

The machine-readable definition is [`scroll.schema.json`](/schema/v2/scroll.schema.json), also shipped
through the package export. See [JSON Schemas](/v2/reference/schemas).

Create a new target-specific input with `scrollcase new scroll`. Interactively it asks four
things — the target, the box id, the upstream revision, and where boxes will be published — and
derives everything else, generating the matching `pixi.toml` and a starter `self_test.py`. It
refuses to overwrite an existing scroll.

## The shortest scroll that builds

Anything the target or the identity already determines may be left out; it is filled in when the
scroll is read. Write the decisions, not the restatements:

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

## The same scroll, fully spelled out

Identical in every respect — this is what the file above becomes when it is read. Declaring a
derived field is never wrong; `pythonEntryPoint` is still checked against the target either way.

```json
{
  "$schema": "https://scrollcase.dev/schema/v2/scroll.schema.json",
  "schemaVersion": 2,
  "scrollVersion": "1.0.0",
  "boxId": "hello-box",
  "modelId": "example-org-hello",
  "runtimeId": "hello-box-runtime",
  "version": "1.0.0",
  "sourceRevision": "example-hello-v1",
  "target": { "platform": "macos", "arch": "aarch64", "accelerator": "metal" },
  "compatibility": { "minHostAppVersion": "1.0.0", "minMacosVersion": "13.0", "minRamGb": 1 },
  "pythonVersion": "3.14",
  "pixiVersion": "0.73.0",
  "pythonEntryPoint": "venv/bin/python",
  "modelCacheSubdir": "model-cache/hello-box",
  "environment": { "MODEL_ROOT": "model-cache/hello-box", "HF_HUB_OFFLINE": "1" },
  "assetBaseUrl": "https://assets.example.org/boxes",
  "assets": [],
  "selfTest": { "imports": ["json", "sqlite3"], "files": [] }
}
```

## Identity

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | yes | Always `2`. See [versioning](/v2/reference/box-format#versioning) |
| `scrollId` | no | Provenance identity. When omitted, Scrollcase derives `<boxId>-<targetId>` |
| `scrollVersion` | no | Version of the scroll itself — bump it when you change how the box is built. Defaults to `1.0.0` |
| `boxId` | yes | Identity of the box across versions. Appears in archive names, object keys, and the channel pointer |
| `modelId` | yes | Identity of what the box packages — a model, a library, an application |
| `runtimeId` | yes | Identity of the runtime environment the box provides |
| `version` | yes | Version of the box this scroll produces, as it appears in the release manifest |
| `sourceRevision` | yes | Upstream revision of the packaged source, recorded verbatim into provenance |
| `extends` | no | `"../scroll.json"`, marking this file as one target's half of a [split scroll](#one-box-several-targets) |

"Required" here means required of the scroll a build reads. In a split scroll that is the two halves
joined, so either half may carry any given field.

`boxId`, `modelId` and `runtimeId` are lowercase identifiers (`^[a-z0-9]+(?:[-.][a-z0-9]+)*$`) in
the published manifests — keep them to that shape.

An explicit `scrollId` lets a project choose its source identity. It may be omitted because `boxId`
and `target` already contain the meaningful identity and the derived value is deterministic.

::: tip Three identifiers, three questions
`boxId` answers *which artefact is this a version of?*, `modelId` answers *what is inside?*, and
`runtimeId` answers *what environment does it provide?* Several boxes may package the same payload
with different runtimes, or the same runtime for different payloads; keeping the three separate is
what lets a consumer reason about that.

The name is historical: the first boxes carried models. What it identifies is whatever the box
packages, and a box that packages a library or an application names that. A project with nothing
to distinguish there sets it to the `boxId` — which is what `scrollcase new scroll` does when
`--model-id` is not passed, so it is a field most scrolls never think about.
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
[The Box Format](/v2/reference/box-format#targets) for the resulting target IDs, and
[Packaging CUDA Boxes](/v2/guides/packaging-cuda) for what a CUDA scroll declares.

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
| `selfTest.pythonCode` / `selfTest.pythonFile` | One slot: a fragment naming either replaces both |
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
| `pythonVersion` | yes | Python version the box carries, recorded into provenance |
| `pixiVersion` | yes | The exact pixi release used to solve and install. `lock` and `build` refuse any other version |
| `pythonEntryPoint` | no | Interpreter path relative to the box root. Fixed per target: `venv/bin/python` on macOS and Linux, `venv/python.exe` on Windows. Derived from the target when omitted, and a mismatch is still rejected when declared |
| `modelCacheSubdir` | no | Directory relative to the box root holding model assets. Defaults to `model-cache/<boxId>` |
| `environment` | no | String environment variables required whenever Scrollcase runs the box interpreter |
| `condaDependencyLicenseAudit` | no | Path (from the project root) to the reviewed licence inventory, written and declared by [`audit --write`](/v2/reference/cli#audit). When declared, the build fails if the lock no longer matches what was reviewed |

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

[`scrollcase add dep <box> <name>`](/v2/reference/cli#add) writes into every target's manifest at once,
so they cannot drift apart, and `--from-requirements` imports an existing pip file.

### Declared runtime environment

`environment` is a map of names to string values, one per
[`scrollcase add env <box> NAME=VALUE`](/v2/reference/cli#add):

```jsonc
"environment": {
  "MODEL_ROOT": "model-cache/hello",
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
[Running a box](/v2/guides/troubleshooting#running-a-box) for the failure that prevents.

This does **not** replace or filter the host environment. A box inherits it exactly as before.
Scrollcase reports the resulting provenance through its CLI and Node/Python consumer APIs; see
[Environment reports](/v2/reference/api#environment-reports). Names must be non-empty and contain
neither `=` nor NUL; values are strings and may be empty but cannot contain NUL.

## Execution intent

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

Omit `execution` for a library-only box. `scrollcase new scroll` presents the three authoring
choices as `python-script`, `python-module`, and `library-only`; the last one deliberately emits no
execution object.

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

Do not write these by hand: [`scrollcase add asset <box> <url>`](/v2/reference/cli#add) fetches the URL
once and records the `sizeBytes` and `sha256` it found, which are the only two fields here that
cannot be known without downloading the file.

```jsonc
"assets": [
  {
    "url": "https://huggingface.co/example-org/model/resolve/main/model.safetensors",
    "relativePath": "model-cache/hello/model.safetensors",
    "sizeBytes": 438012416,
    "sha256": "9f2b…c1"
  }
]
```

Retries inside one download operation resume from a partial file, and a partial transfer is
renamed into place only after its size and hash match. The build scratch tree is recreated at
process start, so there is no cross-process cache. See [Managing Model
Weights](/v2/guides/managing-weights).

### `assetArchives`

Downloaded archives to expand into the payload. Extraction preserves files already present and
refuses to overwrite them.

```jsonc
"assetArchives": [
  {
    "relativePath": "model-cache/hello/weights.tar.gz",
    "format": "tar.gz",
    "destination": "model-cache/hello",
    "stripComponents": 1,
    "removeAfterExtract": true
  }
]
```

`format` is `zip` or `tar.gz`. Archives are expanded at build time, so they **cannot be combined
with `on-demand` weights** — the build fails rather than declaring a layout that never
materialises.

### `localFiles`

Files copied from your own repository into the payload. Added and removed with
[`scrollcase add file`](/v2/reference/cli#add) and [`remove file`](/v2/reference/cli#remove).

```jsonc
"localFiles": [
  { "sourcePath": "runtime/entrypoint.py", "relativePath": "entrypoint.py" },
  { "sourcePath": "legal/MODEL_NOTICE.md", "relativePath": "THIRD_PARTY_NOTICES/MODEL_NOTICE.md", "sha256": "4c7e…9a" }
]
```

`sha256` is an optional **pin**: when it is present, the build refuses a file whose contents no
longer match. Leave it off the files you are still writing — a script you edit every day would
otherwise fail its own build until you recomputed a digest by hand. Add it to the files that must
not change without review, such as a licence notice or a reviewed runtime shim. Either way, what
ships is hashed into the signed release, so the box's contents are always accounted for.

[`scrollcase refresh`](/v2/reference/cli#refresh) recomputes a pin after a reviewed change, so keeping
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
"uncompressedPaths": ["model-cache/hello", "corpora/images"]
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

### `assetBaseUrl`

Base URL the built archive and its objects are published under. It is what the signed release and
channel documents point at. Required unless passed per build with `--asset-base-url`.

## Self-test

Builder checks run with the payload's **own interpreter** before the box is archived. Schema
version 2 signs the import subset for a consumer to repeat; it does not carry the richer file or
`pythonCode` assertions.

```jsonc
"selfTest": {
  "imports": ["torch", "transformers"],
  "files": ["model-cache/hello/model.safetensors"],
  "pythonFile": "scrolls/hello-box/macos-aarch64-metal/self_test.py"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `imports` | yes | One or more modules imported with the box's interpreter, added with [`add import`](/v2/reference/cli#add). These names are signed and repeated by `verify --self-test` |
| `files` | no | Files that must still exist after pruning — this is what stops an over-aggressive prune from shipping a broken box. Defaults to empty |
| `pythonFile` | no | Project path to a Python file run after the imports succeed |
| `pythonCode` | no | The same thing inline, for a single assertion. Mutually exclusive with `pythonFile` |

Prefer `pythonFile` for anything longer than one line. A self-test is real code and deserves an
editor that knows it: in a file it keeps its syntax highlighting, its linter, and a readable diff,
where inline it is a JSON string with escaped newlines. `scrollcase new scroll` generates one next
to the scroll and points the field at it.

The target's own platform assertion is prepended automatically, and the run happens under the
accelerator's validation environment. The file is read at build time and executed from the payload
root, so it can read what the box ships and import what it packs. A file listed in `files` that is
a deliberately deferred on-demand asset is not required to be present. After pruning, the builder
checks required files, then runs the target assertion, imports, the extra Python, and finally
optional parity. A consumer runs the target assertion and signed imports only.

## Weights mode

```jsonc
"weights": "embed"
```

`embed` (the default) packs assets into the archive: the box installs with no network and works
air-gapped, at the cost of a large artefact. `on-demand` leaves them out and carries their URL,
path, size and SHA-256 in the signed release. A caller must materialize those files; the local
consumers verify them before execution and do not download them. A build may override this with
`--weights`. See
[Managing Model Weights](/v2/guides/managing-weights).

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
[Accelerator Parity](/v2/guides/accelerator-parity).

## Validation summary

Validation is ordered so malformed input cannot trigger a process, fetch, or build-directory
mutation:

1. Parse `scroll.json` and, when it declares `extends`, read and join its base first — neither half
   of a split scroll is a complete document, so validating one alone would report the other half's
   fields as missing. Validate the joined result against the shipped scroll and target schemas.
2. For a nested scroll, require a target, and require the parent and child directories to match
   `boxId` and the canonical target; reject invalid target/entry-point combinations and default
   on-demand weights with `assetArchives`.
3. Resolve a build-time `--weights` override and repeat the archive/policy check.
4. Require a matching native host, discover the exact tools, and require `pixi.lock`.
5. Record Git provenance and reject a dirty tree unless `--allow-dirty` was explicit.
6. Only then recreate build state, install from the lock, download verified assets, and enforce
   semantic checks whose inputs appear later, including lock/audit agreement.
