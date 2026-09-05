# Repository Context

This directory contains the canonical shared context for this repository. It replaced the
git-ignored local memory directory on 2026-09-04: everything durable that lived there is here, and
nothing outside a working session belongs anywhere else.

`AGENTS.md` remains the operational rulebook — hard rules, naming, safety, the commands to run —
and `AGENT-POLICY.md` the execution policy. This directory holds the context around them: what the
system is, where the work stands, what was decided and why, and what already went wrong.

## Always relevant

- `truth/architecture.md` — current system architecture.
- `state/current.md` — current project state and active work.

## When relevant

- `truth/conventions.md` — repository conventions, the local environment, and the working habits
  learnt the expensive way.
- `decisions/` — significant technical and architectural decisions:
  - `decisions/independent-of-any-consumer.md` — the defining boundary, and the naming rules that
    follow from it.
  - `decisions/one-substrate.md` — pixi + conda-pack + conda-forge, and only that.
  - `decisions/version-3-is-a-clean-break.md` — the format break shipped in 1.0.0, and why there is
    no migration path.
  - `decisions/bundled-licence-declaration.md` — the one field added inside version 3 rather than
    deferred to a v4.
  - `decisions/payload-digest-v1.md` — the signed path list, and why a receipt is never serialised.
  - `decisions/box-environment-report.md` — accepted, unimplemented: report, do not enforce.
  - `decisions/demo-boxes-are-signed-by-ci.md` — why a demo box cannot be rebuilt locally.
  - `decisions/documentation-site.md` — what the site promises, and what it deliberately does not
    load.
  - `decisions/releases-publish-from-a-tag.md` — why `git push` is now the dangerous command.
  - `decisions/visibility-without-social-accounts.md` — how the project is made visible.

## Historical

- `history/` — completed, historical, or superseded operational context:
  - `history/extraction-and-origin.md` — where Scrollcase came from, and how the maintainer works.
  - `history/mistakes-and-what-they-taught.md` — every trap fallen into, several of them twice.
  - `history/v3-plan.md` and `history/v3-phase-a.md`, `history/v3-phase-b.md`,
    `history/v3-phase-c.md` — the version 3 programme, with the deviations, the guards proven red
    and the real builds.
  - `history/payload-digest-and-attach-plan.md`, `history/white-paper-plan.md` — delivered
    programmes, kept for the reasoning inside them.
  - `history/sentiment-demo-plan.md`, `history/llm-demo-plan.md` — the two model demos, as planned
    and as shipped.
  - `history/early-project-memory-archive.md` — the reconstructed project memory up to 2026-08-09.
    An archive: read it last, and never append to it.
