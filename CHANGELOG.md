# Changelog

All notable changes to Scrollcase are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — the `node` and `native` demo boxes are published

- **`codon-demo`, `transcode-demo` and `dataset-demo` are downloadable boxes**, signed by CI under
  `codon-demo-v1`, `transcode-demo-v1` and `dataset-demo-v1`, for macOS, Linux and Windows. Until
  now the only boxes anyone could download were the three `python` ones, so the two runtimes version
  3 added were the two nobody could try without a toolchain.

  Each is verified with `--self-test` and then *run* before it is published: the codon box is asked a
  real question, the transcode box encodes a synthesised pattern, the dataset box reads the data it
  ships. A box that starts but answers wrongly does not reach a release.

  They ship `box/` and a README rather than the `run-box.ts` and `run_box.py` templates the three
  older demo boxes carry. Those templates run a box with no arguments, and `ffmpeg` and `h5dump` with
  no arguments exit non-zero — three diverging copies to pass one flag each, for demos whose subject
  is the runtime rather than the consumer API.

- **Each demo page states its runtime**, and the three new ones are grouped in the sidebar under
  "Other runtimes" — the axis they actually differ on, everything else being a `python` box.

- **The three demos gained Linux and Windows scrolls**, split base-plus-target the way `hello-box`
  and `llm-demo` already were, with payload files under `shared/` so `codons.csv` and `readings.h5`
  keep one set of bytes and one pinned hash. A `native` box needs a per-target `execution.binary`:
  a conda prefix puts `ffmpeg` and `h5dump` under `venv/bin/` on macOS and Linux, and under
  `venv/Library/bin/` with an `.exe` suffix on Windows.

  `transcode-demo`'s `expectExitCode: 254` probe moved from the shared base into the macOS and Linux
  scrolls. The format caps `expectExitCode` at 255 because a POSIX exit status is one byte, and
  Windows exit codes are 32-bit — so it is a probe the Windows box does not run, rather than one it
  runs weakly. `selfTest.commands` join base-first rather than being replaced, which is why the
  platform-specific probe has to live in the fragments rather than be subtracted in one.

- `example-build.yml` builds all three demos on every target in its matrix, with no `if` gating the
  step. Without it the publishing workflow would be the first place a target was ever built, and the
  first build would be the one that goes out signed.

### Added — every documentation page can be handed to a language model

- **Two menus above each page's H1, `Markdown` and `Ask an AI`.** The first offers the page's
  Markdown twin copied or opened; the second opens Claude, ChatGPT, Mistral or Perplexity with a
  prompt already in the box. The twins and the content negotiation that serve them have been there
  since the site published `llms.txt`; nothing on the page said so, so the reader who would have
  used them had to know they existed.

  Two menus rather than one control with a primary action: the reader wants either the file or a
  model, and answering that first keeps each list short enough to read at a glance — and stops a
  button from acting before they have said which of the two they meant.

- **`Copy prompt` is the last entry**, and it exists so the list of four is not a closed one: it
  copies the same instruction and the same URL the four links carry, for any model that is not
  among them. Google is not among them because Gemini has no stable way to arrive with a prompt
  already filled, and a shortcut that opens an empty chat is worse than no shortcut.

- **`Copy` leads its menu, and it copies the content rather than a link.** A model asked to fetch a
  URL sometimes answers without having read it; the bytes in the clipboard have no such failure,
  and they are also what serves a local model, a chat with egress blocked, and a paste into an
  editor. The control reads the twin's address from the `<link rel="alternate">` the page already
  carries rather than deriving it a fourth time.

### Changed — the example scrolls no longer invent a publishing address

- **`publishBaseUrl` is gone from every example scroll.** All seven carried the same placeholder,
  `https://assets.example.org/boxes`, and no workflow ever overrode it — so every demo box published
  from this repository signed a link to a host that does not exist. Version 3 made `archive.url` and
  a channel entry's `releaseManifestUrl` optional precisely so a box that is not published to a URL
  can say nothing instead of saying something false, and these boxes are distributed as GitHub
  release assets, found beside their release document rather than by following a link.

  Nothing is lost but the address: an archive is verified by `sha256` and size, and all three
  consumers locate it next to the release document. `hello-box-native` had already been shipping
  without one.

### Fixed — the demo workflows honour their own `draft` input

