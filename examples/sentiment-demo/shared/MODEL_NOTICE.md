# Model notice — DistilBERT SST-2 (ONNX INT8)

This box embeds a third-party machine-learning model. The notice below records where that model
comes from, what it may reasonably be used for, and where its documented limitations are described.

## What is embedded

| File | Origin |
| --- | --- |
| `model-cache/distilbert-sst2/model_int8.onnx` | ONNX INT8 conversion, revision `fd49941c1b822846cb14970cdf430a7cfbe0f5b9` |
| `model-cache/distilbert-sst2/tokenizer.json` | ONNX INT8 conversion, revision `fd49941c1b822846cb14970cdf430a7cfbe0f5b9` |
| `model-cache/distilbert-sst2/config.json` | ONNX INT8 conversion, revision `fd49941c1b822846cb14970cdf430a7cfbe0f5b9` |

Every file is fetched from an immutable, commit-pinned URL and hashed in the scroll. The box
performs no download at run time.

## Attribution

Two upstream parties are involved, and they are attributed separately.

**Original model.** `distilbert/distilbert-base-uncased-finetuned-sst-2-english` — DistilBERT
base uncased, fine-tuned on the Stanford Sentiment Treebank v2 (SST-2). Licensed under
Apache-2.0 by its authors. Model card:
<https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english>

**ONNX conversion.** `onnx-community/distilbert-base-uncased-finetuned-sst-2-english-ONNX`, a
community conversion of that checkpoint to ONNX with INT8 quantisation. The exact revision
embedded here is:
<https://huggingface.co/onnx-community/distilbert-base-uncased-finetuned-sst-2-english-ONNX/commit/fd49941c1b822846cb14970cdf430a7cfbe0f5b9>

The Apache-2.0 grant recorded in `APACHE-2.0.txt` accompanies the **original** model. This notice
makes no claim that the community conversion repository independently published its own licence
metadata; it is included here as the immediate source of the embedded bytes.

## Intended use

This box is a **demonstration** of running a signed, self-contained model box. It is intended for
short English sentences and produces one of two labels, `POSITIVE` or `NEGATIVE`, with a
confidence value.

It is not intended for, and should not be used for, decisions about people, moderation,
clinical/legal/financial judgement, or any non-English text. Inputs longer than 128 tokens are
truncated.

## Limitations and bias

The upstream model card documents that this checkpoint reflects biases present in its training
data, and that its predictions can differ systematically for sentences mentioning
underrepresented populations. Those limitations carry over to this box unchanged — quantisation
does not remove them, and may itself shift individual predictions relative to the original
float checkpoint.

Read the upstream limitations section before drawing any conclusion from an output:
<https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english#risks-limitations-and-biases>

## Third-party dependency licences

The conda dependencies resolved into this box are inventoried separately, derived from the
committed lock file, and shipped alongside this notice.
