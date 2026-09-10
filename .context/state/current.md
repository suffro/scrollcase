# Current State

Last reviewed: 2026-09-11.

## In flight

**A box may now contain PyPI dependencies** — branch `pypi-licence-declaration`, unreleased.

Until now it could not, and nobody had noticed: pixi records an SPDX licence for every conda package
and **none at all** for a PyPI one, so `lockedCondaDistributions()` failed the parse on the first
PyPI entry it met. That refusal is correct — an unlicensed dependency is a legal problem, not a
reporting gap — but it left an author with nothing to do about it, because the missing licence is
not in the lock and never will be. Every box built with Scrollcase so far has been pure conda,
which is why the gap survived two format versions.

The fix follows `bundledLicenseDeclaration` exactly: a scroll points at a reviewed
`{ name, version, declaredLicense }` array, checked against the lock in both directions so neither
an uncovered package nor a stale line can pass. conda packages stay ineligible. Declared entries
carry `licenseDeclaredBy: "project"` in the inventory, so a project whose lock declares everything
sees no change at all.

**Additive throughout — no format break, no v4.** The scroll field is optional, the signed release,
`box.json`, the payload digest and every `kind` string are untouched, and the only entries that
change shape are ones no released version could have produced. It is a minor release.

Found downstream, by the first project that needed a model whose dependencies are PyPI-only.

## Current focus

**Documentation, after the 1.0.0 release.** The version 3 format shipped, so the site is being
brought level with it: every page now has a Markdown twin and page actions that hand it to a
language model, the demo pages state their runtime, and `docs/concepts/tool-comparison.md` is under
active edit. `CHANGELOG.md` has an open `## [Unreleased]` section covering this work.

Nothing is in flight in the product itself. The working tree adopted `.context/` on 2026-09-04, and
the retired `.local-memory` directory is gone — everything it held is here. That adoption turned CI
red on all six `test` matrix legs, because the archived plans use the pre-rename product term a
vocabulary guard forbade. On 2026-09-05 the maintainer retired that half of the guard: the rename
has held across two format versions and nobody reaches for the old word any more, while the guard
had begun to catch ordinary English and other projects' file names instead of mistakes. The two
superseded plans written in the old vocabulary were dropped with it. The extracted project's name is
still refused everywhere.

## Recent relevant changes

- **`scrollcase@1.0.0`** released 2026-09-02 (tag `v1.0.0`), carrying the version 3 box format:
  a declared `runtime` block, `labels` replacing `modelId`/`runtimeId`, per-asset `embed` replacing
  the box-wide `weights` switch, a generalised `selfTest.probe`, declared executables,
  `bundledLicenses`, and `/schema/v3/`. The three phases are recorded in
  [`../history/v3-phase-a.md`](../history/v3-phase-a.md),
  [`../history/v3-phase-b.md`](../history/v3-phase-b.md) and
  [`../history/v3-phase-c.md`](../history/v3-phase-c.md).
- **`scrollcase-consumer` 0.5.0 on PyPI** (tag `python-v0.5.0`) and **0.4.0 on crates.io**, both
  published 2026-09-02. The crate went out **without a `rust-v0.4.0` tag** — the tag-driven
  release flow arrived in the same window, and the crate's version is ahead of any tag.
- **The `node` and `native` demo boxes are published**: `codon-demo`, `transcode-demo` and
  `dataset-demo`, signed by CI for macOS, Linux and Windows under their own tags, each verified with
  `--self-test` and then actually *run* before release.
- **All three registries now publish from a pushed tag.** `v<version>` → npm,
  `python-v<version>` → PyPI, `rust-v<version>` → crates.io. `git push --follow-tags` can start a
  release
  without the word "publish" appearing anywhere.
- The `v3-phase-a-runtime-seam` branch is merged; it and its remote copy are now empty of unique
  commits. No pull requests are open.

## Next

Nothing is authorised and in progress. What is owed, in the order it was last discussed:

1. **The box environment declaration.** Accepted 2026-08-03, never implemented: report, do not
   enforce. See [`../decisions/box-environment-report.md`](../decisions/box-environment-report.md).
2. **A `rust-v0.4.0` tag, or a decision not to backfill one.** The published crate has no tag
   behind it. Backfilling a release tag is a push that can trigger a release workflow — the
   maintainer's call, and only his.
3. **Example boxes that exercise `parity`.** Six demos ship and none declares a parity tolerance, so
   the cross-accelerator gate has no example. `protein-box` (transformers + pytorch-cpu + ESM-2 35M)
   was the proposal; `molecule-box` (rdkit, no weights) was the other half of the original request.
4. **Visibility.** `kelvins/awesome-mlops` was submitted 2026-08-16 (PR #244).
   `EthicalML/awesome-production-machine-learning` requires 500 GitHub stars — the highest-value
   listing available, to revisit when the repository crosses that. There are deliberately no
   Scrollcase social accounts.
5. **conda-forge**: `scrollcase-consumer` is live and the autotick bot opens the version-bump PRs.
   Only the Python consumer is packaged there. Before merging a bot PR, compare
   `python/pyproject.toml` against the recipe's `requirements.run` and `python_min`, which the bot
   cannot see. The recipe is `recipe/recipe.yaml`, not `meta.yaml`.

## Blockers

None. Two standing limits shape what can be proven locally rather than blocking work:

- **Linux and Windows exist only in CI.** The local suite runs on macOS with the toolchain stubbed,
  and `MTLCreateSystemDefaultDevice()` returns nil on the maintainer's Mac, so anything
  GPU-touching fails locally and passes in CI.
- **The demo boxes cannot be rebuilt locally.** CI signs them with a private key held in a GitHub
  secret — deliberately. See
  [`../decisions/demo-boxes-are-signed-by-ci.md`](../decisions/demo-boxes-are-signed-by-ci.md).
