# Contributing to scrollcase

Thanks for your interest. A few things about this project are deliberate and non-negotiable;
knowing them first will save you a rejected pull request.

## The boundaries

- **One substrate.** pixi + conda-pack + conda-forge, and only that. A second dependency backend
  means proving every guarantee twice, and the guarantees are the product.
- **Published v1 is immutable; the next major line is v2-only.** Existing v1 boxes stay with their old
  Scrollcase versions. New code must not add a v1/v2 union, compatibility aliases, or dual paths;
  the v2 verifier rejects v1 clearly. Never silently edit a `kind` string, payload encoding,
  signature algorithm, or golden fixture under `src/contract/fixtures/`.
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
now fails on exactly that: the version in `package.json` must have a dated section, and
`[Unreleased]` must be empty once it does.

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

**This has now happened twice.** Every tag from `v0.1.3` to `v0.5.0` was missing from GitHub before
being backfilled; `v0.8.3`, `v0.9.0` and `v0.9.1` were found local-only on 2026-08-14 and backfilled
the same way. Both times the branch had been pushed and the tags had not, and nothing anywhere
noticed — the repository looks healthy from a working clone that already has them. No test can catch
this, because the suite must not reach the network; `git ls-remote --tags origin` is the check, and
`push.followTags` is what removes the need for it.

Publishing to npm itself is the maintainer's call and is never automated from here.

## Python releases

The Python consumer has an independent version and tag namespace. To prepare a release:

1. update `project.version` in `python/pyproject.toml` and the version pinned in the generated
   Python consumer template;
2. run every Python verification command above and inspect both distribution artifacts;
3. configure the `pypi` GitHub environment as the PyPI Trusted Publisher environment for
   `scrollcase-consumer`;
4. create and push the exact tag `python-v<project.version>`.

`.github/workflows/publish-python.yml` rejects a tag/version mismatch, rebuilds and inspects the
wheel and sdist, then publishes them through PyPI Trusted Publishing. Do not upload the artifacts
manually or reuse the npm `v<version>` tag namespace.

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
