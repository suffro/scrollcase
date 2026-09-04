# Version 3 is a clean break, and the only one

**Decided when the version 3 work was planned; shipped in `scrollcase@1.0.0` on 2026-09-02.**

Version 3 changed the wire once and completely. There are no v2/v3 unions, no legacy aliases and no
dual code paths anywhere in the builder, the contract or the three consumers. Published v1 and v2
releases remain historical artefacts, usable with the Scrollcase versions that produced them, and
the v3 verifier **rejects either older `schemaVersion` clearly and by name** rather than
reinterpreting it.

**What changed on the wire**, all of it in one break:

- `runtime: { id, version?, entryPoint? }` replaces `modelId`, `runtimeId`, `pythonVersion` and
  `pythonEntryPoint`. `labels` is the optional free-form map that replaces the two identity fields
  nothing ever read.
- Per-asset `embed` replaces the box-wide `weights` switch, so one box can ship a small entry-point
  binary and defer a 30 GB dataset. `--weights` was removed, not replaced.
- `selfTest.probe` with `imports` and `commands` replaces Python syntax on a signed wire format.
- Declared executables, `assets[].executable` and `localFiles[].executable`, because HTTP carries
  content and not modes.
- `modelCacheSubdir` → `cacheSubdir`, defaulting to `cache/<boxId>` — renaming the field and keeping
  the model vocabulary in its default value would have been half a rename.
- Schemas served at `/schema/v3/`.

**Why a break rather than a migration.** The old format carried a consumer's vocabulary — `modelId`
required and never read, `weights` describing model weights but meaning "inside the archive or not",
`selfTest.pythonImports` putting one runtime's syntax in the format. None of them describe what
Scrollcase is, and each would have had to be carried forever by a compatibility layer that doubles
the surface every future guarantee must hold on.

**Rejected:** a migration tool. A box is rebuilt from its scroll; that is what a scroll is for,
and a migrated box would carry provenance it cannot honestly claim.

**What this costs.** Any future breaking wire change needs another new `schemaVersion` — the `kind`
strings, the payload encoding, the signature algorithm and the golden fixtures are frozen, and
`payload-digest` was deliberately left untouched by version 3
(see [`payload-digest-v1.md`](payload-digest-v1.md)).
