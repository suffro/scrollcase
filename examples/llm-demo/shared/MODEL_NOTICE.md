# Model notice — SmolLM2-1.7B-Instruct (GGUF Q4_K_M)

This box embeds a third-party machine-learning model. The notice below records where that model
comes from, what it may reasonably be used for, and where its documented limitations are described.

## What is embedded

| File | Origin |
| --- | --- |
| `model-cache/llm-demo/smollm2-1.7b-instruct-q4_k_m.gguf` | GGUF Q4_K_M conversion, revision `2d4a76a30b4af41ecd395c35725ac11688d4cfe4` |

One file, and that is the whole model: a GGUF carries the weights, the tokenizer and the chat
template together, so there is no separate `tokenizer.json` or `config.json` to ship alongside it.
It is fetched from an immutable, commit-pinned URL and hashed in the scroll. The box performs no
download at run time.

## Attribution

Two upstream artefacts are involved, and they are attributed separately.

**Original model.** `HuggingFaceTB/SmolLM2-1.7B-Instruct` — the 1.7B instruction-tuned member of
the SmolLM2 family, trained by Hugging Face. Licensed under Apache-2.0 by its authors. Model card:
<https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct>

The revision the quantisation below was produced from is:
<https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/commit/31b70e2e869a7173562077fd711b654946d38674>

**GGUF quantisation.** `HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF`, the same authors' conversion of
that checkpoint to GGUF with Q4_K_M quantisation. The exact revision embedded here is:
<https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/commit/2d4a76a30b4af41ecd395c35725ac11688d4cfe4>

Both repositories are published by the same upstream party under Apache-2.0, and the grant recorded
in `APACHE-2.0.txt` accompanies the model.

## What Q4_K_M means here

The original weights are bfloat16; the embedded file is quantised to roughly 4 bits per weight,
which is what turns 3.4 GB of parameters into a 1.06 GB file that loads on a laptop. That is a
**lossy** transformation. Quantisation shifts individual outputs relative to the float checkpoint,
and it does so unevenly — a prompt the original answers correctly is not guaranteed to be answered
correctly here. Every limitation below should be read as applying at least as strongly to this file
as to the model card it points at.

## Intended use

This box is a **demonstration** of running a signed, self-contained language model with no network,
no API key and no account. It takes an English prompt and returns a short answer.

It is a **1.7-billion-parameter model**, which is small. It states false things fluently and with no
signal that it is doing so, it has no knowledge of events after its training data, and it cannot
reliably do arithmetic, cite sources, or tell you when it does not know something.

It is not intended for, and should not be used for: factual lookup, decisions about people,
moderation, clinical, legal or financial judgement, code you will run unreviewed, or any non-English
text. Prompt and answer together are truncated to a 2048-token context.

## Limitations and bias

The upstream model card documents that SmolLM2 was trained primarily on English data, that its
outputs reflect biases present in that data, and that the generated content may not always be
factually accurate or free from bias. Those limitations carry over to this box unchanged.

Read the upstream limitations section before drawing any conclusion from an output:
<https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct#limitations>

## Third-party dependency licences

The conda dependencies resolved into this box are inventoried separately, derived from the
committed lock file, and shipped alongside this notice.
