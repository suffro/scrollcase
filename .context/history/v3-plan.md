# Scrollcase v3 — multi-runtime, generalised assets

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered.** The plan for the version 3 format break, executed in three phases and
> released as `scrollcase@1.0.0` on 2026-09-02. The per-phase records are
> [`v3-phase-a.md`](v3-phase-a.md), [`v3-phase-b.md`](v3-phase-b.md) and
> [`v3-phase-c.md`](v3-phase-c.md); read them for what the plan got wrong.

## Context

Scrollcase today packs exactly one thing: a pixi/conda-forge **Python** environment, shaped by the
assumption that the payload is an AI model. Three consequences motivate this work.

**The format carries a consumer's vocabulary.** `modelId` is required and never read by any code
path. `weights: embed | on-demand` is a box-wide switch whose name describes model weights but whose
mechanism is "are asset files inside the archive or not". `selfTest.pythonImports` puts Python syntax
in the signed wire format. None of these are what Scrollcase actually is.

**The runtime seam is half-built.** `boxTargetAdapter()` is already threaded through every function
that needs layout knowledge, but it is keyed on `(platform, arch)` only and carries the runtime facts
inside it as a nested `python: {…}` object plus `condaSubdir` and `selfTestPython`
(`src/contract/targets.mjs:63-149`). Three call sites bypass it and hardcode venv/
(`src/build/pixi.mjs:363`, `src/build/execution.mjs:22-24`). The abstraction exists but is fused to
one runtime.

**Assets cannot express what users need.** `embed`/`on-demand` is all-or-nothing, so a box cannot
ship a small entrypoint binary while deferring a 30 GB dataset. And a downloaded asset arrives with
no Unix permission bits at all — HTTP carries content, not modes — so today an executable payload
file can only get its `+x` from the `venv/bin` heuristic in `archiveFileMode`
(`src/build/archive.mjs:37-44`).

**Outcome.** A v3 format that is runtime-agnostic, an internal seam that makes a new runtime an
adapter rather than a fork, and two new runtimes: `native` (already-compiled binaries) and `node`.
R is deliberately out of scope for now — its conda-forge relocatability is an empirical unknown that
needs cold verification on three OSes before any code is written.

**Decisions already taken** (see the Q&A that produced this plan):
- Identity: a real `runtime` block replaces `modelId` and `runtimeId`; free-form labels move to an
  optional `labels` map.
- `native` boxes still resolve a pixi environment. One substrate holds; the licence audit stays
  derived from `pixi.lock` for every box.
- The executable bit stays **synthesised**, but from a declaration instead of a Python path
  heuristic. `payload-digest.v1` is not touched and a post-extraction `chmod` stays invisible to
  verification.

### Recommended Codex effort

Quick, deliberately high-side estimates from this plan alone; they are not based on a fresh code
audit. Use `high` as the minimum default. Reserve `xhigh` for broad cross-language work, the
wire-format break, and the riskiest integration points; `max` is not justified here. Execute the
phases separately rather than asking Codex to implement the whole plan in one run.

| Work item | Effort |
| --- | --- |
| **Phase A overall** | **`xhigh`** |
| A1 runtime contract module | `high` |
| A2 slim target contract | `medium` |
| A3 builder runtime tree and code moves | `high` |
| A4 remove the three adapter bypasses | `medium` |
| A5 tri-language runtime fixture and mirrors | `xhigh` |
| A6 consolidate version rejection | `medium` |
| Gate A and byte-identical rebuild diagnosis | `high` |
| **Phase B overall** | **`xhigh`** |
| B1 schema v3 break | `xhigh` |
| B2 generalised self-test | `high` |
| B3 per-asset embed | `high` |
| B4 executable modes and umask parity | `xhigh` |
| B5 propagate through all three consumers | `xhigh` |
| B6 fixtures, signatures, examples, and docs | `xhigh` |
| Gate B and cross-language failure diagnosis | `xhigh` |
| **Phase C overall** | **`xhigh`** |
| C1 native runtime | `high` |
| C2 native licence declaration | `xhigh` |
| C3 node runtime and launcher validation | `xhigh` |
| C4 CLI and authoring | `high` |
| Gate C, excluding the explicitly approved real builds | `high` |

