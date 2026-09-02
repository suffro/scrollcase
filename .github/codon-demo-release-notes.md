# Genetic code demo box

A signed `codon-demo`, built by CI from `examples/codon-demo/` in this repository. It is a **`node`
box**: the interpreter inside it is Node 26 from conda-forge, not Python.

What makes it worth downloading is that it carries *data* and answers questions about it. The box
ships the standard genetic code (NCBI translation table 1) and the tool that queries it, so the
recipient needs neither Node, nor npm, nor a database.

| Your machine | Download |
| --- | --- |
| Linux, Intel or AMD | `codon-demo-1.0.0-linux-x86_64-cpu.zip` |
| macOS, Apple silicon | `codon-demo-1.0.0-macos-aarch64-metal.zip` |

Unpacking gives the box under `box/` and this README beside it.

The trust key is deliberately **not** in that archive. A signature only proves where something came
from if the key does not arrive in the same package, so it is fetched from the repository:

```sh
unzip codon-demo-1.0.0-<target>.zip -d codon-demo
cd codon-demo
mkdir keys
curl -o keys/example-signing-public.json \
  https://raw.githubusercontent.com/suffro/scrollcase/main/examples/keys/example-signing-public.json
```

Then:

```sh
npm install -g scrollcase
scrollcase verify box/*.release.json --public-key keys/example-signing-public.json

# What the box carries
scrollcase run box/*.release.json --public-key keys/example-signing-public.json

# Codon to amino acid, forward
scrollcase run box/*.release.json --public-key keys/example-signing-public.json -- ATG

# Amino acid to codons, backwards
scrollcase run box/*.release.json --public-key keys/example-signing-public.json -- Leucine
```

RNA is accepted too, so `UUG` and `TTG` give the same answer. An unknown term exits 1.

On PowerShell that glob is not expanded — use `(Get-ChildItem box\*.release.json).FullName`, or type
the file name you see under `box/`.

`verify` checks the signature, the archive's size and hash, the entry names and the manifest.
Adding `--self-test` extracts the box and runs its declared probes with the Node inside it, and
`run` executes its entry point — both need the machine to match the box's target. `verify` on its
own works anywhere.

The two names under `box/` are SHA-256 digests of their own contents: two builds of the same commit
produce the same names, which is what makes the archive verifiable in the first place. Keep them as
they are and side by side — `verify` finds the box by the hash its release document commits to, and
renaming or separating them breaks that.

Full walkthrough: [the genetic code demo](https://scrollcase.dev/demos/codon-demo).

## About the signing key

This box is signed with a key that exists **only for this demo**. It signs nothing else, no trust
chain depends on it, and it is not the key for any Scrollcase release. Treat a signature from it as
evidence that the example is intact — never as evidence that anything else is.
