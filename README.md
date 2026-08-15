
<p align="center">
  <img src="https://scrollcase.dev/static/png/labeled/neutral-colored.png" alt="Scrollcase logo" width="220">
</p>

<p align="center"><b>Ship a Python program — code, dependencies, interpreter and model weights — as one
file that runs on someone else's machine.</b></p>

You describe what your program needs in a small file. [**Scrollcase**](https://scrollcase.dev) builds
a **box**: a single archive holding a complete, locked Python environment for one operating system
and one accelerator.

Whoever receives that box does not install dependencies, does not run Docker, and does not need
Python on the machine. They unpack it and run it. And because every box ships with a signature, they
can prove it is exactly the thing you built, byte for byte — before anything inside it executes.

```sh
npm install -g scrollcase
scrollcase init                                  # a workspace and a runnable example box
scrollcase keygen                                # a local signing key
scrollcase lock  example-box/macos-aarch64-metal # resolve the dependencies, once
scrollcase build example-box/macos-aarch64-metal # install, self-test, archive, sign
scrollcase run   <release.json>                  # verify, unpack, run, clean up
```

That target is an Apple Silicon Mac; `init` prints the one for your machine. The example builds in
about a minute and needs no model, no GPU and no account. Start at the
[Quickstart](https://scrollcase.dev/getting-started/quickstart) or the
[TL;DR](https://scrollcase.dev/getting-started/tl-dr).

## Why you would want one

- **The target machine installs nothing.** No package resolution, no compiler, no container runtime.
- **The same build twice gives the same file.** Byte-identical, so a mismatch means something
  actually changed.
- **It cannot be swapped underneath you.** Signature, size and hash are checked before the box runs.
- **It works offline.** Download once, carry it across, run it on an air-gapped workstation.
- **You know what is inside.** Every box carries a licence inventory and the commit it was built
  from.

Deciding whether this is the right tool at all — versus Docker, pixi, conda-pack, PEX or PyInstaller
— is answered in [Why Scrollcase?](https://scrollcase.dev/getting-started/why-scrollcase).

## Four words

| Word | Meaning |
| --- | --- |
| **scroll** | The file you write: dependencies, model files, what to run, how to test it. The only input a build accepts. → [reference](https://scrollcase.dev/reference/scroll) |
| **box** | What comes out: one archive with the whole environment inside. → [format](https://scrollcase.dev/reference/box-format) |
| **target** | Which machine it is for: operating system, CPU architecture, accelerator (and CUDA version). One box, one target. |
| **release** | The signed document that describes the box, so a consumer can verify it. → [security model](https://scrollcase.dev/concepts/security-and-trust) |

The pipeline is always the same three steps: **write a scroll → lock it → build the box.**

## Using a box from your application

Building needs Node.js. *Consuming* does not — pick the language your application is written in:

```sh
python -m pip install scrollcase-consumer   # imported as scrollcase_consumer
cargo add scrollcase-consumer
# or, in Node: import { ... } from 'scrollcase/consumer'
```

All three do the same thing: verify a box the caller already has, unpack it, run it, and hand back
the result. None of them downloads anything. → [Consumer API](https://scrollcase.dev/reference/api)

## Commands

| Command | What it does |
| --- | --- |
| `init` | Create the workspace, optionally with a runnable example |
| `new scroll` | Create a scroll for one target, guided |
| `add` / `remove` / `edit` / `refresh` | Change what a scroll declares — dependencies, model files, environment variables, self-test imports |
| `doctor` | Can this machine build a box? |
| `keygen` | Create a local ed25519 signing key |
| `lock <scroll>` | Resolve the dependencies once, into a committed `pixi.lock` |
| `audit <scroll>` | Licence inventory for every dependency, derived from the lock |
| `build <scroll>` | Install from the lock, self-test, archive, sign |
| `verify <release.json>` | Check a box the way an installing client does; `--self-test` runs its own interpreter |
| `run <release.json>` | Verify, unpack to a temporary directory, run, clean up |

`scrollcase help` documents every option. Full detail:
[CLI reference](https://scrollcase.dev/reference/cli).

## Requirements

- **Node.js ≥ 20** for the CLI.
- **Real builds** also need [pixi](https://pixi.sh) at the version the scroll pins and
  [conda-pack](https://conda.github.io/conda-pack/). `scrollcase doctor` says what is missing;
  `scrollcase init` offers to install it and downloads nothing without your consent.
- **Locking, auditing, signing, verifying and running an existing box** need no toolchain at all.

Scrollcase is built on exactly one substrate: pixi solves a committed `pixi.lock` against
[conda-forge](https://conda-forge.org), conda-pack relocates the resulting prefix, and the tree
ships inside the box as `venv/`. → [Why pixi](https://scrollcase.dev/concepts/why-pixi)

## Going further

- [Signing and key custody](https://scrollcase.dev/guides/signing-and-custody) — local key out of the
  box, or your own KMS/HSM through `--signer-command`.
- [Managing model weights](https://scrollcase.dev/guides/managing-weights) — embed them in the
  archive, or keep them outside it with their hash recorded in the signed release.
- [Accelerator parity](https://scrollcase.dev/guides/accelerator-parity) — fail the build when the
  CUDA box and the CPU box disagree numerically.
- [Distributing boxes](https://scrollcase.dev/guides/distributing-boxes) and
  [offline installs](https://scrollcase.dev/guides/offline-airgap).
- [Design decisions](https://scrollcase.dev/concepts/design-decisions) — every choice that looks
  arbitrary, and the alternative it rejected.
- Real boxes to look at: [examples/](examples/) ships a stdlib-only one that builds in a minute, a
  sentiment model, and a local LLM. Each is walked through in the
  [demos](https://scrollcase.dev/demos/).

## What Scrollcase is not

It stops at a signed, verified box on disk. It does not host archives, run a registry, decide which
version a client should install, download boxes, manage updates, allocate CI runners, or judge
whether a model is scientifically correct. Those belong to whoever uses it — which is what keeps the
format usable with object storage, GitHub Releases, a private server or an existing updater.

## Development

```sh
npm install
npm test        # no network, no toolchain required
```

The Python consumer lives in [python/](python/) and the Rust crate in [rust/](rust/), each with its
own suite. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE), covering Scrollcase's own source. The contents of the boxes it builds —
interpreters, conda-forge and PyPI dependencies, model code and weights — carry their own licences,
which is exactly what the licence audit inside every box exists to record. See [NOTICE](NOTICE).
