# DistilBERT SST-2 ONNX INT8 end-to-end demo

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered.** The DistilBERT SST-2 ONNX INT8 end-to-end demo, published as `sentiment-demo`
> with its own signed release and documentation page. Written before version 3, so its scroll
> fields are the version 2 spelling.

Prepared: 2026-08-11  
Status: decision-complete plan; awaiting maintainer authorization  
Baseline: clean `main` at `1cb28eb75370fed338d3a60f037f623dc01c448e`

This is a local, git-ignored handoff. It authorizes no implementation, real build, toolchain
installation, external repository change, signing-key operation, publication, or release. Before
implementation, re-read `AGENTS.md` and `AGENT-POLICY.md`, check the current checkout, and replace
stale package or upstream facts with verified current values.

## 1. Maintainer decisions

1. Build a real sentiment-analysis demo around DistilBERT SST-2 in ONNX INT8 form.
2. Keep the existing `hello-box` demo unchanged.
3. Provide two independent experiences:
   - a Linux Codespaces workshop that builds the box from scratch;
   - a separate optional GitHub Release with prebuilt boxes for all three operating systems.
4. The Codespaces workshop uses explicit guided edits after `new scroll`; no helper hides the
   model-specific scroll and pixi configuration.
5. Show both Node and Python consumer examples in addition to the CLI.
6. Run the native build guard on relevant pushes and weekly.
7. The next end-to-end demo after this one is SmolLM2.

## 2. Outcome and success criteria

The primary happy path is:

```text
init -> new scroll -> configure -> lock -> audit -> keygen -> clean commit -> build -> verify -> run
```

The additional `audit` and clean-commit steps are intentional. The box must ship the
lock-derived dependency licence inventory, and a clean commit lets Scrollcase record honest clean
provenance instead of teaching `--allow-dirty`.

A successful application run prints only:

```text
Sentiment: POSITIVE
Confidence: <one decimal>%
```

The percentage is the model result, not a fixed acceptance value. The demo is complete only when:

- all three native boxes build, self-test, verify, and run;
- Node and Python consumers run the same boxes;
- a fresh Codespace completes the documented Linux workflow with no undocumented steps;
- rebuilds are byte-identical;
- every published wrapper is downloaded and executed after upload;
- public documentation clearly limits the model to demonstrative English SST-2 sentiment use and
  links its documented bias limitations.

## 3. Fixed box contract

Use these identities and versions:

| Field | Value |
| --- | --- |
| `boxId` | `sentiment-demo` |
| `modelId` | `distilbert-sst2-onnx-int8` |
| `runtimeId` | `onnxruntime-cpu` |
| box version | `1.0.0` |
| scroll version | `1.0.0` |
| Python | `3.11.*` |
| pixi | `0.73.0` |
| weights | `embed` |
| minimum RAM | 2 GB |
| distribution base | `https://assets.example.org/boxes` |
| ONNX source revision | `fd49941c1b822846cb14970cdf430a7cfbe0f5b9` |

Create target-specific scrolls for:

- `linux-x86_64-cpu` with conda platform `linux-64` and `venv/bin/python`;
- `macos-aarch64-cpu` with conda platform `osx-arm64` and `venv/bin/python`;
- `windows-x86_64-cpu` with conda platform `win-64` and `venv/python.exe`.

All three pixi manifests declare Python, `onnxruntime`, `tokenizers`, and `numpy`. Choose compatible
direct ranges shared by the three targets, then let the committed `pixi.lock` files pin the exact
packages. Inspect every lock and fail the work if Linux or Windows selected a CUDA build.

No Scrollcase schema, public API, generated type, consumer behavior, or contract fixture needs to
change for this demo.

## 4. Immutable model inputs

Embed exactly these files from the immutable ONNX conversion revision:

- `onnx/model_int8.onnx`;
- `tokenizer.json`;
- `config.json`.

Canonical upstream:

- original checkpoint and model card:
  <https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english>
- ONNX conversion commit:
  <https://huggingface.co/onnx-community/distilbert-base-uncased-finetuned-sst-2-english-ONNX/commit/fd49941c1b822846cb14970cdf430a7cfbe0f5b9>

