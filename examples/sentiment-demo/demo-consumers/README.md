# Scrollcase sentiment demo box

You unpacked a signed box built by CI from `examples/sentiment-demo/` in the Scrollcase repository.
It carries a DistilBERT SST-2 sentiment model, quantised to INT8 in ONNX form, together with the
Python 3.11 environment that runs it. Nothing is downloaded when it runs, and no pixi, conda-pack or
build is involved.

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

## 2. Run it

You can use any one of these three:

### CLI

```sh
npm install -g scrollcase
```

```sh
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json
scrollcase run    box/*.release.json --public-key keys/example-signing-public.json \
  -- This product is surprisingly easy to use.
```

---

### Node consumer

```sh
npm install
```

```sh
npx tsx run-box.ts "This product is surprisingly easy to use."
```

---

### Python consumer

```sh
python3 -m venv .venv
source .venv/bin/activate
```

```sh
python -m pip install scrollcase-consumer && python run_box.py "This product is surprisingly easy to use."
```

---

<br>

The box classifies one sentence and prints two lines:

```text
Sentiment: POSITIVE
Confidence: 99.9%
```

The sentence is an argument because the box declares none by default: run it without one and it
answers with a usage line on stderr rather than classifying something you did not ask about. The two
scripts above pass the example sentence for you, and take your own as their first argument.

On PowerShell the `box/*.release.json` glob is not expanded for a command like this — use
`(Get-ChildItem box\*.release.json).FullName`, or type the file name you see under `box/`.

`verify` checks the signature, the archive's size and hash, the entry names and the manifest, and
works on any machine. Running the box needs a machine matching its target, because the interpreter
inside it is executed.

## About the model

A demonstration of packaging, not a sentiment product. It reads short **English** sentences and
answers `POSITIVE` or `NEGATIVE`; anything past 128 tokens is truncated. Its model card documents
biases inherited from the training data, and INT8 quantisation does not remove them — do not use it
for decisions about people. The full model notice and licence text travel inside the box, under
`THIRD_PARTY_NOTICES/distilbert/`.

## About the signing key

This box is signed with a key that exists **only for the Scrollcase demos**. It signs nothing else,
no trust chain depends on it, and it is not the key for any Scrollcase release. Treat a signature
from it as evidence that the example is intact — never as evidence that anything else is.

Full walkthrough: <https://scrollcase.dev/demos/sentiment-demo>
