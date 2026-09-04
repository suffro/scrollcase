# Re-attaching to an installed box, and verifying it

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered.** Re-attaching to an already-installed box: the `sha256-path-list-v1` payload digest,
> `attachExtractedBox`, and the re-verification path. The digest format is frozen — see
> [`../decisions/payload-digest-v1.md`](../decisions/payload-digest-v1.md).

## Context

A Scrollcase box can be prepared and executed today, but **only within the process that extracted
it**. `verifyAndExtractBox` refuses a destination that already exists
(`src/consumer/verify-and-extract.mjs:107`), and the authority to execute lives in a process-local
`WeakMap` (same file, line 61; in Python a `WeakKeyDictionary` keyed on a `frozen=True, eq=False`
`PreparedBox`). So an application that installs a box once and runs it for months has no supported
way to run it after a restart: it must either re-extract to a fresh destination or use `runBox` into
a temporary directory, rewriting gigabytes at every launch.

This is inside Scrollcase's stated scope — *prepare and execute a caller-supplied local box* — and
not distribution policy. The fix is not to serialise the receipt: a receipt readable from JSON would
be a forgeable execution capability, which is exactly what the `WeakMap` prevents. The fix is to
**re-verify** and mint a fresh process-local receipt.

Re-verification then needs something to verify against. The signed release commits to
`archive.sha256` and `installedSizeBytes` — and the latter is explicitly a free-space figure, not an
integrity check. Nothing in the format describes the *extracted* tree, so without an addition an
attach could only check that files with the right names exist, and would hand back a receipt
asserting `boxId` and `version` about a directory it never identified. That is how an application
ends up believing it is running 2.1 while executing a stale 1.4 install.

Hence three coupled additions: a signed digest of the extracted payload, a way to attach to an
existing install, and a separate opt-in way to verify one.

**What this is not.** The digest is not a defence against a live local attacker and must never be
documented as one — the tree can change between verification and use, and Python imports lazily for
the whole life of the process. Guarding the directory belongs to the OS and the embedding
application. The digest binds a directory to a signed release, and detects ordinary corruption.

---

## What gets built

1. **`payloadDigest`** — an additive, optional field on the signed release manifest:
   `{ "format": "sha256-path-list-v1", "sha256": "<64 hex>" }`. It is the SHA-256 of a **list file**
   that travels inside the payload.
2. **`attachExtractedBox(releaseDocumentPath, { publicPath, root })`** — mints a `PreparedBox` from
   an already-extracted directory, without the archive and without reading gigabytes.
   Python: `attach_extracted_box(..., *, public_key_path, root)`.
3. **`verifyExtractedPayload(releaseDocumentPath, { publicPath, root })`** — standalone, opt-in,
   never called by attach or run. Python: `verify_extracted_payload`.
4. **`scrollcase verify --extracted <dir>`** — a flag on the existing verb, no new verb.

### The digest, precisely

At build, after `box.json` is written and before the archive, the payload is walked and a list file
`payload-digest.v1` is written **into the payload**. The release carries only that file's SHA-256.

Verification never walks the directory — **it walks the list**:

```
1. stream-hash <root>/payload-digest.v1, bounded read; compare to release.payloadDigest.sha256
2. only now parse the verified bytes          (never parse unverified input)
3. for each record: lstat the path under root, check kind, check content hash
```

Files absent from the list are never visited, so `__pycache__`, an app's `output.log` written at
`cwd: prepared.root`, and a filled `modelCacheSubdir` are invisible **by construction** rather than
by an exclusion rule. This is what a root hash over a re-walk could not do: there the directory is
the input, so any extra file breaks an honest box.

**The canonical stream** — identical in every implementation, so write it as a pure function:

```
PAYLOAD_DIGEST_FORMAT = "sha256-path-list-v1"

stream(entries) =
  utf8(PAYLOAD_DIGEST_FORMAT) + LF +
  concat(sorted_bytewise([ utf8(path) + NUL + kindByte + NUL + ascii(sha256hex) + LF ]))

  kindByte = 'f' for a regular file, 'l' for a symlink
  file  -> sha256 of the file's bytes
  link  -> sha256 of the UTF-8 link target string, exactly as collectEntries reports it
```

