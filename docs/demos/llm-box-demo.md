---
title: Local LLM
description: Build a real use-case box with SmolLM2-1.7B-Instruct, a language model that runs with no network, no API key and no account.
outline: [2,3]
---

# Local LLM demo box

Model: *[SmolLM2-1.7B-Instruct (GGUF Q4_K_M)](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct)*

> <small> Runtime: **`python`** — the box starts its own interpreter on a declared entry point. </small>

---

A large language model is the thing behind a chat assistant: you give it text, it continues it. Every
one you have used through a website answers somewhere else, on someone else's hardware, behind an
account and an API key.

This demo takes SmolLM2-1.7B-Instruct, quantised to 4 bits in GGUF form, and ships it as a signed,
self-contained box that answers on your own machine.

```text
$ scrollcase run .scrollcase/.../*.release.json \
  -- "What is the capital of Italy?"

Rome.
```

::: info You define what the box should contain, Scrollcase handles it:
No Python environment to prepare, no model to download at run time, no container. The model and
everything it needs are inside the box, which runs it in its own environment.
:::

There is no network call in that command, no key, and no account — and unlike a hosted assistant,
nothing about the question leaves the machine.

## Try the demo

Download a signed box and run it in a minute, or package one yourself in a Codespace. Both end with
the same box; only one of them asks you to build it.

<Tabs :titles="['GitHub codespaces', 'Pre-built box']">
<Tab title="GitHub codespaces">

### Build it yourself

The demo repository is almost empty on purpose: you package the model yourself, and its README is
the walkthrough. Install the CLI, initialise the workspace, create the scroll, declare the model's
pinned file, lock, commit, sign and build. Longer than the [sentiment demo](/demos/sentiment-demo):
most of the wait is the 1.06 GB model, fetched once to pin its hash and once to build.

<Button
  href="https://codespaces.new/suffro/scrollcase-e2e-demo-SmolLM2-1.7B-Instruct-GGUF?quickstart=1"
  external
>

Open in GitHub Codespaces

</Button>

</Tab>
<Tab title="Pre-built box">

### Download the prebuilt box

Signed boxes for Linux, macOS and Windows are published on the Scrollcase repository. Fetch the public key from the repository, verify, run. This path needs neither pixi nor a build, and nothing is downloaded while the box runs.

Download the one matching your machine:

|macOS (Apple silicon)|Linux (CPU)|Windows (CPU)|
|--|--|--|
|[`macos-aarch64-cpu`](https://github.com/suffro/scrollcase/releases/download/llm-demo-v1/llm-demo-1.0.0-macos-aarch64-cpu.zip)|[`linux-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/llm-demo-v1/llm-demo-1.0.0-linux-x86_64-cpu.zip)|[`windows-x86_64-cpu`](https://github.com/suffro/scrollcase/releases/download/llm-demo-v1/llm-demo-1.0.0-windows-x86_64-cpu.zip)|

<Button
  href="https://github.com/suffro/scrollcase/releases/tag/llm-demo-v1"
  external
>

Release page

</Button>

::: tip NOTE

The file you download is **NOT** the box — it is a container, named so you can tell which machine it
is for, holding the box together with two ready-to-run examples. The box is the <samp>.zip</samp>
inside it under <samp>box/</samp>, next to its <samp>.release.json</samp>. Do not unzip that one:
it's ready to run. Leave both named as they are and side by side, because that is how `verify` finds
the box.

:::

Unpack it, fetch the key beside it rather than inside it, then verify and run:

```sh
unzip llm-demo-1.0.0-<target>.zip -d llm-box-demo
cd llm-box-demo
mkdir keys
curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json

npm install -g scrollcase
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json
```

```sh
scrollcase run box/*.release.json --public-key keys/example-signing-public.json \
  -- "What is the capital of Italy?"
```

A sentence is answered once. The same command with no sentence opens an interactive
[chat](#two-modes-one-box) instead:

```sh
scrollcase run box/*.release.json --public-key keys/example-signing-public.json
```

`run-box.ts` and `run_box.py` ship in the same folder and reach both modes from Node and from
Python: `npx tsx run-box.ts "Who wrote the Divine Comedy?"`, or nothing after it for the chat.

> <small>`box/*.release.json` is a real shell glob, not a placeholder. PowerShell does not expand it
> for a command like this, so use `(Get-ChildItem box\*.release.json).FullName` or type the file name
> you see under `box/`. You never name the box archive: `verify` finds it beside the release
> document, under the hash that document commits to.</small>

</Tab>
</Tabs>

## Two modes, one box

Give it words and it answers once. Give it nothing and it opens a chat:

```text
$ scrollcase run .scrollcase/.../*.release.json

loading smollm2-1.7b-instruct-q4_k_m.gguf …
ready in 1.4s · 2 threads · 2048-token context
/exit or Ctrl-D to quit, Ctrl-C to cancel an answer
> what is a hash function?
generating …
A hash function maps data of any size to a fixed-size value. …
> give me an example of one
```

<sub>Shape of a session, not a recording.</sub>

The second question has no subject in it, and it still works: the box keeps the conversation and
sends it back each turn, on a single load of the weights. That is the difference between a chat and
a loop that calls a one-shot twice — and on CPU, where loading a gigabyte is a visible cost, it is
also the difference between the box feeling like a program and feeling like a conversation.

Nothing is rebuilt to get it. Same release file, same signature, same entrypoint: the mode is
decided by whether there are arguments, because `execution.defaultArgs` is `[]` and a bare `run`
therefore reaches the box with an empty argument list. A `--chat` flag would have had to be declared
in the scroll and signed into the release.

## What the demo shows

**A signed release, verified before execution.** The release document commits to the archive by size
and SHA-256, and the archive's filename *is* its content hash. `verify` checks the signature against
a public key you obtain independently of the download. The mechanics are the same as any other box;
what changes here is what the guarantee covers, which is a whole language model rather than a
configuration file.

**The whole model is one file.** A GGUF is a single container holding the weights, the tokenizer
*and* the chat template, so the scroll declares exactly **one** asset where the sentiment demo needs
three — and there is no tokenizer that can drift out of step with the weights it belongs to. It is
pinned to an immutable upstream commit, with the size and SHA-256 that `add asset` recorded when it
fetched the file. Embedded by default, it is packed into the archive, so the box installs and runs
air-gapped.

**Offline because there is no downloader, not because a variable says so.** The sentiment demo
declares `HF_HUB_OFFLINE=1` and two siblings as defence in depth, and it needs them: a Hugging Face
client really is present in its environment, pulled in transitively. This stack has none.
`entrypoint.py` imports `llama_cpp` and nothing else, and what keeps the box offline is that there is
no code in it that could phone home. Copying those variables across would have looked reassuring and
guaranteed nothing, so they are deliberately absent.

**The one environment variable that does earn its place.** `PYTHONDONTWRITEBYTECODE=1`, because a
`.pyc` carries a timestamp. Without it the self-test's own `import entrypoint` writes one into the
payload before the payload is hashed, and a box that was extracted, run, and verified again fails the
second verification — twice defeated by a cache file nobody asked for.

**A self-test that has to actually generate.** It loads the gigabyte with the box's own interpreter
and asserts that the answer to *What is the capital of Italy?* contains `rome`. Greedy decoding
(`temperature=0.0`) is what makes that reproducible enough to assert on content rather than merely on
the model having emitted something — and it asserts a substring, not a sentence, so a llama.cpp point
release that rewords the answer does not fail a build for a reason nobody cares about.

**One declared dependency is not one dependency shipped.** The scroll declares
`llama-cpp-python` and nothing else. What arrives with it is the compiled `llama.cpp` — and also
`fastapi`, `uvicorn`, `pydantic-settings`, `numpy` and `diskcache`, because the upstream package
ships an OpenAI-compatible server this box never starts. Every one of them appears by name in the
licence inventory that `audit` derives from the lock file, which is the point of having one.

## What you write

The walkthrough packages a single target, so unlike the sentiment demo there is no
[split scroll](/reference/scroll#one-box-several-targets) — just one directory:

```text
scrolls/llm-demo/
  linux-x86_64-cpu/
    scroll.json      # identity, the asset, the notices, the environment, the self-test
    pixi.toml        # python 3.11 + llama-cpp-python
    self_test.py     # the one file you open in an editor
```

`scrollcase new scroll` asks eight questions and writes the rest. The model and runtime identity, the
box version, the pixi version and the interpreter path are all defaults worth taking; what it cannot
guess is the target, what the box is called, which revision of the model is inside, where you will
publish it, and what runs when someone starts it.

No hash is typed by hand anywhere. `scrollcase add asset` fetches the GGUF once and records the size
and SHA-256 it found; the notices and the entrypoint are pinned the same way, and
[`scrollcase refresh`](/reference/cli#refresh) moves those digests after a reviewed change.

The scroll embeds the asset, declares a **4 GB RAM floor**, and names `execution` as a `python-script`. That
floor is arithmetic rather than a guess: the quantised weights occupy about 1.0 GB and the attention
cache adds 384 MiB at the 2048-token context the entrypoint asks for, which lands around 1.5–1.8 GB
resident. It is a fact a consumer can check *before* unpacking a gigabyte.

The packaged version of the same box, the one CI builds for all three operating systems, is
`examples/llm-demo/` in the Scrollcase repository. There the three targets *do* share a
[split scroll](/reference/scroll#one-box-several-targets): one base carrying the identity, the asset,
the environment and the self-test, and three target files of nine lines each — twelve on macOS, which
switches the packaged Metal backend off with `GGML_METAL_DEVICES=0` so that a box named `cpu` is
one ([why that is not automatic](/guides/troubleshooting#running-a-box)). Its `entrypoint.py` is byte
for byte the one the walkthrough ships, and a test asserts the declared hashes still match, so the
two copies cannot drift apart quietly.

## Measured

The box has been built, self-tested, verified and run on all three CPU targets — Linux, macOS and
Windows — by the workflow that publishes it. Each one loads its own gigabyte with its own interpreter
and has to answer *What is the capital of Italy?* with Rome before it is allowed to be signed.

On an M1 MacBook Air the published archive is 1.16 GB, unpacks to 1.3 GB, loads in two to four
seconds and generates about 13 tokens per second on eight threads.

## What to expect

**Running one:**

- **Generation is CPU-bound.** On the 2 vCPU a default Codespace gives you, expect single-digit
  tokens per second, so a long answer takes tens of seconds. Output is capped at 160 tokens, and a
  `generating …` line on stderr keeps the wait from looking like a hang.
- **The context is 2048 tokens**, shared between the conversation and the answer. In chat mode the
  oldest exchanges are dropped when it fills, and the box says so on stderr rather than failing.

**Building one:**

- **About 2.1 GB is downloaded** — the 1.06 GB GGUF once when `add asset` records its hash, and
  again when the build fetches it. Fast inside a Codespace, but worth knowing before you start.
- **5–6 GB of disk** goes to environment, payload, archive and downloads, against a Codespace's 32
  GB. It fits; a second build in the same session does not leave much room.

## Scope and limitations

This is a **demonstration of packaging**, not an assistant product, and the model is small: 1.7
billion parameters. It states false things fluently and gives no signal that it is doing so, it knows
nothing of events after its training data, and it cannot reliably do arithmetic or cite sources.

The 4-bit quantisation is a **lossy** transformation of the original bfloat16 checkpoint — it is what
turns 3.4 GB of parameters into a 1.06 GB file that loads on a laptop, and it shifts outputs
unevenly. A prompt the original answers correctly is not guaranteed to be answered correctly here, so
every limitation the model card documents applies at least as strongly to this box.

It was trained primarily on **English** and its outputs reflect the biases of that data. Do not use
it for factual lookup, for decisions about people, or for anything you would not check yourself.

- [Original model card and limitations](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct#limitations)
- [GGUF conversion, pinned revision](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/commit/2d4a76a30b4af41ecd395c35725ac11688d4cfe4)

Both the original checkpoint and the GGUF conversion are published by the same upstream party under
Apache-2.0, and the box ships the full licence text next to the model notice.
