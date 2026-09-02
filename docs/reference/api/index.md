---
title: Scrollcase APIs
description: The Node, Python, and Rust surfaces for contracts, build primitives, signing and running boxes..
---

# Scrollcase APIs

The CLI is the supported way to run the build pipeline, but Scrollcase also provides Node, Python, and Rust surfaces for contracts, local consumers, build primitives, and signing.

::: info The pipeline verbs are CLI-only
`build`, `verify`, `audit`, `lock`, `init`, `new scroll`, and `doctor` are not part of the exported surface.
They orchestrate a process — spawning pixi, writing a workspace, exiting non-zero — and are
driven through `scrollcase <verb>`. What is exported is what a *consumer* of boxes needs.
:::

## The local consumers

Three implementations of one contract for Node, Python, and Rust. They have the same verification, extraction, execution,
receipt and error semantics, and are held to it by shared conformance fixtures — so the choice is
which language your application is written in, not which behaviour you get.

## Stability

The exported surface follows the package version, and each consumer distribution — the npm package,
the PyPI package, the crate — carries its own. The active v3 **format** — target IDs, document
kinds, payload encoding, and signature algorithm — changes only through an explicit new schema
version. The v3 API rejects v1 and v2 by name, each with its own remedy, rather than widening its
types or runtime paths into a compatibility union.

## APIs

<div style="display: flex; justify-content: start; gap: 15px;">

<Button
  href="/reference/api/node"
>

Node API

</Button>

<Button
  href="/reference/api/python"
>

Python consumer

</Button>


<Button
  href="/reference/api/rust"
>

Rust consumer

</Button>

</div>
