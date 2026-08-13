# `sentiment-demo`

The example that carries a real model. `hello-box` proves the pipeline with a stdlib-only
environment; this one adds everything a model brings with it: pinned weights fetched by hash,
third-party licence notices carried into the payload, an offline environment, and a self-test that
runs actual predictions before the box is allowed to be signed.

It packs [DistilBERT SST-2](https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english),
quantised to INT8 in ONNX form, and classifies one English sentence:

```text
$ scrollcase run <release> -- This product is surprisingly easy to use.
Sentiment: POSITIVE
Confidence: 99.9%
```

The same box is declared for three CPU targets, one per supported operating system. Build the one
that matches the machine you are on; the other two are what CI builds elsewhere.

| Scroll | conda subdir | Interpreter in the box |
| --- | --- | --- |
| `sentiment-demo/macos-aarch64-cpu` | `osx-arm64` | `venv/bin/python` |
| `sentiment-demo/linux-x86_64-cpu` | `linux-64` | `venv/bin/python` |
| `sentiment-demo/windows-x86_64-cpu` | `win-64` | `venv/python.exe` |

The accelerator is `cpu` on all three, macOS included: the model runs on onnxruntime's CPU execution
provider, and declaring `metal` would promise an accelerator the box never uses.

## Build it

From the Scrollcase checkout, using `examples/` as the scrolls root. The lock is committed, so
`lock` is only needed after editing `pixi.toml`:

```sh
scrollcase keygen
scrollcase audit sentiment-demo/linux-x86_64-cpu --scrolls-dir examples
scrollcase build sentiment-demo/linux-x86_64-cpu --scrolls-dir examples
scrollcase verify .scrollcase/dist/boxes/sentiment-demo/1.0.0/linux-x86_64-cpu/*.release.json --self-test
scrollcase run .scrollcase/dist/boxes/sentiment-demo/1.0.0/linux-x86_64-cpu/*.release.json \
  -- This product is surprisingly easy to use.
```

The build downloads 68 MB of model files once, verifies each against the size and SHA-256 the scroll
declares, and embeds them. Most of the archive is those weights and onnxruntime.

## What is worth reading in the scroll

**The model is three pinned assets, not a download.** Each declares a URL at an immutable upstream
revision, its size and its SHA-256; the build fails if a byte moved. `weights: embed` puts them in
the archive, so the box installs and runs air-gapped.

**The environment is signed, not merely set.** `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and
`TOKENIZERS_PARALLELISM=false` are carried in the release and override the host. This is defence in
depth rather than the guarantee: `tokenizers` pulls `huggingface_hub` in transitively, so a
downloader *is* present in the environment — the entrypoint importing no client is what keeps it
unused.

**The self-test has two levels.** `selfTest.imports` is the part the signed release carries, which
is why `verify --self-test` can repeat it later with the box's own interpreter. `files` and
`pythonCode` stay builder-only: `pythonCode` runs two real predictions and asserts their labels and
confidence bounds, so a box that classifies wrongly is never signed. It runs with the payload as its
working directory, which is how it imports the entrypoint it is testing.

**The licence text ships with the model.** `MODEL_NOTICE.md` and `APACHE-2.0.txt` are `localFiles`
landing under `THIRD_PARTY_NOTICES/distilbert/`, each hashed into the scroll. Redistributing
weights means redistributing their terms.

**The entrypoint takes an argument and no default.** `execution.defaultArgs` is empty, so running
the box without a sentence prints a usage line on stderr and exits non-zero rather than classifying
something nobody asked about.

## Files

```text
sentiment-demo/
├── shared/
│   ├── entrypoint.py           one entrypoint, hashed identically into all three scrolls
│   ├── MODEL_NOTICE.md         attribution for the checkpoint and its ONNX conversion
│   └── APACHE-2.0.txt          the licence text both are under
├── demo-consumers/             what travels inside each published archive beside the box
├── <target>/scroll.json        identity, assets, environment, self-test, execution
├── <target>/pixi.toml          python, onnxruntime, tokenizers, numpy
├── <target>/pixi.lock          committed: the build installs from it and resolves nothing
└── <target>/conda-licenses.json  the reviewed audit the build recomputes and compares
```

`shared/` exists because the three targets differ only in platform, interpreter path and audit file.
Copying the entrypoint per target, as `hello-box` does, would mean three files to keep byte-identical
by hand; here one file is hashed into three scrolls, and a test asserts those hashes still match.

Those hashes are taken over the file's bytes, which is worth knowing on Windows. Git converts line
endings on checkout by default, and a file rewritten to CRLF no longer matches the hash the scroll
declares — the build stops with a mismatch on a checkout that looks perfectly clean.
[`.gitattributes`](.gitattributes) marks the affected paths.

## Scope

A demonstration of packaging, not a sentiment product. Short English sentences only, truncated past
128 tokens, with the biases documented in the model card — INT8 quantisation does not remove them.
Do not use it for decisions about people. Full walkthrough:
[the sentiment demo guide](https://scrollcase.dev/demos/sentiment-demo).
