# Scrollcase documentation correction and expansion plan

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered.** The documentation correction and expansion programme of 2026-07-26, written
> against `schemaVersion: 1` and the vocabulary of the time (*recipe*, not *scroll*). Its
> decision gates are recorded, still current, in
> [`../decisions/documentation-site.md`](../decisions/documentation-site.md).

Prepared: 2026-07-26

## Purpose

Bring the public documentation into exact agreement with the shipped Scrollcase package, correct
unsafe operational guidance, close missing public-site routes, and add the material a user needs to
build, verify, distribute, and trust a box without relying on repository knowledge.

This plan records work to perform only after the maintainer gives explicit approval. It does not
authorize implementation, dependency changes, schema changes, publishing, key generation, a real
box build, or deployment.

## Governing constraints

- Preserve the `schemaVersion: 1` wire format. Do not silently edit frozen `kind` strings, payload
  encoding, signature algorithm, or golden fixtures.
- Preserve the project boundary: Scrollcase builds and verifies a box; it is not a registry,
  publisher, promotion system, revocation service, or CI scheduler.
- Use the canonical terms `box`, `recipe`, `target`, `payload`, `release`, `channel`,
  `revocations`, `self-test`, and `parity`.
- Write public and developer-facing documentation in English.
- Prefer fixing an implementation that violates an intended security or provenance guarantee over
  weakening the documentation to describe the defect.
- Do not invent unsupported workflows. Every command example must be exercised against the CLI or
  covered by a test.
- Do not run a real build, install a real toolchain, rotate a real key, deploy the site, publish npm,
  or push changes without separate authorization.

## Baseline evidence

The audit covered all 17 Markdown pages, VitePress configuration and theme components, and compared
their claims with the CLI, schemas, public exports, build path, verifier, signing code, asset
staging, and provenance collection.

Current verified state:

- `cd docs && npm run build` passes.
- Normal Markdown internal links resolve.
- `https://scrollcase.dev/privacy` returns HTTP 404.
- `https://scrollcase.dev/schema/target.schema.json` returns HTTP 404.
- Google Analytics is loaded before the cookie banner can receive a user choice.
- The worktree was clean when this plan was created.

## Decision gates

Resolve these decisions before editing. They affect whether a task is documentation-only or a
product-contract correction.

### DG-1 — Analytics and consent

Recommended decision: keep analytics only if it is loaded after explicit opt-in, offer an equally
available rejection action, and persist the choice. If that work is not desired, remove analytics
entirely.

Do not retain the current combination of unconditional Google Analytics and an “essential cookies
only” banner.

### DG-2 — Public schema hosting

Recommended decision: publish the exact shipped JSON Schema files under `/schema/`, matching their
absolute `$id` and `$ref` URLs byte for byte.

Alternative: explicitly make schemas package-only and document how an external validator registers
every schema locally. This is less interoperable and leaves the current public-looking `$id` URLs
misleading, so it is not preferred.

### DG-3 — Verification strength

Recommended decision: make verification satisfy the documented field-for-field guarantee for all
security- and identity-relevant data already present in schema version 1.

Do not merely replace “field-for-field” with weaker language unless the maintainer intentionally
changes the product guarantee.

### DG-4 — Builder versus consumer self-test

Adding `pythonCode` or file assertions to an existing signed wire document may be a schema change.
Before implementation, determine whether:

1. existing schema version 1 fields can express the intended consumer checks without breaking the
   format;
2. the public promise must be narrowed to distinguish builder self-test from consumer import
   verification; or
3. a future schema version is required.

Default for the current release: document the exact distinction unless a backward-compatible
implementation is proven.

### DG-5 — Recipe validation

Recommended decision: validate the complete recipe against the shipped schema at runtime before
toolchain discovery or installation, then retain semantic checks that JSON Schema cannot express.

Before adding a runtime validator dependency, compare it against a small internal validation layer
and the repository's strict dependency-surface rule. Any dependency change must intentionally
include and review `package-lock.json`.

### DG-6 — Asset download persistence

Choose one:

- implement a project-scoped, hash-verified persistent cache and keep the current resume/reuse
  promise; or
- document that resume is limited to retries inside one uninterrupted build attempt.

Do not claim cross-process resume while the build directory is deleted at startup.

## Phase 1 — Correct security, trust, and public-site defects

### P1.1 Privacy route and consent behavior

Files:

- `docs/.vitepress/config.mts`
- `docs/.vitepress/theme/CookieBanner.vue`
- `docs/.vitepress/theme/custom.css`
- new `docs/privacy.md`
- VitePress navigation/footer configuration where appropriate

Work:

1. Implement DG-1.
2. Add a privacy page that identifies the analytics provider, data purpose, consent storage,
   retention/link to provider policy, and how to withdraw or change the choice.
3. Ensure analytics is not requested before opt-in.
4. Provide accept and reject actions with comparable prominence.
5. Add dialog semantics, focus handling, keyboard operation, and clear accessible names.
6. Correct the backdrop comment so it matches actual pointer behavior.
7. Add `/privacy` to link and route checks.

Acceptance:

- A fresh browser session makes no analytics request before opt-in.
- Rejecting leaves analytics disabled across navigation and reload.
- Accepting enables it once without duplicate initialization.
- `/privacy` renders in the production build.
- The banner is operable by keyboard and does not strand focus.

Failure/stop condition:

- If consent cannot be tested deterministically, remove analytics rather than shipping an
  unverified consent mechanism.

### P1.2 Publish the schema route

Files:

- `src/contract/schema/*.json`
- VitePress public assets or a deterministic schema-copy script
- root `package.json` and/or `docs/package.json` only if a script is required
- docs/reference/recipe.md
- `docs/reference/box-format.md`
- docs/reference/api.md

Work:

1. Implement DG-2 without maintaining a second hand-copied schema source.
2. Copy schemas deterministically from `src/contract/schema/` into the built site's
   schema/ directory.
3. Fail the docs build if the deployed copies differ from the package schemas.
4. Verify every absolute `$id` and `$ref` resolves to a published file.
5. Document both public URL validation and package import validation.

Acceptance:

- Every schema `$id` returns HTTP 200 after deployment.
- All absolute references resolve.
- Published files are byte-identical to the package schemas.
- A test fails after deliberately changing or omitting one copied schema.

Stop condition:

- Do not manually duplicate schemas in `docs/public/` without a drift guard.

### P1.3 Correct signing and custody guidance

Files:

- `docs/guides/signing-and-custody.md`
- `docs/reference/cli.md`
- `docs/reference/configuration.md`
- possibly a new trust-model page from Phase 4

Work:

1. Remove the unsupported “build unsigned in CI, sign later” workflow.
2. Explain that build emits signed release/channel documents and that an external signer is the
   supported custody boundary.
3. Replace the unsafe `keygen --force` rotation order:
   - preserve and identify the outgoing public key first;
   - generate the incoming key under a distinct explicit path;
   - distribute a trust bundle containing both public keys;
   - switch signing only after consumers trust the incoming key;
   - retire the outgoing key only after the compatibility window.
4. Never recommend committing the ignored default `.scrollcase/` directory. Show copying the
   public key to a tracked, project-owned trust directory and using `--public-key`.
5. Clearly state that Scrollcase creates/verifies revocation documents but does not distribute or
   enforce a registry policy for a consuming project.
6. Add warnings around `keygen --force` matching `AGENTS.md`.

Acceptance:

- Every command shown exists in current CLI help.
- The procedure never overwrites the only copy of an outgoing key.
- No example prints or commits a private key.
- The external signer sequence retains exact-payload echo verification.

## Phase 2 — Align documented guarantees with implementation

This phase may include source changes. It must be completed before editing prose that depends on the
outcome.

### P2.1 Full manifest agreement during verify

Primary source:

- `src/build/verify.mjs`

Documentation:

- `docs/concepts/architecture.md`
- `docs/reference/cli.md`
- `docs/reference/box-format.md`
- `docs/guides/offline-airgap.md`
- `docs/guides/distributing-boxes.md`

Work:

1. Inventory every duplicated or related field in `box.json` and the signed release.
2. Define canonical comparison rules without changing schema version 1.
3. Compare complete target data, provenance, entry point, cache subdirectory, self-test data,
   weight policy, asset descriptors, and identity/version fields wherever both documents carry
   them.
4. Produce a clear validation failure through `fail()` for each mismatch class.
5. Update documentation to enumerate the verification sequence accurately.

Regression coverage:

- Tamper each comparison class one at a time and confirm verification rejects it.
- Confirm the new guard fails before restoring the fixture.
- Cover embed and on-demand weights.
- Cover local and external signer outputs where applicable.