- **`--draft` is now passed when a demo release is replaced, not only when it is created.** The three
  demo box workflows only ever passed the input to `gh release create`, and every tag they publish
  under has had a release since July or August — so the create branch was dead, `edit` was the only
  path taken, and "publish as a draft for review" silently did nothing on every run since. An option
  that reads like a safety net and cannot act as one is worse than no option at all.

  Its default flips to `false` with it. While the flag was inert `true` was harmless; now it parks a
  live release as a draft, which on a re-publish takes the public box offline.

### Changed — npm and crates.io releases publish from a tag

- **`.github/workflows/publish-npm.yml` and `.github/workflows/publish-rust.yml`** release the npm
  package and the Rust crate the way `publish-python.yml` has released the PyPI package since 0.4.0:
  a pushed tag runs the verification, and the registry is authenticated through Trusted Publishing
  rather than a stored token. `v<version>` publishes npm, `rust-v<version>` publishes the crate —
  a namespace the crate never had, so every version up to `0.3.2` has no tag and no recorded commit.

  What changes is not who decides. `npm publish` uploaded a maintainer's *working tree*, which can
  differ from the tag in ways nothing checked and nobody else could reproduce; the workflow packs a
  clean checkout of the tag and publishes the exact tarball its tests ran against. The decision
  moved from typing a command to pushing the tag, which is where the PyPI release already had it.

  The consequence is worth stating plainly, and both `CONTRIBUTING.md` and `AGENTS.md` now do:
  `git push --follow-tags` is a publishing command, and backfilling an old `v<version>` tag starts a
  release of that old version.

- **`scripts/check-release-version.mjs`** refuses a release tag that disagrees with the manifest it
  claims to release, before anything is built — the guard `python/scripts/check_release_version.py`
  already gave PyPI, for the two manifests a Node script can read. A published version is never
  replaced, only yanked, so a mistyped tag is not a mistake worth discovering afterwards.

## [1.0.0] — 2026-09-02

### Added — the `node` and `native` runtimes

- **A box can run Node, or run nothing at all.** `runtime.id: "node"` packs `nodejs` from
  conda-forge and starts `venv/bin/node` (`venv/node.exe` on Windows) on a declared `node-script`.
  `runtime.id: "native"` packs no interpreter and starts a compiled binary directly: the binary
  *is* the command line, `runtime.version` and `runtime.entryPoint` are absent, and declaring
  either is refused rather than ignored, because it would name a file the box never starts.

- **A native box proves itself with `selfTest.commands`.** It has no module system, so
  `selfTest.imports` means nothing to it and is refused where the scroll is read rather than
  silently dropped, which would report a pass for a check that never ran. `parity` is refused for
  the same reason: it runs a source file with the box's own interpreter, and there is not one.

- **`scrollcase new scroll --runtime <python|node|native>`** drives which execution kinds are
  offered, which starter files are written, and which dependency the generated `pixi.toml`
  declares — none, for `native`, where only the author knows what their binary needs.
  **`--python-version` becomes `--runtime-version`**, and is refused for `native`.

- **A Node box carries its own `package.json`** unless the payload already has one. Node decides
  whether a `.js` file is CommonJS or an ES module from the nearest `package.json` *above* it, so a
  box without one asks whichever directory it was extracted into — the same box then behaves
  differently in two places. Found by building one, against this repository's own `package.json`.

- **Whatever a box starts must come out of the archive executable.** Checked before the archive is
  written, through the runtime's own argv rule rather than by naming an execution kind, so it holds
  for every runtime. A `native-binary` a scroll brought in therefore needs `"executable": true`.

- **Link repair is not attempted for `native`.** A binary that finds its libraries through an
  absolute path recorded at compile time will not find them inside a box, and fixing that is
  per-format work — rpath, `install_name`, the DLL search order — worth its own pass. A native box
  must ship a binary that already resolves. The self-test catches the rest at build time: the first
  native example built here failed on conda-forge's own `ncurses`, which carries an unrewritten
  build-machine path to `libtinfo`.

- **`examples/hello-box-node` and `examples/hello-box-native`**, both built, verified and run for real.

### Changed — publishing is optional, and the field says so

- **`assetBaseUrl` becomes `publishBaseUrl`; `--asset-base-url` becomes `--publish-base-url`.** The
  old name said "asset" and meant nothing of the kind: a scroll's assets carry a URL each, and this
  value was only ever used to build two links — the release naming the archive, and the channel
  naming the release. It is about publishing, so it says publishing.

