# Executable members of asset archives

Prepared: 2026-11-04. Status: planned; implementation has not started.
Branch: `feat/archive-member-executables`, fresh clone of upstream `main` at `e512f00`
(`scrollcase` 1.4.0). The other working copies are untouched.

## Baseline and boundaries

- Read `AGENTS.md`, `CLAUDE.md`, `AGENT-POLICY.md`, `CONTRIBUTING.md`, the context index,
  architecture, conventions, current state, relevant decisions and public design decisions.
- `npm ci`, then `npm test`: **38 files passed; 588 tests passed, 1 skipped** on Linux x86_64
  in WSL. The skip is the macOS code-signing case. Raw logs are outside the clone in
  `/home/lorenzo/scrollcase-executables-evidence/`.
- No push, release tag, publication, hosted workflow or private-key output. Real local validation
  is explicitly requested; use a small synthetic archive and an existing pinned toolchain, never
  rebuild the CI-signed demos. If a real solve is needed, measure it and retain the exact inputs.
- Keep every implementation commit green. Record defects and guard failures here before moving
  to the next expensive step. Restore mutations immediately after proving a guard red.

## Decisions and exact rules

1. Add optional `assetArchives[].executables`, an array of distinct paths relative to that entry's
   `destination`, after `stripComponents`. Empty and absent both mean no declarations. Use the
   existing safe-path convention, with no dot segments or alias spellings; no globbing, directories,
   absolute/drive paths, traversal, NULs, links or link ancestors. Diagnostics name
   `assetArchives[].executables`, the offending path and its archive. Reject duplicates before
   extraction, including normalized duplicates and repeated resulting payload paths across entries.
2. Validate against regular extracted files before pruning and revalidate after pruning, before
   runtime preparation could recreate a removed file. A declaration removed by `prunePaths` or
   `removeAfterExtract` is a contradiction. Keep the default compressed-source removal and optional
   retention working. Declarations do not borrow a pre-existing file from another source.
3. Join the validated paths to the existing asset/local-file declarations. Both the archive writer
   and the execution guard receive this same list. ZIP, TAR and TAR.GZ use the same rules. Windows
   validates declarations identically, writes 0644 as before and uses extension-based execution.
4. Choose mode normalization before the self-test (candidate a). A helper in `archive.mjs` uses
   `archiveFileMode` itself on regular payload files, never follows links, and skips chmod on a
   Windows target. Run it before optional Apple signing, self-test and parity. Keep the entry-point
   guard ahead of execution. Wrap self-test failures with actionable declaration guidance while
   preserving the original error. Reapply modes after probes so probe-created files also match
   the archive. Do not duplicate the rule, infer executable bits from input modes or extract a
   second multi-GB payload (candidate b).
5. Stay inside schema version 3: only the optional build-input schema changes. No signed document,
   manifest, digest format, namespace, signature or frozen golden envelope changes. Older builders
   reject the new field through `additionalProperties: false`; older consumers already understand
   the unchanged ZIP modes. This calls for the next npm **minor** (1.5.0), left unreleased here.

Record the declaration decision and the self-test decision separately in `.context/decisions/`,
including the rejected top-level executable list and archive-round-trip designs.

## Files and implementation commits

### 1. Declare and validate archive members

- `src/contract/schema/scroll.schema.json`: optional described field; regenerate types with
  `npm run types`, public v3 schemas with `npm run docs:schemas`, Python schemas with
  `python/scripts/sync_schemas.py`, Rust assets with `rust/scripts/sync-assets.mjs`.
- `src/build/assets.mjs`, `src/build/archive.mjs`, `src/build/scroll.mjs`, `src/build/box.mjs`:
  validate declarations, reject link traversal before copying, check post-prune survival, collect
  executable paths and feed the existing archive/entry-point checks. Preserve checksum validation,
  collisions, injection seams and the single substrate.
- Authoring audit: `scroll-edit.mjs` spreads complete objects, so add/remove/edit/refresh preserve
  nested archive entries. `edit scroll` intentionally excludes collections; authors edit archive
  JSON directly. `add` has no archive-member command to extend. `authoring.mjs` scaffolds no asset
  archives. `scroll.mjs` joins whole archive entries base-first; nested declarations travel with
  their entry, without an independent merge rule. Add preservation and fragment tests.
- Tests: synthetic ZIP/TAR/TAR.GZ; with/without stripping and source removal; regular-file and
  missing/directory/link/ancestor/unsafe/duplicate cases; prune contradictions; native execution
  guard; Windows mode rule; byte-identical rebuild. Observe focused new tests fail first.
