# Executables the solved environment installs are declared in `executablePaths`

**Decided 2026-11-04, for the same npm minor release as archive-member executables.**

The runtime rule marks only the interpreter and the scripts directory. A package that keeps a
helper binary in its own directory inside the prefix — a compiler Triton launches, a server
PyTorch spawns — has always shipped as 0644, and once the self-test ran with archive modes it
failed at build time with nothing an author could declare. `executablePaths` closes that gap.

It is a top-level list of literal payload paths under the runtime's environment root (`venv/` for
every runtime). The reader refuses a path outside that root, a path an asset or local file brings
in, and a path under any `assetArchives` destination, so each executable keeps one declaration on
the entry that supplies it. Spelling follows `assetArchives[].executables`: forward slashes, no dot
segments, colons or trailing slash, distinct within a whole scroll; base/target joining appends
base-first and drops repeats, like `prunePaths`. After unpacking and pruning, the build requires
each path to be a regular file reached without a link, then joins it to the same mode rule as every
other declaration. Windows validates identically and keeps extension-based executability.

Packing materialises directory links in the prefix, so a path that went through one on the build
machine is a real path in the payload; a file link inside the prefix stays a link on POSIX targets
and is refused there, while Windows receives the file.

**Rejected:** globs, which would make the declaration describe whatever the solve happened to
produce rather than what the author reviewed; a literal path that moves with a new `python3.x`
directory fails the build by name instead. **Rejected:** widening the runtime rule to a package
directory, which would mark data files executable. **Rejected:** accepting any payload path, which
would give archive members and assets a second, competing declaration — the reason
[`archive-member-executables.md`](archive-member-executables.md) rejected a top-level list.

**Compatibility:** optional build input in schema version 3, like `assetArchives[].executables`.
Signed documents, the box manifest, the payload digest and ZIP interpretation do not change;
older builders reject the unknown top-level property; consumers need no upgrade.
