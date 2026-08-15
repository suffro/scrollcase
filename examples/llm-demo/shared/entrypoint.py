#!/usr/bin/env python3
"""Local LLM entrypoint for the SmolLM2-1.7B-Instruct GGUF box.

Reads its weights from inside the box payload, at the location the box's own
`box.json` declares. Nothing is downloaded at run time, no hub client is imported
and no API key exists: the box answers on the machine it is unpacked on.

The application prints exactly one thing to stdout -- the model's answer.
Everything else -- progress, timings, usage, failures -- goes to stderr, so the
answer can be piped into another program without filtering. The chat prompt is
part of "everything else": it is written to stderr too, which is what keeps
`entrypoint.py < questions.txt > answers.txt` producing a file of just answers.

Given words, it answers once and exits. Given nothing, it opens a chat that
holds the conversation across turns on a single load of the weights.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

BOX_MANIFEST = "box.json"
MODEL_SUFFIX = ".gguf"

# 2048 tokens of context costs 384 MiB of KV cache on this model, which is what
# `compatibility.minRamGb: 4` in the scroll was measured against. SmolLM2 was
# trained with an 8192-token window, so this is a memory decision, not a limit of
# the checkpoint -- raising it raises the box's real memory requirement with it.
CONTEXT_TOKENS = 2048
MAX_OUTPUT_TOKENS = 160

# Greedy decoding. `temperature=0.0` is what makes the answer reproducible for a
# fixed build, and reproducible is what lets the self-test assert on content
# rather than merely on the model having emitted something. The seed is set for
# the same reason and matters only if a later change reintroduces sampling.
TEMPERATURE = 0.0
SEED = 0

# Sent as the first message on every turn, which also settles a difference that
# would otherwise be invisible: this GGUF carries a `tokenizer.chat_template`
# whose first branch injects its own system prompt when the caller supplies none,
# while llama-cpp-python's built-in `chatml` formatter injects an empty one.
# Supplying a system message means both paths build the same prompt.
SYSTEM_PROMPT = "You are a helpful assistant. Answer concisely and factually."

# Stated rather than detected. The template above is ChatML and the built-in
# formatter of that name matches it, but a formatter chosen from file metadata is
# a formatter that can change when the file is re-quantised upstream.
CHAT_FORMAT = "chatml"

# What a ChatML turn costs beyond its text: `<|im_start|>`, the role, a newline
# and `<|im_end|>`. Used only to decide when to drop old turns, so an estimate
# that errs high is the right kind of wrong.
MESSAGE_OVERHEAD_TOKENS = 5

CHAT_PROMPT = "> "
EXIT_COMMAND = "/exit"

# llama.cpp explains a failed load in its own log, which this box mutes: a demo that prints
# two hundred lines of tensor repacking before its first token is a demo nobody reads. The
# cost of muting it is the one run where that log was the whole answer -- a Metal backend
# that would not initialise says so there and nowhere else -- so the switch stays reachable
# from outside. Read from the host and deliberately not declared in the scroll: a value the
# release states would win over the one the person debugging sets.
VERBOSE_VARIABLE = "LLM_DEMO_VERBOSE"

USAGE = (
    "usage: entrypoint.py WORD [WORD ...]   answer once and exit\n"
    "       entrypoint.py                   start an interactive chat"
)


class DemoError(RuntimeError):
    """A failure that should be reported to the user, not a stack trace."""


def box_root() -> Path:
    """The box payload root, resolved from this file and never from the caller's cwd."""
    return Path(__file__).resolve().parent


def model_dir() -> Path:
    """Model directory, as the box itself declares it.

    A box ships a `box.json` at its root, and one of the things it states is
    `modelCacheSubdir` -- where the model files were placed. Reading it here means
    the application never has to guess a path, and the scroll never has to be bent
    to match a constant compiled into this file. Change where the model lives and
    this keeps working; hard-code it and the two drift apart silently.
    """
    root = box_root()
    manifest = root / BOX_MANIFEST
    if not manifest.is_file():
        raise DemoError(f"missing box manifest: {manifest}")
    try:
        with manifest.open(encoding="utf-8") as handle:
            subdirectory = json.load(handle)["modelCacheSubdir"]
    except (KeyError, ValueError) as error:
        raise DemoError(f"{BOX_MANIFEST} declares no usable modelCacheSubdir: {error}") from None
    return root.joinpath(*str(subdirectory).split("/"))