During implementation, download each file once, calculate its exact byte count and SHA-256, and
record both in every scroll. Asset URLs must use `resolve/fd49941c1b822846cb14970cdf430a7cfbe0f5b9/...`;
never use `main`. Store the files under model-cache/distilbert-sst2/ in the payload.

Declare this signed runtime environment:

```json
{
  "HF_HUB_OFFLINE": "1",
  "TRANSFORMERS_OFFLINE": "1",
  "TOKENIZERS_PARALLELISM": "false"
}
```

The entrypoint uses direct local files and must not import `transformers`, `huggingface_hub`, or any
downloader. The offline variables are defense-in-depth and clear user-facing evidence, not a
substitute for local-only code.

## 5. Runtime application

Create one shared `entrypoint.py` for all targets.

Behavior:

1. Accept one or more positional words and join them into one sentence.
2. Reject missing or whitespace-only input with usage on stderr and exit code 2.
3. Resolve the model directory from `Path(__file__).resolve().parent`, never from the caller's cwd.
4. Load `tokenizer.json` with `tokenizers.Tokenizer` and enable truncation at 128 tokens.
5. Load `model_int8.onnx` through `onnxruntime.InferenceSession` with only
   `CPUExecutionProvider`.
6. Build `input_ids` and `attention_mask` as NumPy `int64` arrays; DistilBERT receives no
   `token_type_ids`.
7. Require one two-label output row, load `id2label` from `config.json`, and reject an unexpected
   label map or output shape.
8. Compute a stable softmax by subtracting the maximum logit before exponentiation.
9. Print the two application lines to stdout; diagnostics and failures go to stderr.
10. Expose an injectable `main(argv, predict_fn)` seam so argument handling and output formatting
    can be tested without installing ML dependencies.

The builder-only `selfTest.pythonCode` runs real predictions for:

- positive: `This product is surprisingly easy to use.`
- negative: `This was a frustrating and disappointing experience.`

It asserts the expected labels and finite confidences in `[0, 1]`, never a fixed percentage.
`selfTest.files` names the entrypoint, all three model assets, the model notice, and the licence.

Scrollcase schema v2 signs only the import subset of the self-test. Therefore:

- `build` proves both known-sentence inferences through `pythonCode`;
- `verify --self-test` repeats the signed import check with the box interpreter;
- `run` proves actual inference for the downloaded box.

Do not change the wire contract merely to make the consumer repeat builder-only Python assertions.

## 6. Licence and responsible-use material

The source model card identifies the checkpoint as English SST-2 under Apache-2.0 and documents
biases affecting underrepresented populations. Bundle:

- a concise MODEL_NOTICE.md naming the original model, ONNX conversion, both immutable revisions,
  Apache-2.0 attribution, intended English sentiment use, and bias/model-card link;
- the full Apache-2.0 text as `APACHE-2.0.txt`;
- the lock-derived conda dependency licence audit.

Place the notice and licence in the box under THIRD_PARTY_NOTICES/distilbert/ through hashed
`localFiles`. Do not claim that the community ONNX repository independently published licence
metadata; attribute the original model and the conversion separately.

Mark every hashed text file in `.gitattributes` so a Windows checkout cannot rewrite its bytes.

## 7. Canonical repository layout

Add a canonical `examples/sentiment-demo/` tree with:

```text
examples/sentiment-demo/
├── README.md
├── shared/
│   ├── entrypoint.py
│   ├── MODEL_NOTICE.md
│   └── APACHE-2.0.txt
├── consumers/
│   ├── run-box.mjs
│   ├── run_box.py
│   ├── package.json
│   ├── package-lock.json
│   └── requirements.txt
├── codespaces/
│   ├── README.md
│   ├── setup-demo.sh
│   ├── .devcontainer/devcontainer.json
│   ├── .gitignore
│   └── .gitattributes
├── release/README.md
├── linux-x86_64-cpu/{scroll.json,pixi.toml,pixi.lock,conda-licenses.json}
├── macos-aarch64-cpu/{scroll.json,pixi.toml,pixi.lock,conda-licenses.json}
└── windows-x86_64-cpu/{scroll.json,pixi.toml,pixi.lock,conda-licenses.json}
```