- **Sort whole records bytewise.** NUL sorts below every byte legal in a path and paths are unique,
  so this is identical to sorting by the path's UTF-8 bytes — two implementations cannot diverge by
  choosing one or the other. It also dissolves the existing Node/Python divergence
  (`compareStableStrings` is UTF-16 code-unit, Python `str` is code-point; they disagree above the
  BMP). **Do not change `compareStableStrings`** — it orders archive entries, and touching it would
  change the bytes of every rebuilt archive, breaking the byte-identical promise.
- **`sha256File` follows symlinks** — it must never be called on a `kind: 'link'` entry.
  `collectEntries` already supplies the discriminator.
- **The format name is inside the preimage**, so a future `-v2` cannot collide.
- **Framing is injective:** a newline is legal in a filename and is safe here because the path field
  is NUL-delimited and the hash field is fixed-width.

**Deliberately excluded, each for a reason that must survive review:**

| Excluded | Why |
| --- | --- |
| file mode | `archiveFileMode` (`src/build/archive.mjs:38-44`) *synthesises* `0o755`/`0o644` from `(target, path)` rather than preserving the payload's modes, so an observed-mode digest could never match an extracted tree; a canonical-mode digest would hash data already signed; and Windows extraction skips `chmod` entirely. |
| mtime | `normalizeTree` stamps the payload with `FIXED_ARCHIVE_TIME`, but no extractor restores mtimes — extracted files carry install wall-clock. |
| directories | `collectEntries` never emits them and `createDeterministicZip` never writes them; an empty directory is already lost between build and install. |

Pin the first two with conformance cases that **chmod** and **touch** a file and still pass.

---

## Implementation

### Stage 1 — the format

- **`src/contract/payload-digest.mjs`** (new) — `PAYLOAD_DIGEST_FORMAT`, `payloadDigestStream(entries)`,
  `parsePayloadDigestStream(bytes)`. Pure: no `fs`, no `crypto`, so it stays eligible for the browser
  subset. Follows the `src/contract/links.mjs` precedent — a lexical rule every implementation mirrors.
- **`src/contract/fixtures/payload-digest-contract.json`** (new) — golden vectors on the
  `target-id-contract.json` precedent, which AGENTS.md names as *the* way another language proves a
  mirror. Without this, Node and Python would only be proven to agree with themselves: the Node test
  fixture builds a real payload directory, the Python one (`python/tests/support.py`) builds the
  archive from an in-memory entry list and never has a payload directory at all. Cases: single file;
  ordering (`a/b` vs `a.txt`); a non-BMP path; a newline in a filename; a link and a file whose
  content bytes are identical (pins the kind discriminator); empty payload.
- **`src/build/filesystem.mjs`** — `payloadDigestEntries(root)` and `payloadDigest(root)`, built on
  the existing `collectEntries` + `sha256File`. Export `payloadDigest` from `src/build/index.mjs`.
- **`src/contract/schema/release-manifest.schema.json`** — the optional `payloadDigest` object,
  modelled on `installedSizeBytes` (line ~113), reusing `#/$defs/sha256`. Uses only keywords the
  runtime validator in `src/build/schema-validation.mjs` supports (`const`, `required`,
  `additionalProperties: false`, `$ref`) — no validator change needed. **Not** added to `required`.
- Mirror the schema: `npm run docs:schemas` (byte-identical copy, gated by
  `docs-contract.test.mjs:92`) and `python scripts/sync_schemas.py`; then `npm run types`.

### Stage 2 — the build emits it

`src/build/box.mjs`, in the window where the tree is final (after `box.json` at line 254, before
`normalizeTree` at 255):

```
write box.json                                    (existing, 244-254)
write payload-digest.v1 into the payload          ← new; not listed in itself
payloadDigestValue = { format, sha256: sha256(streamBytes) }
normalizeTree(payloadDir)                         (255 — now stamps the new file too)
installedSizeBytes = payloadSize(payloadDir)      (256 — now counts it, honestly)
createDeterministicZip(...)                       (258)
```

