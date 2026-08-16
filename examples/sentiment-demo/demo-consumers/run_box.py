"""Runs the sentiment demo box through the typed Python consumer.

The Python consumer is published separately on PyPI, and needs no Node at all.

SETUP (once):

    python -m pip install scrollcase-consumer

RUN (from this folder):

    python run_box.py
    python run_box.py "a sentence of your own"

The public key is not shipped with the box: download it first, as the guide describes. A signature
only proves where something came from if the key does not travel with it.
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

# This box classifies a sentence, so it needs one. The release declares no default arguments, and
# the entrypoint exits with a usage message rather than inventing an input, so the sentence is
# supplied here — from the command line when given, otherwise the example from the guide.
ARGS = sys.argv[1:] or ["This product is surprisingly easy to use."]


def report(prepared: PreparedBox) -> None:
    """Runs after verification and before the box interpreter starts."""

    # On stderr, not stdout: the box writes its verdict to this process's stdout, and the promise
    # that redirecting it gives you a file with the verdict and nothing else is one a script wrapping
    # the box has to keep too. Flushed because the box writes to the same terminal, and an unflushed
    # line would appear after the output it introduces.
    print(
        f"Running {prepared.box_id} {prepared.version} ({prepared.target_id})",
        file=sys.stderr,
        flush=True,
    )
    print(f"Sentence: {' '.join(ARGS)}", file=sys.stderr, flush=True)


result = run_box(
    releases[0],
    public_key_path="keys/example-signing-public.json",
    args=ARGS,
    on_prepared=report,
)

if result.signal:
    print(f"Box exited after {result.signal}.", file=sys.stderr)
raise SystemExit(result.exit_code if result.exit_code is not None else 1)
