# Scrollcase demo box

You unpacked a signed box built by CI from `examples/hello-box/` in the Scrollcase repository. It is
a stdlib-only Python 3.11 environment, and it runs on this machine without pixi, conda-pack, or a
build.

```text
.
├── box/
│   ├── <archive sha256>.zip           the box — leave it zipped and named as it is
│   └── <document sha256>.release.json the signed release document
├── run-box.ts                         run it from Node
├── run_box.py                         run it from Python
└── package.json
```

Both names under `box/` are SHA-256 digests of their own contents. `verify` finds the archive beside
the release document, under the hash that document commits to, so renaming or separating the two
breaks it.

## 1. Get the trust key

It is deliberately not in this archive. A signature only proves where something came from if the key
does not arrive in the same package.

```sh
mkdir keys
curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json
```

## 2. How to run it

<big>You can use any one of these five:</big>

### <small>2.1</small> CLI

```sh
npm install -g scrollcase

scrollcase verify box/*.release.json --public-key keys/example-signing-public.json
scrollcase run    box/*.release.json --public-key keys/example-signing-public.json
```

---

### <small>2.2</small> Node consumer

```sh
npm install
npx tsx run-box.ts
```

---

### <small>2.3</small> Python consumer

```sh
python -m pip install scrollcase-consumer
python run_box.py
```

---

### <small>2.4</small> Rust consumer

For an application that would otherwise embed a second runtime just to start a box — a Tauri client,
a native service.

```sh
cargo add scrollcase-consumer
```

```rust
use std::path::Path;

use scrollcase_consumer::run::{run_box, RunBoxOptions, RunOptions};
use scrollcase_consumer::trust::TrustAnchors;

fn main() -> scrollcase_consumer::Result<()> {
    // The name under box/ is the document's own SHA-256, and the archive is found beside it.
    let result = run_box(
        Path::new("box/<document sha256>.release.json"),
        &RunBoxOptions {
            trust: TrustAnchors::KeyFile(Path::new("keys/example-signing-public.json")),
            archive: None,
            temporary_root: Path::new("target/boxes"),
            run: RunOptions::default(),
        },
    )?;

    std::process::exit(result.exit_code.unwrap_or(1));
}
```

Verified, extracted, run, and deleted again in one call — deleted whatever happens, including a
failure part way through.

---

### <small>2.5</small> Your custom implementation

Nothing above is privileged. A consumer in whatever language you actually ship is written against a
specification rather than against one of these source files:
<https://scrollcase.dev/reference/box-format>. What it may not do is reorder the work — the
signature, against a key that did not travel with the archive; the archive's size and hash; entry
names that cannot escape the payload; agreement with the manifest; and only then the interpreter
inside the box. Run anything before that and you have verified nothing, which is why the consumers
above are checked against one shared set of conformance cases instead of each holding its own
reading of the rule.

---

<br>

On PowerShell the `box/*.release.json` glob is not expanded for a command like this — use
`(Get-ChildItem box\*.release.json).FullName`, or type the file name you see under `box/`.

`verify` checks the signature, the archive's size and hash, the entry names and the manifest, and
works on any machine. Running the box needs a machine matching its target, because the interpreter
inside it is executed. Its first line says the useful part plainly — `Hello from inside a
Scrollcase box!` — followed by the verified-to-running path and a short runtime/host summary. It
does not make you interpret a temporary `sys.prefix` path to discover that the box worked.

## About the signing key

This box is signed with a key that exists **only for this demo**. It signs nothing else, no trust
chain depends on it, and it is not the key for any Scrollcase release. Treat a signature from it as
evidence that the example is intact — never as evidence that anything else is.

Full walkthrough: <https://scrollcase.dev/demos/box-run-demo>
