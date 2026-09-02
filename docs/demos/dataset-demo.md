---
title: Dataset
description: A native box that fixes the reader, so a published inspection is a repeatable one.
outline: [2,3]
---

# Dataset demo box

<big> **A signed reader, so a published inspection is one anybody can repeat** </big>

> <small> Runtime: **`native`** — no interpreter at all; the binary *is* the command line. </small>

---

The second `native` box, and a different shape from [`transcode-demo`](/demos/transcode-demo): small
compiled tools reading a data file the box itself ships, rather than one large program driven by
flags.

It carries the HDF5 command-line tools and `readings.h5`, pinned by hash. The case it answers is not
*"I cannot install this"* but **"we must all read this file the same way"** — a signed box fixes the
reader, so an inspection somebody publishes is one anybody can repeat. 36 MB archived.

```text
$ scrollcase run box/*.release.json -- -H readings.h5
```

## Try the demo

<Tabs :titles="['GitHub codespaces', 'Pre-built box']">
<Tab title="GitHub codespaces">

### Build it yourself

The demo repository is almost empty on purpose: you package the tools and the dataset yourself, and
its README is the walkthrough. Install the CLI, initialise the workspace, create the scroll, declare
the dependency and the data file, lock, commit, sign and build.

<Button
  href="https://codespaces.new/suffro/scrollcase-e2e-demo-hdf5?quickstart=1"
  external
>

Open in GitHub Codespaces

</Button>

> <small> *Builds the Linux x86_64 CPU box using your GitHub Codespaces account.* </small>

</Tab>
<Tab title="Pre-built box">

### Download the prebuilt box

> You can find the box's **GitHub release** [here](https://github.com/suffro/scrollcase/releases/tag/dataset-demo-v1).

|macOS (Metal)|Linux (CPU)|Windows (CPU)|
|--|--|--|
|[`macos-aarch64-metal`](https://github.com/suffro/scrollcase/releases/download/dataset-demo-v1/dataset-demo-1.0.0-macos-aarch64-metal.zip)|[`linux-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/dataset-demo-v1/dataset-demo-1.0.0-linux-x86_64-cpu.zip)|[`windows-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/dataset-demo-v1/dataset-demo-1.0.0-windows-x86_64-cpu.zip)|

The trust key is deliberately not inside the archive — a signature proves nothing if the key travels
with what it signs:

```sh
unzip dataset-demo-1.0.0-<target>.zip -d dataset-demo && cd dataset-demo
mkdir keys && curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json

npm install -g scrollcase
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json
scrollcase run    box/*.release.json --public-key keys/example-signing-public.json -- -H readings.h5
```

`readings.h5` there is a path **inside the box**, not on your machine. Point `h5dump` at a file of
your own by giving an absolute path instead.

</Tab>
</Tabs>

## The dataset is regenerable, not magic

`readings.h5` is pinned by SHA-256, and the text it was generated from plus the `h5import` config
that built it ship beside it in the repository, under `examples/dataset-demo/shared/`. The
self-test reads the shipped dataset both ways — structure and values — so a box whose data or whose
reader stopped agreeing fails the build.

## Why not a bioinformatics tool

It was meant to be one, and conda-forge is the reason it is not. `samtools`, `bwa`, `seqkit`,
`minimap2`, `hmmer`, `diamond`, `blast`, `muscle` and `fasttree` are all on **bioconda**, a second
channel an example has no business introducing.

`mafft`, the one that is on conda-forge, **fails as a `native` box**: its `venv/bin/mafft` is a shell
wrapper carrying the path of the machine that built the conda package. The self-test caught it before
anything was signed. The lesson is worth keeping — check what a program *is* before packing it: a
wrapper script does not relocate, a compiled binary does.

::: tip The other shapes
[`transcode-demo`](/demos/transcode-demo) is the other `native` box, and
[`codon-demo`](/demos/codon-demo) is the `node` one.
:::
