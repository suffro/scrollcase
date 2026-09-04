# Mistakes, and what each one taught

> **Historical, and still live.** Carried out of the retired local memory directory on 2026-09-04.
> Every trap below is still open; each is recorded because it was caught late, or twice.

## In the code

**A clean grep only describes the tree at the moment it ran.** Consumer references were removed
once, verified by grep, and came back *twice* inside files moved later — worst of all as the default
workspace paths, which were literally that project's directory names. Re-grep after every move.

**An inventory derived from imports is not an inventory of what belongs.** The extraction plan would
have dragged roughly 2,000 lines of the consumer's CI into the tool because things imported it.
Reading what those modules *do* is what caught it.

**A module that loads is not a module that works.** Trimming `licenses.mjs` dropped a constant its
parser used. Every `audit` threw `ReferenceError` while the suite stayed green, because no test
called that function end to end. Exercise the real path.

**A test fake that guesses a flag writes to the wrong place.** The conda-pack stub read `--output`
where the real invocation uses `-o`, so it wrote its tarball to argument zero — creating a file
literally named `-p` in the repository root.

**A guard that has never been seen red is not yet a guard.** The CI determinism step asserted
determinism by *counting* archives after a rebuild; a build clears its own object directory first,
so the count is always one and the check could never fail. It now compares the archive's name.
Separately, a case proven red on macOS alone asserted POSIX modes on every platform and broke on
Windows the first time CI saw it.

**`git checkout -- <file>` destroyed uncommitted work twice**, both times while reverting a
deliberately broken guard, and both times the file also held an hour of unrelated edits. Revert the
specific edit, or commit before breaking anything.

## In the environment

**`which` is not a search. Made three times: 2026-07-25, 2026-07-31, 2026-08-28.** Each time an
agent reported pixi or conda-pack missing and declared a real build impossible, having consulted
only `which`. They were installed the whole time, one of them under a dedicated `PIXI_HOME`
deliberately kept off `PATH`. By the third occurrence the answer was written down in *two* places,
one of which named the directory outright, and neither was read until the maintainer said so. This
is the single most repeated failure on the project.

**Estimating cost instead of measuring it.** In the same breath, a real build was described as
"gigabytes and minutes". `hello-box` builds in about **fifteen seconds**; only the model demos are
large.

**A missing artefact is not proof that nothing was submitted.** A missing conda-forge feedstock was
read as "never submitted" rather than checked; the pull request had been open for weeks and later
merged. Check the state of the thing before acting on its absence.

**The generalisation, which is the point of this file:** never report something missing, or an
expensive operation blocked, without first looking for it.

## In the boxes themselves

Both of these were invisible to the unit suite and surfaced the first time a box was actually built.

**conda-forge's `ncurses` cannot ship inside a `native` box.** Its `libncurses.6.dylib` re-exports
`libtinfo.6.dylib` through an unrewritten conda-*build* placeholder path. Scrollcase deliberately
does not repair a binary's library paths, so anything pulling `ncurses` in — `sqlite`'s CLI, most
console-UI programs — fails a native box's self-test. The example runs `zstd` instead. The failure
is loud and happens before signing, which is the arrangement working.

**Node reads the nearest `package.json` *above* the file it runs.** A box without one asks whichever
directory it was extracted into: the node example failed its self-test against *this repository's*
`"type": "module"`. The node runtime now writes the box its own (`src/runtimes/node/payload.mjs`)
unless the payload already carries one. Anything else that resolves by walking up from a file has
the same shape of bug.