def model_path() -> Path:
    """The single GGUF in the model directory.

    A GGUF is self-contained -- weights, tokenizer and chat template in one file --
    so this box has exactly one, and finding two means the box was assembled with
    something this entrypoint cannot describe honestly. Better to say so than to
    pick one by sort order.
    """
    directory = model_dir()
    if not directory.is_dir():
        raise DemoError(f"missing model directory: {directory}")
    candidates = sorted(directory.glob(f"*{MODEL_SUFFIX}"))
    if len(candidates) != 1:
        found = ", ".join(path.name for path in candidates) or "nothing"
        raise DemoError(f"expected exactly one {MODEL_SUFFIX} in {directory}, found {found}")
    return candidates[0]


def join_words(words) -> str:
    """Join positional words into a single prompt."""
    return " ".join(words).strip()


def thread_count() -> int:
    """Usable CPUs, from the process affinity mask where the platform has one.

    `os.cpu_count()` reports the machine, not the container: on a 2-vCPU Codespace
    pinned out of a larger host it can read high, and oversubscribing llama.cpp
    with threads that never get scheduled makes generation slower, not faster.
    """
    try:
        return max(1, len(os.sched_getaffinity(0)))
    except AttributeError:  # not Linux
        return max(1, os.cpu_count() or 1)


def format_stats(stats: dict) -> str:
    """The one-line stderr summary printed after a successful generation."""
    return (
        f"loaded in {stats['load_seconds']:.1f}s"
        f" · {stats['output_tokens']} tokens in {stats['generate_seconds']:.1f}s"
        f" · {stats['tokens_per_second']:.1f} tok/s"
        f" · {stats['threads']} threads"
    )


def format_turn_stats(output_tokens: int, seconds: float) -> str:
    """The same summary for a chat turn, where the load already happened."""
    rate = output_tokens / seconds if seconds > 0 else 0.0
    return f"{output_tokens} tokens in {seconds:.1f}s · {rate:.1f} tok/s"


def load_model() -> tuple[object, float, int]:
    """Load the GGUF and return (model, load_seconds, threads).

    Separate from `generate` because a chat session pays this cost once and then
    answers many turns with the same instance, while a one-shot run pays it and
    exits. The two callers differ only in how often they call this.
    """
    from llama_cpp import Llama

    path = model_path()
    verbose = bool(os.environ.get(VERBOSE_VARIABLE))

    print(f"loading {path.name} …", file=sys.stderr, flush=True)
    load_started = time.monotonic()
    threads = thread_count()
    try:
        model = Llama(
            model_path=str(path),
            n_ctx=CONTEXT_TOKENS,
            n_threads=threads,
            seed=SEED,
            chat_format=CHAT_FORMAT,
            verbose=verbose,
        )
    except Exception as error:  # llama.cpp raises several unrelated types here
        hint = "" if verbose else f" (set {VERBOSE_VARIABLE}=1 to see llama.cpp's own log)"
        raise DemoError(f"could not load {path.name}: {error}{hint}") from None
    return model, time.monotonic() - load_started, threads