- **A box no longer needs a URL at all.** `archive.url` and a channel entry's `releaseManifestUrl`
  are now optional, and a build given no publish location simply omits both instead of refusing.
  That refusal forced every author who only wanted to run a box on their own machine to invent an
  address — while Scrollcase declined to invent one itself, on the grounds that a placeholder in a
  signed release is a false statement. Both cannot be right.

  Nothing is lost but the address. No guarantee ever rested on that URL: an archive is verified by
  `sha256` and size, and all three consumers find it beside its release document rather than by
  following a link. A `strip-release-archive-url` conformance case now pins that in every language.
  What an unpublished box gives up is the chain a downloader follows — which it has no use for.

### Changed — the version 3 box format

This is a **breaking wire change**, and the only one planned. Published v1 and v2 boxes stay
historical artefacts, usable with the Scrollcase versions that produced them; a v3 verifier refuses
either **by name**, saying which version it holds, rather than reinterpreting it. There is no
dual-read path anywhere, and no migration tool: a box is rebuilt from its scroll.

- **A box declares its runtime.** `runtime: { id, version, entryPoint }` replaces `pythonVersion`
  and `pythonEntryPoint` in the scroll, `box.json` and the signed release, and
  `provenance.pythonVersion` becomes `provenance.runtimeVersion`. A version 2 box recorded a Python
  interpreter path and Python execution kinds and nothing that said "Python", so a reader had to
  infer the runtime from the shape of a path. `id` is one of `python`, `node` or `native` — all three
  are implemented, and a box naming an id the format does not define is refused by name rather than
  misread as the runtime it happens to be shaped like. Fixing the vocabulary once is what let the
  other two arrive as code rather than as a second wire break.

- **`modelId` and `runtimeId` are gone**, replaced by an optional `labels` map that Scrollcase never
  reads. Both were required and neither was ever read by any code path: they were a consumer's
  vocabulary written into the format, so a box packaging a library still had to name a model, and
  most scrolls set `modelId` to the `boxId` and moved on. A label says the same thing when there is
  something to say and nothing when there is not. `modelCacheSubdir` becomes `cacheSubdir` for the
  same reason.

- **`weights` is gone; `assets[].embed` replaces it, per entry.** A box-wide switch could not ship a
  small entry point inside the archive and defer a 30 GB dataset beside it, which is the case it
  existed for. The `--weights` flag went with it rather than being kept: a build-time override of a
  per-asset declaration repacks a box under an identity that no longer describes it, which is the
  silent-repack bug the flag's own documentation already warned about. `assetArchives` gains no
  `embed` field — an archive is expanded at build time, so deferring one names nothing that could
  happen — which turns version 2's cross-field refusal into a schema-level impossibility.

- **A scroll may declare the licences bundled inside a binary it ships.**
  `bundledLicenseDeclaration` points at a reviewed JSON array of
  `{ name, version, declaredLicense, linkedInto }` entries, and the build checks that every path it
  names is a file the box actually carries before signing the list into the release and `box.json`
  and writing it beside the derived audit at `THIRD_PARTY_NOTICES/bundled-dependencies.json`.
  `pixi.lock` declares a licence per conda package, but it cannot see what was linked into a binary
  before Scrollcase ever saw the file, and reading the binary would be guessing. It travels in the
  release rather than only in the payload because a licence decision is made before an archive is
  downloaded. Its absence means the project declared none, never that the box has none.

- **The self-test generalises.** `selfTest.pythonImports` put Python syntax in the wire format and
  gave a runtime with no module system no way to state a check at all. The signed subset becomes
  `selfTest.probe`, carrying `imports`, `commands`, or both; a command invokes the box's own
  declared execution and names the exit status it must produce. In the scroll, `pythonFile` and
  `pythonCode` become `script` and `code`. The runtime adapter is the only thing that turns a probe
  into command lines.

- **The executable bit is declared, not inferred.** `assets[].executable` and
  `localFiles[].executable` replace the `venv/bin` heuristic that used to be the only way a payload
  file could carry the bit. A downloaded file arrives with no permissions — HTTP carries content,
  not modes — and a local file is copied rather than moved, so neither had one to inherit, and a box
  could not ship an asset that runs. The mode is still *synthesised* rather than read off the build
  machine, so two builds of one commit stay byte-identical whatever umask each ran under, and
  `payload-digest.v1` is untouched.

- **Extraction sets the mode explicitly.** All three consumers used to hand the archive's mode to
  `open(2)`, which masks it by the process umask, except the Python one, which chmod'd. Under a
  restrictive umask that made two of them silently drop the executable bit — a box that fails to run
  for reasons nothing in it explains — and made the three disagree observably. Each now chmods after
  writing, on non-Windows, and a conformance case extracts a declared-executable box under
  `umask 077` and asserts the bit survives.

