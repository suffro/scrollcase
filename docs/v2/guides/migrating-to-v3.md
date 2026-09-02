---
title: Migrating from v2 to v3
description: Every version 2 field, flag and document field, and what it becomes in version 3.
---

# Migrating from v2 to v3

Version 3 is a clean break, and the only one planned. There is no dual-read path and no migration
tool: **a box is rebuilt from its scroll**. Migrating therefore means editing one `scroll.json` per
box, running `scrollcase build` again, and publishing the result — the work is in the scroll, and
this page is the whole of it.

:::info <big> Checkout the migration guide: </big>

> <Button href="/guides/migrating-from-v2" external> Migrating to v3 </Button>
> <small> *This will open a **v3** documentation page* </small>

:::