The exact final placement may flatten shared/ into the Codespaces bundle if that avoids copying,
but there must remain one canonical copy of each hashed entrypoint/legal file inside the Scrollcase
repository. Target scrolls may differ only in target, interpreter, conda platform, audit path, lock,
and values derived from those fields.

## 8. Node and Python consumers

The Node example:

- uses `runBox` from `scrollcase/consumer`;
- accepts release path, public-key path, and sentence as explicit arguments;
- forwards the sentence as the box `args` array;
- inherits box stdin/stdout/stderr;
- writes preparation information to stderr;
- pins exactly `scrollcase@0.9.1`, never `latest`.

The Python example mirrors it with `scrollcase_consumer.run_box` and pins exactly
`scrollcase-consumer==0.4.1`.

Both operate only on the caller-supplied local release/archive pair. They do not select releases,
download boxes, fetch model assets, or own installation lifecycle.

## 9. Codespaces workshop

Create the external companion repository:

```text
suffro/scrollcase-sentiment-demo-codespace
```

Its tracked content is copied from the canonical Codespaces bundle in this repository. The
Scrollcase copy remains the source of truth; synchronize and review the exact diff before each
external update.

The devcontainer must:

- open `README.md` directly in Markdown preview via `customizations.codespaces.openFiles` and the
  Markdown editor association;
- wait only for `setup-demo.sh`;
- verify Node >=20 and Python availability;
- install exactly `scrollcase@0.9.1`;
- not install pixi/conda-pack, download the model, create a scroll, or build automatically;
- never remove an existing user's generated workspace on a container refresh.

The README guides these actions:

1. `scrollcase init --no-example --install-toolchain --pixi-version 0.73.0`
2. `scrollcase new scroll` with all fixed non-interactive values for
   `sentiment-demo/linux-x86_64-cpu`, using the tracked `entrypoint.py`.
3. Explicitly add the four conda dependencies to the generated `pixi.toml`.
4. Explicitly add assets, offline environment, self-test, legal files, and audit path to
   `scroll.json` using exact copyable blocks.
5. `scrollcase lock sentiment-demo/linux-x86_64-cpu`
6. `scrollcase audit sentiment-demo/linux-x86_64-cpu --write`
7. `scrollcase keygen`
8. Configure a repository-local demo Git identity only if missing, then commit the generated
   workspace so the build has clean provenance.
9. `scrollcase build sentiment-demo/linux-x86_64-cpu --weights embed`
10. Resolve the generated release path, run `verify --self-test`, and run the sample sentence.
11. Optionally run the same release through the Node and Python consumer examples.

The workshop builds a fresh Linux box and has no dependency on the prebuilt GitHub Release.

## 10. Public documentation

Add a dedicated sentiment demo page under `docs/demos/` with two separate calls to action:

1. **Build it end-to-end in Codespaces** — the primary workshop.
2. **Download a prebuilt signed box** — an independent convenience path.

Lead with the visible sentiment result, then explain briefly:

- signed release and archive verification;
- embedded model/tokenizer and no run-time download;
- native CPU execution through the box's own Python;
- builder self-test versus consumer import self-test;
- English SST-2 scope, demonstrative status, and documented bias limitations;
- CLI, Node, and Python execution paths.

Update the demos index/sidebar, `examples/README.md`, relevant root demo links, and `CHANGELOG.md`.
Audit the white paper, contributor guidance, templates, CLI help, generated/public schemas, and API
reference. Do not edit them unless they actually describe a changed guarantee or need the new demo
link; this work adds no module, export, schema, or guarantee.

Public download links must not land before the release exists. Sequence public docs and companion
links after the corresponding external artefacts are live and verified.

## 11. Real-build CI

Add a dedicated workflow separate from the current `hello-box` workflows.

Triggers:

- pushes affecting the builder or sentiment demo;
- weekly schedule, staggered from the existing example build;
- manual dispatch.

Use a native matrix for all three CPU targets, `fail-fast: false`, a 45-minute timeout, scoped path
filters, and concurrency cancellation for superseded pushes.

