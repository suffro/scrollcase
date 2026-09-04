# Early project memory — archive

> **Historical, and an archive rather than a living file.** Moved out of the retired local memory
> directory on 2026-09-04 when this repository adopted `.context/`. Do not edit it and do not append
> to it; current context belongs in [`../state/current.md`](../state/current.md) and the files
> beside it.
>
> The consuming project's name has been redacted throughout — hard rule 1 keeps it out of this
> repository — and two machine-local toolchain paths were replaced with `$PINNED_PIXI_HOME`.
> Inline-code path references were unwrapped where the path no longer exists, so `syngraphe check`
> can resolve what is left. Nothing else is changed.
>
> **What it is.** The original project-memory file was lost with a deleted clone and had no backup.
> This is a verbatim reconstruction from the coding-transcript record, in chronological order,
> frozen on 2026-08-09. Entries repeat: each is a snapshot of, or an edit to, the same file, and the
> headings between them are transcript metadata in Italian. It is where the release evidence for
> `0.1.0`, the defects the first CI runs found, the payload-digest and consumer-API design sessions,
> and the archive compression measurements are recorded in full.
>
> What is still *true* from it lives in [`extraction-and-origin.md`](extraction-and-origin.md),
> [`mistakes-and-what-they-taught.md`](mistakes-and-what-they-taught.md) and the decision files;
> read those first and come here only for the detail behind them.

---

**Questo non è il file originale.** L'originale (.local-memory/PROJECT-MEMORY.md, ~28,7 KB,
550 righe al 2026-08-03) è andato perso con la cancellazione del clone locale, e non esisteva in
nessun backup: niente Time Machine configurata, e la local history di VS Code non lo copriva perché
il file veniva scritto dall'agente, non dall'editor.

Quello che segue è tutto il materiale verbatim ricostruibile dai transcript delle sessioni Claude
Code in ~/.claude/projects/-Users-lorenzo-Documents-GitHub-scrollcase/: letture integrali,
modifiche (testo prima e dopo), append via heredoc e output di comandi. È in ordine cronologico e
si sovrappone parecchio — le parti tarde del file sono coperte peggio delle prime.

Ricostruito il 2026-08-09.


---

## 2026-07-25 19:04:59 — lettura integrale del file a quella data

````
# Project memory — scrollcase

Local handoff notes. Not committed; not documentation. This is the context a new session needs to
pick the work up without re-deriving it, including the things that went wrong and why.

The public reasoning lives in `docs/concepts/design-decisions.md`, and the rules an agent must follow
live in `CLAUDE.md`. **Read those two first.** This file holds what does not belong in either: where
the work came from, what is still owed, and the mistakes that shaped the current design.

Last updated: 2026-07-25.

---

## 1. Where this came from

scrollcase is an extraction. It was the **Runtime Box builder** inside **a private consuming application**: a
local-first Rust/Tauri desktop application for bioinformatics that installs scientific ML models as
signed, prebuilt Python environments. The builder was ~4,300 lines of Node under
`scripts/runtime-box*.mjs` in the consuming project's monorepo.

**The other half of the story lives at** the consuming project's monorepo, outside this repository, specifically:

- `project-knowledge-base/roadmap/scrollcase-extraction-plan.md` — the canonical extraction plan,
  with an execution record per phase, the evidence, and the inventory of what moved versus what
  stayed. This is the authoritative account of the extraction.
- `project-knowledge-base/current-project-status.md` — the wider status of the consuming project.
- `scripts/runtime-box*.mjs` — the consuming project's own copy of the builder, still in use there.

The extraction ran in phases. **P1** parameterised the paths, **P2** carved out the format contract,
**P3** moved the builder and completed the CLI. **P4** (own repo, packaging, CI, npm) and **P5**
(the consuming project consumes the published package and deletes its in-tree copy) remain.

Commits in the consuming project's monorepo, in order: `9e588e5` (P1), `8596bf3` (P2), `c15050c` (remove every consumer
reference), `66a5fdf` (rewrite the moves/stays inventory), `076539c` (drop the "Runtime Box"
vocabulary, adopt parity tolerances), `bf3a649` (P3 1/3, move the build layer), `1215109` (P3 2/3,
build core and CLI), `229e169` (P3 real-toolchain proof), `7a22fd0` (P3 3/3, complete). In this repo:
`aa99253` added `CLAUDE.md` and the design decisions.

## 2. The maintainer's rules, in his own words

These were stated forcefully during the extraction, after I got them wrong more than once. They are
not preferences; they are the definition of the project.

- *"Scrollcase è un TOOL a parte, indipendente."* It is a spin-off that will be published open
  source, **completely external to the consuming project or any other project**.
- *"[Il progetto consumatore] lo userà per impacchettare i modelli come runtime box, e poi li metterà su R2, ma CI ecc è
  roba sua."* The consuming project is one ordinary user of the tool. Distribution, CI, the model catalog, runner
  allocation and the KMS signer are the consuming project's, not the tool's.
- *"Scrollcase è solo un tool che usa pixi + conda-pack + conda-forge … per impacchettare un dato
  modello per i vari OS e renderlo facilmente trasportabile, lockato, self-contained."*
- *"Qualsiasi cosa dentro scrollcase che contiene riferimenti al progetto consumatore deve essere tolta o cambiata."*
  This includes the artifact's name: "Runtime Box" was the consuming project's product term and is gone.

## 3. Mistakes made during the extraction, and what they taught

Recorded because each was caught late, and the same trap is still open.

**A clean grep only describes the tree at the moment it ran.** The consuming project references were removed once,
verified by grep, and then came back *twice* inside files moved later: `CONSUMER_RUNTIME_BOX_PIXI` and
`CONSUMER_RUNTIME_BOX_CONDA_PACK`, a temp-directory prefix, a hard-coded licence-audit `kind`, and —
worst — the **default workspace paths**, which were literally the consuming project's directory names
(`runtime-boxes/recipes`, `.runtime-box-build`). Re-grep after every move.

**An inventory derived from imports is not an inventory of what belongs.** The original plan listed
`runtime-box-ci.mjs` (812 lines), `evidence.mjs` (601), `heartbeat.mjs`, `validator-context.mjs` and
`node-cli.mjs` as moving into the tool, because things imported them. Reading what they *do* showed
they are the consuming project's CI, and that the build entry point imports none of them. Roughly 2,000 lines of
someone else's infrastructure would have been dragged in. The same reading also found ~390 lines of
R2 and registry distribution *inside* the builder entry point, which stayed behind.

**A module that loads is not a module that works.** Trimming `licenses.mjs` to its conda half dropped
the `CONDA_PACKAGE_FILE` constant its parser uses. Every `audit` threw `ReferenceError` while the
test suite stayed green, because no test called that function end to end. Fixed, and covered.

**`which` is not a search.** I reported that pixi was not installed and that a real build was
therefore impossible. It was installed the whole time, under a dedicated `PIXI_HOME` off `PATH`. The
maintainer pushed back, and the live proof followed within minutes.

**A test fake that guesses a flag writes to the wrong place.** The conda-pack stub read `--output`
where the real invocation uses `-o`, so `indexOf` returned −1 and it wrote its stub tarball to
argument zero — creating a file literally named `-p` that got committed to this repository's root.
Removed; the fake now asserts the path it writes to.

**Two rejected designs, both mine, both wrong for the same reason.** I proposed keeping a generated
mirror of the contract at the consuming project's old paths, and separately proposed adding `scrollcase/**` to
The consuming project's CI path filters. Both would have coupled the tool to its first consumer. Independence beat
convenience in both cases.

## 4. Environment facts

- **pixi 0.73.0 and conda-pack are installed** on the maintainer's Mac at
  `$PINNED_PIXI_HOME/bin/` — a dedicated `PIXI_HOME`, deliberately **not** on `PATH`. Use
  `--pixi` and `--conda-pack`, or `SCROLLCASE_PIXI` / `SCROLLCASE_CONDA_PACK`.
- **The tool has been proven against that real toolchain.** A throwaway project ran `lock` → `keygen`
  → `build` → `verify --self-test`: pixi resolved python 3.11.15 from conda-forge, conda-pack packed
  the prefix, the archive came out at **49,812,054 bytes** (`73e56c2f…`), and verify extracted it and
  imported `json` and `sqlite3` **with the Python inside the box**. That recipe ships as
  `examples/hello-box-macos-arm64-metal`.
- Tests: **51 across 5 files**, no network, no toolchain required — the environment solve is stubbed
  by injecting `run` and `runResult`.

## 5. What is still owed

**P4 — packaging and publication (this repo):**

- `package.json` is `"private": true` and must become `false` to publish, with npm metadata:
  `repository`, `homepage`, `keywords`, `author`.
- No CI yet. It should run `npm test` on macOS, Linux and Windows.
- `README.md` and `CHANGELOG.md` are still scaffolding.
- Publishing to npm is public and irreversible: the maintainer does it, or authorises it explicitly.
- `https://scrollcase.dev` is used as the JSON Schema `$id` namespace and in the config schema. A
  `$id` is an identifier rather than a fetched URL, so nothing breaks, but confirm the domain before
  publishing.

**Deferred deliberately** (was in the original product design, not built): toolchain bootstrap —
`init` downloading a pinned pixi and installing conda-pack — and the `--global` shared toolchain
flag. Doing it responsibly means pinning a release checksum per platform. `doctor` currently names
the missing tool and how to install it.

