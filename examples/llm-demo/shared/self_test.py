"""Self-test: the box must load the model and answer a known question, or it is not signed.

Runs with the payload as its working directory and the box's own interpreter, after
`selfTest.imports` has already proved `llama_cpp` is importable. That ordering is why this
file can go straight to the thing that matters: making the real model generate.

The assertion is a substring, not a sentence. `entrypoint.py` decodes greedily, so the same
build on the same machine answers the same way every time -- but the answer is prose, and a
thread count or a llama.cpp point release can reword it without anything being wrong.
`"paris" in answer.lower()` tests what the box is for; an exact sentence would build a guard
that eventually fails for a reason nobody cares about, and teaches whoever meets it to delete
the guard.
"""

import os
import sys

sys.path.insert(0, os.getcwd())

from entrypoint import generate

answer, statistics = generate("What is the capital of France?")

assert answer.strip(), "the model produced no output"
assert "paris" in answer.lower(), f"unexpected answer: {answer!r}"
assert statistics["output_tokens"] > 0, "no tokens were generated"

print("self-test ok")
