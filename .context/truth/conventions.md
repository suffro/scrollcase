# Conventions

`AGENTS.md` is the operational rulebook and is not repeated here. This file holds the working
context around it: how the maintainer works, what the local environment actually looks like, and the
habits that were learnt the expensive way.

## Repository conventions

- **English everywhere** in comments, code, CLI output and developer-facing documentation — this
  directory included. The maintainer writes in Italian; the repository does not.
- **The comment voice is distinctive.** A module header explains *why* the module is shaped as it
  is, and a decision is recorded together with the alternative it rejected. Match the surrounding
  density rather than generating comment noise.
- **Casing is functional.** *Scrollcase* in prose, `scrollcase` wherever it is an identifier: the
  command, the npm package, the exports, `scrollcase.config.json`, the `scrollcase.box` namespace,
  temp-directory prefixes, the `.gitignore` marker. A blanket capitalisation pass has already broken
  a printed command and an idempotency marker.
- **The canonical terms are fixed**: box, scroll, target, runtime, payload, release / channel /
  revocations, self-test, parity, deferred asset. Never "image", never "container", never a
  consumer's product term.
- **No consumer's name anywhere in the repository**, including in this directory. See
  [`../decisions/independent-of-any-consumer.md`](../decisions/independent-of-any-consumer.md);
  the historical files under `../history/` are redacted for exactly this reason.
- **One word is enforced by a `git grep` guard** in `tests/unit/v3-migration.test.mjs`: the
  extracted project's name, refused everywhere, this directory included. The pre-rename product
  term was policed the same way until 2026-09-05 and no longer is — *scroll* has been the only word
  in the code, schemas, CLI and docs long enough that the guard had stopped catching mistakes and
  started catching ordinary English and other projects' file names.
- **Commits carry no tool attribution trailers.**
- Every user-visible change goes in `CHANGELOG.md` under `## [Unreleased]` until the release that
  ships it closes that section. `npm version` does not touch the changelog.

## Development workflow

- **`npm test` always**, and never report completion from inference. Docs changes need
  `cd docs && npm run build`; schema changes need `npm run types` first; `python/` and `rust/`
  changes need their own suites, their own lints and their own packaging checks. The full command
  table is in `AGENTS.md`.
- **Prove a new guard can fail.** Break what it protects once, observe the failure, restore. A test
  never seen red is not yet a guard — every phase record under `../history/` has a "guards proven
  red" section for this reason.
- **Exercise the real path, not just the import.** A module that loads is not a module that works.
- **`x86_64-pc-windows-msvc` is an installed rustup target on the maintainer's Mac**, so
  `cargo clippy --target x86_64-pc-windows-msvc --all-targets -- -D warnings` compiles the
  `cfg(not(unix))` branches locally in about fifteen seconds. Run it before pushing anything that
  touches conditional code in `rust/`. A Windows-only lint reached CI once for want of this.
- **The Python consumer must be tested in an isolated venv.** The system Python is PEP 668, and
  without one the tests silently import an installed copy instead of the working tree.
- **Never let a test reach the network**, and never let one write outside its temporary directory.

## Important rules

- **`which` is not a search.** pixi and conda-pack *are* installed on the maintainer's machine, in
  two places, one of them a dedicated `PIXI_HOME` deliberately kept off `PATH`; `findPixi` refuses
  any version other than the scroll's `pixiVersion`, so a pinned example is built with `--pixi` /
  `--conda-pack` or `SCROLLCASE_PIXI` / `SCROLLCASE_CONDA_PACK`. Reporting the toolchain missing
  from `which` alone is the most repeated failure here — three times, each time wrongly.
  The exact directories are machine-local; look in the pinned `PIXI_HOME`, `~/.pixi/bin` and
  `.scrollcase/toolchain/bin` before saying anything is absent. See
  [`../history/mistakes-and-what-they-taught.md`](../history/mistakes-and-what-they-taught.md).
- **Measure cost, do not estimate it.** `hello-box` builds in about fifteen seconds. Only the model
  demos are large. Never call an expensive operation impossible without first looking.
- **Reports are a few lines, not walls of text**, and when the maintainer asks for something found
  or fixed he means *every* instance, in one pass.
- **Publishing is his call, never an agent's** — and since all three registries release from a
  pushed tag, the dangerous command is `git push`, not `npm publish`.
- **`MTLCreateSystemDefaultDevice()` returns nil on the maintainer's Mac.** Anything GPU-touching
  fails locally and passes in CI. Not a code defect; do not chase it.
- **Linux and Windows are covered by CI and nowhere else.** The local suite runs on macOS with the
  toolchain stubbed.
- **Durable project knowledge belongs in tracked files** — this directory, `AGENTS.md`, `docs/`,
  `CHANGELOG.md`. Machine-local agent memory is a convenience, never the only copy: the original
  project-memory file was lost with a deleted clone, and what survives is the reconstruction in
  [`../history/early-project-memory-archive.md`](../history/early-project-memory-archive.md).
