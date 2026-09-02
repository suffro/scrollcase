---
title: CLI Commands
description: Every Scrollcase command, flag, environment variable, and exit convention.
---

# CLI Commands

```text
scrollcase <command> [options]
scrollcase -v | --version
```

Thirteen verbs: `init`, `new`, `add`, `remove`, `edit`, `refresh`, `doctor`, `keygen`, `lock`, `audit`, `build`, `verify`, `run`.
`scrollcase help` (or no command) prints the full usage text.
`scrollcase -v` and `scrollcase --version` print only the installed package version and do not
require a workspace.

**Flag syntax.** Flags accept `--name value` or `--name=value`; a bare `--name` means `true`.

**Exit convention.** Every failure, anywhere in the pipeline, exits non-zero with a single
`scrollcase: <message>` line on stderr — safe to rely on from shell scripts and CI.

**Workspace flags** (`--config`, `--project-root`, `--scrolls-dir`, `--build-dir`, `--out-dir`,
`--keys-dir`, `--toolchain-dir`) apply to every command and are resolved before anything else runs. They are
documented in [Workspace Configuration](/v2/reference/configuration).

## Scroll arguments and target selection

`lock`, `audit` and `build` accept an exact nested reference:

```sh
scrollcase build hello-box/macos-aarch64-metal
```

They also accept a box ID, with an optional target flag:

```sh
scrollcase build hello-box --target macos-aarch64-metal
```

With only `hello-box`, a terminal shows a navigable target menu for the scrolls under
`scrolls/hello-box/`: use ↑/↓ and Enter. Exactly one target matching the host OS and architecture is
offered as the default; on macOS, Metal is preferred when both CPU and Metal are available. With no
terminal, the same default is selected and reported; any other ambiguous selection fails and tells
the caller to pass `--target`. v2 accepts only the nested
`scrolls/<boxId>/<targetId>/scroll.json` layout.

