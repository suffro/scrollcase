# Scrollcase Technical White Paper — authoring plan

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered.** The authoring plan for `docs/white-paper.md`. The white paper is part of the
> deliverable and drifts if a module changes without it — three cases in
> `docs-contract.test.mjs` fail when it does.

Prepared: 2026-07-31
Status: **blocks 1–3 delivered (2026-08-01), awaiting maintainer review.** Blocks 4–5 not started.
Baseline: `main` at `6db8803169ccf50b6e95ca3570eb90d3e2e5ec22`, tree dirty in
`docs/concepts/tool-comparison.md` only.

## Progress log

**Block 1 — Foundations (sections 1–4).** Written to `docs/white-paper.md`; nav entry and sidebar
group added to `docs/.vitepress/config.mts`. `cd docs && npm run build` and `npm test` both pass;
all 17 intra-page anchors verified against the built HTML; zero links to other docs pages; no
non-English text; no consuming-project reference.

Decisions taken while implementing, for continuity:

- **No empty placeholder headings.** The "skeleton" is a *Document map* table in section 1 listing
  sections 1–12, plus a closing `*Sections 5 to 12 follow.*` line. Each later block appends real
  sections and deletes/updates that closing line. This keeps the published page coherent at every
  stage.
- **Glossary anchors are safe because the glossary comes first.** markdown-it appends `-1` to a
  *later* duplicate heading, so the glossary entry keeps the bare anchor. Later blocks must still
  avoid heading text identical to a glossary entry where it would be confusing. Verify anchors
  after every block with: extract `id="…"` from `docs/.vitepress/dist/white-paper.html`, diff
  against `](#…)` in the markdown. That check becomes drift-guard case 3 in block 5.
- Anchors in use so far: `box`, `box-json`, `channel`, `conda-channel`, `conda-subdir`,
  `document-payload`, `lockfile`, `parity`, `payload`, `prefix`, `provenance`, `release`,
  `revocations`, `scroll`, `target`, `target-adapter`, `wheel`.
- `AGENTS.md` (plan §7, the "reflect behaviour changes in the white paper" line) is **not yet
  written** — deferred to block 5, so the rule does not point at an incomplete document.

**Block 2 — Contract (section 5).** Appended to `docs/white-paper.md` (now 1,732 lines). Covers:
5.1 the three artefacts + the mirroring rule + the two entry points; 5.2 `targets.mjs` (closed
matrix, identity rule with its four validation steps, full adapter table for the three targets,
`assertNativeHost` / `assertPythonEntryPoint`, `condaSubdir` / `pixiAccelerator`, and the frozen
`uv-windows-pe` string documented as frozen so it is not "cleaned"); 5.3 the envelope
(`document-shape.mjs` / `documents.mjs` split, constants, namespacing, shape check vs decode, the
three-step decode order, base64-not-canonical-JSON with its rejected alternative); 5.4 `links.mjs`
(five rules, five functions, the implicit-directory subtlety, applied three times); 5.5 the eight
schemas (roles, `$ref` graph as mermaid, shared conventions, per-schema walk-through, publication
checks); 5.6 the fixtures; 5.7 both type generators; 5.8 the deliberate absences.

`cd docs && npm run build` and `npm test` pass; 18 anchors resolve; no duplicate-suffixed heading
ids (so no glossary anchor was shadowed); 3 mermaid blocks render as `language-mermaid`, exactly as
the existing pages do; still zero links to other docs pages and no non-English text.

New anchors used by block 2 beyond block 1's list: `target-id`. Glossary entries referenced most:
`box`, `target`, `target-adapter`, `parity`, `target-id`.

**Block 3 — Build (section 6).** Appended to `docs/white-paper.md` (now 2,711 lines). 6.1 the
ordered stages of `buildBox` (mermaid + table of stage / module / state and files touched), the
dist/ tree, content-addressed chain, the derived `cohortSalt`; then module by module: 6.2
`scroll.mjs`, 6.3 `workspace.mjs`, 6.4 `schema-validation.mjs`, 6.5 `pixi.mjs` (payload-side:
deferred links, `conda-meta` allowlist, link settling), 6.6 `launchers.mjs`, 6.7 `assets.mjs`,
6.8 `licenses.mjs` + `audit.mjs`, 6.9 `execution.mjs`, 6.10 self-test + `parity.mjs`, 6.11
`filesystem.mjs`, 6.12 `archive.mjs`, 6.13 `identity.mjs`, 6.14 signing from the builder's side,
6.15 `verify.mjs`, 6.16 `project.mjs` / `authoring.mjs` / `consumer-setup.mjs`, 6.17 `process.mjs`,
6.18 the `scrollcase/build` surface.

Notes for the next block:

- The plan's "11 steps of `box.mjs`" is **15** stages as the code actually reads. The table
  enumerates them honestly rather than forcing the number.
