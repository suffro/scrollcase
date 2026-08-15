---
title: Overview
description: What Scrollcase is for, what a box contains, and the shape of the workflow — in one page.
---

# Overview

## The main concept

- Scrollcase packs an entire Python environment and the code it runs — like an **LLM** or a **scientific model** — into a single, **self-contained**, **portable** and **signed** archive: a **box**.

- You give that box to someone else. They unpack it and run it — **that's it!** <spacer /> **Nothing to install**: no Python, no <kbd><small>pip install</small></kbd>, no compiler, no Docker, **no dependencies to maintain**.

- Every box is **signed**, so whoever receives it can check that it is exactly the one you built and not something that changed on the way over.

- Builds are **deterministic**: rebuilding the same commit gives the same bytes back — anyone can reproduce what you shipped.

This is the whole idea.

## The problem it removes

Getting a Python runtime onto someone else's machine normally means asking them to rebuild your
environment: the right Python, the right libraries, the right native builds for their CPU or GPU,
the right weights downloaded from the right place. It works until it doesn't — and it breaks on
their machine, not yours. Scrollcase moves that work to build time, once, on a machine you control,
and turns the result into a file.

> <small> The rest of this page is a quick overview of how it works </small>

## What is inside a box

| Entity | What's inside |
| --- | --- |
| **Python interpreter** | The exact version you chose. The host does not need Python at all. |
| **Every dependency** | Conda and PyPI packages, native libraries included, at the versions your lock file pinned. |
| **Your code** | Application files, an entry script or module to start. |
| **Model files** | Embedded in the archive, or kept outside it with their size and hash recorded. |
| **Signed metadata** | What this box is, what it contains, and its digest — so a consumer can reject anything else. |
| **Licence inventory** | Every dependency's licence, derived from the lock, not guessed. |

A box is built for **one target**: one operating system, one CPU architecture, one accelerator.
`macos-aarch64-metal` and `linux-x86_64-cuda12` are two boxes, not one box with options. That is
deliberate — a box that promised to work everywhere would have to decide things at install time,
which is the problem being removed.

## Who does what

<Tabs :titles="['The Developer','Scrollcase','The Consuming Application']">
<Tab title="The Developer">

The person or team packaging the thing.

- describes the environment in a **scroll**;
- declares dependencies, files, and model assets;
- chooses the target;
- runs `lock` and `build`;
- publishes the resulting files wherever they like.

</Tab>
<Tab title="Scrollcase">

The build.

Creates the environment from the lock, downloads and hash-checks declared assets, makes the tree
relocatable, copies your files in, runs the tests the scroll declares, produces the archive,
computes the hashes, writes the release documents, and signs them.

The developer does not run those steps one by one, and does not repair environment paths, write
manifests, or sign files by hand.

</Tab>
<Tab title="The Consuming Application">

The application that installs and uses the box.

- picks the right box for the user's machine;
- downloads it;
- hands the local release, archive, and trust keys to a conforming consumer;
- owns updates, activation, rollback, and removal.

The official Node, Python, and Rust consumers verify, safely extract, and run a local box the caller
already holds. They do not choose channels and they do not download.

</Tab>
</Tabs>

## The workflow

Six steps, once. After that, shipping a new version is usually a single `build`.

### 1. Initialise the workspace

```bash
scrollcase init
```

Creates the project structure and — after asking, defaulting to yes — a disposable runnable
`example-box` for your own machine, a short `SCROLLCASE.md`, and TypeScript, Python, and Rust
examples under `consumer-templates/`. Pass `--no-example` for an empty workspace.

### 2. Create a scroll

```bash
scrollcase new scroll
```

Asks four questions — target, box id, the upstream revision of what you are packaging, and where
boxes will be published — and writes one target-specific `scroll.json`, its `pixi.toml`, and a
starter `self_test.py`. Nothing existing is overwritten. To just look around first, use the example
`init` created. → [Scroll reference](/reference/scroll)

### 3. Declare what goes in

Everything the scroll declares is added by command, not by hand-editing files:

```bash
scrollcase add dep   my-model onnxruntime                    # a dependency
scrollcase add asset my-model https://…/model.safetensors    # downloads once, records size and hash
scrollcase add file  my-model runtime/entrypoint.py          # a file from this project
```

