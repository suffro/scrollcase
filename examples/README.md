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
