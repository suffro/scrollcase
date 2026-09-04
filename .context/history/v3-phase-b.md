# v3 Phase B — status

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered.** Phase B of the version 3 work: the single wire break. Landed 2026-08-27.

Branch `v3-phase-a-runtime-seam`, six commits from `e76783d` to `4371ea3`. Landed 2026-08-27.

## Done

- **B1** Eight schemas at `/schema/v3/`, `schemaVersion: 3`. `runtime: { id, version?, entryPoint? }`
  replaces `modelId`, `runtimeId`, `pythonVersion` and `pythonEntryPoint`; `labels` is the optional
  free-form map that replaces the two identity fields nothing read. `modelCacheSubdir` →
  `cacheSubdir`. `weights` gone, `assets[].embed` per entry. `assets[].executable` and
  `localFiles[].executable`. Execution `oneOf` gained `node-script` and `native-binary`.
- **B2** `selfTest.probe` with `imports` and `commands`; `pythonFile`/`pythonCode` → `script`/`code`.
  `selfTestArgv` became `selfTestInvocations`, which returns tagged invocations with an
  `expectExitCode` each, in all three languages.
- **B3** Per-asset embed through `box.mjs`, the release projection, `scroll-edit.mjs` (`--on-demand`,
  `--executable`) and `AGREEMENT_FIELDS`. `--weights` removed, not replaced.
- **B4** `archiveFileMode` takes the runtime rule joined with the scroll's declared executables. All
  three extractors now `chmod` explicitly after writing; Rust was the last one still masked.
- **B5** Node, Rust and Python consumers dispatch on `release.runtime.id`. Python's two bare literals
  became `BOX_SCHEMA_VERSION` plus one `_assert_supported_schema_version`.
- **B6** 84 conformance cases (81 + 3), the re-signed example release, twelve example scrolls, the
  `/schema/v3/` docs routes, managing-weights.md → managing-assets.md, and the white paper.

## Deviations from the plan, and why

- **`provenance.runtimeVersion` and `runtime.entryPoint` are optional, not required.** The plan said
  "rename". But Phase C's `native` runtime has no version to record and no separate executable to
  name, and provenance must never be fabricated (hard rule 6). Making a required field optional
  later would be a second wire break, and Phase B is the only one allowed — so it is decided here.
  The builder always emits both for `python`, and consumers check `entryPoint` when present.
- **`cacheSubdir` defaults to `cache/<boxId>`, not `model-cache/<boxId>`.** Renaming the field and
  keeping the model vocabulary in its default value would have been half a rename.
- **The runtime *vocabulary* is on the wire; the runtime *adapters* are not.** `RUNTIME_IDS` names
  `python`, `node` and `native` in all three languages and in the schema enum; only `python` has an
  adapter, and `isImplementedRuntime` / `unimplementedRuntimeMessage` are how the difference is
  reported. C1 and C3 add adapters without touching the wire, which is what the plan asked for.
- **`rust/tests/fixtures/signed-release.json` was re-signed too**, not just the canonical example.
  Its private key was never committed either, so both it and `trusted-key.json` are new.
- **`errorPatterns` alternations only.** `unsupported-schema-version` is
  `Unsupported schemaVersion 1|Unsupported schemaVersion 2` rather than a character class: the Rust
  driver reads the patterns as literal alternations plus one anchor, so `[12]` would work in two of
  the three drivers and silently fail in the third.
- **`rustix` gained a `fs` dev-dependency feature.** Setting a umask needs a syscall `std` does not
  expose. It is declared under `[target.'cfg(unix)'.dev-dependencies]`, so a consuming application
  never compiles it — without it the Rust half of the umask case would have passed vacuously.
- **Two things outside the plan.** `.scrollcase-runtime-types-*` was tracked from an August commit
  and is now ignored and removed; `run()` in `process.mjs` gained `expectExitCode`, which a command
  probe needs and every other caller defaults away.

## Gate B

