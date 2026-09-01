---
title: v2 Documentation [deprecated]
description: The documentation for box format schema version 2, kept as it was published.
---

# Scrollcase v2

This is the documentation for **box format schema version 2**, kept exactly as it was published.
Nothing here is maintained. It describes a format the current release refuses to read: Scrollcase v3
rejects a v1 or v2 signed document by name rather than reinterpreting it, and tells the reader which
rebuild it needs.

Read it for one reason only — you are holding a box that was built with Scrollcase v2 and you need
to know what its documents meant. For anything you are building now, go to
[the current documentation](/).

Two things behave differently here from the rest of the site. These pages are outside the sitemap,
`llms.txt` and `llms-full.txt`, so a search engine or a model is not handed a superseded format as if
it were current. And the JSON Schemas they reference stay served at `/schema/v2/`, unchanged, because
a v2 box's documents name those URLs in their own `$schema` fields.

## Sections

- [Getting Started](/v2/getting-started/) — what Scrollcase v2 was, and how a box was built
- [Guides](/v2/guides/) — model weights, CUDA, parity, signing, air-gapped installs, distribution
- [Reference](/v2/reference/) — the CLI, the scroll, the box format, the schemas, the library APIs
- [Concepts](/v2/concepts/) — architecture, the security model, and the decisions behind both
- [White Paper](/v2/white-paper) — the v2 codebase and format, module by module
