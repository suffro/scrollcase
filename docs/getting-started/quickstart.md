---
title: Quickstart
description: From an empty directory to a signed, verified box through workspace setup and guided authoring.
---

# Quickstart

This walkthrough goes from an empty directory to a signed, verified box on disk. The guided
authoring step creates a library-only Python environment, so it remains small enough to inspect by
hand while exercising the complete packaging and signing pipeline.

Prerequisites: the CLI and toolchain from [Installation](/getting-started/installation).

<div class="collapse-element">

## Try a demo

</div>

::: info Before that

<br>

<div style="font-size: 20px;">

**You can try a Scrollcase demo**

</div>

Each demo showcases different features and use cases to help you understand how to leverage Scrollcase in your projects.

<Spacer />

<Button
  href="/demos"
>

Try a demo

</Button>

<Spacer />

:::

## 1. Create a project

A box records the commit it was built from, so a Scrollcase project **must be a git checkout** —
building outside one fails rather than inventing a revision.

```sh
mkdir my-boxes && cd my-boxes
git init
```

## 2. Install the CLI

```sh
npm install -g scrollcase
```

Check the install:

```sh
scrollcase --version
```

For more details check the [installation page](/getting-started/installation).


## 3. `init` — initialize the workspace

```sh
scrollcase init
```

`init` writes the workspace plus a disposable runnable example, and never overwrites anything that
already exists:

- `scrollcase.config.json` — the [workspace declaration](/reference/configuration): where scrolls
  live and where builds, artefacts and keys go.
- `scrolls/example-box/<native-target>/` — a complete v2 scroll and pixi manifest for the native
  host: Metal on Apple Silicon, CPU on Linux and Windows.
- `box-entrypoints/example-box/<native-target>/entrypoint.py` — the application executed inside
  that box and target.
- `consumer-templates/run-box.ts` — a typed Node consumer using `scrollcase/consumer`.
- `consumer-templates/run_box.py` — the equivalent Python consumer using `scrollcase_consumer`.
- `consumer-templates/rust/` — the equivalent Rust consumer as a small Cargo crate.
- `package.json` — when absent, a private Node package with `"type": "module"` for the TypeScript
  consumer; an existing package file is never overwritten.
- `SCROLLCASE.md` — a short project-local workflow guide linked to the full documentation.
- `.gitignore` rules for `.scrollcase/`, the regenerated build state that must never be
  committed.

Then, if `pixi` or `conda-pack` is missing, `init` **asks** whether to install it:

```text
Install pixi and conda-pack into /work/my-boxes/.scrollcase/toolchain?
This project needs them to build a box:
 ↳ [Y/n]
```

Answer yes and both land inside the project, with the pixi download checksum-verified and
conda-pack pinned to 0.9.2. Answer no and nothing is downloaded — install them yourself as
described in [Installation](/getting-started/installation). Either way `init` never downloads
anything you did not agree to, which is what makes it safe to re-run.

Because the example includes consumer templates, `init` asks separately whether to install
`scrollcase`, `typescript`, and `tsx`, whether to install the Python `scrollcase-consumer` package,
and whether to add the Rust crate to the generated Cargo manifest. For Python you choose PyPI with
pip or conda-forge with conda. It collects all answers before starting any installation, with a
blank line separating each question. Interactive yes/no questions default to yes (`[Y/n]`);
without a terminal these optional installs remain no. If Conda is unavailable after selecting
conda-forge, a separate default-yes question offers to continue with PyPI.

Use `--install-toolchain` or `--no-install-toolchain` to answer up front in a script. Pass
`--no-example` when an explicitly empty workspace is preferable.

It finishes with:

```text
✓ Workspace initialized
→ Example: scrollcase lock example-box/macos-aarch64-metal
→ Create your own: scrollcase new scroll
```

## 4. `new scroll` — optionally author your own target

```sh
scrollcase new scroll
```

The generated example is already ready for the remaining walkthrough steps, so you can skip this
command for a first build. Use the wizard for real project metadata. It asks four questions — the
complete target, the box id, the upstream revision of what you are packaging, and the base URL
boxes will be published under — plus menus for weights mode and execution kind. Each one is printed
as its own block: a blank line, the field's name, one line saying what the field is, then the answer
typed after ` ↳ `. Everything else has a default and is available as a flag. A blank answer to a
required question repeats it rather than ending the session.

It creates `scrolls/<boxId>/<targetId>/` with `scroll.json`, the matching `pixi.toml` and a starter
`self_test.py`, then prints the exact reference to use next.

For CI or another non-terminal caller, provide the equivalent flags shown by
`scrollcase help`. Missing input that has no default fails before any file is written.