- The execution union gains `node-script` and `native-binary` beside `python-script` and
  `python-module`, and every schema `$id` and `$ref` moves from `/schema/v2/` to `/schema/v3/`.

- Public API: `assertPythonEntryPoint` is replaced by `assertRuntimeEntryPoint(runtimeId, adapter,
  entryPoint)`, and `scrollcase/contract` now exports the runtime model — `RUNTIME_IDS`,
  `runtimeAdapter`, `runtimeAdapters`, `isImplementedRuntime`, `unimplementedRuntimeMessage`,
  `executionAffectingVariables` and `isExecutablePayloadPath`. The Rust crate and the Python package
  gained the equivalents. A `PreparedBox` receipt now carries `runtime` and `labels` in place of
  `pythonEntryPoint`, `modelId` and `runtimeId`.

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
  `TargetAdapter` lost the same fields, for the same reason. `assertPythonEntryPoint` is gone from
  all three, replaced by `assertRuntimeEntryPoint(runtimeId, adapter, entryPoint)`, which asks the
  runtime rule rather than the target for the layout it judges against.

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

### Added — `codon-demo`, and the two smoke tests renamed

- **`examples/codon-demo` is a `node` box doing real work**: it ships the standard genetic code and
  the tool that queries it, so the recipient needs neither Node, nor npm, nor a database. `run` with
  no arguments prints what the box carries, `run -- ATG` answers forward, `run -- Leucine` answers
  backwards, and an unknown term exits 1. Built, verified, run and rebuilt byte-identically on
  macOS; wired into `example-build.yml` beside the other two.

  It exists because the existing `node` and `native` examples prove a box *starts* and nothing more.
  This one proves a box can carry data and be trusted to answer from it: `codons.csv` is pinned by
  SHA-256 in `localFiles`, so appending one fabricated row is refused — `Local box file SHA-256
  mismatch` — before anything is packed or signed.

  Two constraints it documents by example. A `node` box cannot declare an npm dependency, because
  Scrollcase solves from conda-forge and nothing else — the tool uses `node:sqlite`, which is part
  of Node, and the JavaScript enters through `localFiles`. And it pins Node 26, because
  `node:sqlite` needs a recent Node to work without a flag and `execution.defaultArgs` land *after*
  the script path, so a box could not pass `--experimental-sqlite` even if it wanted to.

- **`examples/transcode-demo` is a `native` box doing real work**: ffmpeg, pinned, with the 90
  packages it links against, signed. 121 MB archived, 391 MB extracted — the honest cost of "just
  install ffmpeg", made visible. Its self-test runs a real encode rather than a version check: a
  test pattern synthesised through `lavfi`, encoded with `libx264` and discarded, so a box whose
  codecs did not load fails the build. No sample media ships to make that possible.

  Its third probe declares `expectExitCode: 254`, which is the point rather than a curiosity: ffmpeg
  reports the negative C error number for a missing input, `ENOENT` is 2, and an exit status is one
  byte. The value was measured against the built payload after the first build failed expecting 1 —
  a self-test asserts the binary's real contract, not a convention.

  It is also the example where the licence inventory earns its keep: 21 of the 90 packages are
  GPL-family, including ffmpeg, `x264` and `x265` at GPL-2.0-or-later. Anyone redistributing the box
  needs that before shipping, and `audit` derives it from the lock.

- **`examples/dataset-demo` is the second `native` box**, and a different shape from the first: the
  HDF5 command-line tools reading a dataset the box ships, rather than one large program driven by
  flags. 36 MB. The case it answers is not "I cannot install this" but "we must all read this file
  the same way" — a signed box fixes the reader, so a published inspection is a repeatable one. Its
  `readings.h5` is pinned by hash and regenerable: the text it came from and the `h5import` config
  ship beside it.

  It was meant to be a bioinformatics tool, and conda-forge is why it is not. `samtools`, `bwa`,
  `seqkit`, `minimap2`, `hmmer`, `diamond`, `blast`, `muscle` and `fasttree` are all on **bioconda**,
  a second channel that an example has no business introducing.

  `mafft`, the one that is on conda-forge, **fails as a `native` box** — and the failure is now
  documented in `examples/README.md`, because it is the second instance of the limitation
  `hello-box-native` exists to show. Its `venv/bin/mafft` is a shell wrapper carrying the path of
  the machine that built the conda package, and its `MAFFT_BINARIES` override must be absolute,
  which a box extracted to a fresh temporary directory cannot supply through a fixed signed
  `environment`. The self-test caught it before anything was signed. The lesson added: check what a
  program *is* before packing it — a wrapper script does not relocate, a compiled binary does.

