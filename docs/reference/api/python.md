---
title: Python consumer
description: The Python surface for contracts, build primitives, signing and running boxes.
---

# Python consumer

`scrollcase_consumer` mirrors the local Node consumer without depending on Node or its CLI:

```sh
python -m pip install scrollcase-consumer
```

```python
from scrollcase_consumer import (
    attach_extracted_box,
    run_box,
    run_extracted_box,
    verify_and_extract_box,
    verify_extracted_payload,
)

prepared = verify_and_extract_box(
    "release.json",
    public_key_path="trusted-keys.json",
    archive="box.zip",
    destination="/srv/boxes/example-1.0.0",
)

result = run_extracted_box(
    prepared,
    args=("--port", "8080"),
    env={"APPLICATION_MODE": "local"},
)
```

The receipt fields use idiomatic snake case (`box_id`, `target_id`, `required_assets`,
`archive_sha256`, `environment_report`). `attach_extracted_box(release, public_key_path=…, root=…)` and
`verify_extracted_payload(release, public_key_path=…, root=…)` mirror their Node counterparts
exactly, including the `attached` status and the refusal of a release that commits to no payload
digest. `run_box` performs the same one-shot prepare/run/cleanup composition. Stream
arguments accept Python file objects or `subprocess` constants; the default inherits the parent's
streams. On the main Python thread, `SIGINT`, `SIGTERM`, and `SIGHUP` are forwarded and then the
previous handlers are restored.

`EnvironmentReport`, `EnvironmentVariableReport`, and `EnvironmentSourceValue` are immutable public
models. Their fields mirror the Node structure in snake case; `BoxRunResult` and every verification
receipt include one.

Every operation that verifies a signed release takes `public_key_path` **or** `trusted_keys`, exactly
one, and `parse_trusted_keys(source)` reads both trust-file shapes from text or bytes — so an application
holding its keys in a keyring, an environment variable or a secrets manager verifies against them
directly instead of writing key material to a file first. Naming both sources or neither raises a
`ScrollcaseConsumerError`; the Rust `TrustAnchors` enum makes those two invalid states
unrepresentable instead.

The distribution is not a downloader: callers still supply local release, archive, trust-key,
destination, and on-demand asset paths. It verifies Ed25519 signatures with `cryptography` and
validates bundled, generated copies of the canonical schemas.