- **Maintainer convention: no `---` before a `##`.** The VitePress theme already draws the rule.
  The five existing separators were removed in this block; do not reintroduce them.
- Heading-slug collision to watch: a heading consisting only of the flag name --self-test slugified
  to `self-test` and shadowed the glossary entry as `self-test-1`. Renamed to "Verifying with
  --self-test". Check for suffixed ids after every block, not just broken links.
- The maintainer edited the frontmatter to `sidebar: false` / `navbar: false` and the sidebar entry
  in `config.mts` to a direct `link:`. `navbar: false` is present **twice** in the frontmatter —
  harmless (the build passes) but redundant; left as found.
- 27 anchors in use, all resolving; 4 mermaid blocks.

Two source-level discrepancies found while reading, deliberately *not* documented as fact and
*not* fixed (out of scope for this task):

1. `src/contract/targets.mjs:47` declares `assetTarReader: 'tar@7.5.20'`, while `package.json` pins
   `tar` at `7.5.22`. Section 4.4 states the package.json pins and describes the adapter field as
   naming the backends, without quoting the stale version.
2. The JSDoc of `installAndPackPixiEnvironment` (`src/build/pixi.mjs`) declares a return of
   `{ interpreter, prefix }`; the function returns `{ interpreter, venvDir, sitePackagesRelative }`.

This is a local handoff for the next session. It is not public documentation and is intentionally
git-ignored. Before implementation, read `AGENTS.md`, `AGENT-POLICY.md` and
`docs/concepts/design-decisions.md` in full, then re-check the current checkout rather than assuming
the baseline above is still current.

## 1. Purpose

The existing docs (24 pages, ~4,760 lines) are use-oriented: concepts/architecture.md explains the
*why* of each pipeline step, `reference/*` covers the CLI surface, the box format and the APIs. What
is missing is the module-by-module level — who calls what, which data structure travels where — and
a glossary of technical terms.

The deliverable is a technical document meant to be **studied end to end**, not consulted in spots:
a complete, authoritative description of how Scrollcase is built, for engineers who integrate,
audit, or contribute to it.

Outcome: one long, self-contained file, `docs/white-paper.md`, published on the site, with an
internal glossary and every technical term linked to its entry.

The audience stated inside the document is engineers integrating or auditing Scrollcase, and
contributors. No reference to anyone's knowledge gap.

## 2. Maintainer decisions — final

1. **One single markdown file.** Not a multi-page section. It must be easy to download and study
   offline as one artefact.
2. Named **Technical White Paper**, at `docs/white-paper.md` → `/white-paper`, a top-level entry in
   nav and sidebar.
3. **Everything is explained inside the document.** No deferring an explanation to another docs
   page, neither as a prerequisite nor as further reading. If an external page would elaborate, the
   white paper stopped too early and must be extended there instead.
   - Still allowed: **provenance references** that cite where the just-described code lives —
     source paths (`src/build/box.mjs`), schema names (`release-manifest.schema.json`), test files.
     Those are citations, not redirections.
   - Operating rule: if removing a link makes the paragraph incomprehensible, that link was covering
     a gap — write the missing content.
4. **Length is not a constraint.** Very long is fine and expected.
5. **Overlap with the existing docs is accepted and deliberate.** Two artefacts, two purposes;
   neither defers to the other.
6. **Depth:** module by module, plus the specifications of the substrate libraries, plus the
   glossary explaining the technical terms.
7. **English only**, throughout — prose, diagrams, tables, and comments inside code blocks.
8. **Delivered in blocks**, with maintainer review at the end of each block.
9. Reasoning effort: **high** for the whole job. Optionally raised for the drift-guard tests in
   block 5. Not xhigh — the failure mode here is factual drift from the source, which extra
   reasoning does not fix; reading the file does.

## 3. Document structure

Ordered for linear reading: vocabulary first, then the format, then what produces it, then what
consumes it.

1. **How to read this document** — audience, conventions, how to use the glossary
2. **Glossary** — canonical terms (box, scroll, target, payload, release/channel/revocations,
   self-test, parity) and domain terms (conda prefix, relocation, launcher, content-addressed,
   detached signature, lockfile, wheel, …). Target of every internal link
3. **The problem and the boundary** — what Scrollcase is, and what it deliberately is not
4. **The substrate** — specifications of pixi, conda-pack, conda-forge: what each does, how each is
   invoked, pinned versions. Plus the three runtime dependencies (`tar`, `yauzl`, `yazl`) and why
   those and nothing else
5. **The contract** — `src/contract/`: target model and identity (`targets.mjs`), envelope and
   namespacing (`documents.mjs`, `document-shape.mjs`), `links.mjs`, the 8 JSON schemas, the golden
   fixtures, type generation
