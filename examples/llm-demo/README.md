# `llm-demo`

The example that carries a language model. `sentiment-demo` proves a real model fits the pipeline;
this one packages the kind of model people assume has to live on someone else's hardware, and shows
it answering with no network, no API key and no account.

It packs [SmolLM2-1.7B-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct),
quantised to Q4_K_M in GGUF form, and answers one prompt:

```text
$ scrollcase run <release> -- "What is the capital of Italy?"
Rome.
```

Given no arguments at all it opens an interactive chat instead, on the same release document and the
same signature. Nothing is rebuilt to get the second mode.

The same box is declared for three CPU targets, one per supported operating system. Build the one
that matches the machine you are on; the other two are what CI builds elsewhere.

| Scroll | conda subdir | Interpreter in the box |
| --- | --- | --- |
| `llm-demo/macos-aarch64-cpu` | `osx-arm64` | `venv/bin/python` |
| `llm-demo/linux-x86_64-cpu` | `linux-64` | `venv/bin/python` |
| `llm-demo/windows-x86_64-cpu` | `win-64` | `venv/python.exe` |

The accelerator is `cpu` on all three. conda-forge's `llama.cpp` *is* built with Metal on
`osx-arm64`, so a Metal box is buildable — but `entrypoint.py` never passes `n_gpu_layers`, which
llama-cpp-python defaults to `0`, so no layer is offloaded and every target runs on the CPU.
Declaring `metal` would promise an accelerator this box does not use. Offloading is a change to the
entrypoint first and to the target second, in that order.

## Build it

From the Scrollcase checkout, using `examples/` as the scrolls root. The lock is committed, so
`lock` is only needed after editing `pixi.toml`:

```sh
scrollcase keygen
scrollcase audit llm-demo/linux-x86_64-cpu --scrolls-dir examples
scrollcase build llm-demo/linux-x86_64-cpu --scrolls-dir examples
scrollcase verify .scrollcase/dist/boxes/llm-demo/1.0.0/linux-x86_64-cpu/*.release.json --self-test
scrollcase run .scrollcase/dist/boxes/llm-demo/1.0.0/linux-x86_64-cpu/*.release.json -- "What is the capital of Italy?"
```

The build downloads 1.06 GB of weights once, verifies them against the size and SHA-256 the scroll
declares, and embeds them. Most of the archive is that one file.

## What is worth reading in the scroll

**The whole model is one asset.** A GGUF holds the weights, the tokenizer *and* the chat template in
a single container, so this scroll declares one file where `sentiment-demo` declares three — and
there is no tokenizer that can drift out of step with the weights it belongs to. It is pinned to an
immutable upstream revision with its size and SHA-256, and it carries no `embed: false`, so the
default applies and the file is packed into the archive — the box installs and runs air-gapped.

**The environment declares no offline flag.** `sentiment-demo` sets
`HF_HUB_OFFLINE=1` and two siblings because its stack really does contain a Hugging Face client.
This stack has none: `entrypoint.py` imports `llama_cpp` and nothing else, so copying those
variables across would look reassuring and guarantee nothing. What it declares instead is
`PYTHONDONTWRITEBYTECODE=1`, which is load-bearing twice — the self-test's `import entrypoint` would
otherwise leave a timestamped `.pyc` inside the payload *before* its digest is computed, and an
extracted box that was kept and then run would fail `verify --extracted` the second time.

**The macOS target declares one more, and it is what makes the box CPU-only.** conda-forge's
`llama-cpp-python` for Apple Silicon has the Metal backend compiled in, and llama.cpp registers a
Metal device whatever `n_gpu_layers` says. Registering it is enough to matter: creating the context
initialises *every* registered backend, so a Mac where Metal will not initialise fails a box named
`cpu` for a GPU it was never going to use. `GGML_METAL_DEVICES` is how many Metal devices ggml
registers, so the target fragment sets it to `0` and the accelerator matches the target's name.
Linux and Windows have no Metal backend to switch off and declare nothing — which is the case
`extends` merging `environment` key by key exists for.

**One variable is deliberately *not* declared.** `entrypoint.py` mutes llama.cpp's own log, because a
demo that prints two hundred lines of tensor repacking before its first token is a demo nobody reads
— and that log is where a failed load says why. So the entrypoint reads `LLM_DEMO_VERBOSE` from the
host and unmutes when it is set, and the error it raises names the variable. A release that declared
it would win over the value the person debugging supplies, and weld the switch shut.

**The self-test has to generate, not just import.** `selfTest.imports` is the part the signed
release carries, which is why `verify --self-test` can repeat it later with the box's own
interpreter. `files` and `script` stay builder-only: `shared/self_test.py` loads the gigabyte and
asserts that the answer to *What is the capital of Italy?* contains `rome`, so a box that cannot
generate is never signed. It asserts a substring rather than a sentence — greedy decoding is
reproducible, but a llama.cpp point release may reword prose without anything being wrong.

**One declared dependency is not one dependency shipped.** `pixi.toml` names `llama-cpp-python` and
Python. What arrives is the compiled `llama.cpp` plus `fastapi`, `uvicorn`, `pydantic-settings`,
`numpy`, `diskcache` and more, because the upstream package also ships an OpenAI-compatible server
this box never starts. Every one of them is named in `conda-licenses.json`, which is what an
inventory derived from the lock is for.

**The mode is the argument list.** `execution.defaultArgs` is `[]`, so `run` with no `--` reaches the
box with nothing and the entrypoint opens a chat; words are a question answered once. A `--chat` flag
would have had to be declared in the scroll and signed into the release.

## Files

```text
llm-demo/
├── shared/
│   ├── entrypoint.py           one entrypoint, hashed identically into all three scrolls
│   ├── self_test.py            builder-only: the check that decides whether a box may be signed
│   ├── MODEL_NOTICE.md         attribution for the checkpoint and its GGUF quantisation
│   └── APACHE-2.0.txt          the licence text both are under
├── demo-consumers/             what travels inside each published archive beside the box
├── <target>/scroll.json        extends the base with the target and its audit path
├── <target>/pixi.toml          python, llama-cpp-python
├── <target>/pixi.lock          committed: the build installs from it and resolves nothing
└── <target>/conda-licenses.json  the reviewed audit the build recomputes and compares
```

`shared/` exists because the three targets differ only in platform, interpreter path and audit file.
Copying the entrypoint per target, as `hello-box` does, would mean three files to keep byte-identical
by hand; here one file is hashed into three scrolls, and a test asserts those hashes still match.

`entrypoint.py` is also the file the [Codespaces
walkthrough](https://github.com/suffro/scrollcase-e2e-demo-SmolLM2-1.7B-Instruct-GGUF) ships, byte
for byte. This copy is the canonical one; a change here has to be carried there, and the test that
checks the declared hashes is what makes a divergence visible rather than silent.

Those hashes are taken over the file's bytes, which is worth knowing on Windows. Git converts line
endings on checkout by default, and a file rewritten to CRLF no longer matches the hash the scroll
declares — the build stops with a mismatch on a checkout that looks perfectly clean.
[`.gitattributes`](.gitattributes) marks the affected paths.

## Scope

A demonstration of packaging, not an assistant product. 1.7 billion parameters is small: it states
false things fluently, knows nothing after its training data, and cannot reliably do arithmetic or
cite sources — and 4-bit quantisation is lossy on top of that. English only. Do not use it for
factual lookup or for decisions about people. Full walkthrough:
[the local LLM demo guide](https://scrollcase.dev/demos/llm-box-demo).