Each target job must:

1. install Node dependencies and the pinned Scrollcase toolchain;
2. restore and prove a clean checkout after `init` scaffolding;
3. run `doctor` against that target;
4. create an ephemeral signing key;
5. build with embedded weights;
6. verify with `--self-test`;
7. run both fixed phrases and assert their labels plus confidence-line shape;
8. run the Node and Python consumer examples against the same box;
9. report archive and extracted sizes;
10. rebuild and assert that only one content-addressed archive exists.

This workflow never publishes anything.

## 12. Separate prebuilt release

Add a second, manual-only release workflow.

Fixed defaults:

- tag: `sentiment-demo-v1`;
- title: `DistilBERT sentiment demo boxes`;
- draft: `true`;
- box version: `1.0.0`.

Create a new dedicated demo signing key and GitHub secret. Do not reuse the `hello-box` key. Commit
only its public key; materialize the private half under `RUNNER_TEMP` without echoing it, set mode
0600, and delete it in an `always()` cleanup step.

Build, sign, self-test, verify, and run the three native boxes. Wrap each archive/release pair with
the consumer examples and release README, but not the public key. Publish:

```text
sentiment-demo-1.0.0-linux-x86_64-cpu.zip
sentiment-demo-1.0.0-macos-aarch64-cpu.zip
sentiment-demo-1.0.0-windows-x86_64-cpu.zip
```

Upload the new set before deleting superseded assets. After upload, a matching-host matrix must
download the public wrapper again, unpack it, obtain the public key independently from the checked
out repository, and verify/run it through the CLI plus both consumer examples. A green build job is
not evidence that the public release asset works.

Creating/configuring the stable key, dispatching the workflow, publishing a non-draft release, and
deleting superseded public assets remain explicit maintainer-authorized actions.

## 13. Static tests

Add a focused `sentiment-demo` unit suite that proves:

- all three scrolls validate and carry the fixed identity/version contract;
- target-dependent fields are exactly the permitted differences;
- every shared local file matches its declared SHA-256;
- asset URLs are commit-pinned, never `main`, and descriptors match across targets;
- all three scrolls default to `embed` and declare the offline environment;
- target interpreter and pixi platform agree;
- each lock exists and its reviewed audit matches it;
- consumer manifests use exact package versions and contain no `latest`;
- the entrypoint joins arguments, rejects blank input, maps labels through config, performs stable
  softmax, and formats stdout correctly through injected fakes;
- documentation and Codespaces commands retain the fixed IDs, target, order, and disclaimers.

At implementation time, deliberately observe the relevant guards failing for:

- a tampered local-file hash;
- a wrong asset hash;
- one inverted self-test label.

Restore each defect before continuing.

## 14. Verification and acceptance commands

Always run:

```text
npm test
```

Because docs change, also run:

```text
cd docs && npm run build
```

No schema/type generation is expected. If implementation unexpectedly changes a schema, stop and
re-scope rather than silently widening this demo task.

With explicit authorization for the expensive/native work:

- install the pinned toolchain;
- generate and review all three locks and audits;
- perform the Linux dirty scratch build only if needed during development, clearly recording dirty
  provenance and never publishing it;
- use clean native CI builds as final evidence for all targets;
- test a truly fresh Codespace;
- verify the downloaded public release assets after upload.

Record measured archive/extracted sizes and observed output only after these runs. Never fill public
documentation with estimates presented as results.

## 15. Authorization checkpoints

Keep these phases separate:

1. **Implementation authorization** — edit the Scrollcase repository and static tests/docs.
2. **Expensive-build authorization** — install toolchain, download model assets, and run real boxes.
3. **Repository authorization** — create or update the external Codespaces repository.
4. **Key authorization** — create and configure the dedicated stable demo signing key.
5. **Release authorization** — dispatch publication, replace assets, and make the release public.

Approval for an earlier phase does not imply approval for a later one. No npm, PyPI, crates.io, tag,
or Scrollcase package release is required by this work.

## 16. Next demo

After this demo is implemented, proven in a fresh Codespace, and its separate prebuilt release is
verified, the next end-to-end demo to design is **SmolLM2**.