6. **The build pipeline** — `src/build/`: the 11 steps of `box.mjs` with the state and files touched
   at each; then module by module (`pixi.mjs`, `toolchain.mjs`, `launchers.mjs`, `assets.mjs`,
   `licenses.mjs`, `archive.mjs`, `filesystem.mjs`, `scroll.mjs`, `workspace.mjs`, `authoring.mjs`,
   `project.mjs`, `parity.mjs`, `verify.mjs`, `audit.mjs`, `process.mjs`, `identity.mjs`,
   `schema-validation.mjs`, `execution.mjs`, `consumer-setup.mjs`)
7. **Signing and custody** — `src/sign/`: key generation, local signing, external-signer dispatch
   and the mandatory payload echo, verification
8. **The consumers** — `src/consumer/` and `python/src/scrollcase_consumer/` side by side; the fixed
   verification order; the shared conformance fixtures (`consumer-conformance.json`)
9. **The CLI** — the nine verbs, the dispatch, where the "thin CLI" boundary runs
10. **The invariants** — determinism, provenance, verify-never-trust, and the four paths that break
    silently (three targets, embed vs on-demand, local key vs external signer, toolchain from PATH
    vs the project's own)
11. **Test map** — which of the 26 files in `tests/unit/` plus the 6 in `python/tests/` proves which
    behaviour described above
12. **Appendices** — module summary table, index of public exports

## 4. Delivery blocks

| # | Block | Sections |
| --- | --- | --- |
| 1 | Foundations | 1, 2, 3, 4 — skeleton, glossary, boundary, substrate |
| 2 | Contract | 5 |
| 3 | Build | 6 |
| 4 | Signing and consumers | 7, 8 |
| 5 | CLI, invariants, tests, appendices | 9, 10, 11, 12 |

Block 1 comes first because the glossary is the target of every later link: without it, each
subsequent block would accumulate anchors to fix afterwards.

## 5. Downloadability

The document must be portable and studiable offline. A single file makes that possible, but the
affordances must be added or it stays merely a web page:

- **Raw markdown link** at the top of the document, to
  `https://github.com/suffro/scrollcase/blob/main/docs/white-paper.md` (and the
  `raw.githubusercontent` URL for direct download). That is the canonical copy: one file, no
  external assets
- **Browser-printable to PDF**: being a single page, `print → PDF` already yields the whole
  document. Verify that mermaid blocks and wide tables are not clipped, and add a `@media print`
  rule in `docs/.vitepress/theme/custom.css` if needed
- **Self-sufficiency** as specified in decision 3 above

## 6. Conventions to follow

Observed in the existing pages; follow them exactly:

- **Frontmatter**: `title` + `description`, as in `docs/reference/box-format.md`
- **Links**: the only internal links are **glossary anchors** (`](#payload)`), consistent with the
  site, which already uses anchors. No links to other docs pages — see decision 3
- **Mermaid** for diagrams (already used on 5 pages), **tables** for catalogues
- **VitePress containers**: `::: warning`, `::: tip`, `::: info`, `::: danger` — 19 uses already
- **Repository voice**: a decision is recorded together with the alternative it rejected
- **No consuming project's name anywhere** (hard rule 1)
- `outline: [2, 3]` in the frontmatter: the global config is `[2, 2]`, which is unusable for a
  document this long; per-page frontmatter overrides it

## 7. Files to modify

- `docs/white-paper.md` — **new**, the document
- `docs/.vitepress/config.mts` — top-level nav entry `{ text: 'White Paper', link: '/white-paper' }`
  and the matching sidebar group, after `Concepts`
- `tests/unit/docs-contract.test.mjs` — drift guard (below)
- `AGENTS.md` — one line: a behaviour change must be reflected in the white paper too

## 8. Drift guard

The real risk is not writing the document, it is the document drifting. `docs-contract.test.mjs`
already walks every markdown file and checks the docs against the contract, so it is the right home.
Three cases to add:

1. Every module under `src/**/*.mjs` appears at least once in the white paper — fails when a module
   is added without documenting it
2. Every public export declared in `package.json` `exports` appears in the document
3. Every internal `](#...)` anchor resolves to a heading that actually exists — VitePress's dead-link
   check does not cover intra-page anchors

Case 3 must be seen red once (break an anchor, confirm the failure, restore), as `AGENTS.md`
requires.

## 9. Verification

At the end of every block:

1. `cd docs && npm run build` — VitePress fails on dead links
2. `npm test` — includes the drift guard and `docs-contract.test.mjs`
3. Re-read against hard rule 1: `grep -ri` for consuming-project references
4. No non-English text in the document

At the end of the last block, additionally:

5. The raw markdown reads on its own, without the site: no Vue components, no syntax that degrades
   badly outside VitePress, and — mechanical check — `grep` for links to `/getting-started/`,
   `/guides/`, `/reference/`, `/concepts/`: must be **zero**
6. `print → PDF` from the browser: diagrams and tables intact, nothing clipped

No real box build and no toolchain installation: the document is written by reading the code.
