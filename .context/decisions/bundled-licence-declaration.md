# Bundled licences: one field added inside version 3, not deferred to a v4

**Decided by the maintainer during phase C of the version 3 work, while the branch was still
unpushed.** His words: *"Campo adesso, voglio che sia nella v3."*

`bundledLicenseDeclaration` on the scroll points at a reviewed JSON array; the build validates it
against the release schema's own `$defs/bundledLicenses`, checks that every `linkedInto` path is a
file the box actually carries, signs it into the release and `box.json`, and writes it to
`THIRD_PARTY_NOTICES/bundled-dependencies.json`. It appears in the release as `bundledLicenses`.

**Why.** The licence audit is derived from `pixi.lock`, which sees every package in the solve and
nothing that was linked *inside* a binary the scroll supplies. A `native` box can therefore ship a
statically linked dependency that no lock file mentions — precisely the case version 3 made possible
by adding the `native` runtime.

**Why then.** Adding a field to the wire after the branch was pushed would have cost a second
break; adding it before cost nothing. The phase plan had said "no schema change", so this was raised
rather than assumed.

**Rejected:** deriving the list, or trusting it unchecked. It is a *declaration*, reviewed by a
human, and the build still verifies that every path it names exists in the payload — hard rule 7,
verify never trust.
