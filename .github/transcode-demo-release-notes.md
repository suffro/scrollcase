# Transcode demo box

A signed `transcode-demo`, built by CI from `examples/transcode-demo/` in this repository. It is a
**`native` box**: it carries no interpreter at all. The binary *is* the command line.

It ships ffmpeg, pinned, with the ninety-odd libraries it links against. The recipient transcodes
with the exact build that was tested, on a machine that has no ffmpeg and needs no compiler — which
is the honest cost of "just install ffmpeg", made visible and signed.

| Your machine | Download |
| --- | --- |
| Linux, Intel or AMD | `transcode-demo-1.0.0-linux-x86_64-cpu.zip` |
| macOS, Apple silicon | `transcode-demo-1.0.0-macos-aarch64-metal.zip` |
| Windows, Intel or AMD | `transcode-demo-1.0.0-windows-x86_64-cpu.zip` |

Unpacking gives the box under `box/` and this README beside it.

The trust key is deliberately **not** in that archive. A signature only proves where something came
from if the key does not arrive in the same package, so it is fetched from the repository:

```sh
unzip transcode-demo-1.0.0-<target>.zip -d transcode-demo
cd transcode-demo
mkdir keys
curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json
```

Then:

```sh
npm install -g scrollcase
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json

# Which ffmpeg is inside
scrollcase run box/*.release.json --public-key keys/example-signing-public.json -- -version

# A real transcode, on a file of your own
scrollcase run box/*.release.json --public-key keys/example-signing-public.json \
  -- -i input.mov -c:v libx264 -crf 20 output.mp4
```

Everything after `--` goes to ffmpeg. The box always passes `-hide_banner` first, because that is
its declared `defaultArgs`.

On PowerShell that glob is not expanded — use `(Get-ChildItem box\*.release.json).FullName`, or type
the file name you see under `box/`.

`verify --self-test` is worth running here: the box's declared probes synthesise a test pattern and
encode it with `libx264`, so a box whose codecs did not load fails before you trust it with real
media. No sample file ships to make that possible.

## Licensing, which this box makes concrete

Twenty-one of the ninety packages are GPL-family, ffmpeg, `x264` and `x265` among them at
GPL-2.0-or-later. That is a fact about redistributing *this* box, and it is exactly what a licence
inventory is for — `scrollcase audit` derives it from the lock, and the signed release carries it.

Full walkthrough: [the transcode demo](https://scrollcase.dev/demos/transcode-demo).

## About the signing key

This box is signed with a key that exists **only for this demo**. It signs nothing else, no trust
chain depends on it, and it is not the key for any Scrollcase release. Treat a signature from it as
evidence that the example is intact — never as evidence that anything else is.