### P2.2 Define self-test semantics precisely

Primary source:

- `src/build/box.mjs`
- `src/build/verify.mjs`
- recipe and release schemas

Documentation:

- docs/reference/recipe.md
- `docs/reference/box-format.md`
- `docs/reference/cli.md`
- `docs/concepts/architecture.md`
- `docs/getting-started/quickstart.md`

Work:

1. Resolve DG-4.
2. Name the phases explicitly:
   - build-time target assertion;
   - build-time imports;
   - optional build-time `pythonCode`;
   - post-prune file assertions;
   - consumer/native-host `verify --self-test`.
3. State which checks are signed and repeatable by a consumer.
4. If code is strengthened compatibly, add tamper and native-host tests.
5. If code cannot be strengthened under schema version 1, remove the claim that the complete recipe
   self-test is repeated.

Acceptance:

- A reader can determine exactly which interpreter runs each check and at what lifecycle point.
- No section calls an import-only consumer check equivalent to a richer builder check.

### P2.3 Runtime recipe validation and fail-fast claims

Primary source:

- `src/build/recipe.mjs`
- `src/contract/schema/recipe.schema.json`
- dependent release/box schemas

Documentation:

- docs/reference/recipe.md
- `docs/reference/cli.md`
- `docs/getting-started/quickstart.md`

Work:

1. Resolve DG-5.
2. Align recipe and release constraints, including the minimum number of imports.
3. Run full structural validation before any toolchain installation, environment solve, download,
   or build-directory mutation.
4. Keep semantic checks for path escape, target/policy combinations, lock/audit agreement, and
   asset restrictions at the earliest point where their inputs exist.
5. Rewrite the “Validation order” section as an ordered, implementation-backed sequence.

Regression coverage:

- Invalid nested recipe fields.
- Empty imports.
- Escaping paths.
- `on-demand` combined with `assetArchives`.
- Invalid parity threshold shapes.
- Assert no injected process runner or fetch is called for structurally invalid input.

### P2.4 Honest dirty-tree provenance

Primary source:

- `src/build/recipe.mjs`

Documentation:

- `docs/concepts/architecture.md`
- `docs/reference/cli.md`
- `docs/reference/box-format.md`

Work:

1. Include untracked files in dirty-state detection.
2. Confirm ignored generated state does not create false positives.
3. Test an untracked recipe/local asset, tracked modification, clean tree, and ignored file.
4. Retain refusal without `--allow-dirty` and truthful `sourceTreeDirty: true` with consent.

Acceptance:

- No uncommitted source or build input can produce `sourceTreeDirty: false`.

### P2.5 Asset reuse and resume semantics

Primary source:

- asset downloader/staging modules
- `src/build/box.mjs`
- workspace/configuration modules if a persistent cache is selected

Documentation:

- docs/guides/managing-weights.md
- `docs/concepts/architecture.md`
- `docs/reference/configuration.md`

Work:

1. Resolve DG-6.
2. If caching is implemented, key it by immutable hash, verify size and hash on every reuse, use
   atomic completion, and never trust a partial file.
3. Document cache location, cleanup, offline behavior, and corruption recovery.
4. If caching is not implemented, limit wording to retries within one active build process.

Acceptance:

- Documentation describes exactly the persistence boundary proven by tests.
- A checksum mismatch never enters the payload or cache as complete.

## Phase 3 — Correct remaining existing pages

### P3.1 Homepage

Files:

- `docs/index.md`
- `docs/.vitepress/theme/HomePage.vue`

Corrections:

- Replace “Coming soon” with the current published status/version language.
- Explain that the signature is carried by the adjacent signed release document, not embedded in
  the archive.
- Replace “validation on real inputs” with the actual default and optional validation guarantees.
- Normalize the GitHub repository URL casing.
- Make the seven supported verbs and library exports discoverable without implying publishing or
  registry functionality.

### P3.2 Installation and configuration

Files:

- `docs/getting-started/installation.md`
- `docs/reference/configuration.md`
- `docs/reference/cli.md`

Corrections:

- Remove the contradiction that `lock` needs Pixi but “locking needs no toolchain”.
- Explain which verbs need Pixi, conda-pack, a signing key, or only Node.js.
- Document the real Pixi upgrade flow: edit/pin the intended version, initialize/install that exact
  version with consent, relock, audit, and rebuild.
