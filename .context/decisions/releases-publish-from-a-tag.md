# All three registries publish from a pushed tag

**Decided 2026-09-02, in the same window as the 1.0.0 release.**

`v<version>` releases to npm, `python-v<version>` to PyPI, and `rust-v<version>` to crates.io. No
registry is published from a workstation any more.

**Why.** A publish from a laptop is a publish nobody can reconstruct: it carries whatever was in
that working tree, signed in by whichever credentials were on that machine. A tag is a reviewable
object, and the workflow that reads it builds from a clean checkout.

**The consequence, which is the dangerous half.** The command that publishes is now `git push`, not
`npm publish`. `git push --follow-tags` carries annotated tags along with a branch and can start a
release without the word "publish" appearing anywhere. So:

- Check what is about to travel — `git push --dry-run --follow-tags origin main` — before pushing.
- **Never push a release tag on your own initiative**, including an old one being backfilled as a
  record. Publishing is public and irreversible: a published version is never replaced, only yanked,
  and a yanked one stays downloadable. It is the maintainer's call, never an agent's.

**Known loose end.** `scrollcase-consumer` 0.4.0 is on crates.io with no `rust-v0.4.0` tag behind
it — it went out as the flow was changing. Backfilling that tag is itself a push that a workflow
watches, so it is a decision, not housekeeping.
