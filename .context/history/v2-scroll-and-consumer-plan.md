# Scrollcase v2 — scroll authoring, consumer SDKs, and execution plan

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered, and since superseded by version 3.** The plan that renamed *recipe* to
> *scroll*, defined the execution contract, and added the Node and Python consumers. Its
> wire decisions were replaced by [`v3-plan.md`](v3-plan.md); its vocabulary and consumer
> shape survive.

Prepared: 2026-07-28  
Status: approved plan; implementation has not started  
Baseline: clean `main` at `9bdc2dd640d506c144a7c8fcda52294c9998ccb4` (`v0.2.3`)

This is a local handoff for the next session. It is not public documentation and is intentionally
git-ignored. Before implementation, you MUST read `AGENTS.md`, `AGENT-POLICY.md`, and
`docs/concepts/design-decisions.md` in full, then re-check the current checkout rather than assuming
the baseline above is still current.

## 1. Maintainer decisions — final

The following choices were explicitly made by the maintainer and supersede the earlier draft plan.

1. The new Scrollcase line is **v2-only**. Do not implement a v1/v2 union, runtime compatibility
   layer, legacy aliases, or dual code paths.
2. Existing immutable npm releases and v1 boxes remain historical artefacts usable with their old
   Scrollcase versions. The new verifier rejects v1 clearly; it does not silently reinterpret it.
3. The canonical source term is **scroll**, everywhere. Remove **recipe** from product vocabulary,
   identifiers, filenames, directories, CLI, schemas, fixtures, types, comments, docs, examples,
   errors, and contributor instructions.
4. The output artefact remains a **box**. Do not rename it to “case”; keep `box`, `box.json`, and
   related terminology.
5. The source file is `scroll.json`; the source root is scrolls/.
6. The Node/TypeScript consumer export is `scrollcase/consumer`, not `scrollcase/runtime`.
7. The Python package exposes the same semantics under the import name `scrollcase_consumer`.
8. Add `scrollcase run` as a thin wrapper over the Node consumer API.
9. Add a guided generator at `scrollcase new scroll`, not `init recipe`.
10. Do not build a VS Code extension now. Editor assistance comes from the JSON Schema referenced
    by `$schema`; custom file icons are deferred.
11. Do not add a JavaScript helper inside each built box. The official execution utilities live in
    the consumer SDKs.
12. No real pixi/conda-pack build, npm publish, PyPI publish, tag, deployment, or external consumer
    migration without separate explicit authorization.

## 2. Current scope evidence

At planning time:

- The worktree was clean and synchronized with `origin/main`.
- The checkout version was `0.2.3`.
- A case-insensitive scan found 66 tracked source/test/doc/example files containing `recipe`:
  28 under `src`, 10 under `tests`, and 28 across docs/examples/root guidance.
- The current repository already publishes a JSON Schema and `scrollcase init` generates an example
  input, but generated files do not self-associate with the schema and there is no dedicated guided
  creation flow for additional real inputs.
- The current npm exports are `scrollcase/contract`, `scrollcase/contract/browser`,
  `scrollcase/contract/types`, `scrollcase/build`, and `scrollcase/sign`.
- There is no Node consumer export, no Python package, and no application execution contract.
- The current CLI has seven verbs. This work adds `new` and `run`.

The rename is wide but mostly mechanical. The difficult work is the security-sensitive execution
contract and keeping Node and Python consumers conformant.

## 3. Canonical v2 vocabulary and layout

The intended workspace layout is:

```text
scrolls/<boxId>/<targetId>/
├── scroll.json
├── pixi.toml
└── pixi.lock
```

Required renames include, but are not limited to:

| Old | New |
| --- | --- |
| recipe | scroll |
| `recipe.json` | `scroll.json` |
| recipes/ | scrolls/ |
| `recipeId` | `scrollId` |
| `recipeVersion` | `scrollVersion` |
| `recipesDir` | `scrollsDir` |
| `paths.recipes` | `paths.scrolls` |
| `--recipes-dir` | `--scrolls-dir` |
| `--recipe` | `--scroll` |
| `readRecipe` | `readScroll` |
| `recipeCandidates` | `scrollCandidates` |
| `BoxRecipe` | `BoxScroll` |
| `recipe.schema.json` | `scroll.schema.json` |
| `src/build/recipe.mjs` | `src/build/scroll.mjs` |

CLI language becomes:

```text
scrollcase new scroll
scrollcase doctor --scroll <name>
scrollcase lock <scroll>
scrollcase audit <scroll>
scrollcase build <scroll>
scrollcase run <release.json>
```

The final tracked-tree audit should find no product use of the old term. Historical changelog prose
must be rewritten accurately rather than left as an exception.

## 4. Phase 0 — public decisions and stop conditions

