---
title: Design decisions
description: Why Scrollcase is shaped the way it is, and which alternatives were rejected.
---

# Design decisions

Each entry records the alternative that was rejected, because a decision without its discarded
alternative is just an assertion.

## Version 2 is a clean break

Scrollcase v2 accepts and emits only `schemaVersion: 2`. Published v1 boxes and immutable package
releases remain usable with the old Scrollcase versions that produced them; the v2 verifier rejects
them with a clear unsupported-version error. It does not reinterpret them.

The declarative source is a **scroll**, stored as `scroll.json` under `scrolls/`. The built artefact
remains a **box**. This vocabulary applies across schemas, identifiers, paths, CLI arguments,
fixtures, types, documentation, and errors.

**Rejected:** a v1/v2 union, compatibility aliases, and dual execution paths. They would make every
security check and every consumer carry two meanings indefinitely, while still being unable to
change the already-published v1 wire format.

## Consumers prepare and run local boxes; they do not distribute them

The v2 consumers operate on release documents, archives, trust keys, and destinations supplied by
the caller. They may verify, safely extract, inspect, and execute a box. Verification is ordered so
no box interpreter, script, module, or import runs before the signature, payload shape, archive
size/hash, safe entries, and shared manifest agreement have succeeded.

The official Node API is `scrollcase/consumer`; the Python package is imported as
`scrollcase_consumer`. `scrollcase run` is a thin CLI wrapper over the Node API. The utilities live
in those consumer SDKs, not as a JavaScript helper copied into every box.

This local execution surface does not choose channels, fetch archives, update installations,
promote, revoke, publish, serve, allocate runners, or decide application lifecycle policy.

**Rejected:** folding registry, download, update, and lifecycle policy into the consumer. Those
responsibilities require project-specific trust and rollout choices and would turn a local,
composable verifier into a distribution system.

## One contract, multiple consumer implementations

`src/contract/` and its schemas remain the single source of truth. Node, Python, and Rust expose the
same verification, extraction, execution, receipt, error, signal, cleanup, and on-demand-asset
semantics. Language-neutral fixtures and expected results prove their parity. The Python package
carries checked generated copies of the canonical schemas, and the crate checked copies of the same
schemas and fixtures; neither hand-maintains a second format.

**Rejected:** independent per-language contracts that merely look similar. Security behavior
drifts at edge cases — links, traversal, collisions, signals, or argument handling — unless every
implementation is held to the same observable cases.

## Persistent installations earn a new receipt; payload verification stays separate

A prepared receipt is process-bound execution authority. Serialising it would let anyone who can
write the receipt file manufacture an object that appears to have passed the trust chain. A process
that starts later therefore calls `attachExtractedBox` / `attach_extracted_box`: it re-verifies the
signed release, requires a target the current host can execute, checks the interpreter and execution
shape, verifies on-demand assets, and binds a fresh receipt to the real directory's device and inode.
The receipt says `attached`, not `prepared`, because no archive established the payload bytes in that
process.

Byte verification is an independent, opt-in operation. New builds write `payload-digest.v1` inside
the payload and add optional `payloadDigest: { format, sha256 }` to the signed release. The list has
one byte-sorted record per original file or link and is excluded from itself; the release signs its
hash. `verifyExtractedPayload` / `verify_extracted_payload` authenticates the bounded list before
parsing it, then visits only the paths it names. The field is additive, so `schemaVersion` stays 2
and older v2 releases remain valid, while the specific payload-verification operation refuses one
that carries no commitment.

**Rejected:** storing the whole per-file table in the release. A conda environment routinely holds
10,000–30,000 files, which would add megabytes to every signed document. One signed digest plus the
list inside the payload keeps the document small without weakening which bytes it commits to.

**Rejected:** a single root hash recomputed by walking the installed directory. Honest installations
grow: Python creates caches, applications write in their working directory, and on-demand assets are
materialised after extraction. If the directory is the input, every legitimate extra file changes
the answer. Walking the signed list makes extras invisible by construction.

**Rejected:** folding byte verification into attachment or execution, or adding a verification flag
to attachment. Embedded weights can make the scan read tens of gigabytes, and a result at attach
time does not guarantee the tree at a later spawn or lazy Python import. Separate operations keep
both cost and meaning explicit: attachment answers whether a directory can mint a receipt now;
payload verification answers whether its listed bytes match now.

**Rejected:** committing file mode or modification time. Archive writing synthesises modes from the
target and path, Windows extraction does not apply `chmod`, and no extractor restores the fixed
build timestamp. Including either would make an honest extraction disagree with its build.