---

## What is NOT changing

Stated up front, because each is load-bearing and easy to erode:

- **`payload-digest.v1`** — format string `sha256-path-list-v1`, its golden vectors in
  `src/contract/fixtures/payload-digest-contract.json`, and its deliberate exclusion of mode and
  mtime (`src/contract/payload-digest.mjs:24-31`). The conformance cases
  `payload-verification-ignores-chmod` and `payload-verification-ignores-on-demand-assets` stay green
  unchanged.
- **`target-id-contract.json`** and the target-ID rule. The runtime is **not** part of `targetId`;
  it is a manifest-level block. The Python and Rust target mirrors are untouched.
- **One substrate.** pixi + conda-pack + conda-forge, for every runtime.
- **`launcherKind: 'uv-windows-pe'`** — a frozen wire string.
- **Published v1 and v2** — historical. The v3 verifier rejects both clearly; there is no dual-read
  path anywhere.

---

## Phase A — extract the runtime seam (internal only, no wire change)

Behaviour-preserving refactor. Nothing in any schema, document, or fixture changes; the examples must
rebuild byte-identical. This lands first so the v3 wire change in Phase B is a rename over a settled
structure rather than a redesign.

### A1. New contract module: `src/contract/runtimes.mjs`

Sits beside `targets.mjs` and is contract-level for the same reason: a consumer unpacking a box
relies on it. Shape:

```js
runtimeAdapter(runtimeId) -> {
  id,                                  // 'python' | 'node' | 'native'
  executionKinds,                      // ['python-script', 'python-module']
  layout(target),                      // { root, entryPoint, scriptsDirectory, executableSuffix, launcherKind }
  executionEnvironmentVariables,       // PYTHONPATH, PYTHONHOME, … (runtime half only)
  executablePayloadPaths(target),      // rule for paths the runtime itself requires +x on
  resolveExecutionFiles({ execution, runtimeVersion, target }),  // candidate payload paths
  buildArgv({ execution, root, target }),                        // [command, args] — no shell, ever
  selfTestArgv({ probe, target }),
}
runtimeAdapters()                      // enumeration, for contract tests
assertRuntimeEntryPoint(runtimeId, target, entryPoint)
```

Only the pure, mirrorable half lives here — layout, kinds, argv, discovery. Builder-side behaviour
(environment preparation, launcher repair, templates) lives in Phase A3.

### A2. Slim `src/contract/targets.mjs`

Move out: the whole `python: {…}` block (→ `runtimeAdapter('python').layout(target)`),
`selfTestPython` (→ a per-platform assertion table on the python runtime adapter), and the
`PYTHON_EXECUTION_ENVIRONMENT` half of `executionAffectingEnvironmentVariables`.

Stay: `id`, `platform`, `arch`, `host`, `condaSubdir` (substrate, not runtime), `archive`,
`nativeLibraryInspection`, `validationEnvironments`, and the OS half of the environment list
(`DYLD_INSERT_LIBRARIES`, `LD_PRELOAD`). Callers merge the two halves —
`src/environment.mjs` already takes the list as an injected argument (`resolveEnvironment`,
`environment.mjs:102`), so it needs no change at all.

Rename `assertPythonEntryPoint` → `assertRuntimeEntryPoint`; it is re-exported publicly from
`src/contract/index.mjs:16-18` and `browser.mjs:11-13`, so this is a public-API change (Phase B ships
it; in Phase A keep a same-name export to avoid two public breaks).

### A3. New builder tree: src/runtimes/<id>/

`src/runtimes/index.mjs` registers builder-side adapters. `src/runtimes/python/`:

- `index.mjs` — the adapter: pixi dependency spec contribution (`python = "3.14.*"`), self-test
  command construction, prune defaults.