Before code movement, update the authoritative reasoning and operating rules:

- `AGENTS.md`: make `scroll` the canonical declarative input and keep `box` as the artefact.
- `docs/concepts/design-decisions.md`: record the v2-only cut, the local consumer boundary, and why
  execution does not add registry/distribution/lifecycle responsibilities.
- Architecture and contributor guidance: record `scrollcase/consumer`, Python parity, and the
  single-contract/multiple-implementation rule.
- `CHANGELOG.md`: mark the upcoming change as breaking and unreleased.

The v2 consumer boundary:

- Operates only on local release documents, archives, trust keys, and destinations supplied by the
  caller.
- May verify, safely extract, inspect, and execute.
- Does not select channels, download boxes, update installations, promote, revoke, publish, serve,
  allocate runners, or own application lifecycle policy.
- Never executes box code before signature/hash/shape verification.

Success evidence: documentation and `AGENTS.md` agree; no implementation has crossed the boundary.

## 5. Phase 1 — atomic v2-only contract and scroll rename

Perform the terminology and wire migration as one coherent contract step.

### 5.1 Schemas and wire

- Change the active input and emitted documents to schema version 2 only.
- Add/rename the active schema to `scroll.schema.json`, with a stable v2 `$id`, for example
  `https://scrollcase.dev/schema/v2/scroll.schema.json`.
- Update box, release, channel, revocations, and signed-envelope schemas consistently.
- Keep the current document namespace mechanism and `kind` construction unless the v2 design has a
  concrete reason to change them.
- Keep Ed25519, deterministic payload serialization, target IDs, target adapters, and frozen target
  wire strings unchanged unless separately justified.
- Rename provenance fields to `scrollId` and `scrollVersion`.
- Align v2 channels with the existing CLI product decision: `nightly`, `beta`, `stable`. Remove the
  current schema/CLI contradiction.
- Regenerate contract and runtime declarations; never hand-edit generated `.d.ts`/`.d.mts`.

### 5.2 No compatibility layer

- Remove legacy input aliases and flat-layout compatibility.
- Remove `--recipe-id`, `--recipes-dir`, `--recipe`, and equivalent config/API names.
- Do not accept `recipe.json`.
- Do not accept schema version 1 in the new verifier.
- A v1 document must fail with a concise message such as:

```text
Unsupported schemaVersion 1; rebuild this box with Scrollcase v2.
```

Keeping one v1 rejection fixture is acceptable as negative evidence; do not keep v1 runtime support.

### 5.3 Internal and public names

- Rename modules, variables, functions, JSDoc types, test helpers, generated types, fixtures,
  schema routes, docs routes, flags, workspace fields, and errors.
- Update package-surface tests before adding new exports.
- Preserve unrelated user edits and avoid blanket capitalization/replacement that could alter
  identifiers or frozen strings incorrectly.

Success evidence:

- New v2 schemas/types generate cleanly.
- Focused schema tests pass.
- A deliberately v1 fixture is observed failing for the intended version error.
- Case-insensitive tracked grep finds no unintended old terminology.
- Full Node suite is green before proceeding.

## 6. Phase 2 — `scrollcase init` and `scrollcase new scroll`

Separate workspace setup from scroll creation.

### 6.1 `scrollcase init`

`init` prepares only the workspace:

- `scrollcase.config.json`
- scrolls/
- `.gitignore`
- Scrollcase state directories as needed
- safe toolchain diagnosis/setup policy

It should not silently create a scroll. Its final guidance is:

```text
✓ Workspace initialized
→ Next: scrollcase new scroll
```

Any current toolchain behavior coupled to creation of the example input must be deliberately moved
or redesigned; do not leave a hidden dependency on a scroll that `init` no longer writes.

### 6.2 `scrollcase new scroll`

Interactive wizard inputs:

- `boxId`
- target
- `modelId`
- `runtimeId`
- box version
- `scrollVersion`
- upstream/source revision
- Python version
- pixi version
- compatibility constraints
- asset base URL
- weights mode
- execution kind

Execution menu:

```text
python-script
python-module
library-only
```

For `python-script`, offer:

- use an existing project script; or
- generate a minimal starter script.

When an existing/generated script enters the payload:

- add the correct `localFiles` entry;
- calculate SHA-256 automatically;
- use a safe relative payload path;
- never overwrite existing source or scroll files.

For non-interactive callers, expose equivalent flags. Missing material input must fail instead of
prompting. Reuse the navigable menu primitive for finite choices.

Success evidence:

- Wizard creates a complete valid scroll.
- Script/module/library-only variants have behavioral tests.
- Non-terminal missing-input failure writes nothing.
- Re-running never overwrites.
- Generated script hash is correct and a forced mismatch test fails.

## 7. Phase 3 — JSON Schema authoring experience