The limit is stated rather than hidden. Payload verification has a check-to-use window and is not a
defence against a live local attacker; operating-system permissions and application ownership guard
the directory. `__pycache__` directories and `*.pyc` files are excluded by the collector and are
therefore a permanent blind spot, not merely part of that timing window. Embedded assets are listed
and expensive to re-read; on-demand assets are ignored extras whose separate signed descriptors are
checked during attachment and execution.

## One substrate: pixi + conda-pack + conda-forge

Scrollcase supports exactly one dependency backend.

A packaging tool's product is its guarantees — this environment installs, relocates, self-tests, and
is reproducible from a lock. Two backends means proving every guarantee twice, on every platform, for
every release. The conda-forge path also solves the problem a wheel-based one cannot: native
libraries. Scientific stacks are mostly compiled code, and conda-forge distributes it as a coherent,
licence-annotated package set rather than as wheels of varying provenance.

**Rejected:** a second backend for projects already on `uv`. Those projects convert their scrolls
once; Scrollcase avoids a permanent double burden.

## conda-pack, and deliberately *not* running conda-unpack

`conda-pack` produces a ready-to-run tree, so a consumer pays no install-time work beyond extraction.
The embedded `conda-unpack` fixer is deliberately **not** run: it would stamp the build machine's
absolute paths into dozens of files that then ship to users — measured on a probe environment, zero
files carried the build prefix before running it and thirty-six after — leaking a developer's
directory layout while still being wrong at the user's install location. Instead the few service
files that do carry the prefix are removed, symlinks are settled against a rule that keeps only the
ones provably resolving inside the payload, and generated console scripts are rewritten to resolve
Python next to themselves.

**Rejected:** `pixi-pack`, which ships packages rather than a tree and needs a per-user install plus a
bundled unpacker at the other end. The slow step (compression) is better paid once by whoever builds
than on every install.

## A payload carries the symlinks it can prove safe

A conda prefix is dense with symbolic links. The shared-library soname convention alone stores every
large library under two or three names — `libfoo.so` → `libfoo.so.N` → `libfoo.so.N.M` — and `bin`
carries interpreter aliases. Scrollcase used to materialise all of them, which was simple and
correct and, once measured, expensive: roughly 60% of an extracted Linux box was duplicates of its
own bytes. The example box weighed 191 MB archived and 483 MB extracted, against 48 MB and 126 MB
for the identical scroll on macOS, where dylibs use far fewer such chains.

A link is now kept when it **provably** resolves, inside the payload, to a regular file: the target
must be relative, must stay inside after `..` is applied segment by segment, and must end at a file
rather than a directory. Everything else is materialised exactly as before. That took the example
box to 90 MB archived and 228 MB extracted.

The narrowness is the point. A symbolic link is the classic way an archive writes outside the
directory it was extracted into, so the rule is purely lexical — the same inputs give the same
answer on every host — and it is applied three times: by the builder against the real filesystem, by
the archive writer against the entry set it is about to write, and again by each consumer against
the archive **as received**. No consumer trusts the builder, and a box assembled by hand gets no
benefit of the doubt.

**Rejected:** carrying directory links too. They are legitimate in a prefix — `lib/python3.1` →
`python3.11` is real — and worth about one duplicated standard library. But a directory link is the
only way an entry can be written *through* a link and land somewhere its own name does not describe,
which turns a size optimisation into a question about what every other entry does to the filesystem.
Refusing them keeps the rule small enough to state in five lines and prove in two languages, and
that was worth more than the last 35 MB.

**Rejected:** a `schemaVersion` bump. The signed document is unchanged; only what the archive may
contain grew. A consumer predating the rule rejects a link entry with a clear error rather than
misreading it, which is the only thing a version bump would have bought.

## The document namespace belongs to the publishing project

Every signed document carries a `kind` like `scrollcase.box.release`. The namespace is configurable
and defaults to `scrollcase.box`.

This exists because a project that already has boxes installed in the field cannot have a tool rename
its documents underneath it — its clients would stop recognising them. Making the namespace the
project's own declaration means byte-compatibility for existing publishers and a tool that carries
nobody's brand.

**Rejected:** hard-coding a single namespace. Byte-compatibility for existing publishers turned out to
cost nothing, and independence from any one consumer is not negotiable.

## Signing is built in; key custody is not