- **`node-box` and `native-box` are now `hello-box-node` and `hello-box-native`.** They are
  `hello-box` in another runtime — smoke tests, not demos — and the old names claimed more.

### Added — every question says where it is explained

- **Each interactive prompt prints the documentation section that covers it**, on its own muted line
  under the explanation: `new scroll`'s target, runtime, box id, upstream revision, asset base URL,
  execution kind, script source and paths; `init`'s example, template, dependency, Python-source and
  toolchain questions; and `build`'s channel. A prompt has room for one lead-in line, which is enough
  to say what a field is and never enough to say why it exists — so it names the page that does.
  `scrollcase help` ends with the site itself.

- The links live in one module, `src/cli-docs.mjs`, and **every one of them is asserted against the
  pages in this repository**: the route must be a real file and the fragment a real heading on it.
  A dead link in a browser shows a 404; a dead link in a terminal shows nothing, because whoever
  followed it is somewhere else by the time it fails.

### Added — `add command` and `add file --pin`

- **`scrollcase add command <box> -- <arguments>`** records one invocation of the box's own execution
  as a self-test probe, with `--expect-exit-code` for a probe that must fail. It is the counterpart
  of `add import` for a runtime with no module system: a `native` box can only prove itself by
  running what it declares, and until now that probe could not be authored at all — the scroll had
  to be edited by hand. `remove command <box> -- <arguments>` is its inverse.

  The arguments come after `--` rather than as a quoted list, because they *are* a command line and
  the parser already preserves everything past that boundary byte for byte. It is also the only
  shape that survives arguments of their own: `-version` would otherwise be read as Scrollcase's.

  The first real probe replaces the empty placeholder `new scroll` writes — "run it with no
  arguments" stops being a claim anyone made once a real one exists.

- **`scrollcase add file <box> <path> --pin`** records the file's SHA-256, so a changed byte fails
  the build instead of shipping different data under the same signature. Opt-in, because most added
  files are about to be edited and a hash recorded then would fail the very next build; reference
  data the box answers from is the case that wants it.

  Together these remove the last hand edits from the end-to-end demo walkthroughs, which are
  published as their own `scrollcase-e2e-demo-*` repositories: none of them now asks a reader to
  open `scroll.json`.

### Changed — `--default-args` takes one argument as itself

- **`--default-args -hide_banner` now works**, alongside the JSON array for several
  (`--default-args '["-a", "-b"]'`). Quoting a one-element JSON array to pass one flag was a tax on
  the common case, and it read as noise in a walkthrough. A value opening with `[` is still held to
  being a valid JSON array of strings rather than falling back to a literal, because a malformed
  array silently becoming one argument that looks almost right is the worse failure.

  The quotes around the array are the shell's, not Scrollcase's: `[...]` unquoted is a glob pattern
  and never reaches the process.

### Added — the version 2 documentation stays readable at `/v2/`

- **`docs/v2/` carries the version 2 documentation as it was published.** Thirty-four pages copied
  from the last version 2 commit, plus an index that says what they are. The site's own pages were
  rewritten for version 3, so without this the only account of what a version 2 box's documents mean
  disappeared with the rewrite — while the boxes themselves stay in the field, and the schemas
  describing them stay served at `/schema/v2/`.

- **Every internal link in the copies was moved under the prefix**, including the three written as
  full `https://scrollcase.dev/…` URLs, which would otherwise have walked a reader out of the version
  they were reading without the dead-link check ever seeing it. Links to `/schema/v2/` were left
  alone: those still resolve, and they are the point.

- **Every page under `/v2/` carries a standing deprecation notice**, above the content rather than
  floating in a corner. The reader it exists for did not come through the landing page: they arrived
  from a search result or an old link, onto a mid-level page they have no reason to doubt. The
  navbar switch is too quiet to catch them, and a floating badge lives in the corner people learned
  to ignore when it held cookie banners — so the notice sits where reaching the first heading means
  passing it. It links to the same page in the current version, falling back to the landing page
  and saying so where version 3 has no counterpart. Not dismissible: the whole point is preventing
  one mistake, and a dismiss button removes the warning on exactly the page where it was working.

  It is one component registered in the theme, not a block written into thirty-five files: it cannot
  be forgotten on a page added later, and the copied pages stay byte-identical to what version 2
  published.