**P5 — the consuming project adopts the tool (in the consuming project's monorepo, not here):** the consuming project's core package depends on the published
package, the consuming project's `runtime-box*` npm scripts repoint at the CLI, the consuming project declares its namespace
`<consumer>.runtime-box` so its documents stay byte-identical, its KMS signer is plugged in through
`--signer-command`, and `scripts/runtime-box*` is deleted. Geneformer and UCE still have `uv` recipes
and must become pixi recipes to be built by this tool.

**Open housekeeping:** the consuming project's monorepo still contains a full copy of this repo under `scrollcase/`.
It is now a duplicate that will drift — the `-p` fix and these notes exist only here. Removing it
from the consuming project's monorepo is pending the maintainer's go-ahead. The commit messages explaining each
extraction step also live only in the consuming project's monorepo; `git subtree split --prefix=scrollcase` would
import them here if that history is ever wanted.

## 6. Things to be careful with

- The wire format is frozen at `schemaVersion: 1`. The consuming project has boxes published and clients installed
  against it. Changing a `kind`, the payload encoding, or the signature algorithm breaks them.
- Determinism is asserted by a test (`rebuilding the same commit gives a byte-identical archive`).
  Anything that varies per run — a clock, a random salt, an unsorted directory read — breaks it.
- `verify --self-test` only runs on a matching native host, by design: a macOS box cannot be
  self-tested on Linux.
- The build refuses to run outside a git checkout, and refuses a dirty tree without `--allow-dirty`.
  That is deliberate, not an obstacle to route around.
````

---

## 2026-07-25 19:13:04 — modifica — testo sostituito

````
**P4 — packaging and publication (this repo):**

- `package.json` is `"private": true` and must become `false` to publish, with npm metadata:
  `repository`, `homepage`, `keywords`, `author`.
- No CI yet. It should run `npm test` on macOS, Linux and Windows.
- `README.md` and `CHANGELOG.md` are still scaffolding.
- Publishing to npm is public and irreversible: the maintainer does it, or authorises it explicitly.
- `https://scrollcase.dev` is used as the JSON Schema `$id` namespace and in the config schema. A
  `$id` is an identifier rather than a fetched URL, so nothing breaks, but confirm the domain before
  publishing.
````

---

## 2026-07-25 19:13:04 — modifica — testo nuovo

````
**P4 — packaging and publication (this repo): done 2026-07-25, uncommitted, except the
maintainer's two calls.**

- `package.json`: `private` removed, version `0.1.0`, `repository`/`homepage`/`bugs` pointing at
  `github.com/Suffro/scrollcase`, `author`, `keywords`. The npm name `scrollcase` was **free**
  (registry 404) when checked on 2026-07-25.
- CI: `.github/workflows/ci.yml`, `npm test` on ubuntu/macos/windows × node 20/22. Written but
  unproven until a push — the Windows and Linux runs are the point, since the suite has only ever
  run on the maintainer's Mac.
- `README.md`, `CHANGELOG.md` (`0.1.0 — Unreleased`), `CONTRIBUTING.md` written. The README links
  only content that actually exists (`docs/concepts/design-decisions.md`, `examples/`) and does
  **not** link scrollcase.dev.
- The publication re-grep caught more smuggled origin references, in *comments*: the `pixi.mjs`
  header cited `runtime-box.mjs`, `python.mjs`, the `project-knowledge-base` spike doc, Phase 0/2
  vocabulary and "the Rust install flow"; `licenses.mjs` cited "the uv audit"; `contract/index.mjs`
  said "the Rust and TypeScript clients"; the schema tests used `acme.runtime-box` (now
  `acme.model-pack`). Two `pixi.mjs` docstrings claimed the embedded conda-unpack *is run* — the
  code deliberately deletes it; both rewritten to match reality. All cleaned; tests still 51/51.
- **Left alone on purpose:** `launcherKind: 'uv-windows-pe'` in `src/contract/targets.mjs` is a
  frozen wire string under `schemaVersion: 1`, not a stale comment. Do not "clean" it.
- **Still the maintainer's:** confirm the `scrollcase.dev` domain (schema `$id`s only — nothing is
  fetched), push to run CI for real, and `npm publish` (public and irreversible; explicitly his).
- The VitePress site under `docs/` is still lorem-ipsum scaffolding everywhere except
  `concepts/design-decisions.md` — `index.md`, `getting-started/`, `guides/`, `reference/` and
  `concepts/architecture.md` are placeholders. Not part of P4; owed before the docs site is worth
  deploying.
````

---

## 2026-07-25 19:21:15 — modifica — testo sostituito

````
- **Left alone on purpose:** `launcherKind: 'uv-windows-pe'` in `src/contract/targets.mjs` is a
  frozen wire string under `schemaVersion: 1`, not a stale comment. Do not "clean" it.
````

---

## 2026-07-25 19:21:15 — modifica — testo nuovo

````
- A second, full read of every source file (not just grep) found and fixed the last stragglers:
  `sign/keys.mjs` cited a nonexistent `external.mjs`; `archive.mjs` said "runner-provided tools"
  (CI-runner vocabulary); `targets.mjs` mentioned "future catalog validation"; a third stale
  conda-unpack claim hid in the `dereferenceSymlinksInPlace` docstring. Module headers were added
  to the files that lacked them (`filesystem`, `identity`, `process`, `archive`) and docstrings to
  `buildBox`/`verifyBox`, matching the existing comment voice. `minHostAppVersion` /
  `maxHostAppVersionExclusive` are frozen wire fields — "host app" is generic; leave them.
- **Left alone on purpose:** `launcherKind: 'uv-windows-pe'` in `src/contract/targets.mjs` is a
  frozen wire string under `schemaVersion: 1`, not a stale comment. Do not "clean" it.
````

---

## 2026-07-26 13:32:13 — lettura integrale del file a quella data

````
by injecting `run` and `runResult`.

## 5. What is still owed

**P4 — packaging and publication (this repo): done 2026-07-25, uncommitted, except the
maintainer's two calls.**

- `package.json`: `private` removed, version `0.1.0`, `repository`/`homepage`/`bugs` pointing at
  `github.com/Suffro/scrollcase`, `author`, `keywords`. The npm name `scrollcase` was **free**
  (registry 404) when checked on 2026-07-25.
- CI: `.github/workflows/ci.yml`, `npm test` on ubuntu/macos/windows × node 20/22. Written but
  unproven until a push — the Windows and Linux runs are the point, since the suite has only ever
  run on the maintainer's Mac.
- `README.md`, `CHANGELOG.md` (`0.1.0 — Unreleased`), `CONTRIBUTING.md` written. The README links
  only content that actually exists (`docs/concepts/design-decisions.md`, `examples/`) and does
  **not** link scrollcase.dev.
- The publication re-grep caught more smuggled origin references, in *comments*: the `pixi.mjs`
  header cited `runtime-box.mjs`, `python.mjs`, the `project-knowledge-base` spike doc, Phase 0/2
  vocabulary and "the Rust install flow"; `licenses.mjs` cited "the uv audit"; `contract/index.mjs`
  said "the Rust and TypeScript clients"; the schema tests used `acme.runtime-box` (now
  `acme.model-pack`). Two `pixi.mjs` docstrings claimed the embedded conda-unpack *is run* — the
  code deliberately deletes it; both rewritten to match reality. All cleaned; tests still 51/51.
- A second, full read of every source file (not just grep) found and fixed the last stragglers:
  `sign/keys.mjs` cited a nonexistent `external.mjs`; `archive.mjs` said "runner-provided tools"
  (CI-runner vocabulary); `targets.mjs` mentioned "future catalog validation"; a third stale
  conda-unpack claim hid in the `dereferenceSymlinksInPlace` docstring. Module headers were added
  to the files that lacked them (`filesystem`, `identity`, `process`, `archive`) and docstrings to
  `buildBox`/`verifyBox`, matching the existing comment voice. `minHostAppVersion` /
  `maxHostAppVersionExclusive` are frozen wire fields — "host app" is generic; leave them.
- **Left alone on purpose:** `launcherKind: 'uv-windows-pe'` in `src/contract/targets.mjs` is a
  frozen wire string under `schemaVersion: 1`, not a stale comment. Do not "clean" it.
- **Still the maintainer's:** confirm the `scrollcase.dev` domain (schema `$id`s only — nothing is
  fetched), push to run CI for real, and `npm publish` (public and irreversible; explicitly his).
- The VitePress site under `docs/` is still lorem-ipsum scaffolding everywhere except
  `concepts/design-decisions.md` — `index.md`, `getting-started/`, `guides/`, `reference/` and
  `concepts/architecture.md` are placeholders. Not part of P4; owed before the docs site is worth
  deploying.

**Deferred deliberately** (was in the original product design, not built): toolchain bootstrap —
`init` downloading a pinned pixi and installing conda-pack — and the `--global` shared toolchain
flag. Doing it responsibly means pinning a release checksum per platform. `doctor` currently names
the missing tool and how to install it.