Scrollcase signs with a local ed25519 key out of the box, so anyone gets verifiable boxes without
infrastructure. An operator with real key custody — a KMS, an HSM, a signing service — configures an
external signer command instead: it receives the payload on stdin and returns the signed document on
stdout. Any language, any credential mechanism, no plugin API to keep compatible.

An external signer is not trusted on its word. The returned document must echo back the exact payload
it was given, and its signature is verified locally before the build continues. A signer that
substitutes a payload fails the build instead of producing a box nobody can install.

**Rejected:** a provider-specific integration. Cloud-specific authentication in a packaging tool ages
badly and excludes everyone using something else.

## Verification is not optional

`verify` checks signature, archive size and hash, safe entry names, recursive agreement of every
shared schema-v2 field, the declared interpreter, and optional execution prerequisites. Execution is
a closed script/module union rather than a shell command. The builder and verifier inspect regular
payload/archive files to prove a script or runnable module exists; module discovery never imports
the application. With `--self-test` verification extracts temporarily and runs the signed import
subset. Scroll-only Python and file assertions remain builder checks because they are not part of
the signed release.

**Rejected:** accepting a shell command or proving a module by importing it. A shell changes
argument meaning and creates an injection surface; importing application code turns validation into
execution before the trust chain has finished.

## Weights: embedded by default, on demand when asked

`embed` packs assets into the archive: the box installs with no network and works air-gapped, at the
cost of a large artefact. `on-demand` leaves them out and carries their url, path, size and SHA-256 in
the signed release and in `box.json`. Retrieval belongs to the caller's distribution layer; the
local consumers verify caller-materialized files before execution and never download them.

The declared hash is what makes deferring safe: the release commits to exactly which bytes the box
expects, whatever host serves them.

**Rejected:** making on-demand the default. Air-gapped installation is a property worth keeping
unless a project explicitly trades it away, and it is the behaviour that surprises nobody.

## Accelerator parity is a packaging concern

A scroll may declare a `parity` block: a check script inside the box, the accelerators to run it
under, and tolerances (`absolute`, `relative`, `minimumCosine`). Scrollcase runs the check once per
accelerator using each target's validation environment, compares every run against the first, and
fails the build on a breach.

The question — *does this box compute the same thing on the GPU as on the CPU?* — sounds scientific
but is not. It catches the failures a packaging tool is responsible for: the wrong wheels solved in, a
CPU-only build shipped as CUDA, a broken BLAS.

The division of labour is deliberate. Scrollcase owns the mechanism and enforces the declared
threshold; the project owns the check script, the fixture, and what closeness means for its model.
Non-finite output is rejected explicitly, being the classic symptom of a broken accelerator build, and
relative error is only counted where the reference has magnitude — the absolute bound guards entries
near zero, where relative error is meaningless.

**Rejected:** hard-coding tolerances inside Scrollcase. What counts as close enough is a property of
the model, not of the packaging step, so it is declared per scroll rather than assumed.

## The toolchain is installed on request, and pinned once installed

`init` can install `pixi` and `conda-pack`, but only after asking, and only into the project's own
toolchain directory. Nothing is added to `PATH`, nothing is installed system-wide, and deleting the
directory undoes it. Without a terminal to answer the question — CI, a pipe — nothing is installed
at all: silence is not consent.

The download is verified before use. The release archive's SHA-256 is checked against the checksum
the publisher ships beside it, and the verified digest is then recorded in the project's config, so
every later install is checked against a value the project committed rather than against whatever
the server offers that day. A mismatch aborts before anything is installed. The conda-pack
dependency is installed as the exact `conda-pack==0.9.2` match specification and that version is
recorded beside the pixi pin; floating it would let the same Scrollcase release produce different
payload bytes over time.

**Rejected:** installing silently, and the `curl | sh` convention it would imitate. A packaging tool
whose whole product is verified artefacts cannot begin by running unverified bytes it fetched
without being asked.

## Paths come from the project, not from Scrollcase

A workspace is declared by a `scrollcase.config.json` at the project root, discovered by walking up
from the working directory, with per-invocation flag overrides. Defaults are `scrolls/` and
`.scrollcase/{build,dist,keys}`.

A tool that derives its paths from its own location on disk only works while it lives inside the
project it serves. Making the layout the project's declaration is what lets Scrollcase run from
anywhere against any project that declares one.

## Workspace setup keeps real authoring separate from the disposable example