- Include `--toolchain-dir` consistently in global workspace options.
- Verify discovery precedence: flag, environment, project toolchain, then `PATH`.

### P3.3 API examples

File:

- docs/reference/api.md

Corrections:

- Replace the invalid `try`/`catch {}` fixture example with an assertion that cannot swallow its
  own failure.
- Include `toolchainDir` in workspace resolution output.
- Confirm every named export and signature against `package.json` exports and source.
- Make examples executable as documentation tests where practical.

### P3.4 Offline and distribution guidance

Files:

- `docs/guides/offline-airgap.md`
- `docs/guides/distributing-boxes.md`
- `docs/reference/box-format.md`

Corrections:

- Say that Scrollcase validates through temporary extraction; it does not install/extract into an
  arbitrary destination.
- Place archive extraction after signature/hash verification.
- Describe `installedSizeBytes` as a logical estimate/lower bound, not a free-space guarantee.
- Explain that consumers need headroom for both archive and extracted files plus filesystem
  overhead.
- Preserve the boundary that transport, hosting, promotion, and client installation belong to the
  consumer.

### P3.5 CUDA and target examples

File:

- `docs/guides/packaging-cuda.md`

Corrections:

- Present `cuda12.4` as an example, not the only supported CUDA ABI.
- Use `cuda<major.minor>` when describing the contract generically.
- Explain that compatibility is target-exact and that building a target does not prove scientific
  parity.
- Check all commands against the Pixi version actually pinned by the example recipe, not only the
  latest Pixi documentation.

### P3.6 Parity guide

File:

- `docs/guides/accelerator-parity.md`

Corrections/additions:

- State that all declared thresholds are conjunctive.
- Document accepted numerical values and non-finite-value rejection.
- Explain reference-versus-candidate ordering.
- Separate Scrollcase's enforcement of declared tolerances from scientific choice of tolerances.
- State whether measurements are persisted, signed, returned only internally, or currently
  discarded by the public CLI.
- Do not imply that Scrollcase chooses scientifically correct fixtures or thresholds.

### P3.7 Theme maintenance and accessibility

Files:

- `docs/.vitepress/theme/*.vue`
- `docs/.vitepress/theme/custom.css`
- `docs/package.json`

Work:

- Verify whether `ShareThis.vue` is intentionally functional; wire it correctly or remove it.
- Add complete tab semantics: stable IDs, `aria-controls`, `aria-labelledby`, selected state,
  keyboard arrow/Home/End behavior, and focus management.
- Translate developer-facing CSS comments to English.
- Remove unused theme components and dependencies only after proving they are unused.

## Phase 4 — Add missing documentation

### P4.1 Security and trust model

New page:

- `docs/concepts/security-and-trust.md`

Required content:

- Threat model and non-goals.
- Trust-anchor bootstrap.
- Distinction between archive, `box.json`, release, channel, and revocations documents.
- Exact order of size, hash, signature, manifest, path-safety, and optional native self-test checks.
- Local key versus external signer custody.
- Rotation and compromise response.
- What Scrollcase verifies versus what a consumer must enforce.

### P4.2 Troubleshooting

New page:

- `docs/guides/troubleshooting.md`

Required cases:

- Missing or wrong Pixi version.
- Missing conda-pack.
- Dirty or non-git workspace.
- Missing/outdated `pixi.lock`.
- Licence audit drift.
- Asset size/hash mismatch and interrupted download.
- Public/private key mismatch without recommending `keygen --force`.
- Native-host mismatch for `verify --self-test`.
- Windows path, PowerShell, interpreter, and launcher differences.
- External signer payload mismatch.

Each case should include symptom, cause, safe diagnostic, correction, and actions never to take.

### P4.3 Platform-specific examples

Add or expand examples for:

- macOS CPU;
- Linux CPU;
- Linux CUDA;
- Windows CPU;
- Windows CUDA where contractually buildable, without claiming validation/support not proven.

Use PowerShell syntax for Windows and POSIX shell syntax elsewhere. Keep examples target-neutral
where the behavior is identical.

### P4.4 Schema usage

New section or page:

- `docs/reference/schemas.md`

Required content:

- Public schema URLs.
- Package import paths.
- Registering related schemas for offline validation.
- `$id` and `$ref` behavior.
- Generated TypeScript types and `npm run types`.
- Compatibility and schema-version rules.

### P4.5 Rollout interoperability specification