- **Their Markdown twins say it too**, since that banner is a Vue component and never reaches the
  generated `.md` files — leaving the audience most likely to read a superseded manual as current as
  the only one told nothing. Each deprecated twin now opens with a `> **DEPRECATED.**` paragraph and
  carries `deprecated: true` in its frontmatter: said twice because a consumer that parses
  frontmatter can act on the field, and everything else reads the prose. Both name the URL that
  supersedes the page — `current:` is emitted **only** where version 3 really has that page, since a
  field naming the home page reads to a machine as "your replacement is here", a claim it cannot
  check and would be wrong to act on. Where there is none, the prose says where the current
  documentation starts instead.

  Both also carry `schema-version: 2` and `current-schema-version: 3`, which is the fact a consumer
  can actually act on: it holds a box whose documents carry `schemaVersion`, and comparing that
  number is how it works out which of the two manuals describes what it has. Integers, not `v2`
  strings, because that is how the format spells them — `"schemaVersion": 2` in every document
  version 2 ever signed — and a reader comparing this against a box in hand should not have to strip
  a prefix off one side first. The current number is read from `package.json`, and
  `verify-built-docs.mjs` fails if a twin disagrees with it: the day schema version 4 ships, a
  `current-schema-version: 3` left behind is a lie told to every machine that reads it, and nothing
  else in the build would notice.

- **`/v2/` is served `X-Robots-Tag: noindex, follow`.** Being absent from `sitemap.xml` was never
  enough: the version switch links each deprecated page from its current counterpart, and internal
  links are how most pages get crawled in the first place. So the whole archive would have been
  indexed and would have competed for the same queries, with the obsolete page often winning on age.
  `follow`, because the links inside are worth following — not least the one back out.

  Set in `functions/_middleware.js` rather than as a `<meta>` tag, because the Markdown twins are
  indexable files too and no meta tag reaches them. It is the one place that covers both
  representations. Not `Disallow: /v2/` in robots.txt: that blocks the crawl rather than the index,
  so the URLs can still surface bare while the crawler is prevented from ever reading the very
  notice telling it not to index them. And the pages keep their self-canonical — pointing it at the
  version 3 page would claim these are the same document, when the whole point is that they are not.

- **The same responses carry `Link: <…/v2/>; rel="deprecation"`** (RFC 9745), pointing at the page
  that explains the deprecation. Deliberately not `successor-version`: which page supersedes this
  one differs per URL, and a header that guessed would send readers to pages that do not exist. That
  answer is already per page, in the twin's `current:` field and the page's own banner. No `Sunset`
  either — that promises when a resource stops being served, and these stay readable for as long as
  there are version 2 boxes in the field.

  The `Deprecation` field itself is **not** emitted yet. It is a Date and nothing else, and the
  release that makes version 3 current has not shipped, so there is no date that is a fact rather
  than a guess. `DEPRECATED_SINCE` is the one line to set when it does; a test asserts the field
  appears once it is, and stays absent while it is not.

- **`llms.txt` stops hard-coding the schema version too.** Its header line and its schema links both
  had `3` typed into `llms.mjs`. Same defect as the site footer, which said `2` for the whole of the
  version 3 work; both now come from `package.json`.

- **The route mapping is now one module** (`versions.mjs`), used by the sitemap filter, the llms
  files, the switch and the notice. It resolves a candidate to the spelling the build serves rather
  than answering yes or no, which is what found the bug below.

### Fixed — the version switch stranded readers of the API reference

- **`/v2/reference/api` offered the home page instead of `/reference/api/`.** Version 3 turned that
  single page into a section, so its route grew a trailing slash, and the switch was asking whether
  the exact string `/reference/api` existed. It did not, so the fallback fired and a reader looking
  for the current API reference was dropped on the landing page. The generated twin, computing the
  same answer from a route table that normalises the slash away, advertised `/reference/api` — so
  the two halves disagreed about the same page. Found by the check on the twins, not by reading.

- **The deprecated set has its own sidebar**, so navigation inside it stays inside it, and a
  **`v3` / `v2` switch in the navbar** moves between the two. The switch is a theme component rather
  than a nav entry because both versions ship in one build: which one you are reading is a property
  of the route, so a fixed label would be wrong on half the pages. It keeps your place where it can —
  `/v2/reference/cli` switches to `/reference/cli` — and falls back to the other version's landing
  page where the page does not exist, which it sometimes does not: version 3 split the API reference
  into a section and renamed the weights guide. It is in the mobile navbar too, since a control that
  vanishes below 768px is how a reader gets stranded in the deprecated documentation.

