# Examples

## The published demo boxes

The examples below are built and signed by CI for all three operating systems and attached to a
release, so each can be verified and run without a toolchain:
[`demo-box-v1`](https://github.com/suffro/scrollcase/releases/tag/demo-box-v1) for `hello-box`, and
[`sentiment-demo-v1`](https://github.com/suffro/scrollcase/releases/tag/sentiment-demo-v1) for the
model-bearing `sentiment-demo`. `llm-demo` has its workflow but no release yet: it is built by
`.github/workflows/llm-demo-box.yml`, which has not been dispatched.
`keys/example-signing-public.json` is the public half of the key they are signed with.

That key exists **only for the demos**. It signs nothing else, no trust chain depends on it, and it
is not the key for any Scrollcase release. Its private half lives in a repository secret and is used
by `.github/workflows/demo-box.yml`, `.github/workflows/sentiment-demo-box.yml` and
`.github/workflows/llm-demo-box.yml` alone — a Linux or Windows box cannot be built on a maintainer's
machine anyway, since conda-pack packs the host's own environment.

`demo-consumers/` holds what travels inside each published `hello-box` archive beside the box:
`run-box.ts`, `run_box.py`, a `package.json`, and a `README.md`, so unpacking a download gives a
folder that already runs three ways. The same files are embedded in
[the demo box guide](https://scrollcase.dev/demos/box-run-demo), which is why they live here rather
than in the page — documentation and shipped bytes cannot drift apart. `sentiment-demo` and
`llm-demo` each ship their own set under `<example>/demo-consumers/`, because those boxes take an
argument — a sentence and a prompt respectively — and their templates pass one. The public key is
never copied into any of them: a signature proves nothing if the key arrives in the same package as
what it signs.

## `hello-box`

The smallest thing Scrollcase can build: a stdlib-only Python 3.11 environment from conda-forge,
packed into a relocatable box. No model weights, no assets, nothing to download beyond the
interpreter itself — so it exercises the whole pipeline in about a minute and produces an archive
small enough to inspect by hand.

Size varies more by platform than the identical scrolls suggest, which is worth seeing before you
size a real box:

| Target | Archive | Extracted |
| --- | --- | --- |
| `macos-aarch64-metal` | 48 MB | 126 MB |
| `windows-x86_64-cpu` | 43 MB | 120 MB |
| `linux-x86_64-cpu` | 191 MB | 483 MB |

The same box is declared for three targets, one per supported operating system. Build the one that
matches the machine you are on; the other two are what the CI builds elsewhere.

| Scroll | conda subdir | Interpreter in the box |
| --- | --- | --- |
| `hello-box/macos-aarch64-metal` | `osx-arm64` | `venv/bin/python` |
| `hello-box/linux-x86_64-cpu` | `linux-64` | `venv/bin/python` |
| `hello-box/windows-x86_64-cpu` | `win-64` | `venv/python.exe` |

Run it from the Scrollcase checkout, using `examples/` as the scrolls root:

```sh
scrollcase lock hello-box/macos-aarch64-metal --scrolls-dir examples
scrollcase keygen
scrollcase build hello-box/macos-aarch64-metal --scrolls-dir examples
scrollcase verify .scrollcase/dist/boxes/hello-box/1.0.0/macos-aarch64-metal/*.release.json --self-test
scrollcase run .scrollcase/dist/boxes/hello-box/1.0.0/macos-aarch64-metal/*.release.json
```

`verify --self-test` extracts the archive and imports `json` and `sqlite3` with the interpreter
*inside the box*, which is the check that matters: it proves the packed environment runs somewhere
other than where it was built. `run` then executes `entrypoint.py`, whose output leads with the
result a newcomer cares about and keeps the runtime evidence readable:

```text
Hello from inside a Scrollcase box!

  signed -> verified -> relocated -> running

Success: the box's own Python runtime executed this program.
No dependencies were resolved or installed to make this run.

  Runtime  Python 3.11.15
  Host     Linux / x86_64
```

The final two lines vary with the target. There is deliberately no temporary extraction path to
decode: reaching the entry point already means the consumer verified the signed box and started its
own relocated interpreter.

The committed `pixi.lock` pins the exact packages, so `build` installs rather than resolves and two
builds of the same commit produce byte-identical archives. `platforms` in `pixi.toml` must equal the
target's conda subdirectory — the middle column above — or the solve produces an environment that
cannot run on the machine the box is for.

`entrypoint.py` reaches the payload through `localFiles`, which carries its SHA-256: editing the
script without updating that hash fails the build rather than silently shipping something nobody
reviewed.

That hash is taken over the file's bytes, which is worth knowing on Windows. Git converts line
endings on checkout by default, and a file rewritten to CRLF no longer matches the hash the scroll
declares — the build stops with a mismatch on a checkout that looks perfectly clean. This repository
marks the affected paths in [`.gitattributes`](../.gitattributes); a project declaring its own
`localFiles` needs the same for the files it names.

## `hello-box-node`

The same thing as `hello-box`, one runtime over: a bare Node 22 environment from conda-forge, a
`node-script` entry point, and nothing to download beyond the runtime itself. One target
(`macos-aarch64-metal`), because it exists to show the shape rather than to be published.

Two details are the whole point of it. The scroll declares `runtime.id: "node"` and nothing else
changes shape — the target, the licence audit, the self-test, the signed release are all the same
fields. And the built archive carries a `package.json` at its root that no scroll declares:

```jsonc
{ "name": "scrollcase-box", "private": true, "type": "commonjs" }
```

Node decides whether a `.js` file is CommonJS or an ES module from the nearest `package.json`
**above** it. A box without one asks whichever directory it was extracted into — this example failed
its own self-test against *this repository's* `package.json`, which says `"type": "module"`. The
builder writes one so the walk stops inside the box, and leaves it alone if the payload already has
one. Ship your own as a `localFile` if you want ESM.

```sh
node src/cli.mjs build hello-box-node/macos-aarch64-metal --scrolls-dir examples
```

## `hello-box-native`

A box with **no interpreter at all**. It packs conda-forge's `zstd` and runs `venv/bin/zstd`
directly: the binary is the command line, `runtime.version` and `runtime.entryPoint` are absent, and
the self-test is two invocations of the box's own execution — `--version`, and a `--test` that must
exit 1 on a file that is not a zstd archive.

`zstd` rather than something with a console UI, and that choice is itself the lesson. The first
version of this example ran `sqlite3`, whose own linkage is entirely `@rpath` and perfectly
relocatable — but conda-forge's `ncurses`, three dependencies down, ships a `libncurses` that
re-exports `libtinfo` through an unrewritten path on the machine that *built the package*. The box
was correct; a package inside it was not, and Scrollcase does not repair a binary's library paths.
The self-test caught it before anything was signed, which is the arrangement working: a native box
that cannot start fails the build rather than the user.

The environment is small (`zstd` and `libzlib`) and the licence audit is derived from the lock as
usual — `native` means "no interpreter", not "no dependencies".

It is also the one example that declares **no `publishBaseUrl`**, deliberately: nothing here is ever
published, so its release names no address for its archive and its channel names none for its
release. Everything else is unchanged — the archive is hashed, both documents are signed, `verify
--self-test` passes, and `run` works. Compare its release with any other example's to see exactly
what a publish location adds, and what it does not.

```sh
node src/cli.mjs build hello-box-native/macos-aarch64-metal --scrolls-dir examples
```

## `codon-demo`

What a `node` box is actually for, rather than what it minimally is: a reference table and the tool
that queries it, shipped and signed together. The recipient needs neither Node, nor npm, nor a
database — the box carries its own interpreter, its own data, and the code that joins them.

The table is the standard genetic code (NCBI translation table 1). `run` with no arguments prints
what the box carries; `run -- ATG` answers forward; `run -- Leucine` answers backwards; an unknown
term exits 1. RNA is accepted too, so `UUG` and `TTG` give the same answer.

```sh
node src/cli.mjs build codon-demo/macos-aarch64-metal --scrolls-dir examples
node src/cli.mjs run .scrollcase/dist/boxes/codon-demo/1.0.0/macos-aarch64-metal/*.release.json -- Leucine
```

```text
Leucine (Leu) is encoded by 6 codons: CTA, CTC, CTG, CTT, TTA, TTG
```

Three things in it are worth reading:

**No npm.** Scrollcase solves from conda-forge and nothing else, so a `node` box cannot declare an
npm dependency. The tool loads its table with `node:sqlite`, which is part of Node itself, and the
JavaScript enters through `localFiles` like any other project file. That is the shape a `node` box
has: conda-forge supplies the runtime and the native libraries, the project supplies the code.

**Node 26, deliberately.** `node:sqlite` needs a recent Node to be usable without a flag, and a box
that needed `--experimental-sqlite` could not say so: `execution.defaultArgs` land *after* the script
path, never before it. Pinning the runtime was the fix; the scroll is the place that decides.

**The data is pinned by hash.** `codons.csv` carries its SHA-256 in `localFiles`, so reference data
cannot change without the build stopping. Appending one fabricated row is refused by name —
`Local box file SHA-256 mismatch` — before anything is packed or signed. That is the point of a
signed box carrying data rather than fetching it.

## `transcode-demo`

What a `native` box is actually for: ffmpeg, pinned, with everything it links against, signed. The
recipient transcodes with the exact build that was tested, on a machine that has no ffmpeg and needs
no compiler. 121 MB archived, 391 MB extracted, 90 packages in the lock — which is the honest cost
of "just install ffmpeg" made visible.

```sh
node src/cli.mjs build transcode-demo/macos-aarch64-metal --scrolls-dir examples
r=.scrollcase/dist/boxes/transcode-demo/1.0.0/macos-aarch64-metal/*.release.json
node src/cli.mjs run $r -- -version
node src/cli.mjs run $r -- -f lavfi -i "testsrc=duration=2:size=640x480:rate=25" \
  -c:v libx264 -pix_fmt yuv420p /tmp/out.mp4
```

The second command writes a real MP4 outside the box, which is worth noticing: `run` extracts to a
temporary directory and deletes it on exit, so anything the box produces has to be written somewhere
the caller names. An application that runs a box repeatedly extracts it durably through a consumer
instead.

Three things in it are worth reading:

**No glue.** A `native` box starts one binary with the arguments the scroll fixed, and nothing else.
`defaultArgs` is `["-hide_banner"]`, so every invocation is that plus whatever the caller adds.
There is no script in between, because a box that needed one would be a `node` or `python` box.

**The self-test proves a real encode.** Not just `-version`: the second probe generates a test
pattern with `lavfi`, encodes it through `libx264` and discards the output. A box whose codecs did
not load fails the build. No media file ships to make that possible — ffmpeg synthesises its own
input, which is the trick that keeps the example free of a sample video.

**`expectExitCode` is 254, and that is not a typo.** The third probe points ffmpeg at a file that is
not there. ffmpeg reports the negative C error number, `ENOENT` is 2, and a process exit status is
one byte — so `-2` surfaces as 254. It is in the scroll because a self-test asserts the binary's
*real* contract rather than a convention someone assumed: the value was measured against the built
payload, not guessed, after the first build failed expecting 1.

**The licence inventory earns its place here.** 21 of the 90 packages are GPL-family, including
ffmpeg itself, `x264` and `x265` at GPL-2.0-or-later. Anyone redistributing this box needs to know
that before they ship it, not after — and `scrollcase audit` derives it from the lock rather than
asking anyone to remember.

## `dataset-demo`

The second `native` box, and a different kind of program from `transcode-demo`: the HDF5
command-line tools, which read the format most scientific instrument data and model weights are
stored in. 36 MB archived. It ships a small dataset and the reader together.

The case it answers is not "I cannot install this" but **"we must all read this file the same
way"**. A signed box fixes the reader, so an inspection somebody publishes is one anybody can
repeat.

```sh
node src/cli.mjs build dataset-demo/macos-aarch64-metal --scrolls-dir examples
r=.scrollcase/dist/boxes/dataset-demo/1.0.0/macos-aarch64-metal/*.release.json
node src/cli.mjs run $r -- -H readings.h5
node src/cli.mjs run $r -- -d /measurements/monthly readings.h5
```

```text
GROUP "measurements" {
   DATASET "monthly" {
      DATATYPE  H5T_IEEE_F64LE
      DATASPACE  SIMPLE { ( 12, 3 ) / ( 12, 3 ) }
```

`readings.h5` is pinned by SHA-256 and generated rather than committed blind: `readings.txt` and
`readings.conf` sit beside it, and `h5import readings.txt -c readings.conf -o readings.h5` rebuilds
it. The numbers are a synthetic seasonal series — the point is the format and the reader, not the
measurement.

### Why not a bioinformatics tool

That was the intent, and conda-forge is the reason it is not. **Almost every bioinformatics package
lives on bioconda**, a second channel: `samtools`, `bwa`, `seqkit`, `minimap2`, `hmmer`, `diamond`,
`blast`, `muscle` and `fasttree` are all absent from conda-forge. Adding a channel to one example
would demonstrate something this project does not claim, so it was not done.

`mafft` is the exception that is present — and it fails as a `native` box, instructively. Its
`venv/bin/mafft` is a shell wrapper that finds its helper binaries through a path compiled into it:

```text
prefix=/Users/runner/miniforge3/conda-bld/mafft_.../_h_env_placehold_placehold_.../libexec/mafft
```

That is the machine that *built the conda package*, and Scrollcase does not repair a binary's — or a
script's — recorded paths. The package offers `MAFFT_BINARIES` as an override, but it must be
absolute, and a box is extracted to a different temporary directory on every run: the signed
`environment` is a fixed string map with no substitution, so there is nothing correct to put in it.
The self-test caught it before anything was signed.

This is the second instance of the limitation `hello-box-native` documents, in a new shape — there a
dylib re-exported through an unrewritten path, here a wrapper script. **Before choosing a program
for a `native` box, check what it actually is.** `file venv/bin/<program>` answering "shell script"
is the warning; `Mach-O 64-bit executable` or an ELF binary is what relocates cleanly.

## `sentiment-demo`

The same pipeline carrying a real model: DistilBERT SST-2 quantised to INT8 in ONNX form, with the
weights declared as commit-pinned assets, the licence notices carried into the payload, an offline
environment signed into the release, and a self-test that runs real predictions before the box may
be signed. It is the example to read when packaging something that is not stdlib.

Its own [`README`](sentiment-demo/README.md) covers the targets, the build commands and what is
worth reading in the scroll.

## `llm-demo`

The same pipeline carrying a language model: SmolLM2-1.7B-Instruct quantised to Q4_K_M in GGUF form,
which is one 1.06 GB asset rather than three small ones, because a GGUF holds the weights, the
tokenizer and the chat template in a single container. It is the example to read when the thing being
packaged is large, and when the box has to do more than answer in one shot: given a prompt it answers
once, given no arguments at all it opens an interactive chat, on the same release document and the
same signature.

It is also where the environment declaration is worth comparing against `sentiment-demo`. That box
sets three `*_OFFLINE` variables because its stack really does contain a Hugging Face client; this
one declares `PYTHONDONTWRITEBYTECODE=1` and nothing else, because there is no downloader to switch
off and a variable that guarantees nothing does not belong in a signed release.

Its own [`README`](llm-demo/README.md) covers the targets, the build commands, why every target is
`cpu`, and what is worth reading in the scroll.
