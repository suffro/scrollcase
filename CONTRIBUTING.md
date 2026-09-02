# Contributing to scrollcase

Thanks for your interest. A few things about this project are deliberate and non-negotiable;
knowing them first will save you a rejected pull request.

## The boundaries

- **One substrate.** pixi + conda-pack + conda-forge, and only that. A second dependency backend
  means proving every guarantee twice, and the guarantees are the product.
- **Published v1 and v2 are immutable; the current line is v3-only.** Existing boxes stay with the
  Scrollcase versions that built them. New code must not add a v2/v3 union, compatibility aliases,
  or dual paths; the v3 verifier rejects both older versions clearly, and by name. Never silently
  edit a `kind` string, payload encoding, signature algorithm, or golden fixture under
  `src/contract/fixtures/`.
- **Determinism is a promise.** Rebuilding the same commit must produce a byte-identical archive.
  Do not introduce anything that varies per run: a clock read, a random value, an unsorted
  directory listing.
- **Consumer scope stays local.** Scrollcase may verify, safely extract, inspect, and run
  caller-supplied local boxes. Distribution, downloads, registries, channel selection, updates,
  promotion, revocation services, application lifecycle policy, and CI orchestration belong to
  consuming projects. Read
  [docs/concepts/design-decisions.md](docs/concepts/design-decisions.md) before proposing a
  feature that looks missing — it may have been left out on purpose.
- **The tool names no consumer.** Project-specific values (namespaces, paths, tolerances) are
  declared by the project in config, scroll or flags; the tool stays ignorant of who uses it.
- **One contract, multiple implementations.** `src/contract/` and its schemas are authoritative.
  `scrollcase/consumer` and Python's `scrollcase_consumer` must prove the same observable behavior
  for preparation, attachment, installed-payload verification, and execution against shared
  language-neutral conformance fixtures; neither defines a parallel format.
- **Verification precedes execution.** No consumer path may start box code before signature,
  payload-shape, archive size/hash, safe-entry, and manifest-agreement checks succeed.
- **Attachment and payload verification stay separate.** Attachment may mint a process-bound receipt
  from a caller-supplied local root without reading every payload byte; installed-payload
  verification is the explicit, potentially multi-gigabyte check against the signed entry list.

## Development

```sh
npm install
npm test
```

The suite (vitest) needs no network and no pixi/conda-pack toolchain: the environment solve is
stubbed, and everything after the solve is the real implementation. CI runs it on macOS, Linux
and Windows.

The Python consumer has its own typed package and verification:

```sh
python -m pip install -e './python[test]'
cd python
python -m unittest discover -s tests -t .
mypy src
python scripts/sync_schemas.py --check
python -m build
python scripts/check_distribution.py dist/*
```

Its tests use only temporary local fixtures. The copied schemas must stay byte-identical to
`src/contract/schema/`; regenerate them only through `python/scripts/sync_schemas.py`.

## npm releases

**Close the changelog first, then bump.** `npm version` writes the version and the tag and nothing
else; it has no idea this file exists. So before running it, rename `## [Unreleased]` to
`## [<version>] — <YYYY-MM-DD>` and open a fresh empty `## [Unreleased]` above it:

```sh
# 1. edit CHANGELOG.md: [Unreleased] -> [0.12.0] — 2026-08-14, and add a new empty [Unreleased]
git add CHANGELOG.md && git commit -m "Close the changelog for 0.12.0"
# 2. then bump
npm version 0.12.0
```

Doing it the other way round is how five releases went out with every one of their entries still
under `[Unreleased]`, and the file stopped saying what had shipped when. `package-surface.test.mjs`
now fails on exactly that: the version in `package.json` must have a dated section. Between
releases `[Unreleased]` is where a change is written down, and carrying entries there is the normal
state — it is the bump that has to close them, not the writing that has to wait for one.

`npm version <version>` writes the version, commits it, and creates the tag `v<version>` — but
**locally only**. `git push origin main` does not carry tags, so pushing the branch alone leaves the
tag behind. Push both together:

```sh
git push origin main --follow-tags
```

Better still, make it structural instead of a rule to remember — once per clone:

```sh
git config --local push.followTags true
```

The tag is the only link between a version published on npm and the commit it was built from;
without it nobody can check out a released version from the public repository or diff two of them.

