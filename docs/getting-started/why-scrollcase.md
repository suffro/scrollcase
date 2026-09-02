---
title: Why Scrollcase?
description: Understand when Scrollcase is useful, compare it and see how it differs from other tools and when a simpler solution is the better choice.
---

# Why Scrollcase?

Scrollcase is not a replacement for every Python packaging or deployment tool.

::: info Scrollcase is designed for a specific problem:
A project needs to deliver a complete, target-specific environment as a verifiable product artifact that can run on another machine without asking the end user to assemble that environment.
:::

That means carrying more than application code. A box may include:

- a specific interpreter — Python or Node — or no interpreter at all, for a box that starts a
  compiled binary;
- conda-forge dependencies;
- native libraries;
- model code and supporting files;
- embedded or separately delivered model weights;
- target-specific CPU, CUDA, or Metal builds;
- signed metadata describing exactly what was built;
- enough information for a consumer to reject a corrupted, substituted, or incompatible artifact.

Other tools solve important parts of this problem. Scrollcase exists to join those parts into one explicit build and consumption contract.

## What it does not do

Scrollcase stops at verified local artifacts and local consumption.

It does not:

- host archives;
- provide a package registry;
- detect which release an application should install;
- download boxes in the official consumers;
- manage application updates;
- activate or roll back installed versions;
- allocate build runners;
- provide container isolation;
- prove that a scientific model is correct.

Those responsibilities remain with the product using Scrollcase.

This boundary keeps the box format and verification logic usable with object storage, GitHub Releases, private servers, desktop updaters, or an organization's existing deployment system.

## Decision and comparison guide

Sometimes there might be a simplest tool that fits. If you only need a small reproducible development environment, use Pixi. If you only need to archive an existing Conda environment, conda-pack may be enough. If your users already run containers, Docker may be the better delivery format. Scrollcase is useful when the artifact itself must be portable, signed, inspected, verified, and consumed without a container runtime.

Use **Scrollcase** when the goal is:

> “Build a target-specific scientific models or AI runtime once, publish it as an immutable signed artifact, and let another application verify, install, and run it without resolving dependencies or requiring a container runtime.”

### Other tools comparison and best fits

| Tool | Primary job | Best fit | What Scrollcase adds |
| --- | --- | --- | --- |
| [Pixi](https://pixi.sh/) | Resolve, lock, install, and run project environments | Development, CI, and reproducible environment management | Relocation, packaging, signed release metadata, deterministic archives, verification, and consumer APIs |
| [conda-pack](https://conda.github.io/conda-pack/) | Archive an existing Conda environment so it can be moved | Direct environment deployment with a small custom delivery layer | A declarative source, locked build pipeline, pruning, assets, provenance, signing, manifests, verification, and safe consumers |
| [Nix](https://nixos.org/) | Build and reproduce complete dependency closures from pinned inputs | General-purpose reproducible builds, development shells, and whole-system configuration | An ordinary target-specific artifact, verified and executed by the consuming application itself — no store or package manager on the consumer's machine, and a much smaller model to adopt |
| [Docker](https://docs.docker.com/get-started/docker-overview/) | Package and run applications as isolated containers | Services, infrastructure, reproducible server deployment, and container-native systems | Host-native execution without a container runtime, target-specific accelerator boxes, signed local artifacts, and application-owned installation |
| [PEX](https://pex.readthedocs.io/) | Build executable Python environments from Python distributions | Python applications and command-line tools distributed as executable environments | A complete Conda-based prefix, non-Python native dependencies, model assets, signed release documents, and a separate consumer contract |
| [PyInstaller](https://pyinstaller.org/en/stable/) | Freeze a Python application and its dependencies into an executable bundle | Shipping a standalone end-user application | A reusable environment box rather than one frozen application, plus locks, provenance, content addressing, release channels, verification, and consumer APIs |
| [AppImage](https://appimage.org/) | Distribute a Linux desktop application as one portable executable file | Shipping self-contained applications across Linux distributions without installation | Cross-platform scientific runtime boxes, dependency locks, target and accelerator metadata, signed releases, deterministic archives, and consumer APIs |

> for a complete comparison checkout this [page](/concepts/tool-comparison).

## When is a good fit

- a desktop or local application embeds features powered by a packaged runtime;
- scientific or AI dependencies include native Conda packages;
- releases must support CPU, CUDA, Metal, or multiple operating systems;
- environments or model assets are large enough that integrity and lifecycle matter;
- the publisher needs deterministic, content-addressed artifacts;
- consumers must verify signatures, archive bytes, paths, and manifests before execution;
- offline or air-gapped installation is required;
- the project wants Node, Python, and Rust consumers to follow the same contract.

## When to prefer simpler tools

- the environment is only for the project's own developers;
- users can install dependencies directly from a lock file;
- the deliverable is one small pure-Python command-line program;
- the deployment platform already requires Docker;
- the application does not need signed release metadata;
- a custom script around conda-pack already provides every required guarantee;
- reproducibility, provenance, and independent verification are not product requirements.

Scrollcase intentionally accepts more structure than a plain archive. That structure is worthwhile only when the additional guarantees are requirements.


## Scrollcase terminology

The terminology reflects separate responsibilities rather than extra steps the developer must perform manually.

| Term | Meaning | Why it exists |
| --- | --- | --- |
| **Scroll** | The declarative source describing one box target | Separates project intent from the generated artifact |
| **Lock** | The exact resolved dependency graph in `pixi.lock` | Makes package selection reviewable and repeatable |
| **Target** | One operating system, architecture, and accelerator combination | A native environment cannot honestly be universal across incompatible platforms |
| **Box** | The built, self-contained runtime payload | This is the environment the consuming application installs and runs |
| **Runtime** | What runs *inside* the box: `python`, `node`, or `native` | The box says what executes on the target rather than leaving a reader to infer it from a path |
| **Release** | The signed document binding box identity to archive hashes and metadata | Lets consumers verify an artifact obtained through an untrusted transport |
| **Channel** | A signed pointer such as `beta` or `stable` to a release | Lets a publisher move an audience to a newer immutable release |
| **Key** | The signing identity trusted by the consumer | Establishes which publisher is allowed to issue releases |
| **Consumer** | The Node, Python, or Rust code that verifies, extracts, and runs a local box | Keeps security checks consistent outside the builder |
| **Deferred asset** | One asset the scroll declared `embed: false`, materialized beside the box rather than inside the archive | Per entry, so one box ships a small config inside and defers a large dataset |

The normal developer workflow is still small:

```bash
scrollcase init
scrollcase lock my-box/macos-aarch64-metal
scrollcase build my-box/macos-aarch64-metal
scrollcase verify path/to/release.json --self-test
```

Most of the named objects are generated outputs or concepts used by the publishing and consuming systems. They are not nine unrelated configuration files the developer must maintain.

## Next steps

- Follow the [Quickstart](/getting-started/quickstart) to build and run the example box.
- Read the [Overview](/getting-started/overview) for the complete developer and consumer workflow.
- Read [Architecture](/concepts/architecture) to see how the builder, artifacts, publisher, and consumer fit together.
- Read [Security & Trust](/concepts/security-and-trust) for the exact guarantees and non-guarantees.
- Read [Why Pixi & Conda-Forge](/concepts/why-pixi) for the dependency substrate decision.
- Read [Tool Comparison](/concepts/tool-comparison) for a complete comparison between Scrollcase and other packaging tools.
