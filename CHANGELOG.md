# Changelog

All notable changes to Scrollcase are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The box format now models the **runtime** separately from the **target**. A target says which
  machine a box runs on; a runtime says what runs inside it — where the interpreter sits, which
  execution kinds exist, how a declared entry point becomes a command line, and which inherited
  environment variables can change what that command loads. Those facts lived inside the target
  adapter, which made every target a statement that a box is a Python box and would have made a
  second runtime a fork of that table. They now live in `src/contract/runtimes.mjs`, mirrored by
  `rust/src/contract/runtimes.rs` and `python/src/scrollcase_consumer/_contract.py` and proven
  against a new shared fixture, `src/contract/fixtures/runtime-contract.json`. **No wire format,
  document, schema or existing fixture changes**, and the archive a given commit produces is
  byte-for-byte what it produced before.

- `boxTargetAdapter()` no longer returns a `python` block or a `selfTestPython` string, and its
  `executionAffectingEnvironmentVariables` is now the operating system's half of the list only —
  `DYLD_INSERT_LIBRARIES` on macOS, `LD_PRELOAD` on Linux, nothing on Windows. The runtime
  contributes the `PYTHON*` half, and `executionAffectingVariables(runtimeId, adapter)` joins the
  two in the order a diagnostic report prints them. The Rust `BoxTargetAdapter` and the Python
  `TargetAdapter` lost the same fields, for the same reason. `assertPythonEntryPoint` keeps its
  published name and signature in all three, and delegates to the runtime rule.

- The builder-side half of a runtime now lives under `src/runtimes/<id>/`. `repairPosixLaunchers`
  moved from `src/build/launchers.mjs` to `src/runtimes/python/launchers.mjs` — the conda shebang
  trampoline it parses is a Python fact, not a build fact — and is still re-exported from
  `scrollcase/build` under the same name. The pip `requirements.txt` reader moved beside it, and the
  starter script, starter self-test and interpreter constraint that `new scroll` writes moved to
  `src/runtimes/python/templates/`. The three places that had bypassed the adapter and hard-coded
  `venv/`, or re-derived the Windows standard-library path in a branch, now ask the runtime.

- The four Node call sites that each carried their own copy of the unsupported-`schemaVersion`
  message share one `unsupportedSchemaVersionMessage()` in `src/contract/document-shape.mjs`. The
  wording is unchanged; the next format version now has one sentence to edit per language rather
  than four.

## [0.12.0] — 2026-08-22

### Added

- Every documentation page declares Open Graph metadata, and the home page describes the project in
  `schema.org` JSON-LD. Both address the same problem: *scrollcase* is an old generic word — a
  leather tube for carrying scrolls, an item in several role-playing games — so the string alone
  identifies nothing, and a link shared into a forum or a chat client rendered as a bare URL with no
  title, blurb or image to say otherwise. The structured data's `sameAs` names the project's
  entries on GitHub, npm, PyPI and crates.io, which is how four registry listings and a domain are
  read as one project rather than five coincidences. The JSON-LD sits on the home page only, since
  repeating it under every route would assert the same entity thirty-six times; the privacy page
  names the tag rather than leaving a reader to find a `<script>` in the source it promises has
  none. Both artefacts are generated from the page's own title and description, and the docs build
  fails on a page missing either.

