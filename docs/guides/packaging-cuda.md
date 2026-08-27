---
title: Packaging CUDA Boxes
description: Build a GPU box whose CUDA ABI is part of its identity, and prove it is really a GPU build.
---

# Packaging CUDA Boxes

A CUDA box is an ordinary box with one extra property: the CUDA ABI it was built against is part
of its identity, so a CUDA 12.4 build can never be mistaken for a 12.8 one. This page covers what
a CUDA scroll declares, and how to prove the result is genuinely a GPU build rather than CPU
wheels wearing a CUDA name.

## Supported CUDA targets

| `platform` | `arch` | `accelerator` | Target ID |
| --- | --- | --- | --- |
| `linux` | `x86_64` | `cuda` | `linux-x86_64-cuda<major.minor>` |
| `windows` | `x86_64` | `cuda` | `windows-x86_64-cuda<major.minor>` |

macOS has no CUDA target — use `metal`. The `12.4` values below are one concrete example, not the
only CUDA ABI the contract accepts.

## The scroll

```json
{
  "schemaVersion": 3,
  "scrollVersion": "1.0.0",
  "boxId": "my-model",
  "labels": { "model": "example-org/my-model" },
  "version": "1.0.0",
  "sourceRevision": "my-model-v1.2.0",
  "target": {
    "platform": "linux",
    "arch": "x86_64",
    "accelerator": "cuda",
    "cudaVersion": "12.4"
  },
  "compatibility": {
    "minHostAppVersion": "1.0.0",
    "minNvidiaDriverVersion": "550.54.14",
    "minRamGb": 16
  },
  "runtime": { "id": "python", "version": "3.14" },
  "pixiVersion": "0.73.0",
  "assetBaseUrl": "https://assets.example.org/boxes",
  "selfTest": {
    "imports": ["torch"],
    "script": "scrolls/my-model/linux-x86_64-cuda12.4/self_test.py"
  }
}
```

Three things are CUDA-specific:

1. **`cudaVersion`** — `major.minor`, required for a CUDA target and forbidden on any other. It
   becomes part of the target ID, the archive name, and the object key.
2. **`minNvidiaDriverVersion`** in `compatibility` — copied verbatim into the release manifest for
   the installing host to check. Scrollcase never interprets it.
3. **A self-test that actually exercises the GPU** — see below.