- **`/v2/` is declared as a VitePress locale**, which is what gives it its own navbar menu, its own
  sidebar, and — the part worth the mechanism — **its own search index**. Nothing is translated;
  both locales are `lang: 'en'`. A locale is simply the one thing VitePress has that scopes all
  three to a path prefix.

  Without it the navbar was the leak: the sidebar was already prefixed, but `Reference` in the top
  menu still went to the current version, changing the version under a reader without saying so.
  Search was the same leak in a worse place — `VPLocalSearchBox` loads `searchIndexData[localeIndex]`,
  so with one locale a search made from a deprecated page answered with current-version pages.
  It now searches version 2 and finds version 2. The theme's own locale dropdown is hidden: the
  version switch is the control for this, and unlike the dropdown it checks that the other version
  has the page before offering to go there.

- **`verify-built-docs.mjs` checks the switch and the menu**, on every built page rather than on the
  sitemap's. Both are generated per page — the switch from the route, the menu from the locale — so
  neither is written down where VitePress's dead-link pass could read it, and both fail silently:
  a switch link to a route the build never emitted looks entirely normal and 404s only for whoever
  used it, and a menu from the wrong locale renders perfectly while walking the reader into the
  other version. The menu half was itself written against the wrong attribute order first, passed
  against markup it had never matched, and now fails when it finds no menu to read.

- **It is deliberately absent from `sitemap.xml`, `llms.txt` and `llms-full.txt`.** A sitemap is a
  submission rather than an inventory, and two documentation sets describing incompatible formats
  would compete for the same queries with the obsolete one often winning on age; the two llms files
  exist to say what Scrollcase is *now*, and a second contradictory manual makes them worse than not
  existing. The pages stay served, linkable and indexable — they are simply not put forward. They
  keep their Markdown twins, because `functions/_middleware.js` advertises one for every page and an
  advertised 404 is worse than no offer.

### Fixed — the version 2 schema URLs resolve again

- **`docs/public/schema/v2/` is served again.** Rewriting the documentation for version 3 removed it,
  but every scroll, release and box already in the field carries
  `"$schema": "https://scrollcase.dev/schema/v2/…"` — the `$id` those documents were published with.
  Dropping the directory turned each of those URLs into a 404, breaking editor validation for anyone
  holding a version 2 scroll and any tooling that dereferences `$schema`.

  Published v1 and v2 are immutable, which is a promise about the artefacts as much as the format:
  a v2 box is refused by a v3 verifier *by name*, and its schema stays readable. The eight files are
  restored verbatim from `v0.12.0` and are frozen — nothing generates or checks them, because there
  is nothing left to keep them in step with.

  The `/.well-known/api-catalog` still lists version 3 only. A catalogue is read by software
  choosing what to use, and version 2 is not a choice anyone should make now.

### Fixed — `init` no longer goes quiet about the toolchain

- **When pixi and conda-pack are already installed, `init` says so.** It looks for them on every run
  and asks only when one is missing, so on a machine that had both, the question a reader had been
  told to expect never appeared and nothing explained why — silence indistinguishable from never
  having looked. Every other outcome reported; this one now does too.

- **It also names a newer pixi when there is one**, with a terminal and unless
  `--no-install-toolchain` was passed. Not general news: `new scroll` records the pixi it finds and
  `build` refuses any other version for that scroll, so being behind decides what every scroll
  written next pins. The lookup is advisory and best-effort — an offline machine or the public API's
  rate limit simply produces no line.

- The four outcomes moved out of `cli.mjs` into `toolchainReportLines` so they can be asserted
  without a host that happens to have the tools installed, which is why the silent one went
  unnoticed.

### Added — a `native` box can name a binary the environment provides

- **`new scroll` asks a `native` box where its binary comes from**, and `--from-environment <payload
  path>` answers it without a terminal. A program the dependency solve installs — conda-forge's
  `venv/bin/ffmpeg`, a generated console script — is named where it lands, and nothing of the project
  is copied in, so no `localFiles` entry appears.

  This shape was always in the format: every `native` example in this repository uses it. It was not
  in the authoring surface, which assumed a file-naming execution always pointed at a project file to
  stage — so writing one meant editing `scroll.json` by hand, and `edit scroll` does not accept
  `execution.binary` either. Both `native` end-to-end demo walkthroughs carried that hand-edit as a
  step until this closed it.

  The menu offers the environment first: it is the common case for `native`, and the only one that
  works before anything has been compiled.

### Changed — `new scroll` asks better questions