- `launchers.mjs` — moved verbatim from `src/build/launchers.mjs` (the conda shebang trampoline is a
  Python fact, not a build fact). Update the `src/build/index.mjs:12` public re-export.
- `dependencies.mjs` — the PyPI→conda-forge rename map and pip-requirements parser, moved from
  `src/build/dependencies.mjs:33-39,135`. The `[dependencies]` TOML editing itself is substrate and
  stays in `src/build/`.
- templates/ — `STARTER_SCRIPT`, `STARTER_SELF_TEST`, and the pixi-manifest dependency line, moved
  out of the string constants at `src/build/authoring.mjs:69-133`.

### A4. Fix the three adapter bypasses

`src/build/pixi.mjs:363` (`join(payloadDir, 'venv')`), `src/build/execution.mjs:22-24` (re-derives
the Windows branch and re-hardcodes venv/), and the `adapter.platform === 'windows'` code branch
that duplicates the `scriptsDirectory` data field. All three go through the runtime layout.

### A5. Consumer mirrors — new fixture

Add `src/contract/fixtures/runtime-contract.json`, the analogue of `target-id-contract.json`:
language-neutral golden cases for runtime × target layout, execution-file discovery, and argv
construction. Mirror it in `python/src/scrollcase_consumer/_contract.py` and
`rust/src/contract/` (new `runtimes.rs`), and add it to both sync scripts
(`rust/scripts/sync-assets.mjs:20-32`, `python/scripts/sync_schemas.py:10-16` — note the latter
copies schemas only today and needs a fixtures path).

> **Watch:** `rust/tests/contract.rs:143-178` keeps a **second hand-maintained copy** of the
> sync-assets file table. Both lists need the new entry.

### A6. Consolidate the version-rejection sites

The string `Unsupported schemaVersion 1; …` is duplicated verbatim in 7 places
(`src/contract/documents.mjs:36`, `src/sign/keys.mjs:186`, `src/build/verify.mjs:85,93`, plus the
Python and Rust equivalents). Collapse the three Node sites into one exported helper in
`src/contract/document-shape.mjs` so Phase B changes the message once per language, not once per
call site.

**Gate A:** `npm test` green; `npm run types:check` green; `cd docs && npm run build` green;
`cargo test --all-targets` + `cargo clippy --all-targets -- -D warnings`; Python suite in an isolated
venv; **and a rebuild of `examples/` producing a byte-identical archive** — that is the real proof
this phase changed nothing.

---

## Phase B — the single v3 wire break

Every format change lands here, in one `schemaVersion` bump. This includes the execution kinds and
runtime ids for `node` and `native` **even though the builder does not implement them yet** — so
Phase C is pure implementation and never touches the wire again. The builder rejects an
unimplemented runtime with a clear `fail()`.

### B1. Schema changes (`src/contract/schema/`)

| Change | Files |
| --- | --- |
| `schemaVersion` `const: 2` → `3`; `$id` and `$ref` routes `/schema/v2/` → `/schema/v3/` | all 8 |
| `modelId`, `runtimeId` removed; `runtime: { id, version?, entryPoint? }` added | scroll, box-manifest, release-manifest |
| `labels: { [string]: string }` optional, signed passthrough | scroll, box-manifest, release-manifest |
| `pythonVersion` → `runtime.version`; `pythonEntryPoint` → `runtime.entryPoint` | scroll, box-manifest, release-manifest |
| `provenance.pythonVersion` → `provenance.runtimeVersion` | release-manifest |
| `weights` removed entirely; `assets[].embed: boolean` (default `true`) | scroll, box-manifest, release-manifest |
| `dependentRequired` weights/assets pairing removed | box-manifest `:130-133`, release-manifest `:295-298` |
| `assets[].executable`, `localFiles[].executable`, boolean default `false` | scroll |
| `modelCacheSubdir` → `cacheSubdir` | scroll |
| `selfTest` generalised — see B2 | scroll, box-manifest, release-manifest |
| execution `oneOf` gains `node-script` and `native-binary` | execution |