- Docs in this commit: scroll reference, managing-assets guide, white paper, public decisions,
  changelog, context architecture and decision record. Updating-boxes does not currently describe
  archive declarations; add migration guidance there alongside the behavior change in step 2.
- Regenerate the committed GitHub Action bundle and schemas with `npm run action:build`.
  Gate: focused tests, `npm test`, type/copy/action checks, docs build, Syngraphe.

### 2. Self-test the modes that will ship

- `src/build/archive.mjs`, `src/build/box.mjs`: shared mode normalization, earlier execution guard,
  self-test diagnostics and parity ordering. Preserve safe prefix symlinks and Apple signing.
- Tests: run a real local subprocess against an executable archive member; prove an undeclared
  0755 input fails at self-test time and the declared counterpart succeeds; inspect normalized
  modes in the runner and the final ZIP. Cover runtime-generated console scripts and data files.
- Measure every tracked scroll and every fixture/inline declaration for archive usage and
  execution outside runtime rules. Do not claim large demos were rebuilt. Document measured
  static impact and limits, including dependencies that might spawn helpers outside scripts paths.
- Update the self-test decision, relevant reference/guide/architecture/white-paper/changelog pages.
  Regenerate types and Action. Gate: focused tests and all step-1 checks.

### 3. Consumer parity and complete verification

- Extend the existing restrictive-umask conformance case in
  `src/contract/fixtures/consumer-conformance.json` with a declared archive-member path.
  This behavioral case is not a frozen signature golden. Extend the JS, Python and Rust fixture
  builders and regenerate Rust fixture copies. JS stages a real synthetic asset archive; the
  mirrors express the resulting unchanged signed box. Under umask 077 all three must extract 0755.
- Full checks from `AGENTS.md` and `.github/workflows/ci.yml`: Node suite, types, Action drift,
  npm pack dry-run, production dependency audit, public schemas, docs build; isolated Python unit
  suite, mypy, schema check, wheel/sdist, distribution inspection and clean wheel import; Rust
  tests, clippy, asset check and cargo package. No hosted CI. Report host/version limits honestly.
- Pack the finished repository with `npm pack` into scratch, install that tarball in a separate
  scratch project with a committed scroll and synthetic executable TAR.GZ. Build with the real
  pinned pixi/conda-pack if available, install through the JS consumer under umask 077 and run the
  member. Verify release signature, archive hash, mode and output; keep no scratch state in git.
- Gate: all required checks green; document counts, guard failures, source inventory, artifact
  hashes, commands and remaining limits here; commit evidence and move the finished plan to
  `.context/history/`. Update `.context/index.md` and `.context/state/current.md` in the same change.

## Risks and stop conditions

- Existing ZIP asset copying can turn a link into a regular file: validate the extracted source
  before copying, retaining the stricter asset-archive boundary without changing consumer links.
- A destination may already traverse a prefix link: check destination ancestors before extraction,
  not only the final declared file. Do not broaden this work into a different extraction backend.
- chmod must visit regular files only, not mutate a symlink target under an alias. New self-test
  output and the last-written digest file need their final modes applied too.
- Mode normalization deliberately reveals boxes that passed only on build-directory permissions.
  Preserve the subprocess error and point to every applicable executable declaration.
- The Action includes build code and schemas, so source changes require regenerated committed
  artifacts. Generated types and language copies are never hand-edited.
- Stop a local real build on unexpected downloads or a pin mismatch; inspect exact inputs before
  any retry. Never weaken native-host, provenance, checksum, signer or licence guards.

## Living evidence

- [x] Fresh current source, repository instructions, baseline suite.
- [x] Plan committed before implementation (`765119c`).
- [x] Declaration, validation, authoring preservation, determinism and docs proved.
- [x] Consumer-mode self-test regression proved red, then green; source impact measured.
- [x] Three consumer implementations preserve the archive-member bit under umask 077.
- [ ] Every required local check and packed-package end-to-end validation passed.
- [ ] Final clean branch, commits and owner-only release steps recorded.

Step 1 evidence in progress: 33 new asset tests failed against the baseline (4 existing passed).
The expanded Node suite exposed Ajv strict mode requiring an explicit string type beside a
referenced path pattern; fix the schema rather than weakening strict mode. A first native test
omitted required `defaultArgs`; its corrected declaration passes. System Python lacks ensurepip,
so tests use uv's isolated CPython 3.13 environment outside the clone instead. The existing pinned
toolchain is present under the WSL user's `.pixi/`; do not infer absence from PATH.

