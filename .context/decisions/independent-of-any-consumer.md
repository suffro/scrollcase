# Scrollcase is independent of any consuming project

**Decided during the extraction, in the maintainer's own words, after the boundary was crossed more
than once.** This is the defining rule of the project and the one most likely to erode.

Scrollcase was extracted from a private application that needed it. That application is **one
ordinary user** of the tool, with no more standing than any other. Nothing about it — its name, its
product vocabulary, its paths, its CI, its signer, its distribution model — belongs anywhere in this
repository, including in this directory and in the historical files under `../history/`, which are
redacted for exactly this reason.

**In the maintainer's words:** *"Scrollcase è un TOOL a parte, indipendente"*, published open source
and **completely external** to the project that first needed it; *"Qualsiasi cosa dentro scrollcase
che contiene riferimenti [al progetto consumatore] deve essere tolta o cambiata"* — including the
artefact's name, since "Runtime Box" was that project's product term and is gone.

**What follows from it.**

- **No consumer's name in the tool**: not in identifiers, error messages, environment variables,
  default paths, wire strings, examples, or documentation.
- **The document namespace belongs to the publishing project.** A `kind` is
  `<namespace>.release` / `.channel` / `.revocations`, built by `documentKinds(namespace)` and
  defaulting to `scrollcase.box`. A project with boxes already in the field keeps emitting the
  namespace its clients recognise. Never hard-code one.
- **Scope stops at the box.** Scrollcase builds, signs, verifies, prepares and executes a
  caller-supplied local box. It is not a distribution system, not a CI system, and not a scientific
  validator: channels, downloads, updates, promotion, revocation, serving, runner allocation, cost
  policy and deciding what is scientifically correct all belong to whoever consumes it.

**Rejected during the extraction:** vendoring a mirror of the contract back at the consumer's old
paths, and adding `scrollcase/**` to that project's CI path filters. Both would have coupled the
tool to its first consumer for a small convenience.

**Why it keeps needing restating.** Consumer references were removed once, verified by grep, and
came back *twice* inside files moved later — worst of all as the default workspace paths, which were
literally that project's directory names. A clean grep only describes the tree at the moment it ran;
re-grep after every move.