- **The execution-kind menu explains the kinds it is actually offering.** The line above it was one
  fixed sentence for every runtime, so a `node` author was told they could pick "an importable
  module" — a Python idea that has never been on their menu. It is now assembled from the kinds the
  chosen runtime defines. And a runtime with a single authored kind is no longer asked at all:
  `native` defines only `native-binary`, and a menu of one reads as though an option were missing.

- **The generated starter is the preselected script source**, ahead of pointing at an existing file.
  It is the answer that works with nothing else in place — a first scroll builds and runs
  immediately, and the stub is a file to edit rather than a file to go and find.

- **A malformed box id is refused at the prompt that produced it**, naming the value and the shape it
  needed. It used to be accepted, and then refused by schema validation after the revision, the URL
  and the execution kind had all been answered, as `$.boxId does not match the required pattern` —
  which named neither what was wrong nor what to type. The rule is read from the schema, so the early
  check and the late one cannot disagree.

- **`assetBaseUrl` is optional when authoring.** It is the one field a project often does not know on
  its first day, the scroll schema never required it, and forcing an answer invited a placeholder URL
  into a document whose whole value is that it is true. Press Enter to skip; supply it later with
  `edit scroll`, or per build with `--asset-base-url`.

### Added — one page for the v2 → v3 move

- **`/guides/migrating-from-v2` is the field-by-field mapping, in one place.** Every renamed scroll
  field, every renamed field in the signed documents, every renamed or removed CLI flag, the three
  additions version 2 had no equivalent for — `assets[].executable`, `bundledLicenseDeclaration`,
  an optional `archive.url` — a before-and-after scroll, and the order to do it in. All of it was
  derivable before, from three separate subsections of this changelog and a table in the box-format
  reference, which is not the same as being findable by someone holding a v2 scroll. That table is
  now the *why* and links here for the *what*, so the mapping has one home rather than two.

- The deprecation notice on every `/v2/` page links to it, since a reader who arrived there from an
  old link or a search result is exactly the person it is for.

### Fixed

- **`scrollcase/contract/browser` was a dead entry point for the whole of the version 3 work.** It
  re-exported `assertPythonEntryPoint` from `targets.mjs`, which the runtime split had renamed and
  moved, so linking the module under `node` was a `SyntaxError` before a single statement ran. It
  now exports `assertRuntimeEntryPoint` and the rest of the runtime model — `runtimes.mjs` reads no
  file, joins no host path and starts no process, so the browser-safe rule is unchanged and the
  entry point is once again everything `scrollcase/contract` has except `decodeDocumentPayload`,
  `schemaUrl` and `fixtureUrl`.

  **Three things should have caught it and all three looked elsewhere**, which is the part worth
  recording. The package-surface import test runs under Vitest, whose resolver forgave the missing
  export. The import-closure check is a regular expression over source text and never evaluates a
  module. And `tsc` omits an unresolvable re-export from the generated `.d.mts` without a word, so
  `types:check` reported no drift. The suite now links all five published entry points in separate
  `node` processes, through the `exports` map, which is the walk a dependent's own `import`
  performs.

- **A build with no asset base URL is refused before it solves anything.** The URL is needed only
  when the release document is written, which is after the environment solve, the self-test and the
  archive — so a scroll that never named one paid for the entire build before being told. It is now
  checked with the other early refusals.

- **`llms.txt` lists the published JSON Schemas again.** The generator read them from
  `schema/v2/`, a directory the site stopped emitting, and its `catch` turned the resulting
  `ENOENT` into an empty list — so the schema section had been silently absent rather than wrong.
  It reads `schema/v3/` now, and the eight schemas are back. The header also said "box format
  schema version 2".

- **Hard rule 1 — no consuming project's name anywhere in the tool — has the mechanical guard the
  white paper already claimed it had.** `v3-migration.test.mjs` greps every tracked file and every
  tracked path for it, alongside the retired product term it was already checking. The tree was
  clean; nothing was keeping it that way.

### Fixed — the Python package declares `referencing`

- `scrollcase_consumer` imports `referencing` directly, to build the schema `Registry` that resolves
  the `$ref`s between the bundled canonical schemas, but declared only `cryptography` and
  `jsonschema`. It worked because `jsonschema` depends on `referencing` itself — that is, the package
  was relying on another project's dependency list staying what it is today. It is now a declared
  dependency at the floor `jsonschema` already requires, `>=0.28.4,<1`, so nothing new is installed;
  what was already installed and already imported is simply named. Reported in review of the
  conda-forge submission, where the declared run requirements are what the solver builds an
  environment from. `tests/test_dependencies.py` now walks the shipped source and fails on any
  third-party import the package does not declare.

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