`remove`, `edit scroll`, and `refresh` are the counterparts.
→ [CLI reference](/reference/cli#add)

### 4. Lock the versions

```bash
scrollcase lock my-model/macos-aarch64-metal
```

Resolves the dependencies once into a `pixi.lock` you commit to Git. From then on the build
*installs* — it never resolves — which is what makes two builds of the same commit produce the same
bytes.

Re-run `lock` when a dependency changes, and only then. → [Why pixi](/concepts/why-pixi)

### 5. Get a signing key

```bash
scrollcase keygen
```

Creates the key pair used to sign releases. The private key never goes into the repository; the
public key goes to the consuming application, which is how it can tell your box from anyone else's.
Real key custody — a KMS, an HSM, a signing service — plugs in instead of the local key.
→ [Signing and key custody](/guides/signing-and-custody)

### 6. Build

```bash
scrollcase doctor --scroll my-model/macos-aarch64-metal   # optional: can this machine build it?
scrollcase build  my-model/macos-aarch64-metal
```

The build must run on a machine compatible with the target. It produces the box archive, the signed
release and channel documents, and a publication-ready directory tree.

If a declared import fails, an asset hash does not match, or a parity check breaches its tolerance,
there is no box. A failed gate never produces a signed artefact.

## Running a box

For a one-shot run from the terminal:

```bash
scrollcase run ./release.json --archive ./box.zip -- --help
```

It verifies first, runs the signed script or module without a shell, preserves the child's exit
status, and removes its temporary extraction.

An application does the same thing through a library: the Node API at `scrollcase/consumer`, the
Python package `scrollcase_consumer`, or the Rust crate `scrollcase-consumer`. All three share the
same verification, safe extraction, execution, receipt, signal, cleanup, and on-demand asset
semantics, and none of them downloads anything.

An application that keeps a box extracted across restarts re-attaches to it rather than unpacking
again. → [Library APIs](/reference/api) ·
[Keeping an extracted box](/guides/distributing-boxes#keeping-an-extracted-box-across-restarts)

## Publishing

Scrollcase writes files and stops. Uploading them is yours to do — by hand, with a script, from
CI/CD, or through an object-storage pipeline.

```text
Scrollcase builds the files
↓
your deployment system uploads them
↓
your application downloads, verifies, and runs them
```

This boundary is the reason the format works with object storage, GitHub Releases, a private
server, or a desktop updater you already have.
→ [Distributing boxes](/guides/distributing-boxes)

## Shipping a new version

| What changed | What to run |
| --- | --- |
| Code or included files | bump the version, `build` |
| Dependencies | `lock`, review the result, `build` |
| Model weights | update the asset in the scroll, bump the version, `build` |

Several targets mean several builds, each on a machine compatible with its target — and that, rather
than Scrollcase itself, is usually where a wide platform matrix gets expensive.
→ [Platform examples](/guides/platform-examples)

## What the consuming application still owns

Scrollcase builds the box; it does not implement the application around it. That application
detects the machine, chooses a release, downloads the manifests and archive, verifies the
signatures, checks runtime requirements, extracts the box, fetches any on-demand assets, starts the
runtime, and handles updates and uninstallation.

The official consumers cover verification, extraction, and execution. Selection, download, and
update policy stay with the product — see [Why Scrollcase?](/getting-started/why-scrollcase) for
why that line is drawn where it is.

For the end user, the point is that none of it is visible: they pick a feature, press install, and
the application does the rest.

## Is it complicated?

Conceptually, no:

```text
describe the environment
↓
lock the versions
↓
build the box
↓
publish the files
```

In practice the difficulty comes from the environment you are packaging, not from the tool:
awkward native libraries, old scientific packages, several CUDA versions, very large weights, a
dependency that is not on a supported channel. Scrollcase does not make those disappear — it makes
them a build-time problem you solve once, instead of a support ticket from every user.

## Try a demo

Each demo showcases different features and use cases to help you understand how to leverage Scrollcase in your projects.

<Button
  href="/demos"
>

Scrollcase demos

</Button>

## Next

- [TL;DR](/getting-started/tl-dr) — the same thing in a page you can read in a minute.
- [Quickstart](/getting-started/quickstart) — build the example box now.
- [Why Scrollcase?](/getting-started/why-scrollcase) — and when a simpler tool is the better choice.
- [Try a demo](/demos/) — worked examples that show different features and use cases, and how to put Scrollcase to work in your own project.
