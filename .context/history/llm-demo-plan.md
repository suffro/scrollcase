# SmolLM2 LLM demo

> **Historical.** Moved out of the retired local memory directory on 2026-09-04 when this
> repository adopted `.context/`. Unchanged except for this note and two mechanical repairs:
> pointers that moved with the files, and inline-code path references unwrapped where the
> path no longer exists, so `syngraphe check` can resolve what is left.
>
> **Delivered.** The SmolLM2 generative demo, published as `llm-demo` with its own signed
> release and documentation page. Written before version 3, so its scroll fields are the
> version 2 spelling.

## Context

Scrollcase has one real-model end-to-end demo: DistilBERT SST-2 in ONNX INT8. It lives in two
separate places — the Codespaces workshop is its own repository
(`suffro/scrollcase-e2e-demo-DistilBERT-SST-2-ONNX-INT8`) and its mantained independenty, and the packaged example, docs page, static
tests, CI and signed release live in the Scrollcase repository.

[`sentiment-demo-plan.md`](sentiment-demo-plan.md), section 16, already records SmolLM2 as the next end-to-end demo. This
is that work: the same shape, for a generative LLM instead of a classifier.

---

## Decisions already taken

| | |
| --- | --- |
| Model | **SmolLM2-1.7B-Instruct**, GGUF **Q4_K_M** |
| Source | `HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF`, revision `2d4a76a30b4af41ecd395c35725ac11688d4cfe4`, Apache-2.0 |
| File | `smollm2-1.7b-instruct-q4_k_m.gguf`, 1.056 GB — the repo's only weight file, tokenizer included in the GGUF |
| Runtime | `llama-cpp-python` from conda-forge |
| Application | Single prompt → answer **first**; interactive chat afterwards, on the validated base |
| Companion repo (Codespaces) | `suffro/scrollcase-e2e-demo-SmolLM2-1.7B-Instruct-GGUF` |

### Facts verified against upstream (2026-08-14), not assumed

- `llama-cpp-python` 0.3.34 is on conda-forge for `linux-64`, `osx-arm64`, `win-64`, for Python
  3.10–3.14. It depends on `llama.cpp ==9923`, and transitively on `fastapi`, `uvicorn`,
  `sse-starlette`, `starlette-context`, `pydantic-settings`, `numpy`, `diskcache`, `pyyaml`.
- `onnxruntime-genai` **does not exist on conda-forge**. Ruled out by hard rule 3 (one substrate).
- conda-forge `llama.cpp` is built with `GGML_METAL=ON` for osx-arm64 (`recipe.yaml` line 73; the
  `cpu_accelerate` build string names the BLAS, not the accelerator), `GGML_VULKAN=ON` on Linux, and
  ships separate `cuda129`/`cuda130` variants for linux-64 and win-64. **The macOS target can honestly
  declare `accelerator: metal`** — no example does today.
- It is also built with `LLAMA_CURL=ON`, so a downloader is present in the environment. Same
  defence-in-depth footnote the sentiment demo already makes about `huggingface_hub`: the entrypoint
  importing no client is what keeps it unused.
- SmolLM2-1.7B is **MHA, not GQA** (`num_key_value_heads: 32 == num_attention_heads`, 24 layers,
  hidden 2048). KV cache costs **0.19 MB/token**: 384 MB at 2048 context, 768 MB at 4096. Expect
  ~1.5–1.8 GB RSS at 2048 context. Declare `minRamGb: 4`.
- **Declared assets are stored, not deflated** (`src/build/box.mjs:327`). The 1.06 GB GGUF costs no
  compression time and the archive is roughly weights + compressed environment.
- **Correction to earlier advice in this conversation.** I suggested building the public release
  `--weights on-demand`. That does not work for the demo's happy path: `scrollcase run` extracts to a
  private temp directory and `runExtractedBox` calls `verifyRequiredAssets` before execution
  (`src/consumer/run-extracted.mjs:125`), and the CLI's `onPrepared` hook only logs
  (`src/cli-run.mjs:68`). A caller has no chance to place the weights, so `run` fails on an on-demand
  release. Only the Node/Python/Rust API path (`verifyAndExtractBox` → materialize →
  `attachExtractedBox` → `runExtractedBox`) supports it. **Both plans use `embed`.**

---

## Implementation

Everything that lives in `suffro/scrollcase`: the packaged example for all three targets, static test
coverage, the docs page, CI and the public signed release. Structure copied from `sentiment-demo`;
the differences are called out.

### 1 `examples/llm-demo/`

```text
examples/llm-demo/
├── README.md
├── .gitattributes                 -text for entrypoint.py, MODEL_NOTICE.md, APACHE-2.0.txt
├── scroll.json                    the base: everything the three targets share
├── shared/{entrypoint.py, MODEL_NOTICE.md, APACHE-2.0.txt}
├── demo-consumers/{run-box.ts, run_box.py, package.json, README.md, .vscode/settings.json}
├── linux-x86_64-cpu/    {scroll.json, pixi.toml, pixi.lock, conda-licenses.json}
├── macos-aarch64-metal/ {scroll.json, pixi.toml, pixi.lock, conda-licenses.json}
└── windows-x86_64-cpu/  {scroll.json, pixi.toml, pixi.lock, conda-licenses.json}
```

