"""Runs the local LLM demo box through the typed Python consumer.

The Python consumer is published separately on PyPI, and needs no Node at all.

SETUP (once):

    python -m pip install scrollcase-consumer

RUN (from this folder):

    python run_box.py "a question of your own"   answer once and exit
    python run_box.py                            open the box's interactive chat

The public key is not shipped with the box: download it first, as the guide describes. A signature
only proves where something came from if the key does not travel with it.

Both modes are the box's, not this script's, and reaching them takes no extra code: `run_box` leaves
this process's streams to the child, so the chat reads the terminal you started it from. Started
without one -- a pipe, a CI step -- the chat meets end of input and exits, which is why a script that
has to produce an answer passes a question rather than relying on the mode.
"""

from __future__ import annotations

import sys
from pathlib import Path

from scrollcase_consumer import PreparedBox, run_box

# The release document is named for its own SHA-256, so it is found rather than hard-coded. The box
# archive is never named here: the consumer resolves it beside this document, under the hash the
# document commits to.
releases = sorted(Path("box").glob("*.release.json"))
if not releases:
    raise SystemExit("No .release.json in box/ — unpack the downloaded archive first.")

# Straight through, with nothing substituted for an empty list. The release declares no default
# arguments, so what arrives here is what decides the mode: words are a question answered once, and
# no words at all is how the box is told to open a chat. A template that supplied a prompt of its own
# would always run and would teach the wrong rule -- that a box needs one.
ARGS = sys.argv[1:]


def report(prepared: PreparedBox) -> None:
    """Runs after verification and before the box interpreter starts."""

    # On stderr, not stdout: the box writes its answer to this process's stdout, and the promise that
    # redirecting it gives you a file with the answer and nothing else is one a script wrapping the
    # box has to keep too. Flushed because the box writes to the same terminal, and an unflushed line
    # would appear after the output it introduces.
    print(
        f"Running {prepared.box_id} {prepared.version} ({prepared.target_id})",
        file=sys.stderr,
        flush=True,
    )
    print(
        f"Prompt: {' '.join(ARGS)}" if ARGS else "No prompt: opening the chat",
        file=sys.stderr,
        flush=True,
    )


result = run_box(
    releases[0],
    public_key_path="keys/example-signing-public.json",
    args=ARGS,
    on_prepared=report,
)

if result.signal:
    print(f"Box exited after {result.signal}.", file=sys.stderr)
raise SystemExit(result.exit_code if result.exit_code is not None else 1)