`pythonEntryPoint`, `cacheSubdir` and an empty `assets` list are left out: the target and the
box identity already determine them, and they are filled in when the scroll is read. A box that
ships both a CUDA and a CPU target should keep what they share in one
[base scroll](/reference/scroll#one-box-several-targets), with `cudaVersion`,
`minNvidiaDriverVersion` and the GPU self-test in the CUDA fragment.

## The pixi manifest

The solve is where a CUDA box is really made or broken. `platforms` must be the target's conda
subdirectory, and the CUDA version is declared both as a package pin and as a system requirement,
so the solver picks the GPU build rather than the CPU one:

```toml
[workspace]
name = "my-model-linux-x86_64-cuda12.4"
channels = ["conda-forge"]
platforms = ["linux-64"]

[system-requirements]
cuda = "12.4"

[dependencies]
python = "3.14.*"
pytorch = { version = "2.*", build = "cuda*" }
cuda-version = "12.4.*"
```

Then resolve and commit the lock:

```sh
scrollcase lock my-model/linux-x86_64-cuda12.4
git add scrolls/my-model/linux-x86_64-cuda12.4/pixi.lock
```

Run those commands with Pixi `0.73.0`, because that is the exact version this example scroll pins;
do not substitute another resolver version.

::: warning `cuda-version` pins the ABI, not the driver
The `cuda-version` package constrains which CUDA runtime the conda-forge packages are built
against. The host still needs a driver new enough for that ABI — that is what
`minNvidiaDriverVersion` communicates to the installer.
:::

## Building

CUDA boxes, like all boxes, are **built natively**: a `linux-x86_64-cuda12.4` box is built on
Linux x86_64. There is no cross-building, because the self-test runs the box's own interpreter,
and that only proves anything on matching hardware.

```sh
scrollcase doctor --scroll my-model/linux-x86_64-cuda12.4
scrollcase build my-model/linux-x86_64-cuda12.4
```

The self-test runs under the target's CUDA validation environment
(`CUDA_VISIBLE_DEVICES=0`), so a `torch.cuda.is_available()` assertion is meaningful.

::: tip A GPU is needed to build, not just to run
Solving a CUDA environment does not require a GPU, but a self-test that asserts
`torch.cuda.is_available()` does. Build CUDA boxes on a GPU machine — otherwise weaken the
self-test to something that passes without a device, and you lose the check that matters most.
:::

## Proving it is really a GPU build

The failure this guide exists to prevent is a box that solves, packs, installs, and then runs on
the CPU — CPU-only wheels shipped under a CUDA target ID. Three layers catch it:

**1. The self-test.** The cheapest and most direct. It runs with the box's own interpreter, so a
CPU-only wheel fails it:

```python
# scrolls/my-model/linux-x86_64-cuda12.4/self_test.py
import torch

assert torch.cuda.is_available(), "CUDA runtime not usable inside the box"
assert torch.version.cuda.startswith("12.4"), f"built against CUDA {torch.version.cuda}"
```

A single assertion can also go inline as `selfTest.code`, but anything longer belongs in a
file the editor and the linter can see — which is what `selfTest.script` names.

**2. The parity gate.** Run a real computation on CPU and on CUDA and require the results to
agree within a declared tolerance:

```jsonc
"parity": {
  "script": "checks/parity.py",
  "accelerators": ["cpu", "cuda"],
  "tolerances": { "absolute": 1e-4, "relative": 1e-3, "minimumCosine": 0.9999 }
}
```

This catches a broken BLAS, a mis-solved kernel, and a GPU path that silently falls back — see
[Accelerator Parity](/guides/accelerator-parity).

**3. `verify --self-test`.** Extracts the built archive and re-runs the signed imports with the
box's own interpreter, on a matching native host:

```sh
scrollcase verify .scrollcase/dist/boxes/my-model/1.0.0/linux-x86_64-cuda12.4/*.release.json --self-test
```

This consumer check does **not** repeat scroll `code`, so it does not by itself prove
`torch.cuda.is_available()`. That stronger assertion and parity are builder gates. Building a
target proves packaging and declared gates; it never proves scientific parity unless the scroll
declares and passes a suitable parity check.

## One box per CUDA ABI

Because `cudaVersion` is part of the identity, supporting two ABIs means two scrolls, two locks,
two boxes:

```text
scrolls/
└── my-model/
    ├── scroll.json              # what both ABIs share
    ├── linux-x86_64-cuda12.4/
    └── linux-x86_64-cuda12.8/
```

Two ABIs of one model agree about everything except the ABI, so this is the case a
[split scroll](/reference/scroll#one-box-several-targets) is for: the base holds the identity, the
dependencies and the self-test, and each fragment declares its `cudaVersion` and its
`minNvidiaDriverVersion`. The `pixi.toml` and `pixi.lock` stay per target, since the solve is what
differs.

They share a `boxId` and `version` and differ in target, so they publish under distinct object
keys and a client picks the one matching its driver:

```text
boxes/my-model/1.0.0/linux-x86_64-cuda12.4/…
boxes/my-model/1.0.0/linux-x86_64-cuda12.8/…
```

## Size

CUDA environments are large — the runtime libraries alone can dominate the archive. Prune what
the box does not need at run time, and let the self-test guard the prune:

```jsonc
"prunePaths": [
  "venv/share/doc",
  "venv/lib/python3.14/site-packages/torch/test",
  "venv/lib/python3.14/site-packages/torch/include"
],
"selfTest": { "imports": ["torch"], "files": [], "code": "import torch; assert torch.cuda.is_available()" }
```

See [Managing Assets](/guides/managing-assets#keeping-the-box-small) for the general
approach, and consider `"embed": false` on the weights themselves when they, rather than the CUDA
runtime, are what makes the archive unwieldy.
