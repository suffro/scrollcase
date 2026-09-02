---
title: Managing Assets
description: Declare, verify, embed or defer the files a box carries.
---

# Managing Assets

An asset is usually the largest thing a box carries, and the only part fetched from a server
nobody controls — model weights, a dataset, a compiled tool. Scrollcase treats them the same way it
treats everything else: declared up front, verified before use, and committed to by hash in the
signed release.

## Declare an asset

Every asset carries a URL, a destination inside the payload, a size, and a SHA-256:

```jsonc
"assets": [
  {
    "url": "https://huggingface.co/example-org/model/resolve/main/model.safetensors",
    "relativePath": "cache/hello/model.safetensors",
    "sizeBytes": 438012416,
    "sha256": "9f2b7c1e04a83d5641b0e7c28a3d95f7c9d1a4e60b8f37c25e9a4d7081da5b3f"
  }
]
```

Do not fill those two in by hand. `add asset` fetches the URL once and records the size and hash it
actually found:

```sh
scrollcase add asset my-model https://…/model.safetensors
```

It also adds the payload path to `selfTest.files`, so an over-eager `prunePaths` cannot quietly drop
it. Use `--to <payload path>` to land it somewhere other than the box's cache directory, `--target`
to give it to one target only, `--on-demand` to leave it out of the archive, and `--executable` for
a file that has to run. If you would rather write the entry yourself, the two values come
from `shasum -a 256 model.safetensors` and `wc -c < model.safetensors`.

Nothing enters the payload before **both** match. That is what makes a box reproducible even
though its inputs live on servers outside anyone's control: if an upstream file is moved,
replaced, or silently re-uploaded, the build fails instead of quietly producing a different box
under the same version.

::: tip Resume boundary
A dropped connection is retried inside one download operation, resuming its `.part` file with a
Range request. The partial is renamed only after size and hash match. Build scratch is recreated
at process start, so a new build process does not reuse an earlier partial or provide a persistent
asset cache.
:::

## Archives that need unpacking

When the upstream artefact is a tarball or zip, declare it as an asset and then expand it:

```jsonc
"assets": [
  {
    "url": "https://example.org/model/weights-v1.tar.gz",
    "relativePath": "cache/hello/weights.tar.gz",
    "sizeBytes": 1073741824,
    "sha256": "4c7e…9a"
  }
],
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

- Entries are listed and validated **before** extraction, so a malicious archive cannot write
  outside its destination.
- `stripComponents` drops the redundant top-level wrapper directory many published archives
  carry. It insists on finding exactly one directory to strip, so a surprising layout fails
  loudly rather than producing a wrong tree.
- Extraction never overwrites a file already present in the destination.
- `removeAfterExtract` defaults to `true`: the compressed original is dead weight inside the
  payload once unpacked.

## Compression

An asset usually arrives already compressed, and deflating it again is pure loss. Measured on
incompressible bytes: level 6 runs at 47 MB/s and the archive comes out **0.03% larger** than the
input, and dropping to level 1 recovers 4 MB/s because the search fails either way. Lowering the
level is not the fix — not compressing is.

So every path you declare in `assets` is **stored** in the archive rather than deflated. You do not
have to ask for this and there is nothing to configure.

For anything else your box carries that is already compressed — the tree an `assetArchives` entry
expanded into, a bundled corpus of JPEGs — say so:

```jsonc
"uncompressedPaths": ["cache/hello", "corpora/images"]
```

An entry matches that path and everything beneath it. Nothing is decided by looking at the file or
its extension: the choice comes from the scroll alone, which is what keeps two builds of the same
commit byte-identical. The interpreter, `site-packages` and the notices compress genuinely and
still do.

## Files from your own repository

Runtime shims, licence notices, a parity check script — anything you maintain yourself — go in
`localFiles`:

```sh
scrollcase add file my-model runtime/entrypoint.py
```

```jsonc
"localFiles": [
  { "sourcePath": "runtime/entrypoint.py", "relativePath": "entrypoint.py" },
  { "sourcePath": "bin/launch.sh", "relativePath": "bin/launch.sh", "executable": true },
  { "sourcePath": "legal/MODEL_LICENSE.txt", "relativePath": "MODEL_LICENSE.txt", "sha256": "…" }
]
```

`sourcePath` is relative to the project root; `relativePath` is inside the payload.

`sha256` here is an optional **pin**, and the difference from an asset's is the point. An asset
arrives over a network nobody controls, so its hash is what stands between a substituted file and a
silently different box. A local file comes out of your own checkout, where git already records what
changed, and what ships is hashed into the signed release either way. So pin what must not change
without review — a licence notice, a reviewed shim — and leave the pin off the shim you are still
writing, which would otherwise fail your next build over an edit you meant to make.
[`scrollcase refresh`](/reference/cli#refresh) recomputes a pin after a reviewed change.

## Embed or defer

This is the one real decision, and it is made **per asset**, in the scroll:

| | `embed: true` (default) | `embed: false` |
| --- | --- | --- |
| The file lives | inside the archive | on your asset host |
| Install needs network | no — **works air-gapped** | yes |
| Archive size | large | small |
| Integrity guaranteed by | the archive's own signed hash | the per-asset size + SHA-256 in the signed release |

```jsonc
"assets": [
  { "url": "https://…/entrypoint-config.json", "relativePath": "cache/hello/config.json",
    "sizeBytes": 786, "sha256": "27 47…c2" },
  { "url": "https://…/model.safetensors", "relativePath": "cache/hello/model.safetensors",
    "sizeBytes": 438012416, "sha256": "9f2b…3f", "embed": false }
]
```

That box ships its small config inside the archive and defers the large weights — which version 2
could not express at all, because the choice was a single box-wide `weights` switch. There is no
build-time override, deliberately: overriding a per-asset declaration would repack the box under an
identity that no longer describes it, and `build` prints what the scroll decided rather than
offering a menu in front of it.

### What deferring puts in the release

A deferred asset is left out of the archive, and its descriptor travels in the signed release and in
`box.json`:

```jsonc
"assets": [
  { "url": "https://…/model.safetensors", "relativePath": "cache/hello/model.safetensors",
    "sizeBytes": 438012416, "sha256": "9f2b…3f" }
]
```

The list is exactly the deferred entries and nothing else — on this side of the wire, the list
*is* the statement, so there is no separate mode field to disagree with it. The declared hash is
what makes deferring safe: the release **commits to exactly which bytes the box expects**, whatever
host serves them. Retrieval belongs to the caller's distribution layer, which places each asset at
`relativePath` under the box root. The official consumers do not fetch assets; they check every
materialized file's size and hash before execution.

::: warning Two consequences
An `assetArchives` entry has no `embed` field at all: an archive is expanded at build time, so
deferring one would declare a layout that never materialises. And a file listed in `selfTest.files`
that is a deferred asset is legitimately absent from the payload, so it is skipped by the post-prune
check.
:::

### Choosing

Embedding is the default because air-gapped installation is a property worth keeping unless a
project explicitly trades it away, and because it is the behaviour that surprises nobody: what
you verified is what you install.

Defer the entries that would make the archive unreasonable to move around, that are shared by
several boxes, or that your asset host is already the thing your users download from. Then read
[Offline / Air-Gapped Installs](/guides/offline-airgap) to understand what you gave up.

## Files that have to run

A downloaded file arrives with no permission bits — HTTP carries content, not permissions — and a
local file is copied rather than moved, so neither has a mode to inherit. Declare it:

```jsonc
"assets": [
  { "url": "https://…/tool", "relativePath": "bin/tool",
    "sizeBytes": 4212992, "sha256": "1b82…db", "executable": true }
]
```

The bit is **synthesised** into the archive from that declaration and never read off the build
machine, which is what keeps two builds of one commit byte-identical whatever umask each ran under.
Extraction sets it explicitly rather than letting `open(2)` mask it away, so a box unpacked under a
restrictive umask still runs.

The runtime's own files need no declaration: the interpreter and the console scripts a conda prefix
generates are covered by a rule the runtime carries, because a prefix generates hundreds of them and
no scroll could name them by hand.

## Keeping the box small

Everything the environment does not need at run time can be pruned before packing:

```jsonc
"prunePaths": [
  "venv/share/doc",
  "venv/lib/python3.11/site-packages/numpy/tests",
  "venv/lib/python3.11/site-packages/scipy/io/tests"
]
```

::: warning Literal paths, not globs
Each entry is a single path removed recursively — there is no pattern matching. A glob such as
`.../**/tests` matches nothing and is removed silently, so list the directories explicitly and
check the resulting archive size to confirm the prune did what you expected.
:::

Guard against over-pruning by listing what must survive:

```jsonc
"selfTest": {
  "imports": ["torch", "numpy"],
  "files": ["cache/hello/model.safetensors", "entrypoint.py"]
}
```

A box is a multi-gigabyte download for an end user, so pruning is a user-facing concern rather
than tidiness — but a box that unpacks and cannot run is worse than a large one. The self-test
runs after pruning, with the box's own runtime, precisely to catch that.

## Where assets live inside the box

`cacheSubdir` names the directory holding the box's own large files, relative to the box root
(`cache/hello` above). Keep asset `relativePath` values under it so an installed box has one obvious
place where its data is, and a consumer can find it without parsing anything.