`scrollcase init` creates project structure and, by default, one clearly named `example-box` for the
native host. The example is a complete runnable v2 scroll produced through the same validated
authoring path as any other scroll. It prefers Metal on Apple Silicon and CPU elsewhere, never
guesses a CUDA ABI, never overwrites an existing example, and can be omitted with `--no-example`.
Its application starter lives at
`box-entrypoints/<boxId>/<targetId>/entrypoint.py`: executable input is grouped by the same box and
target it belongs to, without adding a redundant tool-named directory.
Three adjacent, non-overwriting consumer examples show the other side of the boundary:
`scrollcase/consumer` from TypeScript, `scrollcase_consumer` from Python, and
`scrollcase-consumer` from Rust. They accept local release and trust inputs; they do not add
download or distribution behavior. They live under `consumer-templates/`, with Rust in its own
small Cargo crate, while a short non-overwriting `SCROLLCASE.md` keeps the basic workflow and links
to the canonical documentation visible in the project.

`scrollcase new scroll` remains the only command that authors real project identity, target,
versions, compatibility, weights, and execution intent. A non-terminal authoring call must provide
every value that has no default and fails before writing when one is missing; an interactive
terminal uses the same finite-choice menus as the rest of the CLI.

**Rejected:** either treating setup metadata as the project's real scroll or leaving a newcomer with
only an empty directory. The fixed example is explicitly disposable onboarding material; real
inputs are created independently rather than edited from guessed product metadata.

## A scroll declares decisions, not restatements

A scroll is a file a person writes and maintains by hand, and several of its fields were only ever
restating something the file already said. `pythonEntryPoint` is the clearest case: a target admits
exactly one interpreter path and the reader rejected every other value, so requiring the field
obliged the author to type the one string that was already implied — and to type it again for every
target of the same box. `scrollVersion`, `compatibility`, `modelCacheSubdir`, `assets` and
`selfTest.files` were the same kind of obligation in weaker form.

Those fields are now optional and derived when the scroll is read. Derivation happens in one place,
so everything downstream — including the provenance record — still sees a complete object, and a
scroll that spells a derived field out produces an identical result. A declared `pythonEntryPoint`
that disagrees with its target is still refused.

**Rejected:** a `??` fallback at each point of use. That spreads the meaning of an absent field
across the builder, where two of them eventually disagree and the disagreement is invisible.

**Rejected also:** deriving `condaDependencyLicenseAudit` from a file sitting next to the scroll.
That field carries enforcement — declaring it means the build fails when the lock no longer matches
what was reviewed — and a guarantee that switches itself on because of a file's presence is a
guarantee nobody decided to make. It stays explicit; it costs one line.

### The hash on a local file is a pin, not a checksum

`assets` arrive over a network nobody controls, so their size and hash are mandatory: that check is
the only thing standing between a replaced upstream file and a silently different box.
`localFiles` come out of the project's own checkout, where git already records what changed, and
what ships is hashed into the signed release regardless. Requiring a hash there bought little and
cost a great deal: every edit to a generated entry point failed the next build until its digest was
recomputed by hand, which taught authors to distrust the check rather than rely on it.

`sha256` on a local file is therefore optional, and means *pin this*. A project pins what must not
change without review — a licence notice, a reviewed shim — and leaves the pin off what it is still
writing. A pinned file that drifts still fails the build.

### A self-test belongs in a file

`selfTest.pythonCode` puts Python inside a JSON string, with escaped newlines and no syntax
highlighting, no linter and no readable diff. It suits a single assertion and nothing more.
`selfTest.pythonFile` names a file in the project instead; it is read at build time and executed
from the payload root, so it can read what the box ships and import what it packs. The two are
mutually exclusive, and `new scroll` generates the file rather than leaving the field empty.

### One box's targets share a scroll

Three targets of one box agreed about ninety-odd lines and differed in four. Every change had to be
made three times, correctly, and a divergence nobody intended stayed invisible until a user hit it.

A scroll may now be split: `scrolls/<boxId>/scroll.json` holds what the targets share, and each
`scrolls/<boxId>/<targetId>/scroll.json` declares `extends` plus its own differences. The two halves
are joined before anything else happens, and that joined result — the effective scroll — is what the
schema validates, what the build reads, and what provenance records.

**Rejected:** a free path for `extends`. A path parameter invites traversal screening, chains of
bases, and a scroll that reaches outside its workspace. The value is fixed at `"../scroll.json"`, so
the base is always the box directory's own file: nothing to get wrong, and one level rather than a
hierarchy.

**Rejected also:** generating the target files from one command and leaving them independent
afterwards. That solves writing them once and nothing else; the duplication returns at the first
edit, which is where it actually hurts.