Every generated `scroll.json` includes:

```json
{
  "$schema": "https://scrollcase.dev/schema/v2/scroll.schema.json",
  "schemaVersion": 2
}
```

The v2 schema must permit `$schema` and provide:

- descriptions and examples;
- enums/defaults;
- target-specific conditionals;
- `oneOf` for execution kinds;
- mutual exclusion of script/module;
- safe payload paths;
- SHA-256 patterns;
- actionable errors for missing/unknown fields.

No VS Code extension or icon work belongs in this phase. Autocomplete/hover/validation must work
from standard JSON Schema support alone.

Success evidence:

- Generated scroll validates.
- Editor-schema URL is published by the docs build from the exact shipped schema.
- Public and package schemas are byte-identical.
- Schema drift/type generation guards fail red when deliberately broken, then pass restored.

## 8. Phase 4 — execution contract and builder/verifier

The v2 execution union:

```json
{
  "execution": {
    "kind": "python-script",
    "script": "entrypoint.py",
    "defaultArgs": []
  }
}
```

or:

```json
{
  "execution": {
    "kind": "python-module",
    "module": "my_model.main",
    "defaultArgs": []
  }
}
```

`execution` remains optional so a box may intentionally be a library/runtime only. `run` must fail
clearly when it is absent.

Builder requirements:

- Never accept a shell command string.
- Validate `defaultArgs` as strings.
- Script path must be safe, relative, present after asset staging/pruning, and a regular file.
- Module name must follow a strict dotted-module grammar and be discoverable in the built
  environment without starting the application.
- Copy `execution` into both signed release payload and `box.json`.
- Extend manifest agreement to compare it recursively.
- Do not launch a potentially long-running server during build.
- Preserve archive determinism.

Verifier requirements:

- Validate execution shape and shared agreement before any execution.
- Confirm interpreter and script paths exist in the archive.
- Keep native-host enforcement for actual execution/self-test.

Success evidence:

- Tampered execution metadata is rejected.
- Traversal/absolute script paths are rejected.
- Missing script and missing module are rejected.
- Rebuild remains byte-identical.
- Windows/POSIX interpreter layouts are covered.

## 9. Phase 5 — Node/TypeScript `scrollcase/consumer`

Add a public package export with generated declarations:

```js
import {
  verifyAndExtractBox,
  runExtractedBox,
  runBox,
} from 'scrollcase/consumer';
```

Suggested layout:

```text
src/consumer/
├── verify-and-extract.mjs
├── run-extracted.mjs
├── run-box.mjs
├── index.mjs
└── index.d.mts
```

### `verifyAndExtractBox`

- Verify signed document against caller trust keys.
- Verify release shape, archive size, and archive SHA-256.
- Validate all ZIP entries before extraction.
- Extract through the existing safe extractor into a fresh staging destination.
- Compare `box.json` with the signed release.
- Check logical installed size and execution prerequisites.
- Move into the caller destination atomically.
- Refuse collisions/overwrites.
- Return a typed `PreparedBox` receipt.

### `runExtractedBox`

- Accept only a prepared/validated box representation.
- Use the box’s declared Python interpreter.
- Invoke script or `-m module` without a shell.
- Run from box root.
- Use `defaultArgs` followed by caller args.
- Support configurable stdin/stdout/stderr and environment.
- Forward termination signals correctly.
- Return exit code and signal.

### `runBox`

- Compose verify + temporary extraction + execution + guaranteed cleanup.
- Preserve the child exit code.
- Cleanup on normal exit, failure, and signal.

On-demand assets:

- Consumer code does not download them.
- Prepared receipt exposes required descriptors.
- Execution checks that caller-materialized assets match signed size/hash before launch.

Package-surface requirements:

- Add `./consumer` to `package.json`.
- Add strict TypeScript consumer fixture coverage.
- Confirm `npm pack` includes the full import closure.
- Keep runtime dependencies minimal and reuse existing security primitives.

## 10. Phase 6 — `scrollcase run`

Syntax:

```text
scrollcase run <release.json> [--archive <box.zip>] -- [application args]
```

Behavior:

- Thin wrapper over `runBox`; no duplicate verifier/extractor/spawn logic.
- Preserve args following `--` exactly.
- Use configured trust key paths.
- Display box/version/target and execution kind.
- Attach terminal stdio.
- Forward signals.
- Exit with the application exit code.
- Reject non-native targets, absent execution metadata, and unmaterialized on-demand assets.
- Never download, install persistently, or choose a channel.

Success evidence:

- CLI and direct Node API produce equivalent receipts/exit behavior.
- Arguments containing spaces/quotes/shell metacharacters reach Python unchanged.
- Ctrl-C/signal and non-zero exit tests pass.
- Temporary directories are removed in all terminal states.

