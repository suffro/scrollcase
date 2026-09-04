# v3 Phase C — status

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered.** Phase C of the version 3 work: `native` and `node` implemented in all four
> places. Landed 2026-08-28; merged and released in 1.0.0 on 2026-09-02.

Branch `v3-phase-a-runtime-seam`, five commits from `be04c58` to the CI/examples commit. Landed
2026-08-28.

## Done

- **C1 `native`.** No interpreter: `layout.entryPoint` and `layout.standardLibrary` are `null`, the
  binary *is* the command line, and `commands` is its only probe shape. Declaring an entry point, an
  `imports` probe, or `parity` in a native scroll is refused where the scroll is read.
- **C2 bundled licences.** `bundledLicenseDeclaration` on the scroll points at a reviewed JSON array;
  the build validates it against the release schema's own `$defs/bundledLicenses`, checks every
  `linkedInto` path is a file the box carries, signs it into the release and `box.json`, and writes
  it to `THIRD_PARTY_NOTICES/bundled-dependencies.json`. **This is a wire addition inside v3** — the
  maintainer's explicit call, made while the branch was unpushed so v3 stays the only break.
- **C3 `node`.** `nodejs` from conda-forge, `venv/bin/node` / `venv/node.exe`, `node-script` only,
  `NODE_OPTIONS`/`NODE_PATH`/`NODE_EXTRA_CA_CERTS`, an import probe rendered as `require(...)` under
  `-e`.
- **C4 CLI and authoring.** `--runtime` decides which execution kinds are offered, which starter is
  written and which pixi dependency the manifest declares. `--python-version` → `--runtime-version`,
  refused for `native`. `add import` validates the specifier per runtime and refuses a runtime with
  no module system.
- All three consumers mirrored, plus `examples/hello-box-node` and `examples/hello-box-native`, both built,
  verified with `--self-test` and run for real.

## Deviations from the plan, and why

- **The plan said "no schema change"; C2 needed one.** Raised with the maintainer, who chose to add
  it now rather than defer it to a v4 — see above.
- **`execution.path` in the plan is `binary` on the wire.** Phase B shipped `native-binary` with a
  `binary` field; the plan's prose was never updated. The wire won.
- **`assertRuntimeEntryPoint` does not check payload membership for native**, as the plan suggested.
  It has no payload to look at. Native declares *no* entry point at all — the function's third
  answer — and what the box actually runs is checked by `assertExecutionFiles` plus the new
  archive-executable guard, both of which do see the payload.
- **`selfTestProbeKinds` is derived, not declared, in Rust and Python** (from whether the runtime has
  an import probe). Declaring it beside the probe would be two statements of one fact.
- **Two things outside the plan**, both found by building for real:
  - The node runtime writes the box its own `package.json` (`src/runtimes/node/payload.mjs`).
  - A superseded *envelope* is now refused by version rather than as a schema shape error.
- **Link repair stays out of scope**, as the plan said — and the first native example proved why.

## Gate C

Green: `npm test` (525 across 35 files), `npm run types:check`, `cd docs && npm run build` plus
postbuild verify (36 pages), `cargo test --all-targets` (8 suites), `cargo clippy --all-targets
-- -D warnings`, `cargo package`, `node rust/scripts/sync-assets.mjs --check`, the Python suite (65)
in an isolated venv, `mypy src`, `sync_schemas.py --check`, `python -m build` and
`check_distribution.py`.

**Three real builds**, with pixi 0.73.0 and conda-pack, on this Mac:

- `hello-box-native/macos-aarch64-metal` — builds, `verify --self-test` passes, `run -- --version` exits 0.
- `hello-box-node/macos-aarch64-metal` — same, 138 MB extracted.
- A throwaway `embed-box` in the scratchpad with one embedded and one deferred asset, served from a
  loopback HTTP server: the archive holds `small.bin` and not `large.bin`, the release carries a
  descriptor for `large.bin` alone, `box.json` agrees, `run` refuses with *"Required on-demand asset
  is missing"*, and it exits 0 once the file is placed. This closes the plan's end-to-end check 3.
- The plan's check 4 is closed too: the repository's own published **v2** demo box
  (`demo-box-v1`, downloaded with `gh release download`) was fed to all three v3 verifiers. Python
  and Rust already named it; Node did not, and now does.