Then `payloadDigest: payloadDigestValue` into the release literal (270-284), between
`installedSizeBytes` and `pythonEntryPoint`. **No signing-layer change**: `signDocument`
canonicalises with insertion order, so the field is covered by the Ed25519 signature automatically.

Cost: one extra full sequential read of the payload at build. Fusing it into `createDeterministicZip`
was rejected — it couples the archive writer to a rule that is not about archiving, and the list must
exist before the zip. Record the choice in the module comment.

### Stage 3 — split the document half of inspection

`src/build/verify.mjs` currently mixes both halves in `inspectBoxArchive` (lines 78-101 are
document-only; 106-140 need the archive). Extract:

```js
export async function inspectReleaseDocument(releaseDocumentPath, { publicPath })  // 77-101 verbatim
export async function inspectBoxArchive(...)  // calls the above, then 106-140 unchanged
```

Move the `installedSizeBytes` sanity check (112-115) up into `inspectReleaseDocument` — it is a
document-level check — and add the equivalent `payloadDigest` shape check beside it. Mirror the split
in `python/src/scrollcase_consumer/verify.py:190`.

Rejected: an `{ archive: false }` option, which would make the return type conditional and force
every caller to know which half it received.

Also under Stage 3: **`verifyBox --self-test` compares the digest**, beside the existing
`installedSizeBytes` comparison at `verify.mjs:180-182`. That verb already extracts the whole archive
and runs the interpreter, and it is the pre-publish gate — it is the only place that proves the
build-time digest matches what the archive actually extracts to, before a box is signed and shipped.

`verifyAndExtractBox` does **not** compare it: the archive SHA-256 is checked before extraction and
re-checked after (line 134) and already covers every payload byte, so the digest proves nothing new
there, while costing a second full read of a tree just written.

### Stage 4 — the Python collector

`python/src/scrollcase_consumer/extract.py` — add `collect_entries(root)` returning
`(path, kind, link_target)` with `os.sep` normalised to `/`, and re-express the existing
`collect_files` on top of it so there is one walk, one exclusion list, one special-node refusal. Add
`payload_digest(root)`. Mirror the pure stream function in `_contract.py`, driven by the golden
vectors from `python/tests/test_contract.py`.

### Stage 5-6 — attach and verify, both languages

Both functions live in the existing `src/consumer/verify-and-extract.mjs` and
`python/.../verify.py` — no new module files, which avoids a new white-paper module row and a new
`PACKAGE_FILES` entry in `python/scripts/check_distribution.py`. Update the Node module header.

**`attachExtractedBox`:**

```
1. resolve root; lstat; refuse if missing, not a directory, or a symlink
2. inspectReleaseDocument(...)
3. assertNativeHost(adapter)  — with runExtractedBox's exact wording
4. files = collectFiles(root); require release.pythonEntryPoint; assertExecutionFiles(...)
5. verifyRequiredAssets(root, on-demand assets)
6. installedSizeBytes = payloadSize(root)      (lstat-only; measured, never compared)
7. re-lstat root; refuse if dev/ino changed since step 1
8. freeze receipt with status: 'attached'; bind { release, rootIdentity } in the WeakMap
```

Three non-obvious points:

- **A symlinked root must be refused.** `runExtractedBox` requires `rootMetadata.isDirectory()`
  (`run-extracted.mjs:126`) and `lstat` on a symlink reports `false`, so without this check attach
  mints a receipt that can never run.
- **Attach asserts the native host; prepare does not.** This is a real asymmetry, and
  `docs/white-paper.md` §8.7 currently states the opposite in prose. Do not clone the three
  per-target `prepare` conformance cases — two of the three would fail on any host.
