# Local LLM demo box

A signed `llm-demo` for each supported operating system: SmolLM2-1.7B-Instruct, quantised to Q4_K_M
in GGUF form, packed together with the Python 3.11 environment that runs it and built by CI from
`examples/llm-demo/` in this repository. It exists so you can see a language model verified and
answering before installing anything beyond the CLI — `verify` and `run` need no pixi, no
conda-pack, no build, and nothing is downloaded while it runs. No API key, no account, no network.

Download the one archive matching your machine. These are large: the model is inside them.

| Your machine | Download |
| --- | --- |
| Linux, Intel or AMD | `llm-demo-1.0.0-linux-x86_64-cpu.zip` |
| macOS, Apple silicon | `llm-demo-1.0.0-macos-aarch64-cpu.zip` |
| Windows, Intel or AMD | `llm-demo-1.0.0-windows-x86_64-cpu.zip` |

Unpacking one gives a folder that already runs: the box under `box/`, plus `run-box.ts` and
`run_box.py` for driving it from an application instead of the terminal.

```text
scrollcase-llm-demo/
├── box/
│   ├── <archive sha256>.zip           the box — leave it zipped and named as it is
│   └── <document sha256>.release.json
├── run-box.ts
├── run_box.py
└── package.json
```

The trust key is deliberately **not** in that archive. A signature only proves where something came
from if the key does not arrive in the same package, so it is fetched from the repository:

```sh
unzip llm-demo-1.0.0-<target>.zip -d scrollcase-llm-demo
cd scrollcase-llm-demo
mkdir keys
curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json
```

Then any one of these three — they perform the same checks in the same order:

```sh
# Terminal
npm install -g scrollcase
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json
scrollcase run    box/*.release.json --public-key keys/example-signing-public.json \
  -- What is the capital of France?

# Node
npm install && npx tsx run-box.ts "What is the capital of France?"

# Python
python -m pip install scrollcase-consumer && python run_box.py "What is the capital of France?"
```

A successful run prints the answer on stdout and nothing else:

```text
Paris.
```

Loading progress, the timing line and every diagnostic go to stderr, so `... > answer.txt` gives you
a file holding the answer alone.

## Two modes, one box

Give it words and it answers once. Give it **nothing** and the same box opens an interactive chat
that keeps the conversation across turns on a single load of the weights:

```sh
scrollcase run box/*.release.json --public-key keys/example-signing-public.json
```

Same release, same signature, same entry point — the mode is decided by whether any arguments
arrived, because the box declares no default ones. `/exit` or Ctrl-D leaves the chat, and Ctrl-C
cancels an answer without ending the session.

On PowerShell that glob is not expanded for a command like this — use
`(Get-ChildItem box\*.release.json).FullName`, or simply type the file name you see under `box/`.

`verify` checks the signature, the archive's size and hash, the entry names and the manifest.
Adding `--self-test` extracts the box and imports with the interpreter inside it, and `run` executes
its entry point — both need the machine to match the box's target. `verify` on its own works
anywhere.

The two names under `box/` are SHA-256 digests of their own contents: two builds of the same commit
produce the same names, which is what makes the archive verifiable in the first place. Keep them as
they are and side by side — `verify` finds the box by the hash its release document commits to, and
renaming or separating them breaks that. The enclosing zip carries no guarantee of its own; it holds
the pair and the examples, and its name says which machine they are for.

## What to expect

Generation runs on the CPU, on every target: nothing is offloaded to a GPU. Expect single-digit
tokens per second on a modest machine, so an answer takes seconds rather than arriving instantly —
the box prints a `generating …` line to stderr so the wait never looks like a hang. Output is capped
at 160 tokens and the context is 2048 tokens, shared between the conversation and the answer. Allow
about 4 GB of RAM.

Full walkthrough: [the local LLM demo guide](https://scrollcase.dev/demos/llm-box-demo).

## About the model

A demonstration of packaging, not an assistant product. At 1.7 billion parameters it is small: it
states false things fluently and with no signal that it is doing so, it knows nothing of events after
its training data, and it cannot reliably do arithmetic or cite sources. The 4-bit quantisation is a
lossy transformation on top of that. It was trained primarily on **English**, and its
[model card](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct#limitations) documents the
limitations that follow from its training data. Do not use it for factual lookup, for decisions about
people, or for anything you would not check yourself. The model notice and the full Apache-2.0 text
travel inside the box, under `THIRD_PARTY_NOTICES/smollm2/`.

## About the signing key

These boxes are signed with a key that exists **only for the Scrollcase demos**. It signs nothing
else, no trust chain depends on it, and it is not the key for any Scrollcase release. Treat a
signature from it as evidence that the example is intact — never as evidence that anything else is.