Preferred location:

- `docs/reference/box-format.md`, with contract fixture references

Required before claiming interoperable staged rollout:

- exact hash algorithm;
- canonical input byte encoding;
- identity and salt concatenation/framing;
- normalization rules;
- integer extraction and percentage mapping;
- rollout ordering and boundary semantics;
- golden fixtures for multiple identities, salts, and percentages.

If this cannot be added without changing a frozen contract, document the limitation and restrict
examples to deterministic behavior that existing clients can already implement consistently.

### P4.6 Version and release status

Add:

- visible documentation/package version;
- compatibility statement for schema version 1;
- link to `CHANGELOG.md`;
- distinction between package release status and support claims for individual targets.

Avoid hard-coding a version in multiple locations without a drift check.

## Phase 5 — Documentation contract automation

Add automated checks for:

1. CLI help and documented verbs/options.
2. `package.json` exports and the API reference table.
3. Full JSON examples validated against the shipped schemas.
4. Public schema-copy equality and resolvable `$ref` values.
5. Normal Markdown links and links generated inside Vue components.
6. Required public routes, including `/privacy` and `/schema/*.json`.
7. Cookie consent behavior without real analytics network traffic.
8. Executable API examples.
9. Claims tied to behavior tests: dirty provenance, field agreement, recipe fail-fast validation,
   and download persistence.

Every new guard must be deliberately broken once, observed failing, and then restored before it is
accepted.

## Suggested execution sequence

Use small, reviewable steps:

1. Record all decision-gate outcomes.
2. Fix privacy/analytics and add `/privacy`.
3. Add deterministic public schema hosting.
4. Correct signing/custody guidance.
5. Resolve implementation/documentation contract gaps in Phase 2 one at a time.
6. Correct existing pages after the resulting behavior is final.
7. Add security, troubleshooting, schema, platform, and rollout material.
8. Complete accessibility/theme cleanup.
9. Add automated documentation-contract checks.
10. Run the complete verification matrix and review the final rendered site.
11. Update `CHANGELOG.md` for user-visible corrections.
12. Present the diff and evidence to the maintainer; do not deploy, publish, or push unless
    separately requested.

Suggested commit boundaries:

- privacy and consent;
- schema hosting;
- verification/provenance behavior alignment;
- recipe validation;
- asset caching or wording correction;
- signing/trust documentation;
- existing-page accuracy sweep;
- new reference/guides;
- docs automation and accessibility.

Do not combine a wire-format decision with cosmetic documentation changes.

## Verification matrix

Required after every relevant step:

```text
npm test
cd docs && npm run build
node src/cli.mjs help
```

Additional targeted evidence:

- schema URLs and privacy route exist in the generated output;
- custom route/link checker includes Vue-generated links;
- all JSON examples validate;
- package surface test covers all documented exports;
- consent behavior is browser-tested;
- verification tamper tests cover every newly compared field;
- provenance tests cover untracked inputs;
- no test reaches the network or writes outside its temporary directory.

Manual rendered-site review:

- desktop and narrow mobile width;
- light and dark themes;
- keyboard-only navigation;
- code block overflow;
- tables on small screens;
- Mermaid and mathematical rendering;
- headings, sidebar ordering, next/previous links, and search labels.

Platform-sensitive source review:

- macOS, Linux, and Windows interpreter/layout assumptions;
- embed and on-demand assets;
- local signer and external signer;
- project toolchain and `PATH` discovery.

## Completion criteria

The work is complete only when:

- every public factual claim matches a tested behavior or is explicitly marked as policy/example;
- no supported workflow uses a nonexistent command or unsafe key procedure;
- `/privacy` and every schema `$id` resolve publicly;
- verification, self-test, provenance, validation, asset-resume, and rollout wording are exact;
- all documented JSON and API examples are mechanically checked;
- VitePress production build and the root unit suite pass;
- accessibility issues introduced or exposed by custom theme components are addressed;
- `CHANGELOG.md` records user-visible corrections;
- the final diff contains no generated VitePress state, secrets, private keys, or unrelated edits.

## Explicitly out of scope without new authorization

- `npm publish`;
- site deployment;
- git push;
- real key generation or rotation;
- creation of real revocation documents;
- a real box build or toolchain installation;
- a schema-version bump;
- changes to frozen fixtures or wire strings;
- adding registry, publishing, promotion, or serving features.

