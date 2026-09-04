# The box environment is reported, never enforced

**Accepted 2026-08-03. Not implemented.** It is the oldest open design in the project.

A box inherits the whole environment of whoever launches it, so a host variable such as
`PYTHONPATH` can import host code into a verified box. The agreed answer is **report, not enforce**:

- Nothing is filtered.
- The scroll gains an `environment` field, carried into the signed release. The release wins on
  conflict, and it applies to the build's self-test too.
- `run` and `verify --self-test` report what was applied, which host variables change what code
  executes, conflicts and their winner, plus a count of the rest.
- Flags: `--env-report`, and `--env-report-values` to unmask host values — deliberately **not**
  `--verbose`, which people add to CI jobs without thinking. Exposed from the Node and Python
  libraries too, masked by default.

**The boundary that makes it work.** The `environment` declaration belongs to the *format* and is
verifiable by any implementation; the report is diagnostic output of our consumers and must never be
documented as a guarantee of the box.

**Rejected:** default-deny with a per-platform minimal base. The maintainer's reasoning: the
developer's own environment is the developer's responsibility, and Scrollcase's job is integrity,
verifiability, truthful declarations and debugging tools — not sandboxing.

**When it is implemented** it adds a field to the wire, so it needs a `schemaVersion` decision
alongside it. See [`version-3-is-a-clean-break.md`](version-3-is-a-clean-break.md).