**This has now happened three times.** Every tag from `v0.1.3` to `v0.5.0` was missing from GitHub
before being backfilled; `v0.8.3`, `v0.9.0` and `v0.9.1` were found local-only on 2026-08-14 and
backfilled the same way; `v0.12.0` was found local-only on 2026-09-02 and backfilled with the 1.0.0
release. Every time the branch had been pushed and the tags had not, and nothing anywhere noticed —
the repository looks healthy from a working clone that already has them. No test can catch this,
because the suite must not reach the network; `git ls-remote --tags origin` is the check, and
`push.followTags` is what removes the need for it.

### Pushing the tag is what publishes

`.github/workflows/publish-npm.yml` runs on a `v<version>` tag. It refuses a tag that disagrees with
`package.json`, runs the suite and the type check, packs the tarball, and publishes **that tarball**
through npm Trusted Publishing — so what reaches npm is the artefact the tests ran against, built
from a clean checkout of the tag rather than from whatever a laptop happened to have in its working
tree.

The release decision is still the maintainer's. It is the tag push now, not `npm publish`, which is
where the PyPI release has had it since 0.4.0. Two consequences worth holding on to:

- **`git push --follow-tags` is a publishing command.** It was housekeeping when tags were only a
  record. Know which tags are about to travel before running it; `git push --dry-run --follow-tags
  origin main` lists them without sending anything.
- **Backfilling an old `v<version>` tag now starts a release of that old version.** The version
  check passes — a checkout of `v0.11.3` really does contain `0.11.3` — so the refusal comes from
  npm, which will not replace a version that already exists. It fails loudly rather than doing
  damage, but it is a failed release run for something that was only meant to be a bookmark.

Do not run `npm publish` by hand. It uploads the working tree, which is the thing this replaced.

## Python releases

The Python consumer has an independent version and tag namespace. To prepare a release:

1. update `project.version` in `python/pyproject.toml`;
2. run every Python verification command above and inspect both distribution artifacts;
3. configure the `pypi` GitHub environment as the PyPI Trusted Publisher environment for
   `scrollcase-consumer`;
4. create and push the exact tag `python-v<project.version>`.

`.github/workflows/publish-python.yml` rejects a tag/version mismatch, rebuilds and inspects the
wheel and sdist, then publishes them through PyPI Trusted Publishing. Do not upload the artifacts
manually or reuse the npm `v<version>` tag namespace.

## Rust releases

The crate has an independent version and tag namespace too, for the same reason the Python package
does: `rust/Cargo.toml` moves on its own, and a bare `v<version>` tag would make one tag mean two
releases. To prepare one:

1. update `package.version` in `rust/Cargo.toml`;
2. run every Rust verification command above, including `cargo package`;
3. configure the `crates-io` GitHub environment as the crates.io Trusted Publisher environment for
   `scrollcase-consumer`;
4. create and push the exact tag `rust-v<package.version>`.

`.github/workflows/publish-rust.yml` rejects a tag/version mismatch, checks the copied fixtures and
schemas, runs the suite, clippy and `cargo package`, then publishes through crates.io Trusted
Publishing. Unlike the npm and PyPI releases it cannot publish the artefact the verification job
built — `cargo publish` packages from a source tree every time and has no upload-this-file mode — so
it checks the tag out again and lets `cargo publish` do its own verification.

Everything from `0.1.0` to `0.3.2` was published by hand, before this workflow and before the tag
namespace existed. Those versions have no tag, so there is no commit recorded for any of them; do
not backfill one, because pushing a `rust-v*` tag now starts a release.

The conda-forge package is bootstrapped only after the PyPI release exists: submit its exact sdist
URL and SHA-256 through conda-forge's staged contribution repository. After acceptance, the
generated feedstock is the authority for conda packaging and conda-forge's update bot proposes
later PyPI versions.

Building for real additionally needs `pixi` at the version a scroll pins, plus `conda-pack` 0.9.2;
`scrollcase doctor` reports what is missing.

## Tests

- Exercise the real path, not just the import: prefer a test that asserts a behaviour someone
  depends on — a tampered archive is rejected, a rebuild is byte-identical, a dirty tree is
  refused — over one that asserts an implementation detail.
- Never let a test reach the network, and never let one write outside its temporary directory.

## Pull requests

Keep changes focused, include a test for the behaviour you add or fix, and leave
`package-lock.json` alone unless the change is explicitly about dependencies.
