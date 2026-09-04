# v3 Phase A — status

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered.** Phase A of the version 3 work: the runtime seam extracted from the target
> model, behaviour-preserving. Landed 2026-08-27.

Branch `v3-phase-a-runtime-seam`, commit `de0fe07`. Landed 2026-08-27.

## Done

- **A1** `src/contract/runtimes.mjs` — `runtimeAdapter`, `runtimeAdapters`,
  `assertRuntimeEntryPoint`, `isExecutablePayloadPath`, `executionAffectingVariables`,
  `IMPLICIT_RUNTIME_ID`. Only `python` is registered; `node` and `native` are a `TypeError`, not a
  stub.
- **A2** `targets.mjs` slimmed. The `python: {…}` block and `selfTestPython` are gone;
  `executionAffectingEnvironmentVariables` is now the OS half only. `assertPythonEntryPoint` keeps
  its published name and signature and delegates.
- **A3** `src/runtimes/index.mjs`, `src/runtimes/python/{index,launchers,dependencies}.mjs` and
  `src/runtimes/python/templates/index.mjs`.
- **A4** All three bypasses gone (`pixi.mjs` venv/, `execution.mjs` venv/ and the
  `platform === 'windows'` branch, which is now the `standardLibrary` layout field).
- **A5** `src/contract/fixtures/runtime-contract.json` plus mirrors and drivers in all three
  languages, and the two hand-maintained Rust asset tables.
- **A6** `unsupportedSchemaVersionMessage()` in `document-shape.mjs`; four Node call sites collapsed
  to one wording.

## Deviations from the plan, and why

- **`python/scripts/sync_schemas.py` was not touched.** The plan expected it to need a fixtures
  path. It does not: the Python tests read fixtures straight from the repo root (see
  `test_contract.py` and `conformance_support.py`), exactly as they already do for
  `target-id-contract.json`. Only the Rust crate needs copies, because `include_str!` cannot reach
  outside the crate once packaged. Adding a fixture to the wheel would ship test-only data.
- **"Prune defaults" in A3 has nothing to move.** No runtime-specific prune defaults exist today;
  `prunePaths` is entirely a scroll declaration. The builder adapter has the shape for it when
  something does.
- **`buildArgv` returns `{ command, args }` with each element tagged
  `{ kind: 'literal' | 'payload-path', value }`,** not the plan's bare `[command, args]`. Paths stay
  payload-relative so the fixture does not depend on the host that reads it and each language joins
  in its own terms. `selfTestArgv` returns a plain string array because a probe never names a path.
- **`buildArgv` is wired into `src/consumer/run-extracted.mjs`, `run.rs` and `run.py` already,**
  which the plan defers to B5. Only the mechanical half — the argv construction — moved; the kind
  dispatch becomes a runtime dispatch in B. Doing it now keeps `buildArgv` a real path rather than
  fixture-only code.

## Gate A

Green: `npm test` (498), `npm run types:check`, `cd docs && npm run build`,
`cargo test --all-targets`, `cargo clippy --all-targets -- -D warnings`, `cargo package`,
`node rust/scripts/sync-assets.mjs --check`, the Python suite (61) in an isolated venv, `mypy src`,
`sync_schemas.py --check`, `python -m build` and `check_distribution.py`.

**The byte-identical rebuild.** Proven for real after Phase B landed — see
[`v3-phase-b.md`](v3-phase-b.md). Beforehand it was proven by proxy: the whole builder was run against
`fea2280` (pre-Phase-A) and `de0fe07` with the fake toolchain, a fixed git commit and the same
scroll, and the two archives compared. Identical: `archiveSha256`,
`payloadDigest`, the decoded release payload, and all nine entries with their modes, compression
methods, sizes and CRCs. Breaking the directory half of `isExecutablePayloadPath` moved
`venv/bin/tqdm` from `100755` to `100644` and changed the archive digest, so the comparison is not
blind. Real assets, real relocation and real prefix contents are still unproven by anything here.

## Guards proven red

Each was broken once and the failure observed, then restored:

- `contract-runtimes.test.mjs` — changed the POSIX `scriptsDirectory`, and separately dropped the
  runtime half of `executionAffectingVariables`.
- `build-pipeline.test.mjs` — dropped the directory half of `isExecutablePayloadPath`; the new
  archive-mode case went red.
- `rust/tests/contract.rs` — changed `standard_library` to `venv/lib64`.
- `python/tests/test_contract.py` — changed the Windows `launcher_kind`.

## New coverage worth keeping in mind for Phase B

`tests/unit/build-pipeline.test.mjs` now pins the synthesised archive mode (0755 on the interpreter
and the scripts directory, 0644 elsewhere) and the launcher repair, neither of which had any Node
coverage before. B4 rewrites exactly that function, so this is the case that should be seen red
again when the declared-executable set replaces the runtime-only rule.