#### The join rule is per field

A single blanket rule is wrong in both directions. Replacing everything makes a fragment that adds
one asset lose the shared ones. Merging everything leaves `execution` half from each half — a
`python-script` carrying a `module` inherited from the base, an object no author wrote.

So: scalars and the cohesive objects (`target`, `execution`, `parity`) are replaced. Payload entry
lists and string lists are joined base-first. `compatibility` and `environment` are joined key by
key, because both hold independent entries that a base and a target legitimately contribute to — a
shared floor plus a macOS-only one, shared variables plus a CUDA-only one. The extra self-test Python
is one slot with two spellings, so a fragment naming either replaces both.

The two list rules differ deliberately. A prune path or an import repeated by both halves is the same
instruction twice, so the repeat is dropped. A `relativePath` claimed by both is two different
sources for one file in the box — the second would silently overwrite the first — so it is an error.
**Rejected:** resolving that conflict by precedence. A rule saying which source wins is a rule
nobody remembers at the moment it matters, and the loser vanishes without a word.

Order is declaration order, base first, and nothing is sorted. Determinism asks that one pair of
files always produce one result, which declaration order already gives. The visible consequence is
stated rather than hidden: a split scroll and a hand-written whole one hold the same entries, while a
joined map may serialise its keys in a different order. **Rejected:** sorting the joined keys, which
would change the bytes of every box whose map was not already alphabetical, to fix nothing.

### The values nobody can type are not typed

An asset's `sizeBytes` and `sha256` cannot be known without fetching the file, so writing a scroll by
hand meant downloading it, hashing it and pasting two values per asset — for every target. `add
asset` fetches once and records what it found. This does not weaken the check it feeds: the
guarantee has always been that those values are pinned once and verified on every build, and that is
unchanged. What changes is who does the transcription.

`add file`, `add dep`, `remove` and `edit scroll` follow from the same idea. **Rejected:** commands
that only add. A tool where arriving is a command and leaving is a hand edit has not removed the
hand edit, it has moved it.

Every edit is atomic and then verified against the whole box, not just the file it touched: a base
and its fragments only mean something together, so an entry added to the base can collide with one a
fragment already declares. If the result would not load, the originals go back. **Rejected:** writing
first and reporting afterwards, which turns one bad command into a box nobody can build until
someone works out what changed.

### `refresh` maintains pins; it does not launder them

A `localFiles` pin says "this must not change without review". After a reviewed change the digest has
to move, and doing that by hand is the toil the pin never meant to impose — so `refresh` recomputes
it.

A remote asset's hash is a different thing: it is what stands between a replaced upstream file and a
silently different box. **Rejected:** refreshing those the same way. If `refresh` re-fetched and
rewrote them, every substitution upstream would be adopted without a word and the next build would go
green — the protection removed by the command meant to maintain it. So the network is untouched
unless asked, a difference is reported and refused, and accepting it takes a separate, explicit
`--repin`.

### A dependency is added to the manifest; the lock still pins it

`add dep` writes `name = "*"` and lets `pixi.lock` — committed and reviewed — record the version
actually solved. **Rejected:** looking up the newest version and writing it into the manifest. That
puts a second, weaker pin beside the real one and leaves the two to drift, and it makes the same
command produce different manifests on different days.

Importing a `requirements.txt` translates PyPI names to conda-forge where the tool is sure and
lowercases otherwise, and reports every rename and every skip. **Rejected:** a large mapping table
applied silently. A name guessed wrongly gives a lock that resolves and a box that cannot import what
it was built for — a failure that arrives long after the command that caused it.

### Two committed Python versions instead of a lookup

`new scroll` defaults to one minor behind the newest Python conda-forge publishes, and
`--python-version latest` resolves to the newest itself. Both are constants in the repository, moved
deliberately at release time by `npm run python:bump`.

**Rejected:** resolving the newest Python on each invocation. That would make the same command
produce different scrolls in different months, which is precisely the variability a scroll exists to
eliminate. `latest` resolves once, at authoring time, and the resolved number — never the word — is
what the file records.

**Rejected also:** defaulting to the newest release. conda-forge builds the heavy compiled packages
for a new minor months after the interpreter lands, so that default hands a first-time user a solve
that cannot succeed, with an error that says nothing about why.

## Scrolls are grouped by box, then target

The default layout is `scrolls/<boxId>/<targetId>/`. Both directory names are checked against the
meaningful fields in `scroll.json`: `boxId` and the canonical ID computed from `target`. This makes
all target variants of one box visible together without making a directory name the source of the
box's identity.

