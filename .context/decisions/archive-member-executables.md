# Executable archive members are declared beside the extraction

**Decided 2026-11-04, for the next npm minor release after 1.4.0.**

`assetArchives[].executables` lists paths relative to that entry's destination after stripping.
An absent or empty list declares none. Each must be a distinct regular member of that archive,
reached without a link and still present after pruning and compressed-source removal. Diagnostics
name the field and offending path. Paths follow the forward-slash payload convention and additionally
reject dot segments and colons so alias spellings and Windows stream names cannot hide duplicates.
Repeated resulting payload paths across entries are refused, including after base/target joining.

The validated paths join the existing executable asset/local-file rule. Modes remain synthesized:
0755 on POSIX, 0644 for every Windows file entry, with identical declaration validation on Windows.
This also admits an archive member as a native execution binary.

**Rejected:** a top-level executable-path list, which disconnects origin validation from the
extraction that must supply the file. **Rejected:** inheriting upstream permission bits, which
would let extraction and host modes decide a reproducibility promise.

**Compatibility:** schema version 3 stays unchanged. Only optional build input grows; the signed
release, box manifest, digest, kind strings, signature and frozen golden documents do not change.
Older builders reject a scroll using the field through the archive item's closed properties.
Older consumers already understand the resulting ZIP modes. This is an npm minor, not a wire break.

Authoring commands preserve whole nested objects. There is no archive-specific `add` command;
`edit scroll` intentionally excludes collections, `new scroll` creates no archive entries, and
`refresh` changes pins only. Edit the archive JSON directly. Base/target merging joins entries
whole, so declarations travel with their entry and need no separate merge rule.