Green: `npm test` (508 across 35 files), `npm run types:check`, `cd docs && npm run build` plus
postbuild verify (36 pages), `cargo test --all-targets` (8 suites), `cargo clippy --all-targets
-- -D warnings`, `cargo package`, `node rust/scripts/sync-assets.mjs --check`, the Python suite (63)
in an isolated venv, `mypy src`, `sync_schemas.py --check`, `python -m build` and
`check_distribution.py`.

**The real build passes**, on commit `10cbba3` with a clean tree and no `--allow-dirty`:

    node src/cli.mjs build hello-box/macos-aarch64-metal --scrolls-dir examples \
      --pixi $PINNED_PIXI_HOME/bin/pixi --conda-pack ~/.pixi/bin/conda-pack

pixi 0.73.0 resolved python 3.11.15 from conda-forge, conda-pack packed the prefix, the self-test
imported `json` and `sqlite3` **with the Python inside the box**, and the release signed clean. Then
`verify --self-test` passed and `run` printed the box's own banner and exited 0. Built twice: the
same content-addressed archive name both times,
`28039a5145001693f0e241eb733a4904eb4472faedb5ff3f04090a65cd4ec1b9.zip` — byte-identical, on the v3
format. The signed release carries `schemaVersion: 3`, the `runtime` block, `cacheSubdir`,
`selfTest.probe`, no `assets` key, and `provenance.runtimeVersion`.

Only `hello-box` was built. `llm-demo` and `sentiment-demo` download gigabytes and were not run.

## Guards proven red

Each was broken once and the failure observed, then restored:

- `build-pipeline.test.mjs` — removed the `chmod` from `archive.mjs` (`bin/tool` 0755 → 0700) and,
  separately, emptied the declared-executable set.
- `consumer-conformance.test.mjs` — same `chmod`, seen through the shared fixture case.
- `rust/tests/conformance.rs` — removed `set_permissions` from `new_file`; `bin/tool` reported 700.
- `python/tests/test_conformance.py` — removed `output.chmod`; same, plus `box.json` 600.

## Notes for Phase C

- `runtimeAdapter('native')` and `runtimeAdapter('node')` are still a `TypeError` in Node, an `Err`
  in Rust and a `ScrollcaseConsumerError` in Python. Registering one is the whole of C1/C3 on the
  contract side; the wire needs nothing.
- `resolve_python_execution_files` in Rust has an unreachable `Binary` arm guarded by
  `assert_own_kind`. A native adapter replaces it with its own resolver rather than extending that
  one.
- `parity` still runs Python source with the box's interpreter (`box.mjs` keeps `interpreter` for
  exactly that). It is the last Python assumption left in the builder.
- The archive probe from Phase A (`scratchpad/archive-probe.mjs`) compares two checkouts' archives
  byte for byte. It reads `assets`/`localFiles` v2-style and would need its scroll updated to run
  against a v3 tree.

## The toolchain on this Mac — read this before saying it is missing

`which pixi` and `which conda-pack` are **not** a search, and answering from them is a mistake this
project has now recorded twice (see [`mistakes-and-what-they-taught.md`](mistakes-and-what-they-taught.md)). There are
two installations:

| Where | pixi | conda-pack | Notes |
| --- | --- | --- | --- |
| the pinned `PIXI_HOME`, off `PATH` | 0.73.0 | 0.9.2 | Since July, a dedicated `PIXI_HOME` deliberately off `PATH`. **This is the one the examples pin.** |
| ~/.pixi/bin/ | 0.77.0 | 0.9.2 | On `PATH`. conda-pack added 2026-08-27 with `pixi global install conda-pack==0.9.2`. |

`findPixi` refuses any version other than the scroll's `pixiVersion`, so a scroll pinning 0.73.0
must be built with `--pixi $PINNED_PIXI_HOME/bin/pixi`. `SCROLLCASE_PIXI` and
`SCROLLCASE_CONDA_PACK` do the same thing without flags.