**Naming decision, as asked:** the runtime id is **`native`**; the execution kind is
**`native-binary`**. This keeps the existing `<runtime>-<shape>` pattern (`python-script`,
`python-module`, `node-script`, `native-binary`) instead of breaking it with a bare `native`, and
leaves room for a second native shape later without renaming anything.

`assetArchives[]` gets no `embed` field — an archive is expanded at build time, so "defer it" is
meaningless. This replaces the current cross-field refusal at `src/build/scroll.mjs:246` and
`src/build/box.mjs:135` with a schema-level impossibility.

### B2. Self-test, generalised

The signed subset is Python syntax today (`selfTest.pythonImports`, consumed at
`src/build/verify.mjs:242`). v3:

```jsonc
"selfTest": {
  "imports": ["json"],                                  // python | node — runtime turns it into argv
  "commands": [{ "args": ["--version"], "expectExitCode": 0 }],  // any runtime; the only shape native has
  "files": ["bin/tool"],                                // unchanged, already generic
  "script": "self_test.py"                              // builder-only, was pythonFile
}
```

Signed subset becomes `selfTest.probe`, carrying whichever of `imports` / `commands` applies. The
runtime adapter's `selfTestArgv()` is the only thing that knows how to turn a probe into a command
line — `src/build/box.mjs:70-74` and `verify.mjs:241-245` stop constructing Python source.

### B3. Per-asset embed

- `src/build/box.mjs`: delete `weightsMode` (`:128-140`) and the global `embedded` boolean (`:200`).
  Staging becomes per-entry: `for (const asset of scroll.assets) if (asset.embed !== false) …`.
  `deferredAssets` (`:208`) is built from the complement.
- The descriptor projection at `:253-258` emits `assets[]` = the non-embedded entries only, and drops
  the `weights` field.
- `src/cli.mjs`: `--weights` is removed. Replaced by nothing — this is now a per-asset scroll
  declaration, and a build-time override of it would reintroduce exactly the silent-repack bug the
  comment at `src/cli.mjs:561-563` records.
- `AGREEMENT_FIELDS` (`src/build/verify.mjs:20-46`): drop `'weights'`, keep `'assets'` — it is
  already deep-compared, so per-asset fields are covered automatically.
- `src/build/scroll-edit.mjs:239` `addAsset` learns `embed` and `executable`; `refresh` already
  preserves unknown per-entry fields via spread (`:546`).

### B4. Declared executable

`archiveFileMode` (`src/build/archive.mjs:37-44`) stops taking the target adapter's Python layout and
takes a **declared executable set** instead, built as the union of:

1. `runtimeAdapter(id).executablePayloadPaths(target)` — for `python`, still everything under
   `venv/bin` (a conda prefix has hundreds of console scripts; they cannot be declared by hand). The
   rule does not disappear, it stops being a fact of the *target* adapter and becomes a fact of the
   *runtime* adapter.
2. The scroll's `executable: true` entries from `assets[]` and `localFiles[]`.

Mode stays synthesised, so determinism is intact and `payload-digest.v1` is untouched.

**Fix the umask divergence while here.** Node (`src/build/archive.mjs:291-295`) and Rust
(`rust/src/archive.rs:554-562`) apply the mode through `open(2)` and are therefore umask-masked;
Python (`extract.py:225-226`) `chmod`s and is not. Once executability is declared, the three
disagree observably under a restrictive umask. Make all three `chmod` explicitly after write on
non-Windows, following the pattern already documented at `src/sign/keys.mjs:62-64`. Add a conformance
case that extracts a declared-executable box under `umask 077` and asserts the bit survives.

### B5. Propagate through the three consumers

Node `src/consumer/` (kind dispatch at `run-extracted.mjs:128` becomes a switch over the runtime
adapter), Python `python/src/scrollcase_consumer/` (`_contract.py:218-226` parse, `models.py:63,72`
dataclasses + `__init__.py` `__all__` + `test_public_api.py:26`), Rust `rust/src/release.rs:114-122`
enum + `execution.rs:84,90` + `run.rs:293-300`.

