# The demo boxes are built and signed by CI, not locally

**Decided when the first demo box was published, and reaffirmed for every demo since.**

`example-build.yml` builds the demo boxes for macOS, Linux and Windows, verifies each with
`--self-test`, *runs* it, and signs it with a private key held in a GitHub secret. A local machine
can only prove the pipeline with a throwaway key.

**Why.** Two of the three targets do not exist on the maintainer's machine, and a demo box is a
published artefact people verify against a public key — so the key that signs it belongs where the
publishing happens, not in a working tree. Keeping the demo key in a secret also means no session,
human or agent, can accidentally sign something that looks official.

**What follows from it.**

- **A demo box cannot be rebuilt as part of local work.** When a change requires new demo boxes, the
  step is CI's, and it is the maintainer who triggers it.
- **A rebuild re-verifies the upstream asset pins**, which is a reason to batch demo rebuilds at the
  end of a piece of work rather than repeat them mid-flight.
- **The box is run, not merely verified, before release.** A box that starts but answers wrongly
  does not reach a release: the codon box is asked a real question, the transcode box encodes a
  synthesised pattern, the dataset box reads the data it ships.

**Rejected:** committing a demo signing key, and signing demo boxes with the same key as anything
else. Both make an inconvenient check into no check at all.