- The documentation site publishes `robots.txt`, `llms.txt` and `llms-full.txt`, and every page now
  declares its canonical URL. The canonical link is the one that fixes a real defect: Cloudflare
  Pages serves the same build from its own hostname as well, and neither copy said which URL it
  lived at. The two `llms` files follow the [llmstxt.org](https://llmstxt.org) convention — an index
  of every page with its description, and the full text of all of them in one document — because a
  tool whose whole argument is *verify, do not trust* is poorly served by an assistant paraphrasing
  it from a single page it happened to crawl. Both are generated from the built site and ordered by
  the sidebar, so a new page joins them by existing; the docs build fails if one is missing a page.

- The documentation site negotiates content: a request carrying `Accept: text/markdown` gets the
  page as Markdown, a browser still gets HTML, and every page advertises its Markdown twin through
  a `Link` header and a `<link rel="alternate">`. The twins are the page's own source — a build that
  already holds the Markdown a page was written in has no reason to make a reader reconstruct it
  from rendered HTML — and they are plain assets too, at the page's path plus `.md`
  (`/reference/cli.md`, `/guides.md`). Served by a Pages Function, so `_routes.json` keeps static
  assets from invoking it.

- The documentation site publishes an API catalogue at `/.well-known/api-catalog`
  ([RFC 9727](https://www.rfc-editor.org/rfc/rfc9727)), advertised through an `api-catalog` link
  relation on every page. It has two entries and will not grow a third without something to put in
  it: the JSON Schemas, each with the title and `$id` the schema itself declares, and the CLI
  reference. Scrollcase publishes no HTTP API, so the catalogue claims none — a catalogue is read by
  software that never sees the page saying otherwise, and there is no `status` relation for the same
  reason. The build fails if a catalogued URL does not resolve, or if the schemas it lists differ
  from the schemas shipped.

### Fixed

- The `llm-demo` box for `macos-aarch64-cpu` declares `GGML_METAL_DEVICES=0` and runs on a Mac whose
  Metal refuses to initialise. The 0.11.4 note below — no layer is offloaded, because
  `n_gpu_layers` defaults to `0` — was true and not sufficient: llama.cpp registers a Metal device
  whatever that value is, and creating the context initialises every backend it registered. So
  `ggml_metal_init` failing took down a box named `cpu`, for a GPU it was never going to use, and
  said only `Failed to create llama_context`. The variable is how many Metal devices ggml registers;
  zero is the accelerator the target's name already promised. Linux and Windows have no Metal
  backend to switch off and declare nothing new. Boxes already published carry the fix only once
  they are rebuilt. The troubleshooting guide gained a *Running a box* section for the general
  case, since a packaged library initialising an accelerator its box never declared is not specific
  to llama.cpp.

### Changed

- `scrollcase init` asks about the consumer templates separately from the runnable example, with
  `--no-templates` beside `--no-example`. They used to be one answer, and it was the wrong one:
  declining a throwaway demo also declined `consumer-templates/`, which is where the application
  that will actually run this project's boxes starts — the same verification, extraction and
  execution call written out in Node, Python and Rust. A project that knows it does not want a demo
  is exactly the project that has its own consumer to write. The templates no longer name
  `example-box` either; their release path is a placeholder for the project's own box, like the
  target and hash beside it. Passing both flags is what now leaves a bare workspace.

- The dependencies of those templates are offered in **one multi-select menu** — ↑/↓ to move, Space
  to select, Enter to confirm — instead of three consecutive `[Y/n]` prompts. It is one decision
  asked about three languages, and asked one at a time it became three chances to answer by reflex.
  Nothing is preselected and an empty selection is a complete answer, so the shape of the question
  now matches what it means. An unavailable Cargo leaves Rust out of the list rather than skipping
  a question that was already there.

- `scrollcase new scroll` no longer asks for the weights mode, and a new scroll no longer declares
  it. The mode decides whether declared assets are packed into the archive, and a box that declares
  none — which is most of them, because a scroll packages a Python environment and not necessarily a
  model — has nothing for it to decide. It is `--weights` when a project means it, `embed` by the
  schema's own default otherwise, and `scrollcase edit scroll` when it changes later.

- The scroll reference says what `modelId` actually is. The field predates the tool being used for
  anything but models, and the documentation still described it as *what model is inside* — which
  reads, to someone packaging a library, as a field their project has no answer for. It identifies
  whatever the box packages, and `new scroll` has always derived it from the box id when
  `--model-id` is not passed. The wire format is unchanged: `modelId` is required by
  `schemaVersion: 2` in all three consumers, and dropping it would be a breaking change to every
  box already published.

- `scrollcase build` no longer asks either, which fixes a real defect rather than removing a
  keystroke. The menu was preselected on `embed`, so building a scroll that declared `on-demand`
  and answering with Enter silently packed the assets in: the scroll's own declaration overridden by
  a menu default. The scroll's mode is now what a build uses, `--weights` overrides it deliberately,
  and the mode in effect is printed as the build starts.

- Both demos' `run-box.ts` and `run_box.py` report on **stderr** rather than stdout. Their
  `Running …` line and the prompt they echo went to the same stream as the box's own answer, so
  redirecting a script's output gave you a file with two lines of bookkeeping above the thing you
  redirected it for — while both demo pages sell precisely that redirect. The box has always been
  careful about which stream it writes to; the scripts wrapping it now are too.

- The **Sentiment analysis** demo page opened by describing a three-way classifier. The model
  answers `POSITIVE` or `NEGATIVE` and nothing else, so the page now says so in the sentence a
  reader meets first. Its *Measured* section quoted an output format the box does not print, and
  its list of ways to call the box said three while naming four.

- The **Local LLM** demo page no longer opens by saying the box does not exist. It carried a
  Codespaces-only notice and a *not yet built, verified and run end to end* warning from before the
  boxes were published, directly above the table of links to download them — so the first thing a
  reader met was the page contradicting itself. Both are gone; expectations that were estimates are
  now a `Measured` section, split from the figures that only apply to building one yourself, and the
  run/chat instructions say once what they used to say three times.

### Added

- `entrypoint.py` in the `llm-demo` example reads `LLM_DEMO_VERBOSE` from the host. Set it and the
  box stops muting llama.cpp's own log, which is where a failed load explains itself — and the
  failure it raises names the variable, so the next person meets a switch rather than a wall. It is
  deliberately absent from the scroll: a value the release declared would win over the one the
  person debugging sets.
- `run-box.ts` and `run_box.py` forward their own arguments and substitute nothing for an empty
  list, so both shipped consumers reach both of the box's modes the way `scrollcase run` does: a
  sentence is answered once, no arguments at all opens the chat. They used to supply a question when
  the caller passed none, which made them always produce an answer and cost the box a mode — and a
  template is read as a worked example, so it taught that a box needs a prompt. It does not: the
  release declares no `defaultArgs`, and an empty argument list is the chat. Both consumers already
  leave this process's streams to the child, so the chat reads the terminal it was started from and
  neither script needed a line for it.

- The README that travels inside every published demo archive now numbers its ways of running a box
  and lists five rather than three: the `scrollcase-consumer` crate joins the CLI and the Node and
  Python consumers with a `run_box` example, and a closing entry says what a consumer of your own
  has to do — the same checks in the same order, against the format's specification rather than
  against one of the three implementations.

## [0.11.4] — 2026-08-14

### Added

- Add the `llm-demo` example: SmolLM2-1.7B-Instruct, quantised to Q4_K_M in GGUF form, packed for
  Linux, macOS and Windows on CPU, with the manual `llm demo box` workflow that builds, verifies,
  runs and publishes it as one archive per operating system. It is the second example carrying a
  real model, and it exercises what the first one does not. The whole model is a single 1.06 GB
  asset, because a GGUF holds the weights, the tokenizer and the chat template in one container, so
  nothing can drift out of step with the weights it belongs to. The self-test is a `pythonFile`
  rather than an inlined string: it loads the model with the box's own interpreter and asserts the
  answer names Rome, so a box that cannot generate is never signed. And one application has two
  modes, since `execution.defaultArgs` is `[]` and the entrypoint reads an empty argument list as a
  request for an interactive chat rather than as a missing prompt.

  Its `environment` declares `PYTHONDONTWRITEBYTECODE=1` and nothing else. The sentiment demo's
  `*_OFFLINE` variables are absent on purpose: this stack has no hub client to switch off, and a
  declaration that guarantees nothing does not belong in a signed release. Every target is `cpu`,
  macOS included — conda-forge's `llama.cpp` is built with Metal on `osx-arm64`, but the entrypoint
  never passes `n_gpu_layers` and llama-cpp-python defaults it to `0`, so no layer is offloaded
  anywhere and declaring `metal` would promise an accelerator the box does not use.

- Add the **Local LLM** demo page, under a renamed *AI models* group in the sidebar, describing the
  same box: what it guarantees, the two modes, and what to expect from a 1.7-billion-parameter model
  running on a CPU. The sentiment demo page gained the matching title and model metadata.

## [0.11.3] — 2026-08-14

### Changed

- `init` now asks whether to include the runnable example instead of assuming it, defaulting to yes
  (`[Y/n]`). It is the first question, before anything is written, because it decides which of the
  later consumer-dependency questions are asked at all. `--no-example` still answers it in advance,
  and a run without a terminal keeps the example: unlike the installs, writing a disposable scaffold
  is not something silence has to withhold consent for, so scripted and CI runs are unaffected.

## [0.11.2] — 2026-08-14

### Changed

- `add dep` now closes with a reminder that a dependency still has to be declared as a self-test
  import, spelling out the `add import` command. A dependency the box installs but never imports is
  proven by nothing, and the two commands were easy to learn separately and then forget together.
  The reminder is unconditional and guesses no module name: what a package is called and what it
  imports as disagree often enough that a guess would write a signed claim nobody checked.

## [0.11.1] — 2026-08-14

### Changed

- Write `box.json` into the payload **before** the self-test rather than after it. An application
  finds its own files by reading the `modelCacheSubdir` its box declares, instead of hard-coding a
  path the scroll then has to be bent to match — but that only works if the manifest is there when
  the test runs. It was not, so exactly the applications doing the right thing were the ones whose
  self-test could not exercise them: the check ran against a payload missing a file the shipped box
  has. Nothing in `box.json` depends on the test or the parity gate.

## [0.11.0] — 2026-08-14

### Added

- `scrollcase add env <box> NAME=VALUE` and `add import <box> <module>`, with the matching
  `remove`. A map and a list are the two shapes a single-value prompt cannot edit, which left
  `environment` and `selfTest.imports` as the only parts of a scroll still opened in an editor.
  Removing the last environment variable takes the empty map with it; removing the last self-test
  import is refused, because a box has to prove it can import something.

### Changed

- `audit --write` on a scroll that declares no `condaDependencyLicenseAudit` now places
  `conda-licenses.json` beside the scroll and records the declaration, instead of refusing and
  leaving the author to work out the path and type it in. The path is a convention rather than a
  decision. What stays deliberate is the declaration: a build enforces the audit only for a scroll
  that names a path, so the check is switched on by running the command and never by a file
  appearing on disk.

## [0.10.1] — 2026-08-14

### Changed

- **Give every interactive question one legible shape.** A question is now a blank line, the field's
  name, the line explaining it, and the answer typed after ` ↳ ` — text prompts, keyboard menus and
  yes/no consent alike. A `new scroll` session printed hint, question and answer on adjacent lines
  nine times running, and the result was a wall in which the explanations were indistinguishable
  from the things being asked. The name is coloured and the marker is dimmer, both from the terminal
  palette so they stay legible on a light scheme and a dark one; `NO_COLOR` still removes the colour
  without changing the layout. The toolchain and Python-source consent questions were reworded so
  the question comes first and its reason underneath.

## [0.10.0] — 2026-08-13

### Added

- **Six commands for changing a scroll that already exists**, so the fields nobody can write by
  hand are no longer written by hand. `add asset <box> <url>` downloads the URL once and records the
  `sizeBytes` and `sha256` it found; `add file <box> <path>` records a file from the project;
  `add dep <box> <name>` writes into the `[dependencies]` table of every one of the box's pixi
  manifests, with `--from-requirements` to import an existing pip file; `remove asset|file` is the
  exact inverse of the two adds, self-test entry included; `edit scroll` changes one field, choosing
  it from a menu built out of the schema; and `refresh` recomputes the pins a project asked for.
  Every edit is atomic and then read back through the same path a build uses, restoring the
  originals if the result would not load.

- Refuse two declarations that would write the same file in the box — an asset and a local file
  pointing at one payload path, or the same path claimed by a base and by a fragment. Whichever the
  builder staged second silently overwrote the first, and which one that is depended on an ordering
  nobody chose.

- **Split a scroll across the targets of one box.** `scrolls/<boxId>/scroll.json` holds what the
  targets share and each `scrolls/<boxId>/<targetId>/scroll.json` declares `extends: "../scroll.json"`
  plus its own differences; the two halves are joined before validation, and that joined scroll is
  what the build reads and what provenance records. Three targets that agreed about ninety lines and
  differed in four had to be edited three times, correctly, and a divergence nobody intended stayed
  invisible until a user hit it. The join rule is per field: scalars and the cohesive objects
  (`target`, `execution`, `parity`) are replaced; `assets`, `assetArchives` and `localFiles` are
  joined base-first and two entries claiming one `relativePath` is an error; `prunePaths`,
  `uncompressedPaths`, `selfTest.imports` and `selfTest.files` are joined with repeats dropped;
  `compatibility` and `environment` are joined key by key with the fragment winning a shared key;
  and the extra self-test Python is one slot, so a fragment naming either spelling replaces both.
  `extends` takes exactly one value, so a base is always the box directory's own file — no path to
  get wrong and no chain to follow. Both shipped examples are split accordingly.

- Accept `selfTest.pythonFile` in a scroll: a path to a Python file in the project, run after the
  declared imports succeed, as an alternative to inlining the same code in `selfTest.pythonCode`.
  The two are mutually exclusive. A self-test worth writing outgrows a JSON string almost at once,
  and in a file it keeps its syntax highlighting, its linter and a readable diff. `new scroll`
  generates a starter `self_test.py` beside the scroll and points the field at it.

- Add `npm run python:bump` (`scripts/bump-python-version.mjs`), which moves the two committed Python
  version constants at release time by asking conda-forge what it publishes. `--check` fails when a
  bump is due, and `--latest <version>` sets them without touching the network.

- Add the `sentiment-demo` example: a DistilBERT SST-2 classifier, quantised to INT8 in ONNX form,
  packed for Linux, macOS and Windows on CPU. It is the first example carrying a real model, so it
  exercises commit-pinned assets verified by size and SHA-256, `weights: embed`, an offline
  environment signed into the release, third-party licence notices carried into the payload, and a
  self-test that runs real predictions and refuses to sign a box that answers wrong. A dedicated
  `sentiment demo box` workflow builds, verifies, runs and publishes it as one archive per operating
  system, signed with the existing demo key.

### Changed

- `target` is no longer required by the scroll schema. Every scroll a build reads still declares
  one — the reader refuses a scroll without it — but the base of a split scroll legitimately has
  none, and requiring it in the schema would make every base file light up in an editor.

- **Make a scroll declare decisions rather than restate them.** `scrollVersion`, `compatibility`,
  `pythonEntryPoint`, `modelCacheSubdir`, `assets` and `selfTest.files` are no longer required: they
  are derived when the scroll is read, in one place, so everything downstream still sees a complete
  object. `pythonEntryPoint` is the clearest case — the target admits exactly one value and the
  reader rejected any other, so requiring it obliged the author to type the string already implied.
  Declaring a derived field remains valid and produces an identical result, and a declared
  interpreter that disagrees with its target is still refused.

- **`localFiles[].sha256` is now an optional pin.** An asset arrives over a network nobody controls;
  a local file comes out of the project's own checkout, and what ships is hashed into the signed
  release either way. Requiring the pin mainly meant that editing a generated entry point failed the
  next build until its digest was recomputed by hand. Declare `sha256` on what must not change
  without review — a licence notice, a reviewed shim — and the build still refuses a file that
  drifted from it. `new scroll` no longer writes a pin for the script it records.

- **`scrollcase new scroll` asks four questions instead of nine**, and no longer prompts for the four
  optional host constraints. What remains is what nothing else can answer: the target, the box id,
  the upstream revision, and the base URL boxes are published under. `modelId`, `runtimeId`,
  `version`, `scrollVersion` and the Python version take defaults; `pixiVersion` defaults to the
  pixi actually installed, since `build` refuses any other. Every one of them is still a flag.

- Print one line above every `new scroll` question and menu saying what the field is. A label such
  as `Upstream revision` or `Asset base URL` does not explain itself to someone meeting the tool for
  the first time, and both answers end up in a signed document.

- A blank answer to a required prompt now repeats the question instead of ending the session. Losing
  every value already typed punished a slip out of all proportion to it.

- `--python-version` accepts `latest`, resolved once at authoring time to a number that is written
  into the scroll — never the word. The default moved to one minor behind the newest Python
  conda-forge publishes; both are committed constants rather than a per-invocation lookup, because a
  version that changed with the calendar would make the same command produce different scrolls in
  different months.

## [0.9.1] — 2026-08-11

### Fixed

- Keep interactive `scrollcase init` successful when the generated Rust consumer is requested on a
  machine without Cargo. The Rust template is still written, its install prompt is skipped, and the
  CLI prints the exact `cargo add` command to run after Rust is installed instead of aborting with
  `spawnSync cargo ENOENT`.

## [0.9.0] — 2026-08-10

### Added

- Generate a non-overwriting Rust consumer template crate under `consumer-templates/rust/` during
  `scrollcase init`, beside the existing Node and Python templates. Interactive setup now asks
  `Install scrollcase-consumer for Rust?` and, when accepted, adds the crate dependency to that
  generated manifest with Cargo.

### Changed

- Default every interactive `scrollcase init` yes/no question to yes and render it as `[Y/n]`,
  including the Node, Python, Rust, Python fallback, and managed-toolchain offers. Non-interactive
  input still grants no consent unless an explicit flag does so.

## [0.8.3] — 2026-08-10

### Fixed

- Keep `scrollcase build` visibly moving after the `conda-pack` progress bar reaches 100%. That bar
  describes only creation of the relocatable tarball; the CLI now reports extraction and relocation,
  payload preparation and self-test, deterministic archiving and hashing, and document signing
  before the final build summary instead of leaving those phases silent.

## [0.8.2] — 2026-08-10

### Changed

- Make the published `hello-box` demo announce a successful box execution before showing a compact
  runtime and host summary. Its previous output was a table of Python diagnostics and temporary
  extraction paths: technically useful, but it made a newcomer infer the actual result. The demo
  now presents the signed-to-running path directly and keeps those ephemeral paths out of its
  output; all three target scrolls commit to the same revised entry point.

### Fixed

- Give `scrollcase run` and `verify` immediate, blank-separated launch status before verification or
  extraction begins. `run` then flushes its signed `Running …` status before starting the box
  interpreter, so it cannot appear after the application has already finished when stdout and
  stderr are piped or captured.

- `scrollcase-consumer` 0.3.2 (Rust): locate the real ZIP central directory through EOCD or EOCD64
  and scan exactly its declared records when checking for duplicate names. The previous check loaded
  the entire archive into memory and searched every byte for central-directory signatures, so two
  stored copies of the same nested wheel, NPZ or JAR could invent a duplicate entry that did not
  exist in the outer archive; a multi-gigabyte box also needed its full size again in RAM before it
  could be installed. The check now seeks to the directory and reads only that bounded region, while
  a name genuinely repeated there remains a hard refusal.

## [0.8.1] — 2026-08-09

### Changed

- Read the schema version shown in the documentation hero from `package.json`, so the public site
  cannot keep displaying an old version after the package moves on.

### Fixed

- Define trust-source parsing in the shared consumer conformance fixture instead of only in
  per-language tests. Its 81 cases now make Node, Python and Rust agree on single keys, bundles,
  in-memory keys, empty bundles, malformed JSON and bundle shapes, and malformed PEM: invalid trust
  documents fail as `Invalid trusted ed25519 key file.`, while an empty bundle or unusable PEM
  reaches the common no-valid-signature refusal before extraction.

- `scrollcase-consumer` 0.3.0 (Rust): a release whose `compatibility` carries a constraint the format
  does not define is now accepted, and the constraint is carried to the caller, instead of the document
  being refused at the door. That object is `additionalProperties: true` in the release schema on
  purpose — a publishing project may state constraints in its own vocabulary, and the builder copies
  them through verbatim without interpreting any of them — and the Node and Python consumers, which
  validate against that schema at run time, accepted them all along. The crate encodes the schemas as
  types instead, and `deny_unknown_fields` had been applied to `Compatibility` along with every
  closed object, making the crate stricter than the schema it ships and refusing boxes the format
  defines as valid.

  Unknown constraints now land in `Compatibility::additional`, a `BTreeMap<String, Value>` carried
  verbatim through the parse. No safety is given up: the obligation the schema states falls on the
  application — *a consumer that cannot evaluate a constraint must refuse the box rather than assume
  it passes* — and refusing the document instead took away the very value the application needed to
  make that call. The shared `unknown-compatibility-constraint` conformance case pins the behaviour
  in all three consumers, and `rust/tests/schema.rs` now checks type/schema agreement in the
  accepting direction too, which is the direction a typed parse drifts by default.

  **Breaking, crate only, and only for a caller constructing `Compatibility` with a struct literal:**
  the struct has a new public field. Callers that deserialize a release are unaffected.

## [Python 0.4.1] — 2026-08-09

### Fixed

- Make file-backed and in-memory trusted-key parsing share one validation contract. A key needs a
  string `keyId`; `publicKeyPem` may be absent or `null`, and otherwise must be a string. Malformed
  JSON, bundle shapes and entries now fail with the stable
  `Invalid trusted ed25519 key file.` message, while an empty bundle or unusable PEM reaches the
  common no-valid-signature refusal before extraction. The shared 81-case consumer fixture pins the
  same outcomes and messages in Python, Node and Rust.

## [0.8.0] — 2026-08-06

### Added

- A Rust consumer, `scrollcase-consumer`, under `rust/`. It verifies a signed release, prepares or
  re-identifies a local box, checks an extracted payload against the entry list its release commits
  to, and runs the declared entry point — the same surface as `scrollcase/consumer` and
  `scrollcase_consumer`, proved against the same shared conformance cases. A prepared receipt has
  private fields and no public constructor, so the rule that verification precedes execution is
  carried by the type system rather than by convention. Signals are forwarded through a channel the
  caller owns: a library that installed process-wide handlers would displace those of the application
  embedding it. It is released independently on crates.io as `scrollcase-consumer`, requires Rust
  1.88 or newer, forbids `unsafe`, and is synchronous throughout so an embedding application picks
  its own runtime or none. Nothing in the npm package changed to accommodate it.

- `scrollcase-consumer` 0.2.0 (Rust): every entry point that verifies a signed release now takes
  `trust::TrustAnchors` instead of a trust-file path, so a caller can verify against keys it already
  holds — anchors compiled into the binary with `include_str!`, a keychain, anywhere. An application
  shipped to someone else's machine could previously be made to accept a box by editing the trust
  file beside it; carrying the anchors moves that decision inside the binary.
  `trust::parse_trusted_keys` reads the single-key and bundle shapes from bytes, so an embedded
  bundle goes through the same parser a trust file does rather than a second reading of the format
  at the call site.

  **Breaking, crate only.** The `public_key_path` field of `PrepareOptions`, `AttachOptions` and
  `RunBoxOptions` becomes `trust`, and the same argument of `inspect_release_document` and
  `inspect_box_archive` changes type; wrap an existing path in `TrustAnchors::KeyFile(path)`.
  `inspect_release_document_with_keys` is gone — `TrustAnchors::Keys(&keys)` covers it on the regular
  entry point, and keeping both would have meant two ways to state one trust decision.
  `verify_signed_document_with_key_file` becomes `verify_signed_document_with_anchors`. The box
  format, the npm package and the Python package are untouched, and boxes already signed and
  distributed verify exactly as before.

  Note for anyone compiling anchors in: rotating a key then means releasing the application, so embed
  the `{ "keys": [...] }` bundle rather than a single key. Both keys are trusted at once, which is
  what lets a rotation land without stranding the boxes signed by the outgoing one.

- The same in-memory trust source for the Node and Python consumers, additively: every operation that
  verifies a signed release takes `publicPath` **or** `trustedKeys` (`public_key_path` or
  `trusted_keys`), exactly one, and `parseTrustedKeys` / `parse_trusted_keys` reads both trust-file
  shapes from text or bytes. An application holding its keys in a keyring, an environment variable
  or a secrets manager had to
  write them to a file to verify a signature — putting key material on disk for no reason but the
  API's shape. Naming both sources or neither is refused rather than resolved by preference.

  Nothing is removed and no signature changes meaning, so existing callers are unaffected. Unlike
  the crate, this is not about compiling anchors in: a hard-coded key in a script is as editable as
  the trust file beside it, so the security argument that shaped the Rust change does not carry —
  only the plain one, that a library should not force a caller's key material through the
  filesystem.

- An `unsupported-schema-version` error pattern and case in `consumer-conformance.json`, so the
  refusal of a `schemaVersion: 1` document is pinned across all three consumers instead of only being
  asserted per language. Without it, dropping the by-name refusal degrades the message to a schema
  shape complaint — a v2 consumer would still refuse a v1 release, but stop saying why.

## [Python 0.4.0] — 2026-08-06

### Added

- Add `trusted_keys` to every Python consumer operation that verifies a signed release and
  `parse_trusted_keys` for single-key and bundle JSON held in memory. Exactly one of
  `public_key_path` and `trusted_keys` is required there, so callers can use a keyring, environment
  variable or secrets manager without writing key material to a temporary file.

## [0.7.0] — 2026-08-03

### Added

- Commit new boxes to their extracted payload through the optional signed `payloadDigest` release
  field and the canonical `payload-digest.v1` list inside the archive. Node and Python share golden
  byte vectors for the list format and 65 language-neutral consumer cases. `schemaVersion` remains
  2 because the field is additive: existing v2 releases still verify normally, while an explicit
  installed-payload check refuses a release that carries no digest rather than claiming success.

  Add `attachExtractedBox` / `attach_extracted_box` so an application can install once, restart, and
  mint a fresh process-bound `PreparedBox` without retaining or re-extracting the archive. Attached
  receipts are marked `attached`, assert the native host, re-check execution files and on-demand
  assets, and deliberately do not claim the payload bytes were proved.

  Add the separate `verifyExtractedPayload` / `verify_extracted_payload` integrity operation and
  `scrollcase verify --extracted <dir>`. Verification walks the authenticated list rather than the
  directory, so later extra files are ignored; embedded assets are read, while on-demand assets keep
  their signed per-file checks. The result detects corruption at that moment, not later mutation or
  a live local attacker, and excludes Python bytecode caches by design.

- Store already-compressed payload paths in the box archive instead of deflating them. Every path a
  scroll declares in `assets` is stored automatically, and the new optional `uncompressedPaths`
  names anything else the project knows to be compressed already — the tree an `assetArchives` entry
  expanded into, a bundled corpus — matching a path itself and everything beneath it.

  Weights arrive compressed, and deflating them again is loss on both sides of the trade: measured
  on incompressible bytes, level 6 runs at 47 MB/s and produces an archive 0.03% *larger* than its
  input, and level 1 recovers 4 MB/s because the search fails either way. Lowering the level is not
  a fix; not compressing is. Nothing opens the file or reads its extension — the decision comes from
  the scroll and the path alone, so a rebuild of the same commit stays byte-identical.

- Add the optional `environment` declaration to scrolls, `box.json`, and signed release manifests.
  Scrollcase applies it to the build self-test, parity runs, verification self-tests, and consumer
  execution; signed release values override inherited host and caller values, while target
  validation variables remain authoritative for the accelerator gate. Nothing inherited is
  filtered.

  Node and Python verification receipts, attachment receipts, payload-verification results, and run
  results now carry the same structured environment report. Compact reports include every signed
  declaration, execution-affecting inherited variables, conflicts and their winner, plus the count
  omitted; `envReport` / `env_report` expands all names, and `envReportValues` /
  `env_report_values` explicitly reveals inherited host values. Release-declared and caller-supplied
  values remain visible; masking applies only to the inherited host layer. The CLI exposes the same
  distinction as `--env-report` and `--env-report-values` on `run` and `verify`. The report is
  consumer diagnostics, not a signed box guarantee.

### Changed

- Print `run`'s own status lines on stderr, and say on every run that the extraction is temporary.
  Every other verb owns its standard output; `run` hands stdout to the box, so a caller redirecting
  it into a file was receiving a Scrollcase status line mixed into the application's bytes, with no
  way for the box to tell. The second line states what `run` is — one-shot, deleted on exit — rather
  than leaving a caller to read a repeated multi-gigabyte extraction as the tool being slow. A box
  kept across runs is `verifyAndExtractBox` plus `runExtractedBox` from the library, not this verb.

- Publish the demo box as one plainly named archive per operating system —
  `hello-box-1.0.0-macos-aarch64-metal.zip` and its two siblings — that unpacks to a folder which
  already runs. A box archive has to be named for its own SHA-256 and sit beside its release
  document, because that is how `verify` finds it, so publishing the files flat gave the release
  page six hex names and no way to tell which three belonged to your machine before downloading
  them. The pair now keeps those names under `box/`, where `verify` still resolves one from the
  other, while the name outside says which machine it is for.

  Beside it travel `run-box.ts`, `run_box.py` and a `package.json`, so each of the three ways to run
  a box — CLI, Node consumer, Python consumer — is two commands rather than source to copy out of a
  page and save under the right name. Those files come from `examples/demo-consumers/` and the guide
  embeds them from there, so what is documented and what is shipped cannot drift apart. The trust
  key is deliberately not among them and still comes from the repository: a signature proves nothing
  if the key arrives in the same package as what it signs.

  Stored rather than compressed, since the box archive is already deflated: the container costs
  about 9 KB on a 37 MB box.

### Fixed

- Accept a box whose interpreter is reached through a payload link in the Python consumer, which
  rejected every macOS and Linux box built since 0.6.0 with `Archive is missing venv/bin/python`.
  Carrying links made `venv/bin/python` a link to the versioned binary beside it, and while the
  Python extractor learned that rule, its verifier still asked for the entry point and the execution
  files among regular files only — so `scrollcase_consumer` refused boxes the Node consumer ran, and
  the published demo box could not be run from Python at all. Windows boxes stay link-free and were
  never affected.

  The shared conformance suite had a link case, but only for the rejection it exists to enforce: a
  link climbing out of the payload. Both implementations agreed there and diverged on the accepting
  side, which nothing exercised. `linked-interpreter` now covers it, and cases may declare
  `requiresSymlinks` so a host that cannot create one skips rather than weakening the rule.

- Name the `tar` release a box was actually written with in every target adapter's `archive`
  descriptor. The pin moved to 7.5.22 and the descriptor kept reporting 7.5.20, so a consumer
  reading a box was told about a release that never touched its bytes. The three backend versions
  are now checked against the package's own dependency pins by
  `tests/unit/contract-targets.test.mjs`, so they cannot drift apart again.

## [0.6.0] — 2026-07-31

### Added

- Carry a symbolic link in a box payload when it provably resolves, inside that payload, to a
  regular file. A conda prefix stores every large shared library two or three times through the
  soname convention, and materialising all of it made most of an extracted Linux box duplicates of
  its own bytes: the example box drops from 191 MB to 90 MB archived and 483 MB to 228 MB
  extracted, and on macOS from 48 MB to 36 MB and 126 MB to 94 MB. Windows targets stay link-free,
  because creating a link there needs elevation.

  Directory links are refused outright. They are the only way an entry could be written *through* a
  link and land somewhere its own name does not describe, and refusing them costs one duplicated
  standard library while removing that class of escape entirely. The rule — relative targets only,
  resolved inside the payload, ending at a file, no cycles — lives in `src/contract/links.mjs` with
  a Python mirror, and is applied by the builder, by the archive writer, and again by each consumer
  against the archive as received. No consumer trusts the builder.

  `schemaVersion` is unchanged: the signed document is identical, and a consumer that predates this
  rejects a link entry with a clear error rather than misreading it.

- Publish a signed demo box for Linux, macOS and Windows from a manually triggered workflow, so a
  newcomer can verify and run a real box with nothing installed but the CLI. Building needs a
  toolchain; consuming never did, and until now nothing made that visible. The boxes are signed by
  CI with a key scoped to the example alone — a Linux or Windows box cannot be built on a macOS
  machine, since conda-pack packs the host's own environment.

## [0.5.0] — 2026-07-31

### Added

- Ship the `hello-box` example for all three supported operating systems —
  `linux-x86_64-cpu` and `windows-x86_64-cpu` alongside the existing
  `macos-aarch64-metal` — each with its own solved `pixi.lock` and lock-derived licence
  inventory. Previously only a macOS ARM target could be built from a checkout.
- Give every `hello-box` example a `python-script` entry point, carried into the payload
  through `localFiles` with its declared hash, so `scrollcase run` is exercised by the shipped
  example rather than only documented. The script prints `sys.prefix`, which is where a reader
  can see that the answering interpreter is the one inside the box.
- Build the example for real on Linux, macOS and Windows in CI, then self-test it, run its
  entry point, and rebuild it to confirm the archive is byte-identical. The unit suite stubs
  the environment solve, so this is the only check covering the solve, relocation and the
  per-platform interpreter layouts.

### Changed

- **Breaking (next major):** adopt the v2-only contract and canonical **scroll** authoring model.
  The declarative source becomes `scroll.json` under `scrolls/`; v2 does not accept v1 documents,
  legacy input aliases, or dual code paths. Existing v1 boxes remain historical artefacts for the
  Scrollcase versions that produced them.
- Add the typed Node/TypeScript consumer at `scrollcase/consumer`: it verifies signed local
  releases, safely extracts into collision-free destinations, returns opaque prepared receipts,
  executes script/module entry points without a shell, verifies caller-materialized on-demand
  assets, forwards termination signals, and guarantees one-shot temporary cleanup. Distribution,
  download, update, registry, channel, revocation, publication, runner, and application-lifecycle
  responsibilities remain out of scope.
- Add the typed Python consumer package imported as `scrollcase_consumer`, mirroring local
  verification, collision-free safe ZIP extraction, immutable prepared receipts, script/module
  execution, on-demand asset checks, signal forwarding, child terminal results, and one-shot
  cleanup without a Node runtime dependency. The distribution bundles generated, drift-checked
  copies of the canonical schemas, uses maintained `cryptography` Ed25519 verification, and is
  released independently to PyPI as `scrollcase-consumer`.
- Hold the Node and Python consumers to one language-neutral conformance matrix covering trust,
  tampering, hostile archives, execution, streams, signals, cleanup, on-demand assets, and all
  supported interpreter layouts. ZIP path collisions are now rejected during inspection in both
  implementations, before extraction writes any bytes.
- Add `scrollcase run <release.json> [--archive <box.zip>] -- [application args]` as a thin
  terminal wrapper over `runBox`. It displays signed box identity, preserves argument strings and
  child exit status without a shell, forwards termination signals, and removes its temporary
  extraction on every terminal path. It never downloads or persistently installs a box.
- Improve human CLI readability with restrained, TTY-aware coloured status symbols across setup,
  diagnostics, locking, auditing, and building. Successful builds now end with one relative-path
  summary naming the box directory and channel document that must be distributed.
- Add workspace-independent `scrollcase -v` and `scrollcase --version` flags that print the
  installed package version.
- Check signing readiness before `build` starts expensive work. Missing local keys fail immediately
  with an explicit `scrollcase keygen` remedy; `build` never generates identity material itself.
  Incomplete pairs and missing external-signer trust keys also fail without overwriting anything.
- Present target, weights, and suggested channel choices as navigable arrow-key menus. Channel
  choices are closed to `nightly`, `beta`, and `stable`, with `beta` remaining the build default.
- Keep real authoring separate while restoring a useful first-run example. `scrollcase init` now
  creates a disposable runnable `example-box` for the native host by default, without overwriting
  existing files, a concise linked `SCROLLCASE.md`, and TypeScript/Python examples under
  `consumer-templates/` that run a caller-supplied local release through the public APIs. When the
  project has none, it also creates a private `package.json` with `"type": "module"` so the
  TypeScript consumer runs with ESM semantics;
  the Python template and workspace guide explain the separate PyPI installation explicitly.
  When those templates are generated, interactive initialization separately offers to install
  their Node/TypeScript dependencies or the Python consumer from PyPI or conda-forge. It collects
  every answer before starting any installer and visually separates each question. A PEP 668
  managed Python falls back to a user-scoped pip installation, leaving the managed prefix intact.
  If conda-forge is selected without Conda installed, `init` asks whether to use PyPI instead.
  `--no-example` omits the box and consumer examples while retaining the workspace guide.
  `scrollcase new scroll` still gathers complete project metadata interactively or from explicit
  non-terminal flags. Generated application starters are grouped under
  `box-entrypoints/<boxId>/<targetId>/entrypoint.py`.
- Organise new scrolls as `scrolls/<boxId>/<targetId>/`, validating both path components against
  the scroll's declared `boxId` and canonical target. `scrollId` is now optional input and is
  derived as `<boxId>-<targetId>` for release provenance; the flat v1 layout is rejected.
- Let `lock`, `audit`, `build`, and scroll-aware `doctor` select a nested target through
  `<boxId>/<targetId>`, `--target`, or a navigable keyboard menu. A sole host target is the default,
  and Metal is preferred on macOS; other non-terminal ambiguities fail with an explicit `--target`
  remedy. `new scroll` uses the target menu; the fixed init example deterministically selects Metal
  on Apple Silicon and CPU on Linux or Windows.
- Let interactive `scrollcase lock` and `scrollcase build` calls omit the scroll argument and choose
  from every valid `<boxId>/<targetId>` in the workspace. Non-interactive callers still fail unless
  they name the scroll explicitly.
- Publish one editor-oriented v2 execution schema and reference it from scroll, signed release, and
  `box.json`. Generated scrolls self-associate through `$schema`; the schema supplies closed
  script/module alternatives, target conditionals, defaults, examples, safe paths, and strict
  SHA-256 shapes without an editor extension.
- Carry optional shell-free execution metadata through the deterministic builder into both signed
  manifests. Script files and dotted modules must be present in the final payload after staging and
  pruning; `verify` checks their schema, recursive manifest agreement, interpreter layout, and
  archive presence before any optional self-test can execute box code.
- Complete the repository-wide v2 migration across public guides, examples, CLI references,
  package API documentation, generated schema routes, and contributor instructions. Documentation
  now distinguishes caller-owned retrieval from consumer verification, uses content-addressed
  output names, and a tracked-tree guard prevents the retired product terminology from returning.

### Fixed

- Stop Git's line-ending conversion from breaking a `localFiles` hash. The declared SHA-256 covers
  a file's bytes, so a Windows checkout that rewrote a text file to CRLF failed the build on a
  clean tree. The example entry points are marked in `.gitattributes`, and `scroll.md` tells
  projects to do the same for the files their own scrolls name.
- Install the pixi binary when the staging directory and the project's toolchain directory sit on
  different filesystems. The download is staged in the OS temp location and moved with `rename`,
  which cannot cross a volume boundary — so on Windows, where `TEMP` is on `C:` and a checkout
  commonly is not, `init --install-toolchain` failed with `EXDEV` and installed nothing. It now
  falls back to a copy on that path.

> **Gap in this record.** Versions 0.2.0 through 0.4.11 were published without changelog entries.
> What they contained is recoverable from the commit history between the `v0.1.3` and `v0.5.0`
> tags; nothing has been reconstructed here, because a plausible guess in a changelog is worse
> than an acknowledged hole.

## [0.1.3] — 2026-07-27

### Fixed

- Ship conda's per-package records reduced to which binary it is and how it is licensed — name,
  version, build, licence — and drop `conda-meta/history` entirely. As written by the installer
  those records varied between two installs of the identical lock (a per-file `sha256_in_prefix`
  recorded on one run and not the next), so rebuilding a commit produced a different archive hash
  and no third party could reproduce a box to check it. They also carried the build machine's
  package-cache paths in `extracted_package_dir` and `link`: on a minimal `python` environment,
  fourteen files inside the box named the builder's home directory. The kept fields are
  copied verbatim and chosen by allowlist, so a field a later pixi starts writing cannot reintroduce
  either problem. Nothing in a box reads these records — conda is never shipped inside one, and
  package versions stay readable from `site-packages`.

- Unpack a packed environment whose symlinks chain through other symlinks. The extractor refuses to
  create a link whose target passes through another one — a defence against writing file content
  through a link — and conda-forge now ships exactly that shape in a plain `python` environment
  (`libsqlite` 3.53.4 pulls in `icu`, which lays out `current -> <version>` and then
  `pkgdata.inc -> current/pkgdata.inc`). Any environment locked after that release failed to build
  at all. Links are now created in a second pass, once every regular entry is on disk and nothing can
  be written through one; targets are still resolved afterwards, and a link that dangles or leaves
  the tree is still dropped rather than pulling a host file into the box.

### Changed

- Lay `dist` out as the two things a publisher does with it: `boxes/<boxId>/<version>/<targetId>/`
  holds the archive and release document under the hashes they are published as, and
  `channels/<boxId>/<channel>/<targetId>.json` holds the pointer. A channel is filed by channel
  rather than by version because it moves to the next release instead of accumulating one stale
  copy per version. The `objects/` staging tree and the identity-named duplicates of the archive and
  release document are gone — the build no longer writes the same bytes under two names, and
  `dist/boxes` uploads verbatim. **`verify` resolves the archive by the hash its release document
  commits to**, falling back to the old identity-based name so releases built before this still
  verify.
- `build` asks which channel and which weights mode when neither flag is given, offering `beta` and
  `embed` as defaults. Guards are deliberately not asked about: `--allow-dirty` and `keygen --force`
  stay explicit flags, because a question nobody reads is not a guard. With no terminal to ask, the
  default is taken and reported.
- The bundled example build input declares `condaDependencyLicenseAudit`, so a box built by following
  the quickstart ships the dependency licence inventory rather than silently omitting it. The
  reviewed inventory is committed beside that input.

### Removed

- Google Analytics, the third-party sharing widget, and the consent banner are gone from the
  documentation site, which now sets no cookies and loads no third-party script. The banner told
  readers the site used only essential cookies while both trackers loaded ahead of it. The privacy
  page states the new position, and a test fails if any script tag returns to the site config.

## [0.1.2] — 2026-07-26

### Fixed

- Export `scrollcase/contract/browser`, a platform-neutral target/document-helper surface with
  generated TypeScript declarations and no Node built-in dependency. Browser and Worker consumers
  can now derive target IDs and inspect signed-envelope shapes without bundling the Node-only
  cryptographic payload decoder.
- Keep the existing `scrollcase/contract` API unchanged while sharing its namespacing and envelope
  shape implementation with the browser-safe entry point.

## [0.1.1] — 2026-07-26

### Fixed

- Ship source-derived TypeScript declarations for the public `scrollcase/contract`,
  `scrollcase/build`, and `scrollcase/sign` runtime modules. The package export map now routes
  TypeScript to those declarations while Node keeps executing the same JavaScript, and a strict
  consumer regression covers all public entry points.
- Extend `npm run types` and the prepublish gate to regenerate and verify runtime declarations
  alongside the schema-derived box-format types.

## [0.1.0] — 2026-07-26

First public release. Scrollcase was extracted from the runtime packaging builder of a private
application and made project-agnostic: paths are declared by the consuming project, document
namespaces are configurable, and the tool carries no consumer's name.

### Added

- The seven CLI verbs: `init`, `doctor`, `keygen`, `lock`, `audit`, `build`, `verify`.
- The box format contract, frozen at `schemaVersion: 1`: the target model and identity rule, the
  signed-document envelope with project-owned namespacing, seven JSON Schemas, and golden
  fixtures other implementations prove themselves against.
- One build substrate — pixi + conda-pack + conda-forge — with the environment solved from a
  committed `pixi.lock` and never resolved at build time.
- Deterministic archives: normalised timestamps, commit-derived build time, derived rollout
  cohort salt; rebuilding the same commit is byte-identical.
- Relocation repair: prefix-carrying service files removed, symlinks dereferenced, console
  scripts rewritten to resolve Python next to themselves; `conda-unpack` deliberately not run.
- Signing with a local ed25519 key, or through an external `--signer-command` whose output must
  echo the exact payload and is verified locally.
- `verify`: signature, archive size and hash, safe entry names, manifest agreement, and
  `--self-test` extraction that imports the declared modules with the box's own interpreter.
- Licence audit derived from `pixi.lock`; a dependency without a declared licence fails.
- Honest provenance: builds refuse to run outside a git checkout, and a dirty tree requires
  `--allow-dirty` and is recorded as `sourceTreeDirty: true`.
- Optional accelerator parity gate with declared tolerances (`absolute`, `relative`,
  `minimumCosine`).
- Asset handling: `--weights embed` (air-gapped, default) or `on-demand` with size and SHA-256
  committed in the signed release.
- Optional toolchain bootstrap: `init` offers to install `pixi` and `conda-pack` into the
  project's own `.scrollcase/toolchain/`, never without an explicit yes (`--install-toolchain` /
  `--no-install-toolchain`, and never at all without a terminal). The release archive is verified
  against its published SHA-256, and the verified digest is recorded in `scrollcase.config.json`
  so later installs are checked against the committed value.
- TypeScript types for the box format, generated from the JSON Schemas and exported as
  `scrollcase/contract/types`. Generated rather than hand-written so they cannot drift from the
  format; `npm run types` regenerates them and the suite fails if the committed output disagrees
  with the schemas. Types only — there is no build step and no runtime change.
- Typed JSDoc across the exported surface, so an editor gives hover documentation and completion
  for `scrollcase/contract`, `scrollcase/build` and `scrollcase/sign` with no types package.
- Workspace discovery via `scrollcase.config.json`, with per-invocation overrides, including the
  `toolchain` path and `--toolchain-dir`. Tool discovery prefers, in order: an explicit flag, the
  environment override, the project's toolchain, then `PATH`.
- A working example, `examples/hello-box-macos-arm64-metal`, proven end-to-end against a real
  pixi + conda-pack toolchain.
- CI running the test suite on macOS, Linux and Windows across Node.js 20, 22 and 24, plus
  independent package-surface, generated-type, audit, and documentation gates.
- The documentation site with clean production URLs, a generated sitemap, local search, Mermaid
  diagrams, and MathJax equation rendering.
- Public `/schema/*.json` routes generated byte-for-byte from the shipped contract, plus security,
  troubleshooting, schema-usage, platform, privacy, and trust-model documentation.
- Documentation contract tests covering the CLI surface, public module exports, full JSON
  examples, public schemas, required routes, and links emitted by custom Vue components.

### Fixed

- Use the pinned Node TAR implementation when unpacking the conda environment, removing an
  undeclared dependency on the host's `tar` executable.
- Pin managed toolchains to conda-pack 0.9.2 and use locale-independent ordering for every file and
  licence record that can affect deterministic archive bytes.
- Keep generated-type drift checks portable on Windows by running the generator under Node and
  normalising checkout-dependent CRLF/LF line endings before comparison.
- Pin a newly scaffolded build input when the requested pixi is already available, and install the
  requested resolver when a different pixi version is present.
- Preserve quoted external-signer arguments, including empty values and paths containing spaces or
  backslashes, while keeping all subprocesses behind the injectable process runner.
- Exercise hostile ZIP/TAR entries, verified and resumed asset downloads, and external-signer
  payload substitution and signature failures with dedicated regressions.
- Update the direct `tar` dependency to 7.5.22.
- Use GitHub's canonical repository URL in npm metadata, documentation, and status links.
- Validate the complete declarative input from the shipped schemas before probing tools, fetching, or
  mutating build state, while keeping the runtime dependency surface unchanged.
- Treat untracked files as dirty provenance while respecting Git ignore rules.
- Compare every shared schema-v1 field recursively between `box.json` and the signed release,
  including target, cache layout, self-test, asset policy, and provenance.
- Distinguish builder-only Python/file assertions from the signed consumer import check, document
  the single-process asset-resume boundary, and remove unsafe key-rotation and unsigned-build
  guidance.
- Complete tab keyboard/ARIA semantics, remove unused ShareThis and Patreon theme components, and
  restore visible scrollbars for accessible navigation.
