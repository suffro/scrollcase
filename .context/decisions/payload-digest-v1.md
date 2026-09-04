# The payload digest is a signed path list, and a receipt is never serialised

**Decided when re-attaching to an installed box was designed; the format string is
`sha256-path-list-v1` and it was left untouched by version 3.**

A signed release commits to the archive's SHA-256, which proves every payload byte — but only while
the archive still exists. An application that installs a box once and runs it for months has thrown
that archive away, and `installedSizeBytes` is a free-space figure, not an identity. So the payload
also carries a **list**: one record per entry, naming it and hashing its content. The release signs
the SHA-256 of that list, which keeps the signed document one field longer instead of megabytes
longer — a conda prefix routinely holds twenty thousand files.

**Why a list rather than a root hash over the installed tree.** A verifier walks the *list*, never
the directory, so anything the list does not name is never visited: the `__pycache__` written on
first import, the model cache a caller fills after extraction, the file an application writes into
its own working directory. Hashing a walk of the tree reads as the same guarantee for a fraction of
the format, but then the directory is the input and every legitimate extra file makes an honest box
fail.

**What a record deliberately omits**, each load-bearing:

- **Mode** — `archiveFileMode` synthesises `0o755`/`0o644` from the target and the path, and Windows
  extraction skips `chmod` entirely.
- **Modification time** — the payload is stamped with one fixed instant before archiving, and no
  extractor restores it.
- **Directories** — neither the entry collector nor the archive writer represents one.

**The receipt stays process-local.** Re-attaching re-verifies and mints a fresh receipt; it does not
read one back from disk. A receipt readable from JSON would be a forgeable execution capability,
which is exactly what the in-process `WeakMap` (and the Python `WeakKeyDictionary`) prevents.

**Consequence.** The digest rule touches no filesystem and no hash implementation, so the builder
and all three consumers apply one rule rather than three approximations of it, proven against
`src/contract/fixtures/payload-digest-contract.json`. Changing it is a wire change and needs a new
`schemaVersion` — see [`version-3-is-a-clean-break.md`](version-3-is-a-clean-break.md).