Version gates: `src/contract/document-shape.mjs:10`, `rust/src/contract/documents.rs:22`, and
Python's two bare literals at `verify.py:293,295` — **give Python a named constant** so it stops
being the odd one out. Message now covers v1 **and** v2. Builder emit sites currently hardcode `2`
(`src/build/box.mjs:276,350,374`, `authoring.mjs:410`, `licenses.mjs:116`) — switch them to the
constant.

`rust/tests/schema.rs:109-113` currently asserts `schemaVersion = 3` is *rejected*; that mutation
inverts to `4`.

### B6. Fixtures, examples, docs

- `src/contract/fixtures/consumer-conformance.json` — 81 cases, 30 mutations, 29 error patterns.
  Update the on-demand cases to per-asset semantics, add cases for `native-binary` and `node-script`
  argv construction, and add the umask case from B4. Each new mutation is three driver
  implementations: `tests/helpers/consumer-conformance.mjs`, `python/tests/conformance_support.py`,
  `rust/tests/conformance.rs`.
- `src/contract/fixtures/examples/signed-release.example.json` must be **re-signed**, not edited —
  `tests/unit/contract-schema.test.mjs:173-192` checks a real ed25519 signature against its public
  key.
- `examples/*/scroll.json` (3 root + 9 per-target) migrate to v3.
- Docs routes `docs/public/schema/v2/` → v3/ via `scripts/sync-docs-schemas.mjs:16`, plus
  `scripts/verify-built-docs.mjs:16` and `docs/.vitepress/api-catalog.mjs:31,37,51,56`.
- Hand-written pages needing real rewrites: `docs/reference/box-format.md` (especially
  `## Versioning`), scroll.md, schemas.md, and `docs/white-paper.md`.
- `tests/unit/docs-contract.test.mjs:190` hardcodes `schemaVersion === 2` when deciding which JSON
  blocks to Ajv-validate — a bump silently stops validating every docs example unless this is
  updated. Same for `:108` (`/schema/v2/` route assertion) and `tests/unit/v2-migration.test.mjs:22`.
- Every new `src/**/*.mjs` module from Phase A must be cited by path in `docs/white-paper.md`, or
  `docs-contract.test.mjs:230` fails.
- `CHANGELOG.md` under `## [Unreleased]`.

**Gate B:** the full tri-language suite, both drift gates (`npm run types:check`), both sync `--check`
scripts, `cargo package`, the Python wheel/sdist build plus `scripts/check_distribution.py`, and
`cd docs && npm run build`.

---

## Phase C — implement `native` and `node`

Both runtimes against a settled seam and a settled wire. No schema change.

### C1. `src/runtimes/native/`

- `layout(target)` — no interpreter. `entryPoint` is the declared `execution.path`, not a derived
  path, so `assertRuntimeEntryPoint` for `native` asserts the path is inside the payload and declared
  executable rather than equal to a fixed value.
- `buildArgv` — `[join(root, execution.path), ...defaultArgs, ...callerArgs]`. Shell-free, same as
  every other kind.
- `resolveExecutionFiles` — the single declared path must be in the file set.
- `selfTestArgv` — from `selfTest.commands`; `imports` is rejected for this runtime.
- pixi contribution: none of its own. A `native` scroll still carries a `pixi.lock` and still gets a
  licence audit; a statically linked binary simply declares a near-empty environment.
- Link repair is **out of scope for this phase**. A binary linked against the conda prefix needs
  rpath / `install_name` / DLL-search handling, which is per-binary-format work worth its own pass.
  Document the limitation: for now a `native` box must ship a binary that already resolves its
  libraries (static, or rpath-correct at build time). This is stated in the docs, not silently
  assumed.

### C2. Licence declaration for native

