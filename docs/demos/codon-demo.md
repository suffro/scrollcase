---
title: Genetic code
description: A node box that ships reference data and the tool that queries it, signed together.
outline: [2,3]
runtime: node
---

# Genetic code demo box

<big> **A box that carries reference data and the tool that queries it** </big>

> <small> Runtime: **`node`** — the interpreter inside this box is Node 26, not Python. </small>

---

This demo proves a box can carry data and be trusted to answer
from it.

It ships the standard genetic code — NCBI translation table 1 — and the tool that queries it. The
recipient needs neither Node, nor npm, nor a database: the box carries its own interpreter, its own
data, and the code that joins them.

```text
$ scrollcase run box/*.release.json -- Leucine

Leucine (Leu, L)
  UUA  UUG  CUU  CUC  CUA  CUG
```

::: info Two constraints this demo documents by example
A `node` box cannot declare an npm dependency — Scrollcase solves from conda-forge and nothing else.
The tool uses `node:sqlite`, which is part of Node itself, and the JavaScript enters through
`localFiles`. And it pins Node 26, because `node:sqlite` needs a recent Node to work without a flag.
:::

## Try the demo

<Tabs :titles="['GitHub codespaces', 'Pre-built box']">
<Tab title="GitHub codespaces">

### Build it yourself

The demo repository is almost empty on purpose: you package the data and the tool yourself, and its
README is the walkthrough. Install the CLI, initialise the workspace, create the scroll, declare the
files, lock, commit, sign and build.

<Button
  href="https://codespaces.new/suffro/scrollcase-e2e-demo-genetic-code?quickstart=1"
  external
>

Open in GitHub Codespaces

</Button>

> <small> *Builds the Linux x86_64 CPU box using your GitHub Codespaces account.* </small>

</Tab>
<Tab title="Pre-built box">

### Download the prebuilt box

> You can find the box's **GitHub release** [here](https://github.com/suffro/scrollcase/releases/tag/codon-demo-v1).

|macOS (Metal)|Linux (CPU)|Windows (CPU)|
|--|--|--|
|[`macos-aarch64-metal`](https://github.com/suffro/scrollcase/releases/download/codon-demo-v1/codon-demo-1.0.0-macos-aarch64-metal.zip)|[`linux-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/codon-demo-v1/codon-demo-1.0.0-linux-x86_64-cpu.zip)|[`windows-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/codon-demo-v1/codon-demo-1.0.0-windows-x86_64-cpu.zip)|

The trust key is deliberately not inside the archive — a signature proves nothing if the key travels
with what it signs:

```sh
unzip codon-demo-1.0.0-<target>.zip -d codon-demo && cd codon-demo
mkdir keys && curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json

npm install -g scrollcase
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json
scrollcase run    box/*.release.json --public-key keys/example-signing-public.json -- ATG
```

</Tab>
</Tabs>

## What it answers

| Command | Answer |
| --- | --- |
| `run` with no arguments | what the box carries |
| `run -- ATG` | the amino acid that codon encodes |
| `run -- Leucine` | every codon for that amino acid |
| `run -- ZZZ` | nothing, and exit status 1 |

RNA is accepted alongside DNA, so `UUG` and `TTG` give the same answer.

## Why the data is pinned

`codons.csv` is declared in the scroll with its SHA-256. Appending one fabricated row fails the
build — `Local box file SHA-256 mismatch` — before anything is packed or signed. That is the point of
a box that answers questions: the data it answers from is fixed at the moment it was signed.

::: tip The two `native` demos are the other half of this story
[`transcode-demo`](/demos/transcode-demo) and [`dataset-demo`](/demos/dataset-demo) carry no
interpreter at all.
:::