`scrollId` is optional input. Release schema version 2 requires a provenance `scrollId`, so a scroll
that omits it derives the value deterministically as `<boxId>-<targetId>`. Source directories are
always nested; the flat v1 layout is deliberately not a compatibility path.

At the CLI edge, a box name expands to its target scrolls and a terminal presents them as a
navigable menu. One target matching the current host may be the default; on macOS, Metal is the
explicit preference when CPU and Metal both match. A non-interactive process uses that same policy
and fails on any remaining ambiguity instead of silently choosing CPU or CUDA.

For the mutating `lock` and expensive `build` commands, omitting the scroll entirely opens a
workspace-wide menu of complete references. This is interactive convenience, not a default:
non-interactive callers must name the scroll, and even a single discovered candidate still requires
terminal confirmation rather than being selected silently.

**Rejected:** requiring `scrollId` to repeat the directory name. That check made the filesystem a
second identity layer and encouraged product-plus-machine directory names even though the scroll
already declares both facts.

## The environment is declared; inheritance is reported, not policed

A scroll may declare the string map its interpreter requires. The builder copies it into
`box.json` and the signed release, applies it to its own self-test and parity gate, and consumers
apply it over inherited host and caller values. Target validation controls remain last for the
accelerator checks. A wrong declared path therefore fails during the build instead of first failing
on a user's machine.

The inherited environment is intentionally not filtered. Scrollcase is responsible for integrity,
verifiable declarations, and truthful diagnostics; it is not a sandbox for the developer or the
application launching a box. Consumers instead return a masked provenance report, and the CLI can
expand it with `--env-report`. Revealing inherited values requires the separate, deliberate
`--env-report-values` flag because a generic verbosity switch is routinely enabled in public CI
logs.

The boundary is permanent: the declaration is part of the format and can be verified by any
implementation. The report is output from a particular consumer process and must never be
documented as a guarantee of the box. Starting the packed interpreter directly bypasses the report,
just as it bypasses every other consumer check.

**Rejected:** a default-deny environment with a hand-maintained minimal base per platform. It would
silently make the tool a sandbox policy, and a mistaken Windows base could prevent the packed
interpreter from starting at all.

## Provenance refuses to lie

A box records the commit it was built from and whether that working tree was dirty, including
untracked files while respecting Git ignore rules. Building outside a git checkout fails rather
than inventing a revision, and building from a dirty tree requires
`--allow-dirty` and is recorded as `sourceTreeDirty: true` in the box itself. A build that cannot be
reproduced from its recorded revision says so.

Rebuilding the same commit produces a byte-identical archive: timestamps are normalised, the build
time comes from the commit rather than the clock, and the channel cohort salt is derived from box
and version rather than randomly.

## Documentation audit decisions (2026-07-26)

The public-contract audit resolved six implementation choices:

- The maintainer chose to preserve the existing privacy banner and analytics behavior. The linked
  `/privacy` route documents that behavior; consent controls were not added.
- Public schema URLs are deterministic copies of `src/contract/schema/`, guarded byte for byte.
- Verification compares all security-, identity-, target-, asset-policy-, self-test-, and
  provenance fields duplicated by schema version 2.
- Consumer self-test is documented as the signed import subset; scroll `pythonCode` and file
  assertions stay builder-only until a future wire version can carry them.
- Scroll structure is validated at runtime from the shipped schemas by a dependency-free internal
  validator before tool discovery or build-directory mutation.
- Asset resume is limited to retries within one download operation. There is no persistent cache
  and the documentation makes that process boundary explicit.

## The licence audit is derived from the lock

The inventory is a pure function of the committed `pixi.lock`, which carries an SPDX licence per
package, and `pixi install --frozen` guarantees the installed set equals it. So `audit` runs without
building anything, and licence review can happen when dependencies change rather than at the end of a
multi-gigabyte build. A package with no declared licence fails the parse outright: an unlicensed
dependency is a legal problem, not a reporting gap.

## Deliberately out of scope

Publishing to object storage, downloading boxes, selecting or promoting a channel, updating an
installation, revoking a release, serving a registry, allocating CI runners, application lifecycle
policy, and model-specific scientific validation all belong to the consuming project. Scrollcase
stops at building a signed box or preparing and running caller-supplied local box inputs.

The boundary is what keeps the guarantees provable. A packaging tool that also serves a registry has
to keep proving both sets of guarantees at once; one that stays local composes with any distribution
mechanism a project already has.
