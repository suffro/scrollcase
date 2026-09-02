---
title: Sentiment analysis
description: Build a real use-case box with DistilBERT sentiment analysis model.
outline: [2,3]
---

# Sentiment Analysis demo box

Model: *[DistilBERT SST-2 (ONNX INT8)](https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english)*

> <small> Runtime: **`python`** — the box starts its own interpreter on a declared entry point. </small>

---

Sentiment analysis reads a piece of text and judges the opinion in it. This model is binary: it says
whether a sentence reads as positive or negative, and how confident it is about that.

This demo takes DistilBERT, fine-tuned on SST-2 and quantised to INT8 in ONNX form, and ships it as a
signed, self-contained box.

```text
$ scrollcase run .scrollcase/.../*.release.json \
  -- "This product is surprisingly easy to use."

Sentiment: POSITIVE
Confidence: 99.9%
```

::: info You define what the box should contain, Scrollcase handles it:
No Python environment to prepare, no model to download at run time, no container. The model and everything it needs are inside the box, which runs it in its own environment.
:::

## Try the demo

<Tabs :titles="['GitHub codespaces', 'Pre-built box']">
<Tab title="GitHub codespaces">

### Build it yourself

The demo repository is almost empty on purpose: you package the model yourself, and its README is
the walkthrough. Install the CLI, initialise the workspace, create the scroll, declare the model's
pinned files, lock, commit, sign and build. About fifteen minutes, most of it spent waiting on the
build.

<Button
  href="https://codespaces.new/suffro/scrollcase-e2e-demo-DistilBERT-SST-2-ONNX-INT8?quickstart=1"
  external
>

Open in GitHub Codespaces

</Button>

</Tab>
<Tab title="Pre-built box">

### Download the prebuilt box

Signed boxes for Linux, macOS and Windows are published on the Scrollcase repository. Fetch the public key from the repository, verify, run. This path
needs neither pixi nor a build, and nothing is downloaded while the box runs.

Download the one matching your machine:

|macOS (Apple silicon)|Linux (CPU)|Windows (CPU)|
|--|--|--|
|[`macos-aarch64-cpu`](https://github.com/suffro/scrollcase/releases/download/sentiment-demo-v1/sentiment-demo-1.0.0-macos-aarch64-cpu.zip)|[`linux-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/sentiment-demo-v1/sentiment-demo-1.0.0-linux-x86_64-cpu.zip)|[`windows-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/sentiment-demo-v1/sentiment-demo-1.0.0-windows-x86_64-cpu.zip)|

<Button
  href="https://github.com/suffro/scrollcase/releases/tag/sentiment-demo-v1"
  external
>

Release page

</Button>

::: tip NOTE

The file you download is **NOT** the box — it is a container, named so you can tell which machine it
is for, holding the box together with two ready-to-run examples. The box is the <samp>.zip</samp>
inside it under <samp>box/</samp>, next to its <samp>.release.json</samp>. Do not unzip that one:
it's ready to run. Leave both named as they are and side by side, because that is how `verify` finds
the box.

:::

Unpack it, fetch the key beside it rather than inside it, then verify and run:

```sh
unzip sentiment-demo-1.0.0-<target>.zip -d sentiment-demo
cd sentiment-demo
mkdir keys
curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json

npm install -g scrollcase
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json
scrollcase run    box/*.release.json --public-key keys/example-signing-public.json \
  -- "This product is surprisingly easy to use."
```

The sentence is an argument because the box declares no default one: without it the box answers with
a usage line on stderr rather than classifying something you did not ask about. `run-box.ts` and
`run_box.py` ship in the same folder and pass it for you — `npx tsx run-box.ts`, or with a sentence
of your own as their first argument.

> <small>`box/*.release.json` is a real shell glob, not a placeholder. PowerShell does not expand it
> for a command like this, so use `(Get-ChildItem box\*.release.json).FullName` or type the file name
> you see under `box/`. You never name the box archive: `verify` finds it beside the release
> document, under the hash that document commits to.</small>

</Tab>
</Tabs>

## What the demo shows

**A signed release, verified before execution.** The release document commits to the archive by
size and SHA-256, and the archive's filename *is* its content hash. `verify` checks the signature
against a public key you obtain independently of the download.

**The model travels inside the box.** The ONNX weights, the tokenizer and the config are declared
as assets pinned to an immutable upstream commit, each with its size and SHA-256. The build fetches
them once and fails if a byte moved. Embedded by default, they are packed into the archive, so
the box installs and runs air-gapped.

**Defence in depth against a stray download.** The scroll declares `HF_HUB_OFFLINE=1`,
`TRANSFORMERS_OFFLINE=1` and `TOKENIZERS_PARALLELISM=false`, and those values are signed into the
release and override the host environment. This matters in practice: `tokenizers` pulls
`huggingface_hub` in transitively, so a downloader *is* present in the environment — the guarantee
comes from the entrypoint importing no client and from the signed environment, not from absence.

**A locked, audited environment.** `lock` resolves the four conda dependencies into a `pixi.lock`,
and the build installs only from it — nothing is resolved while building. `audit` derives the
licence inventory from that same lock, and the build recomputes it and fails on any difference, so
a dependency whose licence changed is caught when it changes rather than at the end of a
multi-gigabyte build.

**A self-test at two levels.** `selfTest.imports` is the part schema v2 signs, which is why
`verify --self-test` can repeat it later with the box's own interpreter. `files` and the optional
`code` block stay builder-only: add `code` and the build runs real predictions and
refuses to sign a box that answers wrong. Proof of real inference for a box you downloaded is what
`run` gives you.

**More than one way to call it.** The CLI; the `run-box.ts` and `run_box.py` that ship beside the
downloaded box; and, in a workspace of your own, the Node, Python and Rust consumer templates `init`
writes under `consumer-templates/`. Whichever starts it, the two lines above are the whole of stdout
— progress, diagnostics and failures go to stderr — so `… > verdict.txt` is a file with the verdict
in it and nothing else.

## What you write

Three CPU targets that package the same model agree about everything except the target itself, so
the demo is a [split scroll](/reference/scroll#one-box-several-targets):

```text
examples/sentiment-demo/
  scroll.json                      # everything the three targets share
  shared/                          # entrypoint, model notice, Apache-2.0 text
  linux-x86_64-cpu/scroll.json     # extends + target + its licence audit path
  macos-aarch64-cpu/scroll.json
  windows-x86_64-cpu/scroll.json
```

The base carries the identity, the three model files as commit-pinned assets with their sizes and
SHA-256, the offline environment, the self-test and the licence files to carry into the box. Each
target file is nine lines. A change to the model is one edit, not three.

Beside every target sits its own **`pixi.toml`** — four conda dependencies: `python`,
`onnxruntime`, `tokenizers`, `numpy` — because the solved environment is what genuinely differs.
`lock` and `audit` then write `pixi.lock` and `conda-licenses.json` next to it.

No hash is typed by hand anywhere. `scrollcase add asset` fetches each model file once and records
the size and SHA-256 it found; the notices and the entrypoint are pinned, and
[`scrollcase refresh`](/reference/cli#refresh) moves those digests after a reviewed change.

The scroll embeds its assets, declares a 2 GB RAM floor, and names `execution` as a `python-script`.

## Measured

The box has been built, self-tested, verified and run on all three CPU targets — Linux, macOS and
Windows — and a rebuild produces a byte-identical archive. On Apple Silicon the archive is about
192 MiB, almost all of it model. It answers the sentence above `POSITIVE` at 99.9% confidence, and
*This was a frustrating and disappointing experience.* `NEGATIVE` at 100.0%.

## Scope and limitations

This is a **demonstration of packaging**, not a sentiment product. The model reads short **English**
sentences and answers `POSITIVE` or `NEGATIVE`; input beyond 128 tokens is truncated. Its model
card documents biases inherited from the training data, including predictions that differ
systematically for sentences mentioning underrepresented populations, and INT8 quantisation does
not remove them. Do not use it for decisions about people.

- [Original model card and limitations](https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english#risks-limitations-and-biases)
- [ONNX conversion, pinned revision](https://huggingface.co/onnx-community/distilbert-base-uncased-finetuned-sst-2-english-ONNX/commit/fd49941c1b822846cb14970cdf430a7cfbe0f5b9)

The original checkpoint is Apache-2.0; the community conversion is attributed separately, and every
box ships the full licence text next to the model notice.