**Both new examples rebuild byte-identically**, checked by name rather than by counting files —
which is how the CI determinism step turned out to be unable to fail (below).

## The CI determinism check could never fail, and now can

`example-build.yml` asserted determinism by counting archives after a rebuild, on the reasoning that
a differing archive would land *beside* the first under its own hash. It would not: a build clears
its own object directory before writing into it, so the count is always one. Measured — changing the
scroll's `sourceRevision` produced a completely different archive and left the count at one. The
step now compares the archive's name before and after.

## Guards proven red

Each broken once and the failure observed, then restored:

- Node — the archive-executable guard, the bundled-licence membership check, the bundled-licence
  schema check, the native entry-point refusal, the probe-kind refusal, both halves of the node
  `package.json` rule, and the envelope-version refusal.
- Rust — the native entry-point refusal, the probe-kind refusal (by giving `native` an import
  probe), and the `bundledLicenses` agreement field.
- Python — the native entry-point refusal, the import-probe refusal, and the `bundledLicenses`
  agreement field.

## Two things found by doing the real work

**conda-forge's `ncurses` breaks a native box, and it is not the box's fault.** The first native
example ran `sqlite3`, whose own linkage is entirely `@rpath`. It failed anyway: `libncurses.6.dylib`
re-exports `libtinfo.6.dylib` through an unrewritten *conda-build* placeholder path. Scrollcase does
not repair a binary's library paths — the stated limitation — and the self-test caught it before
anything was signed. The example runs `zstd` instead. Worth remembering before choosing any
console-UI program for a native box.

**Node reads the nearest `package.json` above the file it runs.** With none inside the box, that
walk leaves the box entirely. The node example failed its self-test against *this repository's*
`package.json`, which declares `"type": "module"`. The runtime now writes the box its own unless the
payload already carries one.

## The first CI run, and what it cost to have skipped one

The branch reached Linux and Windows for the first time on 2026-09-01, in PR #8. It took three runs
to go green, and every failure was Windows-only, in a test or a lint rather than in the product —
which is precisely the shape of defect a macOS-only gate cannot see.

Before CI would run at all, the PR had to stop being `CONFLICTING`: GitHub does not evaluate
`pull_request` workflows when it cannot compute the merge commit, so the PR sat with only a
Cloudflare Pages check and no CI, which reads exactly like a broken workflow. `main` had moved
(PR #7, the `referencing` dependency). Merged, not rebased — the branch was already pushed.

1. `declared-executable-survives-a-restrictive-umask` asserted `755`/`644` on every platform. Windows
   carries no POSIX modes, so the consumer reports `null`, correctly. Broken since phase B, where the
   case was proven red on macOS alone. Now gated `requiresPosixModes`, honoured by all three drivers
   exactly as `requiresSymlinks` already was; proven by forcing the gate closed (85 ran, 1 skipped).
2. The phase C archive-executable test asserted a refusal on every target. On a Windows target there
   is no bit to be missing, so the build correctly does not refuse. It now asserts both halves.
3. `clippy::unused_unit` on `fn set_umask(_octal: &str) -> () {}`, the stub only Windows compiles and
   which had therefore never been linted.

**The third was avoidable without CI**, and this is worth keeping: `x86_64-pc-windows-msvc` is an
installed rustup target on this Mac, so `cargo clippy --target x86_64-pc-windows-msvc --all-targets
-- -D warnings` compiles the `cfg(not(unix))` branches locally in about fifteen seconds. Run it
before pushing anything that touches conditional code in `rust/`.

Final state: **16 of 16 jobs green**, PR #8 `MERGEABLE`.

## Still owed after this

- **The demo boxes are not rebuilt.** Agreed with the maintainer that they come last, after C,
  together with the CI run. They are v2 and CI signs them with the secret key; a local rebuild
  cannot produce them.
- **No v3 box has been built on Linux or Windows.** `example-build.yml` has no `pull_request`
  trigger — by design, since the project pushes straight to `main` — so the 16 green jobs above are
  `ci.yml` only: the unit suite with the toolchain stubbed, the Rust suite, the Python suite and the
  docs build. The real solve, the real `conda-pack` relocation and the box's own interpreter
  starting are still unproven anywhere but this Mac for the v3 format. Either merge to `main` and
  let the push trigger fire, or `workflow_dispatch` that workflow on the branch first.
- The branch **is pushed** and open as PR #8. Nothing is published.
