# Where Scrollcase came from

> **Historical.** Carried out of the retired local memory directory on 2026-09-04, and redacted:
> the consuming project's name is not recorded anywhere in this repository. See
> [`../decisions/independent-of-any-consumer.md`](../decisions/independent-of-any-consumer.md).

Scrollcase is an **extraction**. It began as a builder living inside a private, local-first desktop
application for bioinformatics that installed scientific ML models as signed, prebuilt Python
environments — roughly 4,300 lines of Node inside that project's monorepo. The full account of the
extraction, phase by phase, lives in that project's own knowledge base and not here.

The extraction ran in phases:

- **P1** parameterised the paths that were hard-coded to the consumer's layout.
- **P2** carved out the format contract.
- **P3** moved the builder and completed the CLI.
- **P4** established this standalone repository, its packaging, CI, documentation and the first npm
  release — `scrollcase@0.1.0`, published 2026-07-26.
- **P5** — the consuming project adopting the published package and deleting its in-tree copy — is
  that project's work, not this repository's.

The duplicate copy of this repository that used to sit inside the consumer's monorepo is gone,
confirmed 2026-08-28. That housekeeping item is closed.

## What the extraction settled

Three things came out of it that are still the shape of the project, each recorded as a decision:

- The tool is **independent of any consumer** — the naming rules, the namespace rule and the scope
  boundary all follow from this
  ([`../decisions/independent-of-any-consumer.md`](../decisions/independent-of-any-consumer.md)).
- The substrate is **pixi + conda-pack + conda-forge, and only that**
  ([`../decisions/one-substrate.md`](../decisions/one-substrate.md)).
- The artefact is a **box**, built from a **scroll**. The consumer's own product term for it was
  dropped along with everything else that named them.

## How the maintainer works

Terse go-aheads, usually in Italian; a report back is a few lines, not a wall of text. When he asks
for something found or fixed, he means *every* instance, in one pass. Publishing to npm, PyPI or
crates.io, and anything touching the domain, are his calls and never an agent's.

The detail behind all of this — the release evidence for `0.1.0`, the defects the first CI runs
found, the design sessions, the compression measurements — is in
[`early-project-memory-archive.md`](early-project-memory-archive.md).