- **`verifyRequiredAssets` must move down**, from `run-extracted.mjs:49` into
  `verify-and-extract.mjs` (and `run.py:78` into `verify.py`, changing the signature from
  `(prepared)` to `(root, assets)`). Importing it upward would create an ESM cycle, since
  `run-extracted.mjs` already imports `preparedBoxState`.

**`verifyExtractedPayload`:** `inspectReleaseDocument` → refuse a release with no `payloadDigest`
("built before payload verification existed") or an unsupported `format` → hash the list file
(bounded read, documented cap) → compare → parse → check each listed path, failing on the first
mismatch **and naming it**. Returns a small frozen result (`status`, `root`, `boxId`, `version`,
`targetId`, `entryCount`); Python returns a `PayloadVerification` dataclass in `models.py`.

**`PreparedBox.status` widens to `'prepared' | 'attached'`.** No in-repo reader breaks — the only
readers are two conformance drivers and two unit tests, all comparing against a literal, all of
which would fail loudly. Amend the `installedSizeBytes` doc from "logical size of the verified
extracted payload" to a *measurement* of the root at receipt time, since on an attached receipt it
proves nothing. Also update `preparedBoxState`'s error message in both languages to name both
producers. Note `models.py:54` deliberately has no `slots=True` so `PreparedBox` keeps `__weakref__`
— add a comment on the line being edited.

Register the exports: `src/consumer/index.mjs`, `python/.../__init__.py` `__all__`,
`tests/unit/package-surface.test.mjs` `typeof` probes, `tests/fixtures/typescript-consumer/index.ts`
(exercise both, the widened `status`, and one `@ts-expect-error` proving it no longer narrows to
`'prepared'`), `python/tests/test_public_api.py`.

### Stage 7 — conformance

**First, fix a latent bug and prove the fix.** Both drivers dispatch
`if (action === 'run-prepared') … else { runBox }` with no `default`
(`tests/helpers/consumer-conformance.mjs:306-340`, `python/tests/conformance_support.py:331-359`), so
an unrecognised action silently runs the wrong branch and passes green. Add an explicit
`default: throw` in both, typo one action, confirm **both** suites go red, restore.

Then two new actions, `attach` and `verify-payload`, plus a `runtime.attach` flag on `run-prepared`.
New cases:

- *Attach, success:* attach to a prepared root; **attach then run** producing argv/cwd identical to
  the existing `run-prepared` case (the load-bearing one — `runExtractedBox` must work unchanged);
  linked interpreter; on-demand assets present; **extra files in the root ignored**.
- *Attach, rejection:* missing root; root is a file; root is a symlink; missing entry point; missing
  script (reuses `missing-script`); foreign target; asset missing / wrong hash (reuse existing).
- *verify-payload:* matches; **ignores extra files**; **ignores a chmod**; **ignores a touch**;
  tampered file; deleted file; retargeted symlink; on-demand assets ignored; release without a
  digest; missing list file; tampered list file.

New `errorPatterns` entries must each be checked against every existing message — `classifyError`
iterates and returns the **first** match, unanchored. In particular `payload-mismatch` must not
shadow the existing "Extracted payload size does not match the signed release."

Fixture helpers gain a `payloadDigest: false` option and a non-native-target selector; the Python
fixture must compute the digest from its in-memory entry list (which is exactly why the golden
vectors in Stage 1 exist).

### Stage 8 — CLI

`src/cli.mjs` stays thin: a flag branch that calls `verifyExtractedPayload` from `src/consumer/`
(not a reimplementation in `src/build/verify.mjs`), mirroring how `run` reaches the consumer. Refuse
`--extracted` combined with `--archive` or `--self-test` with one clear line. Add the flag to
`node src/cli.mjs help`; `docs/reference/cli.md` is diffed against that output
(`docs-contract.test.mjs:135`), so the literal `--extracted` must appear there.

### Stage 9 — docs (a behaviour change not reflected here is unfinished)