def complete(model, messages: list) -> tuple[str, int, float]:
    """One completion from an already-loaded model: (answer, tokens, seconds).

    `KeyboardInterrupt` is deliberately not caught. llama.cpp returns to Python
    between tokens, so a Ctrl-C during generation lands here, and the caller --
    which knows whether it is a script or a chat turn -- decides what that means.
    """
    started = time.monotonic()
    try:
        response = model.create_chat_completion(
            messages=messages,
            temperature=TEMPERATURE,
            max_tokens=MAX_OUTPUT_TOKENS,
            seed=SEED,
        )
    except Exception as error:
        raise DemoError(f"generation failed: {error}") from None
    seconds = time.monotonic() - started

    try:
        answer = response["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        raise DemoError("the model returned no message") from None

    output_tokens = int(response.get("usage", {}).get("completion_tokens", 0))
    return answer.strip(), output_tokens, seconds


def generate(prompt: str) -> tuple[str, dict]:
    """Run the embedded model on CPU and return (answer, statistics).

    Loads, answers one prompt and returns. This is what the box's self-test
    calls, and its shape is fixed by that: one call, no session, no terminal.
    """
    model, load_seconds, threads = load_model()

    print("generating …", file=sys.stderr, flush=True)
    answer, output_tokens, generate_seconds = complete(
        model,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )

    statistics = {
        "load_seconds": load_seconds,
        "generate_seconds": generate_seconds,
        "output_tokens": output_tokens,
        "tokens_per_second": output_tokens / generate_seconds if generate_seconds > 0 else 0.0,
        "threads": threads,
        "context_tokens": CONTEXT_TOKENS,
    }
    return answer, statistics


def trim_history(model, messages: list) -> int:
    """Drop the oldest turns until the conversation fits, and say how many went.

    A chat that keeps every turn eventually sends more than `CONTEXT_TOKENS` and
    llama.cpp refuses the request -- so a session that felt fine for five turns
    dies on the sixth. Dropping from the front keeps the recent turns, which are
    the ones a follow-up question refers to.

    Two messages are never dropped: the system prompt at index 0, which is what
    makes the prompt match the GGUF's own template, and the newest user message,
    which is the question being asked. If that one alone will not fit, no amount
    of trimming helps and `complete` reports the refusal.
    """
    budget = CONTEXT_TOKENS - MAX_OUTPUT_TOKENS
    sizes = [
        len(model.tokenize(message["content"].encode("utf-8"), add_bos=False))
        + MESSAGE_OVERHEAD_TOKENS
        for message in messages
    ]
    total = sum(sizes)

    dropped = 0
    while total > budget and len(messages) > 2:
        total -= sizes.pop(1)
        messages.pop(1)
        dropped += 1
    return dropped


def chat(input_fn=input, load_fn=load_model) -> int:
    """Interactive chat: one model load, one message list, many turns."""
    try:  # line editing and history if the interpreter has them, plain input if not
        import readline  # noqa: F401
    except ImportError:
        pass

    model, load_seconds, threads = load_fn()
    print(
        f"ready in {load_seconds:.1f}s · {threads} threads · {CONTEXT_TOKENS}-token context",
        file=sys.stderr,
    )
    print(f"{EXIT_COMMAND} or Ctrl-D to quit, Ctrl-C to cancel an answer", file=sys.stderr)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    while True:
        print(CHAT_PROMPT, end="", file=sys.stderr, flush=True)
        try:
            line = input_fn()
        except EOFError:  # Ctrl-D, or the end of a piped script
            print(file=sys.stderr)
            return 0
        except KeyboardInterrupt:  # Ctrl-C at the prompt abandons the line, not the session
            print(f"\n({EXIT_COMMAND} or Ctrl-D to quit)", file=sys.stderr)
            continue

        line = line.strip()
        if not line:
            continue
        if line == EXIT_COMMAND:
            return 0

        messages.append({"role": "user", "content": line})
        dropped = trim_history(model, messages)
        if dropped:
            print(f"(dropped {dropped} older message(s) to fit the context)", file=sys.stderr)

        print("generating …", file=sys.stderr, flush=True)
        try:
            answer, output_tokens, seconds = complete(model, messages)
        except KeyboardInterrupt:
            # The turn never happened. Removing the user message too keeps the
            # history a clean alternation, so the next answer is not conditioned
            # on a question this model never got to answer.
            messages.pop()
            print("\n(cancelled)", file=sys.stderr)
            continue
        except DemoError as error:
            messages.pop()
            print(f"error: {error}", file=sys.stderr)
            continue

        if not answer:
            messages.pop()
            print("error: the model produced an empty answer", file=sys.stderr)
            continue

        print(answer, flush=True)
        print(format_turn_stats(output_tokens, seconds), file=sys.stderr)
        messages.append({"role": "assistant", "content": answer})


def main(argv, generate_fn=generate, chat_fn=chat) -> int:
    """Argument handling and output formatting, with injectable back ends."""
    # The mode is the argument list, not a flag and not a second box: words are a
    # question, nothing is a conversation. `execution.defaultArgs` is `[]`, so
    # `scrollcase run <release>` with no `--` lands here and opens the chat.
    if not argv:
        try:
            return chat_fn()
        except DemoError as error:
            print(f"error: {error}", file=sys.stderr)
            return 1

    prompt = join_words(argv)
    if not prompt:
        print(USAGE, file=sys.stderr)
        return 2

    try:
        answer, statistics = generate_fn(prompt)
    except DemoError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    # Stripped here and not only in `generate`, so the guard holds for whatever is
    # passed in: a model that emits nothing but a newline is an empty answer, and
    # this is the function that decides what reaches stdout.
    answer = (answer or "").strip()
    if not answer:
        print("error: the model produced an empty answer", file=sys.stderr)
        return 1

    print(answer)
    print(format_stats(statistics), file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised by the box itself
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        # Ctrl-C somewhere the loop does not handle -- during the model load, or
        # during a one-shot generation. 128 + SIGINT, so a shell sees it as an
        # interrupt rather than as a program that failed.
        print(file=sys.stderr)
        sys.exit(130)
