---
title: Updating Boxes
description: Decide what needs a new box, what can be reused, and what the consuming application updates separately.
---

# Updating Boxes

A Scrollcase release is an immutable snapshot of one program for one target. Updating it is
therefore simple: change the source, give the box a new version, build, verify, and publish the new
release. The old release remains valid, which makes side-by-side installation and rollback
straightforward.

This is the same for every runtime. A box may start a Python script or module, a Node script, or a
native binary; the update model does not change.

::: tip The short version
- If something declared by the scroll changes, build a new box release.
- Re-run `lock` only when the dependency environment changes.
- Large deferred assets stay outside the archive and can be reused by hash.
- Files intentionally managed by the consuming application can change without rebuilding the box.
- Promoting or rolling back an existing release changes lifecycle state, not the release itself.
:::

## Start with what changed

Upgrading to a builder that supports `assetArchives[].executables` also makes its self-test use
the exact modes the archive will carry. A helper that only ran because extraction left it
executable on the build machine now fails during the build, where installed users already failed.
Add the member's path to its archive entry's `executables`, relative to the destination after
stripping, then increment the box version and rebuild. Use `executable: true` for a direct asset
or local file. See [archive declarations](/reference/scroll#assetarchives).
Older builders reject this new optional field; installed consumers already understand the ZIP
permissions and need no format upgrade.

<Tabs :titles="['Code & configuration', 'Dependencies', 'Assets', 'Channels & rollback']">
<Tab title="Code & configuration">

Build a new release when changing files or declarations that are part of the box, including:

- Python or JavaScript entry points;
- a native executable;
- local configuration shipped in `localFiles`;
- the signed environment, execution arguments, self-test, pruning, labels or compatibility rules.

The dependency lock can stay as it is when the environment did not change. If a changed local file
has an explicit SHA-256 pin, run [`scrollcase refresh`](/reference/cli#refresh) after reviewing the
change. Then increment the box version and build each affected target.

The user downloads the new archive. Deferred assets whose hashes did not change can be reused by
the consuming application.

</Tab>
<Tab title="Dependencies">

Adding, removing or upgrading a dependency changes the environment itself. Update `pixi.toml`, then:

1. run [`scrollcase lock`](/reference/cli#lock) for the affected target;
2. review the new lock and dependency licence audit;
3. increment the box version;
4. build and verify the new release.

Changing the Python or Node runtime version follows the same path because the interpreter is part
of the locked environment. For a native box, changing a library supplied by the environment also
requires a new lock; replacing only the project-built binary does not.

The build still installs exactly what the committed lock names. Nothing is resolved on the user's
machine. See [Why Pixi & Conda-Forge](/concepts/why-pixi) for the reasoning behind that boundary.

</Tab>
<Tab title="Assets">

An asset's URL, destination, size, SHA-256 and embedding choice are part of the scroll. If any of
those declarations changes, publish a new box release.

When bytes at a pinned URL change, `scrollcase refresh --check-assets` reports the mismatch without
accepting it. After checking why the upstream file changed, `scrollcase refresh --repin` records the
new size and hash. The new descriptor is then signed by the next build.

Whether users download the whole archive depends on the asset:

- an **embedded asset** is inside the archive, so it travels again with the new box;
- a **deferred asset** stays outside the archive, so the consuming application can reuse every file
  whose signed hash is unchanged and fetch only new hashes.

The builder does not download or pack deferred assets during `build`. The authoring step still has
to read an asset once when first pinning or deliberately repinning it, because its size and hash
cannot be guessed.

</Tab>
<Tab title="Channels & rollback">

No rebuild is needed to promote a release that already exists. A channel is a separately signed,
mutable pointer, so moving an existing release from `beta` to `stable` does not change or re-sign
that release.

Rollback is similar: the consuming project can reactivate an older verified installation or move
its channel policy back to a previous immutable release. Scrollcase defines the signed documents;
the project decides promotion, rollout, activation and rollback policy.

Publish immutable box objects first and the mutable channel pointer last. The complete layout and
ordering are covered in [Distributing Boxes](/guides/distributing-boxes).

</Tab>
</Tabs>

## Choose where large or frequently changing files belong

There are three useful choices. The right one depends on whether the release must guarantee the
exact file, not on whether the file happens to be a model weight, dataset, ruleset, dictionary,
media bundle or another kind of program data.

<Tabs :titles="['Embedded', 'Deferred', 'External input']">
<Tab title="Embedded">

Embed a file when the box must contain everything it needs:

```jsonc
"assets": [
  {
    "url": "https://downloads.example.org/data/rules-v1.bin",
    "relativePath": "data/rules.bin",
    "sizeBytes": 845211,
    "sha256": "9f2b…3f"
  }
]
```

This is the simplest installation: one archive, no asset download at install time, and full
air-gapped operation. The trade-off is equally direct: a new box archive contains the embedded file
again, even when a code-only change left its bytes untouched.

Choose this for modest files, offline installations, or anything that must never be separated from
the executable payload. See [Offline / Air-Gapped Installs](/guides/offline-airgap).

</Tab>
<Tab title="Deferred">

Set `embed: false` when Scrollcase must still bind the release to exact bytes but the file is too
large or too widely shared to place in every archive:

```jsonc
"assets": [
  {
    "url": "https://downloads.example.org/data/corpus-v1.bin",
    "relativePath": "data/corpus.bin",
    "sizeBytes": 43801241600,
    "sha256": "9f2b…3f",
    "embed": false
  }
]
```

The archive contains the program and environment, while the signed release contains the deferred
asset descriptor. The consuming application follows one small rule:

1. look for the declared SHA-256 in its local cache;
2. reuse and materialize it when present;
3. otherwise fetch the URL, check size and SHA-256, then materialize it;
4. let the Scrollcase consumer verify it again before execution.

With that pattern, a code-only release downloads a new, relatively small box archive and reuses the
large file. If one of several deferred files changes, only the file with the new hash needs to be
fetched.

Scrollcase consumers expose the signed descriptors as `requiredAssets` / `required_assets`; they
verify the materialized files but deliberately do not choose a cache or download policy. See
[Managing Assets](/guides/managing-assets#embed-or-defer) and the
[Node](/reference/api/node#preparation), [Python](/reference/api/python), or
[Rust](/reference/api/rust) consumer API.

</Tab>
<Tab title="External input">

Keep a file outside the scroll when it is input selected and updated independently by the consuming
application. This can be a user's document, a database, a separately released dataset, a plug-in
configuration, or model data whose lifecycle already belongs to the application.

No special service is required. In the simplest design, the application keeps an ordinary cache
directory, verifies each file using its own trusted metadata, and passes its path to the box as an
argument or environment value when it runs.

Updating that file does not rebuild the box because the box release never claimed to identify it.
The trade-off is explicit: Scrollcase cannot verify a file that is not in its signed release. The
application must own its integrity, compatibility, download and rollback rules. Executable code or
a library imported by the runtime normally belongs in the box instead.

Use this option when the data genuinely has an independent release cycle. Do not use it merely to
bypass a failed Scrollcase hash check.

</Tab>
</Tabs>

::: info A rebuild is not necessarily a large transfer
Changing a deferred asset descriptor still requires a new box release because the descriptor is
repeated in `box.json` and the signed release. The rebuilt archive does **not** contain that asset.
Rebuild cost, archive download and asset download are three separate things.
:::

## Examples for each runtime

<Tabs :titles="['Python', 'Node', 'Native']">
<Tab title="Python">

- Edit an entry-point `.py` file: build a new box; keep the existing lock.
- Upgrade Python, NumPy or another dependency: update and review the lock, then build.
- Keep a large model or dataset deferred when the release must identify its exact bytes.
- Pass a user-selected document or independently managed model path as an external input.

</Tab>
<Tab title="Node">

- Edit the declared `.js` entry point: build a new box; keep the existing lock.
- Upgrade Node or a package supplied by the locked environment: update and review the lock, then
  build.
- Defer a large ruleset, search index or data bundle when it belongs to the release but not the
  archive.
- Pass user content and application-owned data paths as external inputs.

</Tab>
<Tab title="Native">

- Replace the declared binary: build a new box; the lock changes only if its environment
  dependencies changed.
- Upgrade a native library installed through pixi: update and review the lock, then build.
- Defer large reference data that must be verified against the release.
- Pass media, documents or other per-run inputs as ordinary paths.

</Tab>
</Tabs>

## One box or several?

Use separate boxes when the application is coordinating separate executable programs: for example,
a native preprocessing tool and a Python analysis service. The application can run each verified
box and pass data between them through normal files, arguments, standard input or its own IPC.

Scrollcase does not define box-to-box dependencies, discovery or communication. Each box remains an
independent release that can be updated and rolled back on its own.

Do not create a second box merely to hold data for the first one. A box is an executable runtime,
not a data archive. For shared files, use a deferred asset when Scrollcase should verify them, or an
external input when the application intentionally owns their lifecycle.

## A safe consumer update

The consuming application keeps updates uncomplicated by installing side by side:

1. select a signed release according to its channel and compatibility policy;
2. download the new archive and verify it before extraction;
3. extract into a fresh destination — consumer APIs refuse to overwrite an existing one;
4. materialize deferred assets, reusing cached hashes where possible;
5. verify the completed installation and perform the application's readiness check;
6. activate it, while keeping the previous verified installation available for rollback;
7. remove old versions later according to the application's storage policy.

This exposes either the complete old installation or the complete new one, never a directory being
modified underneath a running process. The [Node](/reference/api/node),
[Python](/reference/api/python) and [Rust](/reference/api/rust) consumer APIs provide the common
local verification and execution semantics; [Distributing
Boxes](/guides/distributing-boxes#the-clients-side) covers channel selection and transport
responsibilities.

## Why there is no “accept changed bytes” flag

The signed size and SHA-256 are what make both verification and safe cache reuse possible. A flag
that accepted different bytes behind the same URL would make one release mean different things on
different machines.

When bytes are intentionally part of the release, update their descriptor and build a new release.
When they intentionally change outside the release, model them as external input and verify them in
the consuming application. Both paths are simple; neither requires weakening the box's guarantees.

## Update checklist

| Change | New lock? | New box release? | What the user needs |
| --- | --- | --- | --- |
| Entry point, local code or signed configuration | No | Yes | New archive |
| Python, Node or environment dependency | Yes | Yes | New archive |
| Native binary only | No | Yes | New archive |
| Add a target | For that target | Build that target | New target archive |
| Embedded asset bytes or descriptor | No | Yes | New archive including the asset |
| Deferred asset bytes or descriptor | No | Yes | New archive plus assets with new hashes |
| Code changes; deferred assets stay identical | No | Yes | New archive; cached assets can be reused |
| External application input | No | No | Application updates the input |
| Promote an existing release | No | No | Updated channel policy or pointer |
| Roll back to an installed release | No | No | Reactivate the previous verified installation |
| Rotate signing keys | No | Not by itself | Update trust anchors safely; see [Signing & Key Custody](/guides/signing-and-custody) |

For automated target builds, the official [GitHub Action](/guides/github-actions) runs the same
build and verification pipeline in CI without taking ownership of upload or rollout.
