---
title: Transcode
description: A native box carrying ffmpeg and everything it links against, pinned and signed.
outline: [2,3]
---

# Transcode demo box

<big> **ffmpeg, pinned and signed, on a machine that has none** </big>

> <small> Runtime: **`native`** — no interpreter at all; the binary *is* the command line. </small>

---

This is the case the `native` runtime exists for: a large compiled program where "just install it"
means a different version on every machine, and a different answer from each.

The box pins one ffmpeg, carries the ninety-odd libraries it links against, and is signed — so the
transcode a user runs is the transcode that was tested. 121 MB archived, 391 MB extracted, which is
the honest cost of "just install ffmpeg" made visible.

```text
$ scrollcase run box/*.release.json -- -i input.mov -c:v libx264 -crf 20 output.mp4
```

::: warning This box is where licensing stops being abstract
Twenty-one of its ninety packages are GPL-family, including ffmpeg, `x264` and `x265` at
GPL-2.0-or-later. Anyone redistributing the box needs that inventory before shipping, and
`scrollcase audit` derives it from the lock.
:::

## Try the demo

<Tabs :titles="['GitHub codespaces', 'Pre-built box']">
<Tab title="GitHub codespaces">

### Build it yourself

The demo repository is almost empty on purpose: you package ffmpeg yourself, and its README is the
walkthrough. Install the CLI, initialise the workspace, create the scroll, declare the dependency,
lock, commit, sign and build.

<Button
  href="https://codespaces.new/suffro/scrollcase-e2e-demo-ffmpeg?quickstart=1"
  external
>

Open in GitHub Codespaces

</Button>

> <small> *Builds the Linux x86_64 CPU box using your GitHub Codespaces account.* </small>

</Tab>
<Tab title="Pre-built box">

### Download the prebuilt box

> You can find the box's **GitHub release** [here](https://github.com/suffro/scrollcase/releases/tag/transcode-demo-v1).

|macOS (Metal)|Linux (CPU)|Windows (CPU)|
|--|--|--|
|[`macos-aarch64-metal`](https://github.com/suffro/scrollcase/releases/download/transcode-demo-v1/transcode-demo-1.0.0-macos-aarch64-metal.zip)|[`linux-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/transcode-demo-v1/transcode-demo-1.0.0-linux-x86_64-cpu.zip)|[`windows-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/transcode-demo-v1/transcode-demo-1.0.0-windows-x86_64-cpu.zip)|

The trust key is deliberately not inside the archive — a signature proves nothing if the key travels
with what it signs:

```sh
unzip transcode-demo-1.0.0-<target>.zip -d transcode-demo && cd transcode-demo
mkdir keys && curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json

npm install -g scrollcase
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json
scrollcase run    box/*.release.json --public-key keys/example-signing-public.json -- -version
```

Everything after `--` goes to ffmpeg. The box always passes `-hide_banner` first, because that is
its declared `defaultArgs`.

</Tab>
</Tabs>

## The self-test runs a real encode

Its probes do not check a version string. They synthesise a test pattern through `lavfi`, encode it
with `libx264` and discard the result — so a box whose codecs did not load fails the build, before
anything is signed.

A third probe declares `expectExitCode: 254`, which is the point rather than a curiosity: ffmpeg
reports the negative C error number for a missing input, `ENOENT` is 2, and an exit status is one
byte. The value was measured against the built payload, not assumed — a self-test asserts the
binary's real contract, not a convention.

That probe is declared in the macOS and Linux scrolls rather than in the base the three share,
because the one-byte exit status it depends on is a POSIX fact: the format caps `expectExitCode` at
255, and Windows exit codes are 32-bit. It is a probe the Windows box does not run, rather than one
it runs weakly — and a good illustration of why a split scroll keeps per-target facts per target.

## What a native box will not do for you

Scrollcase does not repair a binary's library paths. A program that finds its libraries through an
absolute path recorded at compile time will not find them inside a box, and the self-test catches
that at build time rather than shipping it. The first native example written here failed on
conda-forge's own `ncurses`, which carries an unrewritten build-machine path to `libtinfo`.

::: tip The other shapes
[`dataset-demo`](/demos/dataset-demo) is the second `native` box, and
[`codon-demo`](/demos/codon-demo) is the `node` one.
:::