- `docs/white-paper.md`: §12.1 module table (5527-5534) for `src/contract/payload-digest.mjs`; §12.2
  export tables (5598, 5621-5631) for all three new exports — **test case 2 fails without every
  named runtime export appearing**; §8.1 parallel-surfaces table (3874-3890); §8.2 for the
  `inspectReleaseDocument` split; §8.3 for `'attached'`; a new §8 subsection; §8.7 case/pattern
  counts **and** the sentence claiming preparation has no native-host requirement; line 3183, where
  the release-only field list must gain `payloadDigest`; the `installedSizeBytes` paragraph at 2032.
  Four places say "three operations" (5426, 5551, 5598, and `test_public_api.py`).
  Leave line 2016 ("Thirteen required fields") alone — the field is optional.
- docs/reference/api.md (consumer section, both languages), `docs/reference/box-format.md`,
  `docs/guides/distributing-boxes.md`, `python/README.md:21`.
- `docs/concepts/design-decisions.md` — one entry with its rejected alternatives, per that file's
  governing rule. Record: a per-file list in the release was rejected (megabytes for a 10k-30k-file
  venv); a root hash over a re-walk was rejected (it cannot ignore extra files); folding verification
  into `attach` or `run` was rejected; mode and mtime were rejected. State the limits plainly — the
  TOCTOU window, **and** that `__pycache__`/`*.pyc` are excluded by the collector and therefore a
  permanent blind spot, not merely a timing gap.
- `CHANGELOG.md` — a new `### Added` under `## [Unreleased]`, stating that `schemaVersion` is
  unchanged because the field is additive.

**Leave both golden example fixtures untouched.** `signed-release.example.json` cannot gain the field
— only its public key ships, the private key is gone, and `contract-schema.test.mjs:170-186` verifies
its signature. Adding the field to the unsigned `release-manifest.example.json` alone would make the
two disagree. Show the field in `docs/reference/box-format.md` prose and the schema instead.

---

## Verification

At every stage: `npm test`. Full gate at the end:

```
npm test
npm run types:check
cd docs && npm run build                      # VitePress fails on a dead link
cd python && python -m unittest discover -s tests -t .
cd python && mypy src
cd python && python scripts/sync_schemas.py --check
cd python && python -m build && python scripts/check_distribution.py dist/*
```

Then deliberately break one `package.json` `files`/`exports` entry and confirm the package-surface
test still fails (AGENTS.md item 4).

**Prove each new guard can fail** (AGENTS.md testing convention): delete the digest comparison,
confirm red, restore; same for the attach root check, the attach `assertNativeHost`, and the
conformance `default: throw`.

**The paths that break silently**, checked against this change:

1. **Three targets.** Windows boxes are link-free, so a Windows digest carries no `l` record — but
   the code path must be identical, since a Linux box is verified on Linux. The new Python
   `collect_entries` must normalise `os.readlink` results to `/` even though it is a no-op on POSIX.
   Windows never `chmod`s on extraction, a third independent reason mode is excluded.
2. **`embed` vs `on-demand`.** Under `on-demand` the assets are absent at build, absent from the
   list, and present at verify time as ignored extras — their integrity is covered separately by the
   per-file `requiredAssets` hashes in attach and run. Under `embed` the weights *are* in the list,
   so `verifyExtractedPayload` and `verify --self-test` read tens of gigabytes. Document that
   asymmetry rather than letting someone discover it.
3. **Local key vs external signer.** No signing change, but the external signer now receives
   different payload bytes; the `valid-external-signer` conformance case asserts byte-exact
   echo-back and is the guard. Confirm it still passes.
4. **Toolchain discovery.** Untouched — the digest is computed from the filesystem after packing and
   invokes no tool.

**Not run without asking:** a real box build or toolchain install (gigabytes, minutes). Every test
above uses the in-memory/tmp fixtures, which need no pixi or conda-pack.

---

## Deliberately out of scope

- No serialisable receipt, no `force`/`overwrite` on `verifyAndExtractBox`, no verification folded
  into `run`, no `verifyPayload` flag on attach.
- No channel/revocations reading in the consumer; anti-replay and rollback policy stay with the
  embedding application.
- No Rust consumer — deferred by decision, and it must not start before this lands or it inherits
  the same gap in a third language.
