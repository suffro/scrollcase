# Visibility goes through registries, GitHub and one-off posts — not social accounts

**Decided 2026-08-16, and deliberately.** Scrollcase has no social media accounts of its own and is
not to be given any.

**Why.** An account is a standing commitment to feed it, and an abandoned project account reads
worse than none. The audience for a packaging tool is reachable where they already look: the
registries (npm, PyPI, crates.io, conda-forge), the GitHub repository and its releases, the
documentation site, and occasional posts made by the maintainer **in his own voice, disclosing
authorship up front**.

**What was checked, and holds.** Awesome-lists were assessed by merge activity rather than star
count, because most are abandoned and a pull request to one is wasted effort:

- `kelvins/awesome-mlops` — alive, no star minimum. Submitted 2026-08-16 as PR #244. Its
  `check_order.py` validates alphabetical order; run it before pushing.
- `EthicalML/awesome-production-machine-learning` — alive, merges tool PRs weekly, **requires 500
  GitHub stars**. The highest-value listing available; revisit when the repository crosses that.
- `visenger/awesome-mlops`, `nschloe/awesome-scientific-computing` — dead, and the second is
  off-topic regardless.
- `vinta/awesome-python` — alive but a hard shortlist: admission past its per-use-case cap means
  naming the entry you displace.

**The related standing rule:** publishing and anything touching the domain are the maintainer's
calls, never an agent's. See
[`releases-publish-from-a-tag.md`](releases-publish-from-a-tag.md).