The editing verbs — `add`, `remove`, `edit` and `refresh` — take a **box**, not a scroll reference,
because a change may belong to every target of that box or to one of them. Their `--target` answers
that question and is described under [`add`](#where-an-edit-goes).

## `init`

Initialize a workspace, and offer two independent extras: a fixed, disposable `example-box` for the
native host, and the consumer templates. A concise, linked `SCROLLCASE.md` is always created unless
one already exists.

The **example** is a complete runnable v2 scroll: Metal on Apple Silicon and CPU on Linux or
Windows. It is created through the normal validated authoring path and never overwritten. It exists
to be built once and deleted.

The **consumer templates** are `consumer-templates/run-box.ts`, `consumer-templates/run_box.py`, and
a small Rust crate at `consumer-templates/rust/`. They demonstrate the public Node, Python, and Rust
consumer APIs against a caller-supplied local release and include their setup commands, and they
name no particular box: the release path in each is a placeholder for the project's own. If no
`package.json` exists, `init` creates a private one with `"type": "module"`; an existing package
file is never changed. The Rust crate has its own non-overwriting `Cargo.toml` and ignores only its
generated `target/` directory.

Both questions come before anything is written and default to yes (`[Y/n]`), and they are separate
because they answer different needs: a project that does not want a throwaway demo still has an
application to write against its boxes. `--no-example` and `--no-templates` answer without asking;
passing both leaves the workspace and its guide alone. Without a terminal both are included, as they
always were: unlike the installs below, writing a scaffold is not an act silence has to withhold
consent for.

When it generated the templates, `init` asks in **one multi-select menu** which of their
dependencies to install — TypeScript, Python, Rust — using ↑/↓ to move, Space to select and Enter to
confirm. Nothing is preselected, and confirming an empty selection installs nothing. Selecting
Python then asks whether to take `scrollcase-consumer` from PyPI with pip or conda-forge with conda.
`init` also offers to install `pixi` and `conda-pack` if they are missing. Every answer is collected
before the first installer runs. If conda-forge is selected but `conda` cannot start, a default-yes
question offers PyPI instead. Without a terminal nothing is installed: a pipe or CI job does not
grant installation consent by being silent.

```sh
scrollcase init [--pixi-version <version>]
                [--no-example] [--no-templates]
                [--install-toolchain | --no-install-toolchain]
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--pixi-version` | example pin | Use this exact pixi release for the example and managed toolchain |
| `--no-example` | ask | Initialize without the `example-box` scroll, without asking |
| `--no-templates` | ask | Initialize without `consumer-templates/` and its package file, without asking |
| `--install-toolchain` | ask | Install missing tools without prompting |
| `--no-install-toolchain` | ask | Never install; just report what is missing |

The final guidance names the example's exact lock command and points to `scrollcase new scroll` for
real project metadata. Without the example, it is simply `Next: scrollcase new scroll`. Target and
product flags passed to `init` are rejected with the same remedy instead of being silently ignored.

### The toolchain step

With neither flag and a terminal attached, `init` prompts, defaulting to **yes**. Without a
terminal — CI, a pipe — it never installs and simply reports what is missing: silence is not
consent.

When you agree, `init`:

1. resolves the pixi version — `--pixi-version`, else the example's repository pin; with
   `--no-example`, the installed pixi's or newest release;
2. downloads the release for this host and checks its SHA-256 against the checksum pixi publishes
   beside it. **A mismatch aborts and installs nothing**;
3. installs pixi into the workspace's toolchain directory, then uses it to run
   `pixi global install "conda-pack==0.9.2"` with `PIXI_HOME` pointing there, so both land in the
   project;
4. records the verified pixi digest and the conda-pack version under `toolchain` in
   `scrollcase.config.json`, so later pixi installs are checked against the committed digest — see
   [Workspace Configuration](/v2/reference/configuration#toolchain);
5. keeps each scroll's own `pixiVersion`; the generated example and managed toolchain use the same
   resolved pin.

Nothing is added to `PATH` and nothing is installed system-wide; later commands find the tools
because [tool discovery](#tool-discovery) looks in the toolchain directory. Deleting
`.scrollcase/toolchain/` undoes the whole thing.

The consumer selections are independent of this managed build toolchain. Selecting TypeScript runs
npm in the project root to install `scrollcase`, `typescript`, and `tsx`. Selecting Python installs
`scrollcase-consumer` with either pip or conda-forge. For a PEP 668 externally managed interpreter,
`init` retries as a user-scoped installation and keeps package files outside the managed prefix. The
conda-forge path checks Conda before installation and offers the PyPI fallback when it is missing.
Selecting Rust runs `cargo add --manifest-path consumer-templates/rust/Cargo.toml
scrollcase-consumer`, modifying only the generated template crate. If Cargo is unavailable, `init`
leaves Rust out of the menu entirely without failing, keeps the Rust template, and prints the same
command so it can be run after Rust is installed.

The example follows Scrollcase's supported box target matrix. On another host, decline it or
initialize with `--no-example`. Toolchain-only setup can still use any host for which pixi publishes a build.

## `new`

Create one `scrolls/<boxId>/<targetId>/` input. With a terminal it asks **four questions** — the
target, the box id, the upstream revision, and the base URL boxes will be published under — plus
navigable menus for execution kind and script source. Everything else has a defensible default and
is a flag rather than a prompt. A required answer left blank repeats the question instead of ending
the session.

The weights mode is one of those defaults rather than a menu. It decides whether declared assets are
packed into the archive, and a box that declares none — which is most of them, since a scroll
packages a Python environment and not necessarily a model — has nothing for it to decide. New
scrolls take `embed` and say nothing about it; `--weights on-demand` states the other choice, and
`scrollcase edit scroll` changes it later.

Every question in the CLI has the same shape: a blank line, the field's name, one line saying what
the field is, then the answer typed after ` ↳ `. The name is coloured and the explanation is not, so
a session of several questions stays readable rather than running together:

```text
Upstream revision
Which version of the thing you are packaging this is — a model commit, a release tag. Recorded
verbatim in the box provenance:
 ↳ upstream-v1
```

Without a terminal, every value that has no default must be supplied explicitly, and missing input
fails before anything is written.

```sh
scrollcase new scroll
scrollcase new scroll \
  --target linux-x86_64-cpu \
  --box-id example-model \
  --source-revision upstream-v1 \
  --asset-base-url https://assets.example.org/boxes \
  --weights embed \
  --execution library-only
```

| Flag | Meaning |
| --- | --- |
| `--target` | Complete canonical target; CUDA IDs include the ABI, such as `linux-x86_64-cuda12.4` |
| `--box-id` | Box identity and parent directory |
| `--source-revision` | Upstream revision recorded in provenance |
| `--asset-base-url` | Base URL copied into built release metadata |
| `--model-id` | Identity of what the box packages. Defaults to the box id |
| `--runtime-id` | Runtime identity. Defaults to `<box-id>-runtime` |
| `--version` | Box version. Defaults to `1.0.0` |
| `--scroll-version` | Version of the authoring input. Defaults to `1.0.0` |
| `--python-version` | Python dependency version written into `pixi.toml`, or `latest`. Defaults to one minor behind the newest Python conda-forge publishes |
| `--pixi-version` | Exact resolver version required by `lock` and `build`. Defaults to the installed pixi's version |
| `--min-host-app-version` | Optional compatibility floor |
| `--max-host-app-version-exclusive` | Optional compatibility ceiling |
| `--min-macos-version` | Optional macOS floor |
| `--min-ram-gb` | Optional positive RAM requirement |
| `--min-nvidia-driver-version` | Optional NVIDIA driver floor |
| `--weights` | `embed` (default, and left out of the scroll) or `on-demand` |
| `--execution` | `python-script`, `python-module`, or `library-only` |
| `--script` | Existing project-relative Python script |
| `--generate-script` | Generate a minimal starter instead of using an existing script |
| `--script-destination` | Safe payload path, default `entrypoint.py` |
| `--generated-script-path` | Project path for the generated source; defaults to `box-entrypoints/<boxId>/<targetId>/entrypoint.py` |
| `--module` | Strict dotted Python module name |
| `--default-args` | JSON array of default application arguments |

For `python-script`, choose exactly one of `--script` and `--generate-script`. Scrollcase records the
source in `localFiles` **without a hash pin**, so the first edit to a freshly generated script does
not fail its own build; add `sha256` yourself for a file that must not change without review. It
refuses traversal and non-regular sources, and never overwrites an existing source or scroll.
Generated defaults are grouped by both box and target; `library-only` omits execution metadata.

Alongside `scroll.json` and `pixi.toml`, `new scroll` writes a `self_test.py` next to them and
points `selfTest.pythonFile` at it, so the box's own check starts life as real Python rather than
an escaped JSON string.

`--python-version latest` resolves once, at authoring time, and writes the resulting number into the
scroll — never the word `latest`. Both it and the default are constants moved deliberately at each
Scrollcase release by `npm run python:bump`, which asks conda-forge what it publishes: a version
looked up on every invocation would make the same command produce different scrolls in different
months.

Execution metadata is copied into the signed release and `box.json`. Before archiving, the builder
requires a script to remain a regular payload file or a dotted module to be discoverable in the
built environment without importing it. Library-only scrolls omit the field.

## `add`

Record something in a scroll that already exists, so the fields nobody can write by hand are not
written by hand.

```sh
scrollcase add asset  <box> <url>        [--to <payload path>] [--target <targetId>|all]
scrollcase add file   <box> <path>       [--to <payload path>] [--target <targetId>|all]
scrollcase add dep    <box> <name>       [--version <spec>] [--target <targetId>|all]
scrollcase add dep    <box> --from-requirements requirements.txt
scrollcase add env    <box> NAME=VALUE   [--target <targetId>|all]
scrollcase add import <box> <module>     [--target <targetId>|all]
```

`add asset` **downloads the URL once** and records the `sizeBytes` and `sha256` it actually found,
which are the two values a scroll cannot be written without and no author can know without fetching
the file. Recording them here changes nothing about the guarantee: they are pinned once and checked
on every build, exactly as before. `--to` is optional and defaults to the URL's last path segment
under the box's `modelCacheSubdir`.

`add file` records a file from the project. `--to` defaults to the file's own name at the payload
root. No `sha256` is written — see [`localFiles`](/v2/reference/scroll#localfiles) — so the first edit
to a file you just added does not fail your next build.

Both also add the payload path to `selfTest.files`, so an over-eager `prunePaths` cannot quietly
drop what you just declared.

`add dep` writes into the `[dependencies]` table of the box's `pixi.toml` files, editing the text
rather than re-emitting the manifest, so comments and spacing survive. The default constraint is
`*`: `pixi.lock` is the pin that matters and it records the exact version solved, so a second,
weaker pin in the manifest would only be something else to keep in step. Pass `--version ">=2,<3"`
when a project wants a bound. It closes by reminding you that a dependency is not proven until the
box imports it — the module name is yours to give, so the reminder names the command and no module.

`add env` declares one environment variable the box needs whenever its interpreter runs, leaving the
rest of the map alone. A map is the one shape a single-value prompt cannot edit, which is why it has
its own command rather than being left to a hand edit. The value may contain `=`; only the first one
separates the name.

`add import` adds a module to `selfTest.imports`. Those names are signed into the release and
repeated by `verify --self-test`, so they are the part of the self-test a consumer can check for
itself.

`--from-requirements` reads a pip `requirements.txt` instead. Names are translated to conda-forge
where Scrollcase is sure and lowercased otherwise, and **every translation and every skip is
reported** rather than applied quietly: a name translated wrongly gives a lock that resolves and a
box that cannot import what it was built for. Extras, pip options and direct URLs are skipped with a
reason.

### Where an edit goes

A box may keep its shared declarations in a base and its differences in per-target fragments (see
[one box, several targets](/v2/reference/scroll#one-box-several-targets)), so every one of these
commands has to know which file to write:

| `--target` | Writes to |
| --- | --- |
| `all` | What the targets share: the base of a split scroll, or every target file when there is no base |
| A target ID | Only that target's scroll |
| Omitted, box has one target | That target |
| Omitted, box has several, terminal | A menu, with "every target" first |
| Omitted, box has several, no terminal | Nothing — the command stops and asks for `--target` |

It is never guessed. Both answers are reasonable, only the author knows which was meant, and a
declaration that lands on one target instead of all of them is silent until a build somewhere is
missing a file.

Every edit is atomic and verified: the new bytes go to a staging file and are moved into place with
one rename, then the whole box is read back through the same path a build uses. If the result would
not load — a payload path claimed twice, a value the schema refuses — the originals are put back and
the command fails.

## `remove`

The exact inverse of `add`, because a tool where arriving is a command and leaving is a hand edit
has not removed the hand edit.

```sh
scrollcase remove asset  <box> <payload path> [--target <targetId>|all]
scrollcase remove file   <box> <payload path> [--target <targetId>|all]
scrollcase remove env    <box> NAME           [--target <targetId>|all]
scrollcase remove import <box> <module>       [--target <targetId>|all]
```

For `asset` and `file` the entry is dropped and so is its `selfTest.files` line. Removing the last
environment variable takes the empty map with it rather than leaving `"environment": {}` behind.
Removing the last self-test import is refused: a box has to prove it can import something.

A path, name or module that matched nothing is an error, not a quiet success.

## `edit`

Change one field of a scroll that exists.

```sh
scrollcase edit scroll [<box>] [--field <name> --value <value>] [--target <targetId>|all]
```

With a terminal and no flags, the field comes from a **menu built out of the schema** — so a name
that is not a field cannot be typed in the first place — and an enum field offers its values.
Without a terminal, `--field` and `--value` are required.

Three kinds of field are not offered: structural values a project does not choose (`schemaVersion`,
`extends`), values the layout or the target fixes (`boxId` and `target` name the directories,
`pythonEntryPoint` has one legal value per target), and the collections, which have `add`/`remove`
or a file of their own.

## `refresh`

Bring a scroll back into agreement with the project it describes.

```sh
scrollcase refresh [<box>] [--check-assets] [--repin]
```

By default it recomputes only the pins a project asked for: a `localFiles` entry that declares
`sha256` means "this must not change without review", and after a reviewed change the digest has to
move with it. That is the edit worth automating; nothing else is touched and the network is not
used.

Remote assets are deliberately different. Their hashes are what stands between a replaced upstream
file and a silently different box. If `refresh` re-fetched and rewrote them, then every time someone
swapped a file on that server the next `refresh` would adopt it without a word and the build would
go green — the protection would be gone. So `--check-assets` is opt-in (it downloads every asset), a
difference is **reported and refused**, and accepting it takes a separate `--repin`. Find out why
upstream changed before you use it.

## `doctor`

Report whether this machine can build a box. Reads only; never writes. Each failing check prints
a remedy, and all checks run even when an early one fails.

```sh
scrollcase doctor [--scroll <name>] [--target <targetId>] [--pixi-version <version>]
                  [--pixi <path>] [--conda-pack <path>]
```

Checks: the workspace resolution, the scrolls directory, being inside a git checkout, pixi at the
required version (from `--pixi-version` or `--scroll`; skipped when neither is given), and
conda-pack. The managed installer pins conda-pack 0.9.2; because its `--version` output is not
reliable, `doctor` can only prove that an externally supplied conda-pack executable runs. Exits
non-zero if any check fails.

## `keygen`

Create a local ed25519 signing key pair: a private PEM written with owner-only permissions, and a
public key JSON file used as the trust anchor by `verify`.

```sh
scrollcase keygen [--key-id <id>] [--force]
                  [--private-key <path>] [--public-key <path>]
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--key-id` | `scrollcase-<first 16 hex of key hash>` | Identifier recorded in every signature |
| `--force` | off | Overwrite an existing key. Guarded because rotating silently would invalidate every previously signed document |
| `--private-key` | `<keys>/signing-private.pem` | Where the private key is written |
| `--public-key` | `<keys>/signing-public.json` | Where the public key file is written |

See [Signing & Key Custody](/v2/guides/signing-and-custody) for rotation and external signers.
`--force` is not a rotation workflow or a safe way to repair mismatched paths: it can overwrite
the only copy of an established signing identity.

## `lock`

Resolve the scroll's `pixi.toml` into a fully pinned `pixi.lock`, written next to the manifest.
Run by a human when dependencies change; the lock is committed and reviewed, and `build` then
only installs from it. Requires pixi at the scroll's pinned version.

```sh
scrollcase lock [<scroll>] [--target <targetId>] [--pixi <path>]
```

The manifest itself pins the channels and the single target platform, so resolution does not
depend on the machine doing it.

When `<scroll>` is omitted in an interactive terminal, Scrollcase discovers every valid nested
scroll in the workspace and presents their complete `<boxId>/<targetId>` references in a navigable
menu. A non-interactive caller must provide the reference explicitly.

## `audit`

The dependency licence inventory, derived from the committed `pixi.lock` without building
anything. The lock carries an SPDX licence per package; a package **without a declared licence
fails the parse outright** — an unlicensed dependency is a legal problem, not a reporting gap.

```sh
scrollcase audit <scroll> [--target <targetId>] [--write] [--namespace <ns>]
```

Two modes:

- **Check (default).** If the scroll declares a `condaDependencyLicenseAudit` path, the computed
  inventory is compared byte-for-byte against that reviewed file and any difference fails. This
  is what `build` enforces too, so licence review happens when dependencies change — not at the
  end of a multi-gigabyte build.
- **Write (`--write`).** Write the inventory to the scroll's declared path, for a human to review
  and commit. Writing is explicit because silently overwriting the reviewed file is exactly how
  an unreviewed licence change would slip through.

A scroll that declares no path gets one: `--write` places `conda-licenses.json` beside the scroll
and records the declaration, reporting both. The path is a convention rather than a decision, so
there is nothing gained by making you type it. The **declaration** stays deliberate: a build
enforces the audit only for a scroll that names a path, so the check is switched on by running this
command and never by a file appearing on disk.

`--namespace` sets the namespace of the inventory's `kind`
(`<namespace>.dependency-license-audit`, default `scrollcase.box`).

Output is a per-licence package count, for example:

```text
23 packages for hello-box-macos-aarch64-metal (macos-aarch64-metal)
    9  MIT
    4  Apache-2.0
    ...
```

## `build`

Turn a scroll into a signed box: install the locked environment, pack and relocate it, stage
assets, prune, audit licences, self-test with the box's own interpreter, run the optional
[parity gate](/v2/guides/accelerator-parity), archive deterministically, and sign a release document
plus a channel pointer. The full pipeline is narrated in
[Architecture](/v2/concepts/architecture).

```sh
scrollcase build [<scroll>] [--target <targetId>]
                 [--channel <name>] [--weights embed|on-demand]
                 [--asset-base-url <url>] [--namespace <ns>] [--allow-dirty]
                 [--pixi <path>] [--conda-pack <path>]
                 [--private-key <path>] [--public-key <path>] [--signer-command <cmd>]
```

As with `lock`, omitting `<scroll>` in an interactive terminal opens the workspace-wide scroll
menu. CI and other non-interactive callers must always provide it explicitly.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--target` | ask when a box has several scrolls | Canonical target scroll to build |
| `--channel` | `beta` | Channel the signed pointer names. The v2 vocabulary is closed to `nightly`, `beta`, and `stable` |
| `--weights` | scroll's `weights`, else `embed` | Overrides the scroll for this build: `embed` packs assets into the archive (works air-gapped), `on-demand` leaves them out for the caller to materialize; consumers verify them before execution. `build` does not ask — the scroll's declaration is what it uses |
| `--asset-base-url` | scroll's `assetBaseUrl` | Base URL the signed documents point at; one of the two must be set |
| `--namespace` | `scrollcase.box` | Document `kind` namespace — a project with boxes already in the field keeps emitting its own |
| `--allow-dirty` | off | Permit a build from an uncommitted tree; recorded as `sourceTreeDirty: true` in the box |
| `--signer-command` | none | Sign through an external command instead of the local key — see [Signing & Key Custody](/v2/guides/signing-and-custody#external-signers) |

Before starting the environment build, Scrollcase checks that signing is ready. If both default
local key files are absent, it fails immediately with `Signing keys not found. Run scrollcase
keygen before building.` The build command never generates identity material itself. An incomplete
pair is never overwritten; an external signer instead requires its trusted public key to be
present.

The progress bar ending in `100% Completed` belongs to `conda-pack`, not to the whole build. After
that handoff Scrollcase reports the remaining long phases while it extracts and relocates the
packed environment, prepares and self-tests the payload, creates and hashes the deterministic
archive, and signs the release and channel documents.

A successful build ends with a compact relative-path summary: you can distribute the two immutable files
under `boxes/<boxId>/<version>/<targetId>/` and the signed pointer at
`channels/<boxId>/<channel>/<targetId>.json`. The individual content-addressed filenames remain
unchanged.

`build` refuses to run when: the workspace is not a git checkout; the tree is dirty and
`--allow-dirty` is absent; `pixi.lock` is missing; the pixi on hand is not the scroll's pinned
version; or the host OS/architecture does not match the target — boxes are proven on the hardware
they ship for. Dirty detection includes untracked files and excludes files ignored by Git.

Outputs, under the workspace's `dist` directory:

| File | What it is |
| --- | --- |
| `boxes/<boxId>/<version>/<targetId>/<archive sha256>.zip` | The box archive |
| `boxes/<boxId>/<version>/<targetId>/<document sha256>.release.json` | The signed release document committing to the archive by size and SHA-256 |
| `channels/<boxId>/<channel>/<targetId>.json` | The signed channel pointer |

`boxes/` is uploaded as it stands — the paths are the keys the signed documents already point to.
`channels/` is separate because a channel outlives any one version. See
[Distributing Boxes](/v2/guides/distributing-boxes).

## `verify`

Run the format checks a consumer can repeat against a signed release document and its archive,
before anything is published.

```sh
scrollcase verify <release.json> [--archive <path>] [--self-test] [--env-report] [--env-report-values]
scrollcase verify <release.json> --extracted <dir> [--env-report] [--env-report-values]
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--archive` | `<archive.sha256>.zip` next to the release document | The archive to check |
| `--self-test` | off | Extract to a temporary directory and import the declared modules with the box's own interpreter. Only runs on a matching native host |
| `--extracted` | off | Verify an existing extracted payload against the signed payload digest. Cannot be combined with `--archive` or `--self-test` |
| `--env-report` | off | Expand the diagnostic from the compact relevant subset to every resolved variable name; inherited host values remain masked |
| `--env-report-values` | off | Expand the report and reveal inherited host values. Use deliberately: logs may contain secrets |
| `--public-key` | `<keys>/signing-public.json` | Trusted key file (a single key, or a `{ "keys": [...] }` bundle) |

Checks, in order: envelope payload hash and at least one trusted signature; release kind; coherent
target and entry point; archive size and SHA-256; safe entry names; recursively equal shared
`box.json` fields (identity/version, full target, entry point, cache subdirectory, declared
environment, consumer self-test, weights/assets, and provenance); and the declared interpreter. `--self-test`
additionally requires a matching native host, extracts to a temporary directory, checks logical
payload size, and runs the signed import check. It does not repeat scroll-only `pythonCode` or file
assertions, which are builder-only checks.

After validating the command arguments, `verify` prints a blank line and `Verifying box` (or
`Verifying extracted payload`) before it starts reading and hashing the supplied bytes, so a long
verification gives immediate terminal feedback.

Every verification result carries a structured environment snapshot in the library. The CLI stays
silent on a plain verification unless a report flag is present; `--self-test` prints the compact
report automatically when the release declares variables, conflicts exist, or inherited variables
such as `PYTHONPATH`, `PYTHONHOME`, `PYTHONSTARTUP`, `PYTHONBREAKPOINT`, `LD_PRELOAD`, or
`DYLD_INSERT_LIBRARIES` can change which code runs. The snapshot is diagnostic output from this
consumer and this process, not evidence signed into the box.

`--extracted` takes the archive path out of this flow and delegates to the Node consumer's payload
verification operation. It verifies the signed release document and the payload list carried by
`<dir>`, then checks every file and symbolic link named by that list. Files added after installation
are ignored. This is an explicit integrity check at one moment; it does not attach or execute the
box, and it does not protect the directory from later changes.
Modes and modification times are outside the commitment. The build collector also excludes
`__pycache__` directories and `*.pyc` files, so this command makes no assertion about compiled
Python caches.

## `run`

Verify and execute one caller-supplied local release through `scrollcase/consumer`:

```sh
scrollcase run <release.json> [--archive <box.zip>] [--env-report] [--env-report-values] -- [application args]
```

The command prints a blank line and `Preparing box for execution` immediately after validating its
arguments, then performs the same signature, schema, archive, safe-entry, manifest-agreement,
installed-size, interpreter, and execution checks as the Node consumer. It extracts into a private
temporary directory and prints the signed box ID, version, target and execution kind after another
blank separator, then attaches terminal stdio and runs the declared script or module with the box's
own Python. Every status write is flushed before the interpreter starts, so it cannot appear after
the box's own output. Signed `defaultArgs` come first; every string after `--` follows unchanged,
without a shell.

The compact environment report appears automatically when it has something relevant to say.
`--env-report` expands it to every variable name and provenance source while keeping inherited host
values masked; `--env-report-values` explicitly reveals those values and implies the full report.
The signed declaration wins over inherited and caller values. Nothing is filtered.

The child exit code becomes the Scrollcase exit code. `SIGINT`, `SIGTERM`, and `SIGHUP` are forwarded
to the child; after the child terminates, the temporary box is removed and the CLI terminates by the
same signal. Temporary cleanup also runs after verification failure, spawn failure, normal exit, and
non-zero exit.

`run` is intentionally local:

- it never selects a channel or downloads an archive;
- `--archive` names bytes already present on disk, defaulting to the content hash beside the release;
- `--public-key` uses the same trusted key file or bundle as `verify`;
- it refuses library-only releases, non-native targets, and missing or mismatched on-demand assets;
- it never installs persistently, updates an existing box, or owns application lifecycle policy.

Because one-shot `run` does not download or provide an asset-materialization step, an on-demand box
with required assets fails clearly. A caller that already owns those bytes uses
`verifyAndExtractBox`, materializes each signed descriptor under the prepared root, and then calls
`runExtractedBox`.

## Tool discovery {#tool-discovery}

Every command that needs `pixi` or `conda-pack` resolves it the same way, highest precedence
first:

1. **The explicit flag** — `--pixi <path>`, `--conda-pack <path>`.
2. **The environment** — `SCROLLCASE_PIXI`, `SCROLLCASE_CONDA_PACK`.
3. **The project's own toolchain** — `<toolchain>/bin/`, if the executable is there. This is where
   `init` installs, which is why nothing has to be added to `PATH` afterwards.
4. **`PATH`** — the bare `pixi` / `conda-pack` name.

`build` and `lock` additionally require pixi to be at the exact version the scroll pins; a
different version is an error rather than a silent substitution.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `SCROLLCASE_PIXI` | Path to the pixi executable, when not on `PATH`. A `--pixi` flag wins over it |
| `SCROLLCASE_CONDA_PACK` | Path to the conda-pack executable. A `--conda-pack` flag wins over it |
