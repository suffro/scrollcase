# scrollcase-consumer

Verify, prepare, and run caller-supplied local [Scrollcase](https://scrollcase.dev) boxes from Rust.

A **box** is a portable, locked, self-contained Python environment built for one operating system and
accelerator, signed so whoever receives it can prove what they received. This crate is the consuming
half of that story, and only that half.

It is deliberately **not** a distribution system. It selects no channel, downloads nothing, updates
nothing, and knows about no registry. Every path, trust key, archive and destination comes from the
caller, because those lifecycle choices belong to the application rather than to the format.

Every entry point that verifies a signed release takes `TrustAnchors::KeyFile` or
`TrustAnchors::Keys`. The first reads a single-key or `{"keys": [...]}` trust file at verification
time; the second lets an application carry its own anchors. `trust::parse_trusted_keys` parses the
same two JSON shapes from bytes, including `include_str!` output, so file-backed and compiled-in
anchors share one grammar.