## 5. `doctor` — check the machine

```sh
scrollcase doctor --scroll example-box/macos-aarch64-metal
```

Every failing check comes with a remedy. Fix what it names and re-run; `doctor` never modifies
anything, so it is always safe.

::: info Scroll references
The exact reference is `<boxId>/<targetId>` under `scrolls/` — here
`example-box/macos-aarch64-metal`, assuming an Apple Silicon Mac. Substitute the example reference
printed by `init`, or the reference printed by `new scroll`, throughout. You may also pass `example-box --target
macos-aarch64-metal`.
:::

## 6. `lock` — resolve dependencies, once

```sh
scrollcase lock example-box/macos-aarch64-metal
```

`lock` runs the pinned pixi against the scroll's `pixi.toml` and writes `pixi.lock` next to it.
This is the only step that resolves anything: `build` later *installs* exactly what the lock
pins, and never resolves. Commit the lock — it is what makes a build reproducible and what the
licence audit reads.

```sh
git add . && git commit -m "Example box scroll and lock"
```

Committing now also matters for the next steps: `build` refuses a dirty tree without
`--allow-dirty`, because an artefact built from uncommitted changes is reproducible by nobody.

After the build, the three templates under `consumer-templates/` show how an application can run the
local signed release through the Node, Python, or Rust public consumer API. Replace the `<target>`
and `<hash>` placeholders in the chosen template, then follow its setup and run instructions. The
corresponding consumer package must be installed in the application that runs the template.

For Python, npm does not install `scrollcase_consumer`. The generated template includes the complete
setup; the equivalent commands are:

```sh
python -m pip install scrollcase-consumer
python consumer-templates/run_box.py
```

A Python consumer-only application does not need the Scrollcase CLI or Node.js.

For Rust, the generated crate includes the equivalent commands:

```sh
cargo add --manifest-path consumer-templates/rust/Cargo.toml scrollcase-consumer
cargo run --manifest-path consumer-templates/rust/Cargo.toml
```

## 7. `keygen` — create a signing key

```sh
scrollcase keygen
```

This writes a private ed25519 key (`.scrollcase/keys/signing-private.pem`, owner-only
permissions) and the matching public key file (`signing-public.json`). Every document the build
emits is signed; `verify` checks signatures against the public key file. For production custody —
a KMS, an HSM — see [Signing & Key Custody](/guides/signing-and-custody).

## 8. `build` — install, self-test, archive, sign

```sh
scrollcase build example-box/macos-aarch64-metal
```

The pipeline, in order: install the locked environment, pack and relocate it with conda-pack,
stage declared assets, prune, self-test **with the interpreter inside the box**, normalise
timestamps, zip deterministically, and sign. The result lands in `.scrollcase/dist/`:

```text
.scrollcase/dist/
├── boxes/example-box/1.0.0/macos-aarch64-metal/   # upload this tree as it stands
│   ├── <archive sha256>.zip                       # the box archive
│   └── <document sha256>.release.json             # signed release document
└── channels/example-box/beta/macos-aarch64-metal.json   # signed channel pointer
```

The build prints both paths and what to do with each. Files are named for their own hash because
that is the name they are published under — see [Distributing Boxes](/guides/distributing-boxes).

Rebuilding the same commit produces a byte-identical archive — see
[Architecture](/concepts/architecture#determinism) for what makes that true.

## 9. `verify` — prove what you built

```sh
scrollcase verify .scrollcase/dist/boxes/example-box/1.0.0/macos-aarch64-metal/*.release.json --self-test
```

`verify` mirrors the format checks available to an installing client: trusted signature, archive
size and SHA-256, safe entry names, recursive agreement between `box.json` and the signed release,
and the declared interpreter. With `--self-test` it extracts to a temporary directory and imports
the signed modules **with the box's own Python**. Scroll-only `pythonCode` and file assertions ran
on the builder but are not carried by the signed release.

## Where to go next

- Package something real: declare model weights and data files —
  [Managing Model Weights](/guides/managing-weights).
- Understand every field you just used: [The Scroll](/reference/scroll) and
  [CLI Commands](/reference/cli).
- Review dependency licences before building: run `scrollcase audit <scroll>` — see
  [CLI Commands](/reference/cli#audit).
- See how the whole pipeline fits together: [Architecture](/concepts/architecture).

The repository also ships a proven example,
[`examples/hello-box`](https://github.com/suffro/scrollcase/tree/main/examples/hello-box), with a
committed lock per target — the same walkthrough with nothing left to fill in, and a worked
[split scroll](/reference/scroll#one-box-several-targets): one base file plus a short fragment for
each of its three targets.
