# Dataset demo box

A signed `dataset-demo`, built by CI from `examples/dataset-demo/` in this repository. It is a
**`native` box** — no interpreter inside it — and a different shape from `transcode-demo`: small
compiled tools reading a data file the box itself ships, rather than one large program driven by
flags.

It carries the HDF5 command-line tools and a small dataset, `readings.h5`, pinned by hash. The case
it answers is not "I cannot install this" but **"we must all read this file the same way"**: a
signed box fixes the reader, so an inspection somebody publishes is one anybody can repeat.

| Your machine | Download |
| --- | --- |
| Linux, Intel or AMD | `dataset-demo-1.0.0-linux-x86_64-cpu.zip` |
| macOS, Apple silicon | `dataset-demo-1.0.0-macos-aarch64-metal.zip` |
| Windows, Intel or AMD | `dataset-demo-1.0.0-windows-x86_64-cpu.zip` |

Unpacking gives the box under `box/` and this README beside it.

The trust key is deliberately **not** in that archive. A signature only proves where something came
from if the key does not arrive in the same package, so it is fetched from the repository:

```sh
unzip dataset-demo-1.0.0-<target>.zip -d dataset-demo
cd dataset-demo
mkdir keys
curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json
```

Then:

```sh
npm install -g scrollcase
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json

# The structure of the dataset the box ships
scrollcase run box/*.release.json --public-key keys/example-signing-public.json -- -H readings.h5

# The values in one dataset
scrollcase run box/*.release.json --public-key keys/example-signing-public.json \
  -- -d /measurements/monthly readings.h5
```

Everything after `--` goes to `h5dump`, and `readings.h5` is a path *inside the box*, not on your
machine. Point it at a file of your own by giving an absolute path instead.

On PowerShell that glob is not expanded — use `(Get-ChildItem box\*.release.json).FullName`, or type
the file name you see under `box/`.

`verify --self-test` reads the shipped dataset both ways, structure and values, so a box whose data
or whose reader stopped agreeing fails before you trust either.

The dataset is regenerable rather than magic: the text it was built from and the `h5import` config
that built it ship in the repository beside it, under `examples/dataset-demo/shared/`.

Full walkthrough: [the dataset demo](https://scrollcase.dev/demos/dataset-demo).

## About the signing key

This box is signed with a key that exists **only for this demo**. It signs nothing else, no trust
chain depends on it, and it is not the key for any Scrollcase release. Treat a signature from it as
evidence that the example is intact — never as evidence that anything else is.
