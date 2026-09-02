---
title: Box development
description: Quick demo to learn how to develop a box with Scrollcase.
outline: [2,3]
runtime: python
---

# Box development demo

<big> **Build, verify and run a real box from an empty project** </big>

> <small> Runtime: **`python`** — a stdlib-only Python 3.11 environment inside the box. </small>

## Try it now

This is the whole path end to end — from an empty directory to a signed box you built and then ran,
with nothing prepared in advance. If you only want to run a box somebody else signed, that is the
shorter [box-run demo](/demos/box-run-demo).

Open it in **GitHub Codespaces** for an instant VM with a clean repository and a walkthrough to
follow:

<Button
  href="https://codespaces.new/suffro/scrollcase-build-demo-codespace?quickstart=1"
  external
>

Open in GitHub Codespaces

</Button>

> <small>*A real Linux x86_64 CPU build. It downloads the project toolchain and the locked Python
> environment, so allow a few minutes. Codespaces runs on your GitHub account.*</small>

## What the demo does

The demo uses the disposable `example-box` created by `scrollcase init`. It contains only Python
and a small entry point, keeping the result easy to understand while still exercising the real
pipeline:

```text
init → lock → commit → keygen → build → verify → run
```

Which is five short steps:

1. install the CLI and initialize the project-local toolchain;
2. resolve `pixi.lock` and commit the generated project;
3. create a local signing key and build the box;
4. verify the signed release and run its self-test with the box's own Python;
5. run the box, and watch its own interpreter execute the entry point.

Nothing is prebuilt. The Codespace only prepares the disposable Linux machine, Node.js and Git; the
Scrollcase commands and their output remain yours to type and read.

## Follow it in Codespaces

The Codespace starts as an empty Scrollcase project inside a Git repository. Open its terminal and
follow the rendered README, or run the essential sequence directly:

```sh
npm install --global scrollcase
scrollcase init --install-toolchain < /dev/null
scrollcase lock example-box/linux-x86_64-cpu

git add .
git commit -m "Initialize Scrollcase example"

scrollcase keygen
scrollcase build example-box/linux-x86_64-cpu

release=.scrollcase/dist/boxes/example-box/1.0.0/linux-x86_64-cpu/*.release.json
scrollcase verify $release --self-test
scrollcase run    $release
```

Redirecting `init` from `/dev/null` keeps this walkthrough non-interactive: the required toolchain
is installed because `--install-toolchain` explicitly authorizes it, while the optional Node,
Python, and Rust consumer packages are skipped. Their ready-to-customize templates are still written under
`consumer-templates/`.

The commit is not ceremony. Every box records the exact Git revision it came from, and `build`
refuses a dirty tree unless that loss of reproducibility is explicitly accepted.

::: warning Demo signing key
`scrollcase keygen` creates a local key for this disposable walkthrough. Its private half stays
under the ignored `.scrollcase/` directory. Production signing and key rotation need deliberate
custody — see [Signing & Key Custody](/guides/signing-and-custody).
:::

## What the last two commands prove

`verify` checks the trusted signature, archive size and SHA-256, safe entry names, and agreement
between the signed release and the box manifest. `--self-test` then extracts the box to a temporary
directory and exercises its declared imports with the Python interpreter contained in the box.

`run` closes the loop: it repeats those checks, extracts to a temporary directory, and executes the
entry point with that same interpreter — the box you just built, doing what it was built to do. This
is the end the [box-run demo](/demos/box-run-demo) starts from, on a box somebody else signed.

At that point you have produced the two files a consumer needs:

```text
.scrollcase/dist/boxes/example-box/1.0.0/linux-x86_64-cpu/
├── <archive sha256>.zip
└── <document sha256>.release.json
```

The archive is the box. Its signed release document identifies it and commits to its bytes; keep
them side by side so `verify`, `run`, or a consumer API can resolve the archive from the release.

## Go further

- To create real project metadata, targets, assets, and execution settings, use
  [`scrollcase new scroll`](/reference/cli#new).
- `doctor` and `audit` are intentionally outside this short demo; see the complete
  [Quickstart](/getting-started/quickstart) and [CLI reference](/reference/cli).
- To run the result from an application, start with the generated templates and the
  [Library APIs reference](/reference/api/).