Safety review found that checking only an extraction destination misses a link deeper beneath it.
Move the lstat walk into the existing filesystem module and apply it before every copied archive
entry as well as when validating declarations. Add a regression asserting no file is written
through that ancestor. No second extractor or mode rule is needed.

Step 1 complete: **640 Node tests passed, 1 macOS-only skip, 38 files**. The source membership,
link traversal, stripping/removal combinations, prune contradictions, Windows modes, native
entry point and byte-identical ZIP/TAR/TAR.GZ builds pass. Authoring preservation and split-scroll
tests pass. Generated contract/runtime types, 8 public schemas and Action bundle checks pass;
Python and Rust synchronization made no copy changes because neither consumer ships the build-only
scroll schema. Python: **68 tests**, mypy (9 source files), schema check, wheel/sdist and distribution
inspection pass. Rust: **112 tests**, clippy clean. Docs build and postbuild verification pass:
82 pages, 8 schemas, 82 Markdown twins and 46-page canonical/LLM coverage. `syngraphe check` passes
with the pre-existing AGENT006 managed-block-version warning; no managed block was hand-edited.

The docs build was first started concurrently with schema generation and correctly refused drift.
It passed after synchronization; dependent checks will run after their generators from now on.

Step 2 focused evidence: the undeclared real-helper regression failed because the baseline build
wrongly succeeded; the runtime-mode assertion also failed (0644 instead of 0755). After applying
the writer's rule, all 10 focused self-test cases pass. The undeclared helper now fails with an
OS permission error before archive creation; declaring it succeeds. Probe outputs and the final
digest receive final modes too; the link-alias regression checks that chmod never follows links.

Static source inventory (script and JSON in the external evidence directory): **26 tracked
scroll.json files, 20 effective example/demo scrolls**, all read through the real split-scroll
reader. Zero example archive entries; every execution command satisfies the existing executable
rule. Per family: codon-demo, dataset-demo, hello-box, llm-demo, sentiment-demo and transcode-demo
each have 3 targets; hello-box-node and hello-box-native have 1 each. Native commands are the
runtime-provided h5dump, zstd and ffmpeg under the scripts directory; interpreted commands are
the runtime entry point. Scanning tracked JSON found 10 complete scroll inputs: the only archive
declaration is the canonical scroll-pixi example, a source ZIP with no execution. The pre-existing
inline archive fixtures exercise reading or intentionally invalid `embed`; no undeclared helper
is run. The full suite measures these paths dynamically with the stubbed toolchain. This does
not establish that every third-party dependency avoids spawning a helper outside runtime script
paths; real builds may expose those, and CI-signed demos cannot be rebuilt with local keys.

Step 2 gate: **644 Node tests passed, 1 skipped, 38 files**; contract/runtime types and Action
drift checks pass; docs build and all generated-route checks pass; Syngraphe passes with the same
pre-existing managed-block warning. No Python or Rust implementation/copy changed in this step.

Step 3 in progress: extending the existing umask-077 case with `tools/bin/archive-tool` (0755)
and an undeclared upstream-executable README (0644) first failed in **all three** implementations,
because the extra paths were missing. The JS fixture now expands a real synthetic TAR.GZ through
the build declaration; Python and Rust describe the resulting unchanged ZIP. No consumer runtime
or signed schema changes are needed. Next gates include the full language checks and packaging.

The lost-bit guard was then proven directly in all three fixture builders: set only the archive
member's synthesized mode to 0644, run the conformance case, observe 0644 versus required 0755,
and restore the exact original file in a finally block. JS exited 1, Python 1 and Rust 101.
Separately, the 1.4.0 schema accepted its original canonical scroll, then rejected that same scroll
with the new field as `$.assetArchives[0].executables is not allowed`. Compatibility is observed,
not inferred. Full suites after the fixture additions passed: Node 644 + 1 skip, Python 68,
Rust 112. Types, Action drift, npm pack dry-run, production audit (0 vulnerabilities), Python
schema/mypy/build/distribution checks and Rust clippy/asset checks pass. Docs build passes too.
The restored guards will be checked again before the conformance commit; clean cargo packaging,
clean wheel import and the real packed-package smoke remain.

Guard cleanup finding: Python reused bytecode compiled during the deliberate same-size 0755 to
0644 mutation, because mutation and restoration fell within the same timestamp second. The
source was correctly restored to 0755, but the next suite still observed the cached 0644 fixture.
Remove only the identified generated conformance-support pyc, then rerun the full Python suite;
this is mutation-harness cleanup, not a production-code fallback or weakened expectation.