**P5 — the consuming project adopts the tool (in the consuming project's monorepo, not here):** the consuming project's core package depends on the published
package, the consuming project's `runtime-box*` npm scripts repoint at the CLI, the consuming project declares its namespace
`<consumer>.runtime-box` so its documents stay byte-identical, its KMS signer is plugged in through
`--signer-command`, and `scripts/runtime-box*` is deleted. Geneformer and UCE still have `uv` recipes
and must become pixi recipes to be built by this tool.

**Open housekeeping:** the consuming project's monorepo still contains a full copy of this repo under `scrollcase/`.
It is now a duplicate that will drift — the `-p` fix and these notes exist only here. Removing it
from the consuming project's monorepo is pending the maintainer's go-ahead. The commit messages explaining each
extraction step also live only in the consuming project's monorepo; `git subtree split --prefix=scrollcase` would
import them here if that history is ever wanted.

## 6. Things to be careful with

- The wire format is frozen at `schemaVersion: 1`. The consuming project has boxes published and clients installed
  against it. Changing a `kind`, the payload encoding, or the signature algorithm breaks them.
- Determinism is asserted by a test (`rebuilding the same commit gives a byte-identical archive`).
````

---

## 2026-07-26 13:32:38 — modifica — testo sostituito

````
- The VitePress site under `docs/` is still lorem-ipsum scaffolding everywhere except
  `concepts/design-decisions.md` — `index.md`, `getting-started/`, `guides/`, `reference/` and
  `concepts/architecture.md` are placeholders. Not part of P4; owed before the docs site is worth
  deploying.

**Deferred deliberately** (was in the original product design, not built): toolchain bootstrap —
`init` downloading a pinned pixi and installing conda-pack — and the `--global` shared toolchain
flag. Doing it responsibly means pinning a release checksum per platform. `doctor` currently names
the missing tool and how to install it.
````

---

## 2026-07-26 13:32:38 — modifica — testo nuovo

````
- **The docs site is written (2026-07-26).** 14 pages under `docs/`, no placeholders left:
  `getting-started/{installation,quickstart}`, `guides/{managing-weights,packaging-cuda,`
  `accelerator-parity,signing-and-custody,offline-airgap,distributing-boxes}`,
  `reference/{cli,configuration,recipe,box-format,api}`, `concepts/{architecture,why-pixi,`
  `design-decisions}`. `index.md` renders the pre-existing `HomePage.vue`, which had been written
  but never wired in. Mermaid diagrams render through `vitepress-mermaid-renderer` (installed in
  `docs/`, hooked into the theme's `Layout()`); its media query was proven live, not just compiled.
  `npm run build` in `docs/` is the check — VitePress fails the build on a dead link.

**Toolchain bootstrap: built 2026-07-26** (it was the deferred item; the maintainer asked for it
after noticing the docs did not mention it — because it did not exist).

- `init` *offers* to install pixi and conda-pack; it never installs silently. `--install-toolchain`
  / `--no-install-toolchain` answer up front, and with no TTY the answer is no. The consent is the
  design: `init` stays a command that is always safe to re-run.
- The download is verified. The GitHub release archive's SHA-256 is checked against the `.sha256`
  pixi publishes beside it (asset names verified against the real release feed, all six hosts), and
  the verified digest is written to `scrollcase.config.json` under `toolchain`, so later installs
  check against the committed value. That pinning is what made the item shippable at all.
- Both tools land in `<workspace>/.scrollcase/toolchain`; nothing touches PATH. Tool discovery is
  now flag > env > project toolchain > PATH (`toolCandidate` in `pixi.mjs`), which is why nothing
  has to be exported afterwards. `findPixi`/`findCondaPack` are built on new `probePixi`/
  `probeCondaPack`, since `init` needs "is there a pixi at all?" rather than "is the pinned one here?".
- **Proven for real, not just stubbed:** in a throwaway project it downloaded pixi 0.73.0
  (`63e7cc91…`), installed conda-pack 0.9.2, and `doctor` then found both with `SCROLLCASE_PIXI` /
  `SCROLLCASE_CONDA_PACK` unset. 11 unit tests cover it with `fetch` injected, including the
  checksum-mismatch refusal.
- Still not built: the `--global` shared toolchain location.

**Types and the package surface: built 2026-07-26.**

- `src/contract/types/index.d.ts` is **generated from the JSON Schemas** by
  `scripts/generate-contract-types.mjs` (`npm run types`, `json-schema-to-typescript`), committed,
  and exported as `scrollcase/contract/types` (types-only subpath, no runtime target). A test
  regenerates and compares, so a schema edit without a regeneration fails the suite. The generator
  overwrites each schema's `title` with the name from its own table — dropping the title makes the
  generator fall back to naming types after the `$id` URL.
- Typed JSDoc across the exported surface, using those generated types as its vocabulary. Verified
  with `tsc --checkJs` run out-of-tree: every referenced type resolves. Remaining `--checkJs`
  complaints are the code's own dynamic access on values honestly typed `unknown` (a signed
  payload's shape is not known until its `kind` is checked) — not defects in the annotations.
- `tests/unit/package-surface.test.mjs` imports each entry point **by package name through the
  exports map** (Node self-reference), not by relative path, and checks every advertised subpath
  resolves inside `files`. Proven to bite: pointing one export at a missing file fails two tests.
- The maintainer explicitly declined `.d.ts` generated from JSDoc via `tsc` (option 2 of three): no
  build step, the CLI stays pure source.
````

---

## 2026-07-26 13:32:52 — modifica — testo sostituito

````
**Open housekeeping:** the consuming project's monorepo still contains a full copy of this repo under `scrollcase/`.
````

---

## 2026-07-26 13:32:52 — modifica — testo nuovo

````
**Git history was rewritten on 2026-07-26, and one thing is unfinished.** The maintainer wants no
AI or editor artefacts in the repo: `.gitignore` now covers `CLAUDE.md`, `AGENTS.md`, `.claude`,
`.codex` and `PROJECT-MEMORY.md`, and none of them are tracked (`.claude/settings.local.json`,
`PROJECT-MEMORY.md` and `AGENTS.md` never entered git at all). `CLAUDE.md` had been committed, so
`git filter-branch` stripped it from every commit and `main` was force-pushed; the commit that
added it is now `4e15126` instead of `aa99253`, and the "Cleaning" commit vanished because it only
deleted that file. **But GitHub still serves the pre-rewrite objects by SHA** — `CLAUDE.md` was
still fetchable at `aa992539…` (6,758 bytes) after the push, verified via the API. Closing that
needs either a GitHub Support request to garbage-collect, or deleting and re-creating the repo
(cheap here: 0 forks, 1 star). Until then the goal is not fully met. `CLAUDE.md` is still on disk
locally and is still the operating rulebook — it left git, not the working tree.

**Commits carry no `Co-Authored-By: Claude` trailer**, deliberately: adding an AI signature to the
history while scrubbing AI traces from it would be self-defeating. Keep omitting it unless the
maintainer says otherwise.

**The name-casing pass (`c68273a`) broke three functional strings**, all fixed: `init` printed
`Scrollcase lock <id>` as the next command to run and usage read `Usage: Scrollcase` — neither
exists on a case-sensitive filesystem — and `GITIGNORE_MARKER` became `# Scrollcase build state`,
which would have made an already-scaffolded project append its ignore rules a second time. Prose in
docstrings is legitimately capitalised; commands, `scrollcase.config.json`, `scrollcase.box` and the
npm name are not. The wire constants survived, which is the part that would have broken compatibility.

**Open housekeeping:** the consuming project's monorepo still contains a full copy of this repo under `scrollcase/`.
````

---

## 2026-07-26 13:33:07 — modifica — testo sostituito

````
`aa99253` added `CLAUDE.md` and the design decisions.
````

---

## 2026-07-26 13:33:07 — modifica — testo nuovo

````
`aa99253` added `CLAUDE.md` and the design decisions — that commit is now `4e15126` and carries only
the design decisions, after the history rewrite described in section 5.
````

---

## 2026-07-31 21:06:27 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
grep -n "^# \|^## " .local-memory/PROJECT-MEMORY.md | head -30; echo "=== ultime righe"; tail -12 .local-memory/PROJECT-MEMORY.md
````

---

## 2026-07-31 21:06:27 — output di: grep -n "^# \|^## " .local-memory/PROJECT-MEMORY.md | head -30; echo "=== ultime righe"; tail -12 .local-memory/PROJECT-

````
1:# Project memory — scrollcase
15:## 1. Where this came from
42:## 2. The maintainer's rules, in his own words
57:## 3. Mistakes made during the extraction, and what they taught
92:## 4. Environment facts
109:## 5. What is still owed
220:## 6. Things to be careful with
=== ultime righe
## 6. Things to be careful with

- The wire format is frozen at `schemaVersion: 1`. The consuming project has boxes published and clients installed
  against it. Changing a `kind`, the payload encoding, or the signature algorithm breaks them.
- Determinism is asserted by a test (`rebuilding the same commit gives a byte-identical archive`).
  Anything that varies per run — a clock, a random salt, an unsorted directory read — breaks it.
- `verify --self-test` only runs on a matching native host, by design: a macOS box cannot be
  self-tested on Linux.
- The build refuses to run outside a git checkout, and refuses a dirty tree without `--allow-dirty`.
  That is deliberate, not an obstacle to route around.
- `scrollcase@0.1.0` is already public and cannot be replaced. Any subsequent npm publication needs
  a new version and changelog entry; `npm publish` remains a maintainer-only irreversible action.
````

---

## 2026-07-31 21:06:34 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
sed -n '92,112p' .local-memory/PROJECT-MEMORY.md
````

---

## 2026-07-31 21:06:34 — output di: sed -n '92,112p' .local-memory/PROJECT-MEMORY.md

````
## 4. Environment facts

- **pixi 0.73.0 and conda-pack are installed** on the maintainer's Mac at
  `$PINNED_PIXI_HOME/bin/` — a dedicated `PIXI_HOME`, deliberately **not** on `PATH`. Use
  `--pixi` and `--conda-pack`, or `SCROLLCASE_PIXI` / `SCROLLCASE_CONDA_PACK`.
- **The tool has been proven against that real toolchain.** A clean throwaway git project ran
  `lock` → `keygen` → `build` → `verify --self-test`: pixi resolved Python 3.11.15 from
  conda-forge, conda-pack packed the prefix, and verify imported `json` and `sqlite3` **with the
  Python inside the box**. The archive was
  `hello-box-1.0.0-macos-aarch64-metal.zip`, **49,811,879 bytes**, SHA-256
  `17c0e0a771f8244acbee2e0e0698c30dd00fa131c6f38332869d28d7673721dc`. Provenance recorded clean
  fixture commit `d48b68eb6b75f73548e7ad2620d7bb6156e24f40`.
- Tests: **84 across 10 files**, no network and no toolchain required — environment solving is
  stubbed by injecting `run` and `runResult`, and toolchain downloads by injecting `fetch`.
- Final CI run `30209373381` passed all 11 jobs: Node 20, 22 and 24 across Linux, macOS and Windows,
  plus package-surface/audit and documentation gates.

## 5. What is still owed

**P4 — standalone repository, packaging, CI, documentation and npm publication: complete
2026-07-26.**
````

---

## 2026-07-31 21:07:09 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
cat >> .local-memory/PROJECT-MEMORY.md <<'EOF'

---

## 7. Session of 2026-07-31

**Sections 1–6 above predate this session and have gone stale in three places.** The wire format is
no longer "frozen at `schemaVersion: 1`" — the repository is v2-only and the v2 verifier rejects v1
documents. The test count is 270 across 25 files, not 84 across 10. The toolchain now also installs
into the project's own `.scrollcase/toolchain/`, found without any flag.

### What prompted the work

The question asked was how to stop Scrollcase being a cathedral in the desert. The measurable
answer was that it declared three targets and had a runnable example for one, and that its CI ran
only a suite whose environment solve is stubbed — so nothing in the tree had ever proven that a
Linux or Windows box could be solved, packed, relocated and started.

### Done

- `hello-box` now exists for all three targets, each with a solved lock, a lock-derived licence
  inventory, and a `python-script` entry point so `run` is exercised by the shipped example.
- `.github/workflows/example-build.yml` builds each target on its own runner, self-tests it, runs
  it, rebuilds it to prove byte-identity, and prints what the box costs. Separate from `ci.yml`
  because GitHub applies `paths` filters per workflow, not per job.
- `.github/workflows/demo-box.yml` publishes a signed demo box to the `demo-box-v1` release, so a
  newcomer needs no toolchain. CI signs because it must build: conda-pack packs the host's own
  environment, so a Linux box cannot come from the maintainer's Mac. The demo key's private half is
  the repository secret `SCROLLCASE_DEMO_SIGNING_KEY`; its public half is committed at
  `examples/keys/example-signing-public.json`. **That key signs nothing but the example.**
- Payload symbolic links (`src/contract/links.mjs`, mirrored in Python `_contract.py`). Linux went
  from 191 MB to 90 MB archived and 483 MB to 228 MB extracted; macOS from 48 to 36 and 126 to 94;
  Windows unchanged by design.
- `scrollcase-consumer` 0.2.0 is on PyPI. It had to move with the CLI: 0.1.0 rejects every box that
  carries a link.

### Three defects the CI found on its first runs, all invisible from a Mac

1. `init --install-toolchain` died with `EXDEV` on Windows: the download is staged in the OS temp
   directory and moved with `rename`, which cannot cross a volume, and `TEMP` sits on `C:` while a
   checkout commonly does not. Fixed with a copy fallback.
2. `init` asked the GitHub releases API for the newest pixi and got 403 on a runner. Worked around
   by pinning the version; the unauthenticated dependency itself remains.
3. Git's line-ending conversion broke a `localFiles` hash on a clean Windows checkout. Fixed with
   `.gitattributes` and documented in `docs/reference/scroll.md`, because it affects any project
   declaring its own `localFiles`.

### Environment facts learned here

- **Testing the Python consumer needs an isolated venv.** The machine's Python 3.14 is PEP 668
  externally-managed, and `python3 -m unittest` from `python/` imports whatever is already in
  `~/Library/Python/3.14/lib/python/site-packages` — which silently ran a stale copy through two
  rounds of debugging. Always confirm with
  `python -c "import scrollcase_consumer; print(scrollcase_consumer.__file__)"`.
- **There is no Linux available locally**, and no Docker, Colima, Podman or Lima. Linux is reached
  only through CI; `gh workflow run example-build.yml --ref <branch>` builds a branch without
  touching main.
- **Version tags were never pushed.** Every tag from `v0.1.3` to `v0.5.0` existed only on the
  maintainer's laptop until backfilled; `npm version` tags locally and `git push origin main` does
  not carry tags. Now written into `CONTRIBUTING.md`.
- **conda-forge is submitted, not merged.** `conda-forge/staged-recipes` PR #34350, opened
  2026-07-29, all checks green, waiting in the review queue. A missing feedstock proves it has not
  been merged, not that it was never sent — an inference made wrongly here.
EOF
wc -l .local-memory/PROJECT-MEMORY.md && echo "sezione 7 aggiunta"
````

---

## 2026-07-31 21:07:10 — output di: cat >> .local-memory/PROJECT-MEMORY.md <<'EOF'

---

## 7. Session of 2026-07-31

**Sections 1–6 above predate this sess

````
293 .local-memory/PROJECT-MEMORY.md
sezione 7 aggiunta
````

---

## 2026-07-31 21:07:24 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
sed -n '42,92p' .local-memory/PROJECT-MEMORY.md
````

---

## 2026-07-31 21:07:24 — output di: sed -n '42,92p' .local-memory/PROJECT-MEMORY.md

````
## 2. The maintainer's rules, in his own words

These were stated forcefully during the extraction, after I got them wrong more than once. They are
not preferences; they are the definition of the project.

- *"Scrollcase è un TOOL a parte, indipendente."* It is a spin-off that will be published open
  source, **completely external to the consuming project or any other project**.
- *"[Il progetto consumatore] lo userà per impacchettare i modelli come runtime box, e poi li metterà su R2, ma CI ecc è
  roba sua."* The consuming project is one ordinary user of the tool. Distribution, CI, the model catalog, runner
  allocation and the KMS signer are the consuming project's, not the tool's.
- *"Scrollcase è solo un tool che usa pixi + conda-pack + conda-forge … per impacchettare un dato
  modello per i vari OS e renderlo facilmente trasportabile, lockato, self-contained."*
- *"Qualsiasi cosa dentro scrollcase che contiene riferimenti al progetto consumatore deve essere tolta o cambiata."*
  This includes the artifact's name: "Runtime Box" was the consuming project's product term and is gone.

## 3. Mistakes made during the extraction, and what they taught

Recorded because each was caught late, and the same trap is still open.

**A clean grep only describes the tree at the moment it ran.** The consuming project references were removed once,
verified by grep, and then came back *twice* inside files moved later: `CONSUMER_RUNTIME_BOX_PIXI` and
`CONSUMER_RUNTIME_BOX_CONDA_PACK`, a temp-directory prefix, a hard-coded licence-audit `kind`, and —
worst — the **default workspace paths**, which were literally the consuming project's directory names
(`runtime-boxes/recipes`, `.runtime-box-build`). Re-grep after every move.

**An inventory derived from imports is not an inventory of what belongs.** The original plan listed
`runtime-box-ci.mjs` (812 lines), `evidence.mjs` (601), `heartbeat.mjs`, `validator-context.mjs` and
`node-cli.mjs` as moving into the tool, because things imported them. Reading what they *do* showed
they are the consuming project's CI, and that the build entry point imports none of them. Roughly 2,000 lines of
someone else's infrastructure would have been dragged in. The same reading also found ~390 lines of
R2 and registry distribution *inside* the builder entry point, which stayed behind.

**A module that loads is not a module that works.** Trimming `licenses.mjs` to its conda half dropped
the `CONDA_PACKAGE_FILE` constant its parser uses. Every `audit` threw `ReferenceError` while the
test suite stayed green, because no test called that function end to end. Fixed, and covered.

**`which` is not a search.** I reported that pixi was not installed and that a real build was
therefore impossible. It was installed the whole time, under a dedicated `PIXI_HOME` off `PATH`. The
maintainer pushed back, and the live proof followed within minutes.

**A test fake that guesses a flag writes to the wrong place.** The conda-pack stub read `--output`
where the real invocation uses `-o`, so `indexOf` returned −1 and it wrote its stub tarball to
argument zero — creating a file literally named `-p` that got committed to this repository's root.
Removed; the fake now asserts the path it writes to.

**Two rejected designs, both mine, both wrong for the same reason.** I proposed keeping a generated
mirror of the contract at the consuming project's old paths, and separately proposed adding `scrollcase/**` to
The consuming project's CI path filters. Both would have coupled the tool to its first consumer. Independence beat
convenience in both cases.

## 4. Environment facts
````

---

## 2026-07-31 21:07:34 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
ls -la $PINNED_PIXI_HOME/bin/ 2>&1 | head -6; echo "=== e sezione 5, cosa era 'ancora dovuto'"; sed -n '109,135p' .local-memory/PROJECT-MEMORY.md
````

---

## 2026-07-31 21:08:32 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
cat >> .local-memory/PROJECT-MEMORY.md <<'EOF'

### Mistakes repeated here, from section 3

**This file was not read during this session at all**, and two of its recorded lessons were repeated.

*"`which` is not a search"* — again. `command -v pixi conda-pack` returned nothing, conda-pack was
reported missing to the maintainer, and a second copy was downloaded into `.scrollcase/toolchain/`.
The real one had been at `$PINNED_PIXI_HOME/bin/conda-pack` since 25 July, which is exactly what
section 3 records. The same trap, the same tool, the same machine.

*The absence of evidence read as evidence of absence* — a variant of the same habit. No
`conda-forge/scrollcase-consumer-feedstock` and no package on anaconda.org were taken to mean the
recipe had never been submitted. It had: `conda-forge/staged-recipes` PR #34350, opened 2026-07-29,
green and waiting in the review queue. A missing feedstock means unmerged, not unsent.

The lesson worth adding: **checking a path costs one command; asserting from its absence costs the
maintainer's trust.** Look in the two known toolchain locations before reporting anything missing,
and query the actual source before reporting anything unstarted.
EOF
echo "aggiunto"; grep -c "" .local-memory/PROJECT-MEMORY.md
````

---

## 2026-07-31 21:08:32 — output di: cat >> .local-memory/PROJECT-MEMORY.md <<'EOF'

### Mistakes repeated here, from section 3

**This file was not read dur

````
aggiunto
311
````

---

## 2026-07-31 21:49:18 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
echo "=== existing plan head ==="; sed -n '1,30p' .local-memory/scroll-v2-consumer-execution-plan.md; echo; echo "=== PROJECT-MEMORY references to plans ==="; grep -n 'plan.md\|\.local-memory' .local-memory/PROJECT-MEMORY.md | head -20
````

---

## 2026-08-03 01:50:49 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
head -40 .local-memory/PROJECT-MEMORY.md; echo "=== wc ==="; wc -l .local-memory/PROJECT-MEMORY.md
````

---

## 2026-08-03 01:50:49 — output di: head -40 .local-memory/PROJECT-MEMORY.md; echo "=== wc ==="; wc -l .local-memory/PROJECT-MEMORY.md

````
# Project memory — scrollcase

Local handoff notes. Not committed; not documentation. This is the context a new session needs to
pick the work up without re-deriving it, including the things that went wrong and why.

The public reasoning lives in `docs/concepts/design-decisions.md`, the operational rules live in
`AGENTS.md`, and the execution policy lives in `AGENT-POLICY.md`. **Read those first.** This file
holds what does not belong there: where the work came from, what is still owed, and the mistakes
that shaped the current design.

Last updated: 2026-07-26.

---

## 1. Where this came from

scrollcase is an extraction. It was the **Runtime Box builder** inside **a private consuming application**: a
local-first Rust/Tauri desktop application for bioinformatics that installs scientific ML models as
signed, prebuilt Python environments. The builder was ~4,300 lines of Node under
`scripts/runtime-box*.mjs` in the consuming project's monorepo.

**The other half of the story lives at** the consuming project's monorepo, outside this repository, specifically:

- `project-knowledge-base/roadmap/scrollcase-extraction-plan.md` — the canonical extraction plan,
  with an execution record per phase, the evidence, and the inventory of what moved versus what
  stayed. This is the authoritative account of the extraction.
- `project-knowledge-base/current-project-status.md` — the wider status of the consuming project.
- `scripts/runtime-box*.mjs` — the consuming project's own copy of the builder, still in use there.

The extraction ran in phases. **P1** parameterised the paths, **P2** carved out the format contract,
**P3** moved the builder and completed the CLI, and **P4** established the standalone repository,
packaging, CI, documentation and npm release. Scrollcase `0.1.0` was published on 2026-07-26.
**P5** (the consuming project consumes the published package and deletes its in-tree copy) remains.

Commits in the consuming project's monorepo, in order: `9e588e5` (P1), `8596bf3` (P2), `c15050c` (remove every consumer
reference), `66a5fdf` (rewrite the moves/stays inventory), `076539c` (drop the "Runtime Box"
vocabulary, adopt parity tolerances), `bf3a649` (P3 1/3, move the build layer), `1215109` (P3 2/3,
build core and CLI), `229e169` (P3 real-toolchain proof), `7a22fd0` (P3 3/3, complete). In this repo:
`aa99253` added `CLAUDE.md` and the design decisions — that commit is now `4e15126` and carries only
the design decisions, after the history rewrite described in section 5.
=== wc ===
     311 .local-memory/PROJECT-MEMORY.md
````

---

## 2026-08-03 01:50:52 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
grep -n "^## \|^### " .local-memory/PROJECT-MEMORY.md
````

---

## 2026-08-03 01:50:52 — output di: grep -n "^## \|^### " .local-memory/PROJECT-MEMORY.md

````
15:## 1. Where this came from
42:## 2. The maintainer's rules, in his own words
57:## 3. Mistakes made during the extraction, and what they taught
92:## 4. Environment facts
109:## 5. What is still owed
220:## 6. Things to be careful with
235:## 7. Session of 2026-07-31
242:### What prompted the work
249:### Done
267:### Three defects the CI found on its first runs, all invisible from a Mac
278:### Environment facts learned here
295:### Mistakes repeated here, from section 3
````

---

## 2026-08-03 01:50:55 — lettura integrale del file a quella data

````
## 5. What is still owed

**P4 — standalone repository, packaging, CI, documentation and npm publication: complete
2026-07-26.**

- `scrollcase@0.1.0` is public on npm. It was published at `2026-07-26T16:15:08.771Z`.
- Registry artefact:
  - tarball `https://registry.npmjs.org/scrollcase/-/scrollcase-0.1.0.tgz`;
  - SHA-1 `e6e0f4f44e6f2f9220a9b234f692d312f100fc2f`;
  - integrity
    `sha512-E0JXxUmgP7uD4dWTKBKQ5+R2w7KnvKrRvdJSb66D5p1LfNk1aj+lpqAaPEcD6q6rftjpEEJ17qjZFeW6fHsxQg==`.
- The public package is unscoped `scrollcase`; its executable is `scrollcase`. Public imports are
  `scrollcase/contract`, `scrollcase/contract/types`, schema and fixture wildcard exports,
  `scrollcase/build` and `scrollcase/sign`.
- Runtime dependencies are exactly `tar@7.5.22`, `yauzl@3.2.1` and `yazl@3.3.1`.
- The exact final `npm publish --dry-run` passed with 44 files, 66.8 kB packed and 228.1 kB
  unpacked. Its SHA-1 matches the registry artefact. A fresh consumer installed the packed
  tarball, imported all public modules and ran the CLI successfully.
- Root `npm audit --omit=dev` and the docs dependency audit both report 0 vulnerabilities.
- `main`, `origin/main` and `origin/HEAD` pointed to release head
  `a0f48de3b3bcad160ca5e7a4bac963e8e64bb4ac` at the final check. CI run `30209373381` passed all
  11 jobs.
- CI covers Node 20, 22 and 24 on Linux, macOS and Windows, plus package-surface/audit and docs
  gates. The last Windows-only failure was CRLF/LF drift in generated types; its exact log was
  retrieved, the guard was proven red and green, and generation is now platform-independent.
- Release-closing commits: `b5f44de` (prepare `0.1.0`), `cbdac49` (homepage tagline), `433b837`
  (documentation metadata), `e0d098d` (canonical repository URL) and `a0f48de`
  (cross-platform generated-type normalization).
- The docs site uses clean URLs, sitemap generation, local search, Mermaid and MathJax.
  `https://scrollcase.dev` is live, and the canonical repository URL is
  `https://github.com/suffro/scrollcase`.
- The logo and parity-pass banner are public README/docs assets. The maintainer's README and docs
  edits were included in the pushed release history.
- Publication was performed by the maintainer. No agent ran `npm publish`.
- The publication re-grep and full source read removed all consumer-specific origin references.
  `minHostAppVersion` / `maxHostAppVersionExclusive` remain generic frozen fields.
- **Left alone on purpose:** `launcherKind: 'uv-windows-pe'` in `src/contract/targets.mjs` is a
  frozen wire string under `schemaVersion: 1`, not a stale comment. Do not "clean" it.

**Toolchain bootstrap: built 2026-07-26** (it was the deferred item; the maintainer asked for it
````

---

## 2026-08-03 01:51:04 — lettura integrale del file a quella data

````
### Mistakes repeated here, from section 3

**This file was not read during this session at all**, and two of its recorded lessons were repeated.

*"`which` is not a search"* — again. `command -v pixi conda-pack` returned nothing, conda-pack was
reported missing to the maintainer, and a second copy was downloaded into `.scrollcase/toolchain/`.
The real one had been at `$PINNED_PIXI_HOME/bin/conda-pack` since 25 July, which is exactly what
section 3 records. The same trap, the same tool, the same machine.

*The absence of evidence read as evidence of absence* — a variant of the same habit. No
`conda-forge/scrollcase-consumer-feedstock` and no package on anaconda.org were taken to mean the
recipe had never been submitted. It had: `conda-forge/staged-recipes` PR #34350, opened 2026-07-29,
green and waiting in the review queue. A missing feedstock means unmerged, not unsent.

The lesson worth adding: **checking a path costs one command; asserting from its absence costs the
maintainer's trust.** Look in the two known toolchain locations before reporting anything missing,
and query the actual source before reporting anything unstarted.
````

---

## 2026-08-03 01:51:30 — modifica — testo sostituito

````
The lesson worth adding: **checking a path costs one command; asserting from its absence costs the
maintainer's trust.** Look in the two known toolchain locations before reporting anything missing,
and query the actual source before reporting anything unstarted.
````

---

## 2026-08-03 01:51:30 — modifica — testo nuovo

````
The lesson worth adding: **checking a path costs one command; asserting from its absence costs the
maintainer's trust.** Look in the two known toolchain locations before reporting anything missing,
and query the actual source before reporting anything unstarted.

---

## 8. Session of 2026-08-03 — consumer API review

No code changed. The maintainer raised three doubts about `verifyAndExtractBox` /
`runExtractedBox`; the review below is the outcome.

### Open defect: an installed box cannot be run after a process restart

Doubts 1 and 2 are one gap, and it is real. `verifyAndExtractBox` refuses an existing destination
(`src/consumer/verify-and-extract.mjs:107`) and the authority to execute lives in a `WeakMap`
(same file, line 61; in Python, `eq=False` plus private state). So a second process has no way to
reach an already-extracted install: the only options are re-extracting elsewhere or `runBox` into a
temporary directory, i.e. rewriting gigabytes at every launch. This is inside the stated scope
("prepare and execute a caller-supplied local box"), not distribution policy.

**The process binding itself is correct and stays.** A serialisable receipt would be a forgeable
execution capability — whoever can write the file skips the trust chain, which is exactly what the
`WeakMap` prevents. The answer is to *re-verify*, not to deserialise: a new
`verifyExtractedBox(releaseDocumentPath, { publicPath, root })` returning a fresh `PreparedBox`.
The split is clean: the document half of `inspectBoxArchive` (`src/build/verify.mjs:78-101`) is
already independent of the archive half (106-111).

**The blocking design question:** the signed release carries no digest of the *extracted* tree —
only `archive.sha256` and `installedSizeBytes`, which the schema itself describes as a free-space
figure. A reattach can therefore prove signature, shape, target, entry point, execution files and
on-demand asset hashes, but not the bytes of `venv/`. Options weighed: (a) keep the archive beside
the install and re-hash it at attach — full guarantee, costs a duplicate of gigabytes, good as an
opt-in strict mode only; (b) add a signed digest over the extracted tree to the release, additive
so existing v2 boxes keep verifying while reattach requires it — the recommendation; (c) shape-only
attach, rejected as the sole path under hard rule 7.

Also noted: rollback, current-version pointers and directory layout belong to the consuming app;
the in-scope piece for anti-replay is a *verify-only* helper for channel/revocations documents
(today the consumer surface exposes none — those documents are produced by `build` and never read
back), leaving the decision of what to run with the app.

### Rust consumer: deferred on purpose

The maintainer's call on 2026-08-03: **worth doing later, waits for now.** Reasons recorded so the
question is not re-litigated from scratch:

- It would be a port, not a rewrite: `src/contract/fixtures/consumer-conformance.json` is 35
  language-neutral cases plus `target-id-contract.json`, and `tests/helpers/consumer-conformance.mjs`
  is only the Node driver.
- Tauri is the real motivation (the consuming project is exactly that shape); **WebAssembly is not** — no process
  spawn and no multi-gigabyte filesystem extraction, so only the document-verification half would
  work there.
- Cost: every guarantee proven a third time, plus a crates.io release channel and an Ed25519
  library choice.
- **Sequencing matters:** it must not start before the reattach gap above is settled, or the third
  implementation bakes in the same hole and the API gets fixed in three languages instead of two.
````

---

## 2026-08-03 02:09:27 — modifica — testo sostituito

````
figure. A reattach can therefore prove signature, shape, target, entry point, execution files and
on-demand asset hashes, but not the bytes of `venv/`. Options weighed: (a) keep the archive beside
the install and re-hash it at attach — full guarantee, costs a duplicate of gigabytes, good as an
opt-in strict mode only; (b) add a signed digest over the extracted tree to the release, additive
so existing v2 boxes keep verifying while reattach requires it — the recommendation; (c) shape-only
attach, rejected as the sole path under hard rule 7.
````

---

## 2026-08-03 02:09:27 — modifica — testo nuovo

````
figure. A reattach can therefore prove signature, shape, target, entry point, execution files and
on-demand asset hashes, but not the bytes of `venv/`. Options weighed: (a) keep the archive beside
the install and re-hash it at attach — full guarantee, costs a duplicate of gigabytes; (b) add a
signed digest over the extracted tree to the release, additive so existing v2 boxes keep verifying
while reattach requires it; (c) shape-only attach, rejected as the sole path under hard rule 7.

**Decided 2026-08-03: (b). (a) is dropped, not deferred — do not reopen it.**

Two constraints on (b), both established in the same session:

- **The extracted tree is not immutable, so the digest must be a closed list of signed paths, never
  a directory snapshot.** Verification asks "every path the release commits to is present with
  these bytes", never "the directory contains nothing else". A snapshot digest would fail on the
  second run through no fault of anyone: `__pycache__`/`.pyc` appear on first import (already
  skipped by `collectEntries` in `src/build/filesystem.mjs:82`, which is the set to hash),
  `modelCacheSubdir` is filled by the caller *after* extraction under `weights: on-demand`, and
  `runExtractedBox` runs the child with `cwd: prepared.root` so the application writes there too.
- **The digest is not a defence against a live local attacker, and must not be described as one.**
  Between attach and spawn — and throughout the run, since Python imports lazily — the tree can
  change, and no consumer library can close that window; filesystem permissions do, and they belong
  to the OS and the embedding application. What the digest earns its place for is narrower and
  solid: it is the only thing that binds a directory to a signed release (without it
  `verifyExtractedBox` cannot tell a current install from a stale one, a rollback directory, or an
  interrupted extraction, and would hand back a receipt asserting the wrong version), plus ordinary
  corruption detection. The docs must state that Scrollcase does not guard the directory afterwards.

Open cost question, to measure on the demo box before adding any cheaper mode: re-hashing gigabytes
at every application launch is seconds on NVMe and much worse on slow or network storage.
````

---

## 2026-08-03 02:43:30 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
sed -n '/^## 8\./,$p' .local-memory/PROJECT-MEMORY.md | grep -n "^#\|^\*\*The blocking\|^\*\*The process"
````

---

## 2026-08-03 02:43:30 — output di: sed -n '/^## 8\./,$p' .local-memory/PROJECT-MEMORY.md | grep -n "^#\|^\*\*The blocking\|^\*\*The process" 

````
1:## 8. Session of 2026-08-03 — consumer API review
6:### Open defect: an installed box cannot be run after a process restart
15:**The process binding itself is correct and stays.** A serialisable receipt would be a forgeable
22:**The blocking design question:** the signed release carries no digest of the *extracted* tree —
29:### The accepted design, 2026-08-03
64:### Two constraints on the digest
90:### Rust consumer: deferred on purpose
````

---

## 2026-08-03 02:43:35 — modifica — testo sostituito

````
**The blocking design question:** the signed release carries no digest of the *extracted* tree —
````

---

## 2026-08-03 02:43:35 — modifica — testo nuovo

````
**The design question it raised, answered below:** the signed release carries no digest of the
*extracted* tree —
````

---

## 2026-08-03 14:05:39 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
grep -n "^## \|^### " .local-memory/PROJECT-MEMORY.md | tail -30; echo "=== tail ==="; tail -30 .local-memory/PROJECT-MEMORY.md
````

---

## 2026-08-03 14:06:49 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
cat >> .local-memory/PROJECT-MEMORY.md <<'EOF'

---

## 9. Session of 2026-08-03 — LLM readiness, archive compression, run output, box environment

### What prompted the work

The maintainer asked whether Scrollcase can package and run an LLM today, and proposed shipping
real-world example boxes (one or two scientific models, one or two LLMs) so people can try them.
The assessment surfaced four frictions; three sessions of argument narrowed them to two small
changes (shipped) and one design (accepted, not yet implemented). **The example boxes were never
started** — they are still owed, and they are the reason all of this began.

### Measurements — do not re-derive these

Taken on this machine with Node's zlib, 512 MB of incompressible bytes standing in for GGUF:

| | Result |
| --- | --- |
| deflate level 6 | 47 MB/s, output **0.03% larger** than input |
| deflate level 1 | 51 MB/s — lowering the level is **not** a fix, the search fails either way |
| inflate | 658 MB/s — extraction cost is disk writes, not CPU |

Consequence: ~110 s of pure CPU per 5 GB per build, for a negative return. Small but real, and
paid again on every rebuild.

### Two claims I made and had to correct

- "Decine di minuti" to compress a large box. Wrong by an order of magnitude; see the table.
- "Disk during build is 3× the weights." Wrong: assets are downloaded **straight into the payload**
  (`box.mjs:165`), so it is 2× — payload plus archive.

Both had been stated confidently before being measured. The maintainer's pushback is what caught
them.

### Shipped — branch `store-weights-and-run-stderr`, commit `7877e4a`

- **`uncompressedPaths`** in the scroll, plus an automatic rule: every path declared in `assets` is
  stored rather than deflated, without the project asking. An entry matches the path and everything
  beneath it. The decision comes from the scroll and the path alone — never from the file's bytes or
  extension — which is what preserves byte-identical rebuilds. Reader side needed nothing: yauzl
  handles method 0 and validates its sizes, and Python's `zipfile` is native.
- **`run`'s own output moved to stderr**, plus a second line, printed always: `126 MB extracted to a
  temporary directory, deleted on exit.` The real defect was not in `cli-run.mjs` but in `cli.mjs`,
  which passed `log: step`, and `step` writes to stdout — so a caller piping a box's output was
  getting a Scrollcase line inside it.
- The compression rule was verified as a real guard: breaking `isDeclaredUncompressed` turned the
  test red (`expected 8 to be +0`) before it was restored.
- 277/277 green, docs build clean. `example-build.yml` dispatched manually on the branch
  (run 30820980434) — the 3-OS real build is the only thing that can prove an archive change on
  Windows and Linux from a Mac.

### The box environment — accepted design, NOT implemented

The starting point was a hole worth remembering: **the box inherits the entire environment of
whoever launches it** (`{...process.env, ...options.env}`). Demonstrated live — a `sitecustomize.py`
in a host directory executes inside the box's interpreter purely because `PYTHONPATH` was exported
in the shell. Also `PYTHONHOME`, `PYTHONBREAKPOINT` (resolves and calls a dotted name), `LD_PRELOAD`,
`DYLD_INSERT_LIBRARIES`, `SSL_CERT_FILE`.

**My first proposal was rejected, correctly.** I designed a four-layer environment with a minimal
per-platform base, default-deny, and an `inheritEnvironment` allowlist. The maintainer's objection:
the developer's environment is the developer's responsibility, and Scrollcase's job is integrity,
verifiability, truthful declarations and debugging tools — not sandboxing. That also removed the
single fragile piece of the whole plan (the Windows base env, where a wrong variable name means the
interpreter does not start).

What was accepted instead:

1. **Nothing is filtered.** The box inherits as it does today.
2. **`environment` in the scroll, carried into the signed release.** Today there is *no* way for a
   box author to set an environment variable — only the caller can, via `runBox(…, { env })`. That
   asymmetry is the actual gap. On conflict **the release wins**, because it is signed and the shell
   is not. It must also apply to the self-test during the build, which makes a wrong model path fail
   the build instead of a user's machine.
3. **Report, do not enforce.** `run` and `verify --self-test` print which declared variables were
   applied, which host variables of the kind that change *what code executes* are present, which
   conflicts occurred and who won, and a count of the remaining variables.
4. **Names decided by the maintainer:** `--env-report` for the report, `--env-report-values` for
   revealing host values. Two flags on purpose — a generic `--verbose` is a flag people add to CI
   jobs without thinking, and it must never be the thing that prints `HF_TOKEN` into a public log.
   Host values are masked by default; release-declared values are printed, being already public in a
   signed document. The same defaults apply to the library surface, which is where the structure
   will actually be logged.
5. **Exposed from the libraries too**, Node and Python, not only the CLI.

**The boundary that must not blur:** the `environment` *declaration* belongs to the format — signed,
verifiable by any implementation. The *report* is diagnostic output of our consumers and must never
be documented as a guarantee of the box. Someone who spawns `venv/bin/python` themselves gets none
of it, and that is the same boundary that already applies to every other check.

Asked whether the report could be "native" instead: it can be in every Scrollcase surface (CLI, both
libraries), but it cannot live inside the box, because a box is a ZIP and a signed document, not a
process. The only way further would be injecting a `sitecustomize.py` into every box's `venv/` —
rejected: permanent weight in every box, fires on every interpreter invocation, and changes the
verified payload, all to serve someone who chose not to use our tools.

### Also decided, and deliberately deferred

- **`--keep <dir>`** (extract and leave it): dropped. Without the ability to *run* from an
  already-extracted directory it only serves inspection.
- **Running an already-prepared box in a new process**: not possible today — `runExtractedBox`
  requires the handle `verifyAndExtractBox` returns and re-checks device/inode. Doing it would be the
  first place Scrollcase executes code it has not verified in that process, which contradicts the
  stated rule in `AGENTS.md`. If it is ever wanted, the rule must be amended in writing, not routed
  around. Note this is adjacent to the payload-digest work in section 8 — a per-file digest in the
  release is exactly what would make reuse verifiable.

### Still owed

1. The environment work above. ~8 files across two languages, three schemas, ~5 new cases in
   `consumer-conformance.json`, docs and white-paper. The logic is small and pure; the cost is
   keeping the surface aligned. One to two days.
2. **The example boxes, which were the original request.** Proposed set: `chat-box`
   (llama-cpp-python + a ~0.4 GB GGUF, embed, three OS + metal), `serve-box` (~4 GB, `on-demand`,
   which is also the only way past GitHub's 2 GB per-release-asset limit), `molecule-box` (rdkit,
   no weights, native C++ stack), `protein-box` (transformers + pytorch-cpu + ESM-2 35M, exercising
   the `parity` gate, which no example uses today). Verified on conda-forge the same day:
   `llama.cpp`, `llama-cpp-python`, `onnxruntime`, `pytorch-cpu`, `rdkit`, `biopython` all build for
   linux-64/osx-arm64/win-64; `transformers` and `mlx-lm` are noarch.
3. Untested: a single payload file over 4 GB. yazl promotes the entry to zip64 and yauzl reads it
   back, so it should hold, but nobody here has done it. Do it before promising a 7B box.

### An authoring rule the examples must follow

`from_pretrained("org/model")` takes a *repository name*, not a path: the library resolves it from
the user's cache or the network and never looks inside the box. An example written that way ships
verified weights it does not use, works on the author's machine, and lies. Load from
`Path(__file__).parent / …` and let the declared `HF_HUB_OFFLINE=1` turn a wrong path into a loud
failure. Scrollcase cannot detect this without knowing `transformers`, and knowing `transformers` is
exactly what it must not do.
EOF
wc -l .local-memory/PROJECT-MEMORY.md
````

---

## 2026-08-03 14:06:49 — output di: cat >> .local-memory/PROJECT-MEMORY.md <<'EOF'

---

## 9. Session of 2026-08-03 — LLM readiness, archive compression, r

````
550 .local-memory/PROJECT-MEMORY.md
````

---

## 2026-08-03 14:25:31 — modifica — testo sostituito

````
## 8. Session of 2026-08-03 — consumer API review
````

---

## 2026-08-03 14:25:31 — modifica — testo nuovo

````
## 8. Session of 2026-08-03 — consumer API review

**The accepted plan and its execution record live in
`.local-memory/payload-digest-and-attach-plan.md`.** Stages 1-3 are done; 4-9 are not started. This
section holds the reasoning; that file holds the work.
````

---

## 2026-08-03 14:25:36 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
grep -n "^### \|^## " .local-memory/PROJECT-MEMORY.md | sed -n '20,40p'
````

---

## 2026-08-03 14:25:36 — output di: grep -n "^### \|^## " .local-memory/PROJECT-MEMORY.md | sed -n '20,40p'

````
437:### Measurements — do not re-derive these
450:### Two claims I made and had to correct
459:### Shipped — branch `store-weights-and-run-stderr`, commit `7877e4a`
476:### The box environment — accepted design, NOT implemented
521:### Also decided, and deliberately deferred
532:### Still owed
547:### An authoring rule the examples must follow
````

---

## 2026-08-03 14:25:42 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
grep -n "^## \|^### " .local-memory/PROJECT-MEMORY.md | awk -F: '{print $1" "$2}' | sed -n '1,22p'
````

---

## 2026-08-03 14:25:42 — output di: grep -n "^## \|^### " .local-memory/PROJECT-MEMORY.md | awk -F: '{print $1" "$2}' | sed -n '1,22p'

````
15 ## 1. Where this came from
42 ## 2. The maintainer's rules, in his own words
57 ## 3. Mistakes made during the extraction, and what they taught
92 ## 4. Environment facts
109 ## 5. What is still owed
220 ## 6. Things to be careful with
235 ## 7. Session of 2026-07-31
242 ### What prompted the work
249 ### Done
267 ### Three defects the CI found on its first runs, all invisible from a Mac
278 ### Environment facts learned here
295 ### Mistakes repeated here, from section 3
315 ## 8. Session of 2026-08-03 — consumer API review
324 ### Open defect
348 ### The accepted design, 2026-08-03
383 ### Two constraints on the digest
409 ### Rust consumer
427 ## 9. Session of 2026-08-03 — LLM readiness, archive compression, run output, box environment
429 ### What prompted the work
437 ### Measurements — do not re-derive these
450 ### Two claims I made and had to correct
459 ### Shipped — branch `store-weights-and-run-stderr`, commit `7877e4a`
````

---

## 2026-08-06 02:50:14 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
cat PROJECT-MEMORY.md 2>/dev/null | head -60; ls .local-memory 2>/dev/null
````

---

## 2026-08-06 02:50:14 — output di: cat PROJECT-MEMORY.md 2>/dev/null | head -60; ls .local-memory 2>/dev/null

````
PROJECT-MEMORY.md
docs-correction-and-additions-plan.md
payload-digest-and-attach-plan.md
rust-consumer-plan.md
scroll-v2-consumer-execution-plan.md
white-paper-plan.md
````

---

## 2026-08-06 02:50:17 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
head -80 .local-memory/PROJECT-MEMORY.md
````

---

## 2026-08-06 02:50:18 — output di: head -80 .local-memory/PROJECT-MEMORY.md

````
# Project memory — scrollcase

Local handoff notes. Not committed; not documentation. This is the context a new session needs to
pick the work up without re-deriving it, including the things that went wrong and why.

The public reasoning lives in `docs/concepts/design-decisions.md`, the operational rules live in
`AGENTS.md`, and the execution policy lives in `AGENT-POLICY.md`. **Read those first.** This file
holds what does not belong there: where the work came from, what is still owed, and the mistakes
that shaped the current design.

Last updated: 2026-07-26.

---

## 1. Where this came from

scrollcase is an extraction. It was the **Runtime Box builder** inside **a private consuming application**: a
local-first Rust/Tauri desktop application for bioinformatics that installs scientific ML models as
signed, prebuilt Python environments. The builder was ~4,300 lines of Node under
`scripts/runtime-box*.mjs` in the consuming project's monorepo.

**The other half of the story lives at** the consuming project's monorepo, outside this repository, specifically:

- `project-knowledge-base/roadmap/scrollcase-extraction-plan.md` — the canonical extraction plan,
  with an execution record per phase, the evidence, and the inventory of what moved versus what
  stayed. This is the authoritative account of the extraction.
- `project-knowledge-base/current-project-status.md` — the wider status of the consuming project.
- `scripts/runtime-box*.mjs` — the consuming project's own copy of the builder, still in use there.

The extraction ran in phases. **P1** parameterised the paths, **P2** carved out the format contract,
**P3** moved the builder and completed the CLI, and **P4** established the standalone repository,
packaging, CI, documentation and npm release. Scrollcase `0.1.0` was published on 2026-07-26.
**P5** (the consuming project consumes the published package and deletes its in-tree copy) remains.

Commits in the consuming project's monorepo, in order: `9e588e5` (P1), `8596bf3` (P2), `c15050c` (remove every consumer
reference), `66a5fdf` (rewrite the moves/stays inventory), `076539c` (drop the "Runtime Box"
vocabulary, adopt parity tolerances), `bf3a649` (P3 1/3, move the build layer), `1215109` (P3 2/3,
build core and CLI), `229e169` (P3 real-toolchain proof), `7a22fd0` (P3 3/3, complete). In this repo:
`aa99253` added `CLAUDE.md` and the design decisions — that commit is now `4e15126` and carries only
the design decisions, after the history rewrite described in section 5.

## 2. The maintainer's rules, in his own words

These were stated forcefully during the extraction, after I got them wrong more than once. They are
not preferences; they are the definition of the project.

- *"Scrollcase è un TOOL a parte, indipendente."* It is a spin-off that will be published open
  source, **completely external to the consuming project or any other project**.
- *"[Il progetto consumatore] lo userà per impacchettare i modelli come runtime box, e poi li metterà su R2, ma CI ecc è
  roba sua."* The consuming project is one ordinary user of the tool. Distribution, CI, the model catalog, runner
  allocation and the KMS signer are the consuming project's, not the tool's.
- *"Scrollcase è solo un tool che usa pixi + conda-pack + conda-forge … per impacchettare un dato
  modello per i vari OS e renderlo facilmente trasportabile, lockato, self-contained."*
- *"Qualsiasi cosa dentro scrollcase che contiene riferimenti al progetto consumatore deve essere tolta o cambiata."*
  This includes the artifact's name: "Runtime Box" was the consuming project's product term and is gone.

## 3. Mistakes made during the extraction, and what they taught

Recorded because each was caught late, and the same trap is still open.

**A clean grep only describes the tree at the moment it ran.** The consuming project references were removed once,
verified by grep, and then came back *twice* inside files moved later: `CONSUMER_RUNTIME_BOX_PIXI` and
`CONSUMER_RUNTIME_BOX_CONDA_PACK`, a temp-directory prefix, a hard-coded licence-audit `kind`, and —
worst — the **default workspace paths**, which were literally the consuming project's directory names
(`runtime-boxes/recipes`, `.runtime-box-build`). Re-grep after every move.

**An inventory derived from imports is not an inventory of what belongs.** The original plan listed
`runtime-box-ci.mjs` (812 lines), `evidence.mjs` (601), `heartbeat.mjs`, `validator-context.mjs` and
`node-cli.mjs` as moving into the tool, because things imported them. Reading what they *do* showed
they are the consuming project's CI, and that the build entry point imports none of them. Roughly 2,000 lines of
someone else's infrastructure would have been dragged in. The same reading also found ~390 lines of
R2 and registry distribution *inside* the builder entry point, which stayed behind.

**A module that loads is not a module that works.** Trimming `licenses.mjs` to its conda half dropped
the `CONDA_PACKAGE_FILE` constant its parser uses. Every `audit` threw `ReferenceError` while the
test suite stayed green, because no test called that function end to end. Fixed, and covered.

**`which` is not a search.** I reported that pixi was not installed and that a real build was
therefore impossible. It was installed the whole time, under a dedicated `PIXI_HOME` off `PATH`. The
maintainer pushed back, and the live proof followed within minutes.
````

---

## 2026-08-09 02:49:52 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
cat > /private/tmp/claude-501/-Users-lorenzo-Documents-GitHub-scrollcase/126b6f7f-0a0c-4239-8530-40b24a9ca451/scratchpad/recover.py <<'PYEOF'
import json, glob, os, re

DIR = "/Users/lorenzo/.claude/projects/-Users-lorenzo-Documents-GitHub-scrollcase"
hits = []  # (timestamp, kind, path, text)

def walk_content(msg):
    c = msg.get("content")
    if isinstance(c, list):
        return c
    return []

for f in sorted(glob.glob(os.path.join(DIR, "*.jsonl"))):
    pending = {}  # tool_use_id -> (path, kind)
    for line in open(f, errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            e = json.loads(line)
        except Exception:
            continue
        ts = e.get("timestamp", "")
        msg = e.get("message") or {}
        for item in walk_content(msg):
            if not isinstance(item, dict):
                continue
            if item.get("type") == "tool_use":
                inp = item.get("input") or {}
                p = str(inp.get("file_path", ""))
                if "PROJECT-MEMORY" in p or ".local-memory" in p:
                    name = item.get("name")
                    if name == "Write":
                        hits.append((ts, "Write:" + os.path.basename(f), p, inp.get("content", "")))
                    elif name == "Edit":
                        hits.append((ts, "Edit-new:" + os.path.basename(f), p, inp.get("new_string", "")))
                    elif name == "Read":
                        pending[item.get("id")] = (p, os.path.basename(f))
            elif item.get("type") == "tool_result":
                tid = item.get("tool_use_id")
                if tid in pending:
                    p, src = pending.pop(tid)
                    c = item.get("content")
                    if isinstance(c, list):
                        text = "\n".join(x.get("text", "") for x in c if isinstance(x, dict))
                    else:
                        text = str(c)
                    hits.append((ts, "Read:" + src, p, text))

hits.sort(key=lambda h: h[0])
print(f"{len(hits)} recuperi\n")
for ts, kind, p, text in hits:
    print(f"{ts}  {kind}  {p}  ({len(text)} chars)")
json.dump(hits, open("/private/tmp/claude-501/-Users-lorenzo-Documents-GitHub-scrollcase/126b6f7f-0a0c-4239-8530-40b24a9ca451/scratchpad/hits.json", "w"))
PYEOF
python3 /private/tmp/claude-501/-Users-lorenzo-Documents-GitHub-scrollcase/126b6f7f-0a0c-4239-8530-40b24a9ca451/scratchpad/recover.py
````

---

## 2026-08-09 02:50:30 — comando shell che ha modificato il file (il testo aggiunto è dentro al comando)

````
cat > /private/tmp/claude-501/-Users-lorenzo-Documents-GitHub-scrollcase/126b6f7f-0a0c-4239-8530-40b24a9ca451/scratchpad/recover2.py <<'PYEOF'
import json, glob, os, re

DIR = "/Users/lorenzo/.claude/projects/-Users-lorenzo-Documents-GitHub-scrollcase"
events = []

def texts(item):
    c = item.get("content")
    if isinstance(c, list):
        return "\n".join(x.get("text", "") for x in c if isinstance(x, dict))
    return c if isinstance(c, str) else ""

for f in sorted(glob.glob(os.path.join(DIR, "*.jsonl"))):
    pending = {}
    for line in open(f, errors="replace"):
        line = line.strip()
        if not line: continue
        try: e = json.loads(line)
        except Exception: continue
        ts = e.get("timestamp", "")
        msg = e.get("message") or {}
        c = msg.get("content")
        if not isinstance(c, list): continue
        for item in c:
            if not isinstance(item, dict): continue
            if item.get("type") == "tool_use":
                inp = item.get("input") or {}
                p = str(inp.get("file_path", ""))
                name = item.get("name")
                if ("PROJECT-MEMORY" in p or ".local-memory" in p):
                    if name == "Write":
                        events.append({"ts": ts, "op": "write", "path": p, "content": inp.get("content", "")})
                    elif name == "Edit":
                        events.append({"ts": ts, "op": "edit", "path": p,
                                       "old": inp.get("old_string", ""), "new": inp.get("new_string", ""),
                                       "all": bool(inp.get("replace_all"))})
                    elif name == "Read":
                        pending[item.get("id")] = (p, inp.get("offset"), inp.get("limit"))
                if name == "Bash":
                    cmd = str(inp.get("command", ""))
                    if ".local-memory" in cmd:
                        events.append({"ts": ts, "op": "bash", "path": "", "cmd": cmd, "id": item.get("id")})
                        pending[item.get("id")] = ("BASH:" + cmd[:120], None, None)
            elif item.get("type") == "tool_result":
                tid = item.get("tool_use_id")
                if tid in pending:
                    p, off, lim = pending.pop(tid)
                    events.append({"ts": ts, "op": "read", "path": p, "content": texts(item),
                                   "partial": bool(off or lim)})

events.sort(key=lambda x: x["ts"])
json.dump(events, open("/private/tmp/claude-501/-Users-lorenzo-Documents-GitHub-scrollcase/126b6f7f-0a0c-4239-8530-40b24a9ca451/scratchpad/events.json", "w"))
print("events:", len(events))
# what does a directory listing tell us about the full file set?
for e in events:
    if e["op"] == "read" and e["path"].startswith("BASH:") and "ls" in e["path"]:
        print("\n---", e["ts"], e["path"][:100], "\n", e["content"][:600])
PYEOF
python3 /private/tmp/claude-501/-Users-lorenzo-Documents-GitHub-scrollcase/126b6f7f-0a0c-4239-8530-40b24a9ca451/scratchpad/recover2.py 2>&1 | head -60
````