Each target fragment carries exactly three keys — `extends`, `target`, `condaDependencyLicenseAudit`.

**The macOS target is `macos-aarch64-metal`, not `-cpu`.** conda-forge's llama.cpp enables Metal on
osx-arm64, so unlike the ONNX demo this box really does use the accelerator it names. Prove it before
declaring it: build on macOS and confirm from llama.cpp's own load log that a Metal backend is
selected. If it is not, the target becomes `-cpu` and the docs say why — declaring an unused
accelerator is exactly the dishonesty the sentiment README calls out.

**Entrypoint ownership must be settled here.** The two DistilBERT copies have already drifted: the
companion repo's reads `box.json`, `examples/sentiment-demo/shared/entrypoint.py` hard-codes
`MODEL_SUBDIR`. Make `examples/llm-demo/shared/entrypoint.py` the canonical copy, sync the companion
repo to it byte for byte, and add the hash test below so they cannot drift silently.

### 2 `tests/unit/llm-demo.test.mjs`

Same construction as `tests/unit/sentiment-demo.test.mjs`: `configureWorkspace({ cwd: root, overrides:
{ scrolls: 'examples' } })` + `readScroll` so it reads the **joined** scroll a build would see, with
`resetWorkspace()` in a `finally`. Assert:

1. every shared/ file's bytes match the `sha256` declared in every target;
2. each target fragment has exactly the three permitted keys, and the joined scrolls are identical
   once target-dependent fields are nulled;
3. the asset URL is pinned to the commit and never `main`, and its descriptor is identical across
   targets;
4. all three declare `weights: embed`, `execution.defaultArgs: []`, and the `llama_cpp` import;
5. interpreter path and pixi platform agree per target;
6. each lock exists and its reviewed audit matches it;
7. the demo-consumer templates pin exact versions and contain no `latest`;
8. `entrypoint.py` through the injected `generate_fn` seam: joins words, rejects blank input with
   exit 2 and empty stdout, prints only the answer on stdout — no `llama_cpp`, no model.

Then **observe three of these failing on purpose** and restore: a tampered shared/ file, a wrong
asset hash, an inverted self-test assertion. A guard never seen red is not yet a guard.

### 3 Docs

- docs/demos/llm-demo.md — new page. Frontmatter `title` is required: the demos index
  auto-discovers from it via `docs/.vitepress/theme/subpages.data.ts`. Two calls to action in a
  `<Tabs>`, exactly like sentiment-demo.md: the Codespaces repo from Plan 1, and the prebuilt
  download. The download links land **only after** §2.4 has published and the assets have been
  downloaded and run from their public URLs.
- `docs/.vitepress/config.mts` — one sidebar entry in the `Demos` → `Real models` group, beside
  `{ text: 'Sentiment Analysis', link: '/demos/sentiment-demo' }` at line 90. Adding the entry
  without the page fails `docs-contract.test.mjs`.
- `examples/README.md` — the four places that name `sentiment-demo` get a sibling entry.
- `CHANGELOG.md` under `## [Unreleased]`.
- `docs/white-paper.md` — no change expected: this adds no module, export, schema or guarantee. If
  something turns out to change one, stop and re-scope.

### 4 CI and release

- **`.github/workflows/llm-demo-box.yml`** — `workflow_dispatch` only, matrix over the three targets,
  `fail-fast: false`, same step order as the sentiment workflow: checkout → node → `npm ci` →
  `init --install-toolchain --no-example` → `git clean -fd` and assert a clean tree → materialize the
  key under `RUNNER_TEMP` → `build --weights embed` → `verify --self-test` → `run` with a fixed prompt
  and assert a substring of the answer → `rm` the key in `always()` → upload artifact. Then a
  `publish` job that wraps each target with the demo consumers, uploads **one asset per call with the
  retry loop**, and only afterwards deletes superseded assets.
- **`.github/llm-demo-release-notes.md`** — same section layout as the sentiment release notes.

Raise the upload timeout: the sentiment workflow's per-asset `timeout 600` was tuned for ~300 MB
archives, and these are ~1.2 GB. Expect roughly 1.2–1.4 GB per zip and ~3.6 GB of release assets in
total — under GitHub's 2 GB per-asset limit, but the upload is the step most likely to fail and it
already has a history of stalling.

Assert a substring the model must produce, never an exact sentence — the answer will not be identical
across three operating systems.

Also worth recording, not fixing here: `.github/workflows/example-build.yml` matches `examples/**`, so
this demo will trigger it while it only ever builds `hello-box`.

### 5 Verification

```sh
npm test                     # includes the new suite, plus the three deliberate failures in §2.2
cd docs && npm run build     # VitePress fails on a dead link
```

Any full scroll shown in the docs page must validate against
`src/contract/schema/scroll.schema.json` — `docs-contract.test.mjs` parses every ```json fence in
`docs/` and validates the ones that look like scrolls, with Ajv in strict mode.

---

## Authorization checkpoints

Each is a separate maintainer decision; approval of one is not approval of the next.

1. **Implementation** — the example, the tests, the docs page, the CI workflow.
2. **Key and release** — a dedicated demo signing key, then publishing and replacing public assets.

No npm, PyPI, crates.io or Scrollcase version release is required by any of this.
