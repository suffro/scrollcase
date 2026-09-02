---
title: Rust consumer
description: The Rust surface for contracts, build primitives, signing and running boxes.
---

# Rust consumer

The `scrollcase-consumer` crate mirrors the same local consumer for applications — a Tauri desktop client, a native
service — that would otherwise have to embed a second runtime just to start a box:

```sh
cargo add scrollcase-consumer
```

```rust
use std::path::Path;

use scrollcase_consumer::prepare::{verify_and_extract_box, PrepareOptions};
use scrollcase_consumer::run::{run_extracted_box, RunOptions};
use scrollcase_consumer::trust::TrustAnchors;

let prepared = verify_and_extract_box(
    Path::new("release.json"),
    &PrepareOptions {
        trust: TrustAnchors::KeyFile(Path::new("trusted-keys.json")),
        archive: Some(Path::new("box.zip")),
        destination: Path::new("/srv/boxes/example-1.0.0"),
        environment: Default::default(),
    },
)?;

let result = run_extracted_box(
    &prepared,
    &RunOptions {
        args: vec!["--port".into(), "8080".into()],
        env: vec![("APPLICATION_MODE".into(), "local".into())],
        ..Default::default()
    },
)?;
```

### Where the trusted keys come from

Every entry point that verifies a signed release takes a `TrustAnchors`, not a path, because the two
sources are not equivalent security decisions. `TrustAnchors::KeyFile` reads a trust file at the
moment of verification, which suits a command line whose operator is also its administrator.
`TrustAnchors::Keys` verifies against
keys the caller already holds — and an application shipped to someone else's machine usually wants
exactly that, because a trust file sitting beside the application can be edited, and whoever edits it
decides which boxes the application will accept:

```rust
use scrollcase_consumer::trust::{parse_trusted_keys, TrustAnchors};

// Compiled in, so substituting a key means rebuilding the application rather than editing a file.
static ANCHORS: &str = include_str!("../anchors/production.json");

let keys = parse_trusted_keys(ANCHORS.as_bytes())?;
let trust = TrustAnchors::Keys(&keys);
```

`parse_trusted_keys` accepts the same two shapes a trust file holds — a single key object, or a
`{ "keys": [...] }` bundle — so an embedded bundle is read by the crate rather than by a second
parser at the call site. Prefer the bundle shape: keys compiled into an application can only be
rotated by releasing the application, and a bundle lets the outgoing and incoming keys both be
trusted while that release makes its way out. Verification is unchanged either way, a document being
accepted when any one of its signatures verifies against any trusted key.

The trust-file grammar is the same in all three implementations. Every entry needs a string
`keyId`; `publicKeyPem` may be absent or `null`, and otherwise must be a string. An empty bundle is
structurally valid but cannot verify a signature. Malformed JSON, bundle shapes or entries fail as
`Invalid trusted ed25519 key file.`; a syntactically valid but unusable PEM is skipped and therefore
reaches the common `Document has no valid signature from a trusted ed25519 key.` refusal. Node and
Python also reject malformed directly supplied key lists as `Invalid trusted ed25519 keys.`; Rust's
`Vec<TrustedKey>` makes the corresponding field-type errors unrepresentable. A trust file that
cannot be read uses the same `Invalid trusted ed25519 key file` prefix and includes the path and I/O
detail.

`attach_extracted_box` and `verify_extracted_payload` behave exactly as their Node and Python
counterparts, including the `attached` status and the refusal of a release that commits to no
payload digest; `run_box` performs the same one-shot prepare/run/cleanup composition. The receipt
fields are accessor methods (`prepared.box_id()`, `prepared.target_id()`,
`prepared.environment_report()`) rather than public fields, because `PreparedBox` has no public
constructor: the rule that verification precedes execution is carried by the type system, so a
caller cannot assemble one without having verified a box.

Everything is synchronous and needs no async runtime. Signals are forwarded from a channel the
caller owns rather than through process-wide handlers, which a library embedded in someone else's
application has no business installing. The crate forbids `unsafe`, and the modules are the same
concerns as the other two consumers: `contract`, `trust`, `release`, `archive`, `filesystem`,
`execution`, `environment`, `verify`, `prepare`, `run`.
