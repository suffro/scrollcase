#!/usr/bin/env python3
"""Sentiment demo entrypoint for the DistilBERT SST-2 ONNX INT8 box.

Reads its model, tokenizer and config from files that live next to this script
inside the box payload. Nothing is downloaded at run time and no Hugging Face
client library is imported: the box is fully self-contained.

The application prints exactly two lines to stdout:

    Sentiment: POSITIVE
    Confidence: 99.9%

Everything else -- usage, diagnostics, failures -- goes to stderr.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

MODEL_SUBDIR = ("model-cache", "distilbert-sst2")
MODEL_FILE = "model_int8.onnx"
TOKENIZER_FILE = "tokenizer.json"
CONFIG_FILE = "config.json"

MAX_TOKENS = 128
EXPECTED_LABEL_IDS = (0, 1)

USAGE = "usage: entrypoint.py WORD [WORD ...]"


class DemoError(RuntimeError):
    """A failure that should be reported to the user, not a stack trace."""


def model_dir() -> Path:
    """Model directory, resolved from this file and never from the caller's cwd."""
    return Path(__file__).resolve().parent.joinpath(*MODEL_SUBDIR)


def join_words(words) -> str:
    """Join positional words into a single sentence."""
    return " ".join(words).strip()


def label_map_from_config(config: dict) -> dict[int, str]:
    """Read and validate `id2label` from an already-parsed config.json.

    DistilBERT SST-2 is a binary classifier: any other label map means the box
    was assembled with a model this entrypoint cannot describe honestly.
    """
    raw = config.get("id2label")
    if not isinstance(raw, dict):
        raise DemoError("config.json has no id2label object")

    labels: dict[int, str] = {}
    for key, value in raw.items():
        try:
            label_id = int(key)
        except (TypeError, ValueError):
            raise DemoError(f"id2label has a non-integer key: {key!r}") from None
        if not isinstance(value, str) or not value.strip():
            raise DemoError(f"id2label[{key!r}] is not a non-empty string")
        labels[label_id] = value

    if tuple(sorted(labels)) != EXPECTED_LABEL_IDS:
        raise DemoError(
            f"expected label ids {list(EXPECTED_LABEL_IDS)}, got {sorted(labels)}"
        )
    return labels


def stable_softmax(logits) -> list[float]:
    """Softmax that subtracts the maximum logit before exponentiation."""
    values = [float(v) for v in logits]
    if not values:
        raise DemoError("cannot compute softmax of an empty row")
    largest = max(values)
    exponentiated = [math.exp(v - largest) for v in values]
    total = sum(exponentiated)
    return [v / total for v in exponentiated]


def single_logit_row(output) -> list[float]:
    """Require exactly one two-label output row and return it as plain floats."""
    rows = [list(row) for row in output]
    if len(rows) != 1:
        raise DemoError(f"expected 1 output row, got {len(rows)}")
    row = rows[0]
    if len(row) != len(EXPECTED_LABEL_IDS):
        raise DemoError(f"expected {len(EXPECTED_LABEL_IDS)} logits, got {len(row)}")
    return [float(v) for v in row]


def format_output(label: str, confidence: float) -> str:
    """The two application lines, with the confidence as a one-decimal percentage."""
    return f"Sentiment: {label}\nConfidence: {confidence * 100:.1f}%"


def predict(sentence: str) -> tuple[str, float]:
    """Run the embedded INT8 model on CPU and return (label, confidence)."""
    import numpy as np
    import onnxruntime
    from tokenizers import Tokenizer

    directory = model_dir()
    for name in (MODEL_FILE, TOKENIZER_FILE, CONFIG_FILE):
        if not directory.joinpath(name).is_file():
            raise DemoError(f"missing box payload file: {directory / name}")

    with directory.joinpath(CONFIG_FILE).open(encoding="utf-8") as handle:
        labels = label_map_from_config(json.load(handle))

    tokenizer = Tokenizer.from_file(str(directory / TOKENIZER_FILE))
    tokenizer.enable_truncation(max_length=MAX_TOKENS)
    encoding = tokenizer.encode(sentence)

    # DistilBERT takes no token_type_ids.
    feeds = {
        "input_ids": np.array([encoding.ids], dtype=np.int64),
        "attention_mask": np.array([encoding.attention_mask], dtype=np.int64),
    }

    session = onnxruntime.InferenceSession(
        str(directory / MODEL_FILE), providers=["CPUExecutionProvider"]
    )
    expected = {i.name for i in session.get_inputs()}
    if not expected.issubset(feeds):
        raise DemoError(f"model expects inputs {sorted(expected)}")

    outputs = session.run(None, {k: v for k, v in feeds.items() if k in expected})
    probabilities = stable_softmax(single_logit_row(outputs[0]))

    best = max(range(len(probabilities)), key=probabilities.__getitem__)
    return labels[best], probabilities[best]


def main(argv, predict_fn=predict) -> int:
    """Argument handling and output formatting, with an injectable predictor."""
    sentence = join_words(argv)
    if not sentence:
        print(USAGE, file=sys.stderr)
        return 2

    try:
        label, confidence = predict_fn(sentence)
    except DemoError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    print(format_output(label, confidence))
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised by the box itself
    sys.exit(main(sys.argv[1:]))