## 11. Phase 7 — Python `scrollcase_consumer`

Suggested repository layout:

```text
python/
├── pyproject.toml
├── src/scrollcase_consumer/
│   ├── __init__.py
│   ├── models.py
│   ├── verify.py
│   ├── extract.py
│   ├── run.py
│   ├── schemas/
│   └── py.typed
└── tests/
```

Public API:

```python
from scrollcase_consumer import (
    verify_and_extract_box,
    run_extracted_box,
    run_box,
)
```

Requirements:

- Same semantics and receipt fields as Node, with idiomatic Python names/types.
- Complete type hints and `py.typed`.
- Use the box’s Python only for the child application; the host Python merely orchestrates.
- Do not implement cryptography manually. Select a maintained Ed25519 dependency deliberately.
- Bundle checked copies of canonical schemas through a generation/check step; never hand-maintain a
  Python format definition.
- Safe ZIP extraction must match Node behavior for traversal, links, special entries, encryption,
  size, and collision handling.
- Match Node on execution, args, environment, exit codes, signals, cleanup, and on-demand assets.
- No Node CLI dependency at runtime.

The intended distribution name is `scrollcase-consumer`; publication is out of scope.

## 12. Phase 8 — shared conformance suite

Both consumer implementations must pass the same semantic fixtures:

- valid local signer and external signer documents;
- altered signature/payload/hash/size;
- release/box disagreement;
- altered execution metadata;
- missing script/module/interpreter;
- traversal, absolute paths, links, special/encrypted entries;
- extraction collision and existing destination;
- default/user argument ordering;
- shell-metacharacter preservation without injection;
- stdin/stdout/stderr;
- child non-zero exit;
- signal forwarding;
- temporary cleanup;
- persistent prepared box execution;
- on-demand asset missing/size mismatch/hash mismatch;
- macOS/Linux/Windows entry-point layouts.

Keep a language-neutral expected-result representation so Node and Python compare against the same
receipts/errors rather than merely having similarly named tests.

## 13. Phase 9 — repository-wide migration and docs

Update:

- README and all public guides/references;
- architecture and design decisions;
- examples and example commands;
- CLI help and errors;
- configuration reference;
- package API reference;
- contributor and agent instructions;
- schemas published by VitePress;
- fixture names/content;
- source/test filenames and helper identifiers;
- TypeScript fixtures;
- changelog.

Final terminology guard:

```sh
rg -i recipe .
```

Review every remaining match. The target is no product usage; unavoidable third-party/generated
dependency text must be identified explicitly rather than silently ignored.

## 14. Verification ladder and stop rules

After each material phase:

1. Focused tests, with each new guard proven red once.
2. `npm run types`
3. `npm test`
4. `npm run types:check`
5. `git diff --check`

When docs change:

```sh
cd docs && npm run build
```

Python phase adds:

- Python unit/conformance suite;
- static type checking;
- wheel/sdist build;
- package-content inspection;
- clean install into a temporary environment.

Final local audit:

- Node tests and types;
- Python tests/types/package;
- npm package surface and dry-run pack;
- docs build;
- direct runtime dependency audit;
- terminology grep;
- consumer-boundary grep;
- cross-platform path review.

Stop and ask before:

- a real pixi/conda-pack build or toolchain install;
- npm/PyPI publication;
- tag/release creation;
- site deployment;
- migration or edits in another consumer repository;
- any paid/remote runner.

## 15. Execution checkpoints

Use sequential checkpoints, never parallel writers:

1. **Checkpoint A:** Phase 0 + atomic scroll/v2 contract rename, generated types, focused/full Node
   tests. Do not begin consumer runtime until the contract is stable.
2. **Checkpoint B:** `init` split, `new scroll`, schema autocomplete, authoring tests.
3. **Checkpoint C:** execution-aware builder/verifier and golden v2 fixtures.
4. **Checkpoint D:** Node consumer export and CLI `run`.
5. **Checkpoint E:** Python consumer against frozen conformance fixtures.
6. **Checkpoint F:** full docs, package surfaces, audits, and final handoff.

Commit only task-owned files, use no tool attribution trailers, and push only when the maintainer
requests it in the active session.

## 16. Next-session starting procedure

1. Read `AGENTS.md`, `AGENT-POLICY.md`, and this plan.
2. Run `git status --short --branch` and inspect commits after the baseline.
3. Re-open current schema/type generation and package-surface tests.
4. Create a living checklist for Checkpoint A.
5. Add focused tests that express v2-only rejection and canonical scroll paths/names; observe them
   fail against current code.
6. Implement Phase 0 and Phase 1 atomically.
7. Run generated types, focused tests, full Node suite, docs if touched, and `git diff --check`.
8. Report the checkpoint before moving to authoring/runtime work if any unexpected contract issue
   appears.