`pixi.lock` cannot see dependencies linked statically inside a supplied binary. Add an optional
declared inventory on the scroll that Scrollcase **transports and signs without deriving** —
consistent with `condaDependencyLicenseAudit`, which is already a reviewed declaration checked
against the lock. Verified for shape and completeness against the declared binaries, never inferred.

### C3. `src/runtimes/node/`

- pixi contribution: `nodejs = "22.*"` from conda-forge.
- `layout(target)`: `venv/bin/node` / `venv/node.exe`, scripts dir `venv/bin` / `venv/Scripts`.
- `node-script` only. There is no `-m` analogue worth inventing; a package entrypoint is a script
  path like any other.
- `executionEnvironmentVariables`: `NODE_OPTIONS`, `NODE_PATH`, `NODE_EXTRA_CA_CERTS`.
- `selfTestArgv` from `imports`: `node -e "require('x'); require('y')"` (or dynamic `import()` when
  the box declares ESM), plus the platform assertion the python adapter already models.
- Launcher repair: conda-forge `nodejs` console scripts carry the same absolute-shebang problem.
  Reuse `src/runtimes/python/launchers.mjs`'s `repairPosixLaunchers` — it parses a conda/setuptools
  trampoline, so confirm against a real packed prefix before assuming it applies unchanged; if it
  does not, the shared piece is the shebang rewrite, not the trampoline parser.
- Authoring templates and a `node-script` starter under `src/runtimes/node/templates/`.

### C4. CLI and authoring

`scrollcase new scroll --runtime <python|node|native>` drives which prompts appear
(`src/cli-authoring.mjs:198-202` becomes runtime-dispatched), which templates are written, and which
execution kinds are offered. `doctor` and `add dep` gain runtime awareness for the pixi dependency
they manage. `usage()` in `src/cli.mjs:641-802` loses its Python vocabulary — note that
`docs-contract.test.mjs:143` mechanically pins the CLI reference page to `cli.mjs help` output, in
order.

**Gate C:** the full tri-language suite plus one real build per new runtime. A real build downloads
gigabytes and takes minutes — **ask before running one.**

---

## Verification

Run at the end of every phase, not only at the end of the work:

```bash
npm test                                   # Node unit suite
npm run types && npm test                  # after any schema change — the drift gate
cd docs && npm run build                   # dead links + verify-built-docs postbuild
node rust/scripts/sync-assets.mjs          # after any fixture/schema change
cd python && python scripts/sync_schemas.py
```

Per language:

```bash
cd rust && cargo test --all-targets && cargo clippy --all-targets -- -D warnings && cargo package
cd python && python -m unittest discover -s tests -t . && mypy src \
  && python -m build && python scripts/check_distribution.py dist/*
```

Use an **isolated venv** for the Python suite — the system Python is PEP 668 and the tests will
silently import an installed copy instead of the tree under test.

End-to-end checks that the unit suite cannot cover:

1. **Byte-identical rebuild** of `examples/` — the Phase A proof, and re-run after B4 since that
   phase touches the archive writer.
2. **Declared executable survives a restrictive umask** — extract a box under `umask 077` with each
   of the three consumers and assert the bit. This is the check that would have caught the existing
   Node/Rust/Python divergence.
3. **Per-asset embed** — build a box with one embedded and one deferred asset; assert the archive
   contains the first and not the second, that the release carries a descriptor only for the second,
   and that `run` refuses until the second is materialised.
4. **v2 rejection** — feed a published v2 release to the v3 verifier in all three languages and
   confirm one clear message, not a reinterpretation.
5. **Real builds** (Phase C) — one `native` and one `node` box, on a real host. Expensive and
   network-bound: ask first.

## Prove the new guards can fail

Per the repo's testing convention, a test never seen red is not a guard. Before each gate, break the
thing once and confirm the failure, then restore: flip a declared `executable` to `false` and confirm
the binary fails to launch; mark a deferred asset `embed: true` and confirm the archive size and hash
change; hand-edit a `runtime.entryPoint` to a wrong path and confirm `assertRuntimeEntryPoint`
rejects it.
