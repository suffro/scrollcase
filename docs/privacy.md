---
title: Privacy
description: Privacy information for the Scrollcase documentation site.
---

# Privacy

This page describes the data handling of the public documentation site at
`scrollcase.dev`. It does not describe boxes built with Scrollcase or the policies of projects that
distribute them.

## Analytics and cookies

The site sets no cookies and loads no third-party scripts, with one exception named below. There is
no analytics tag, no sharing widget, and nothing that identifies a reader across pages or across
visits. This is why the documentation asks for no consent: there is nothing to consent to.

Earlier versions of this site loaded Google Analytics and a third-party sharing widget behind a
notice that described them as essential cookies. Both have been removed.

The home page does carry one `<script>` tag, and it is worth naming rather than leaving for a
reader to find in the source: an `application/ld+json` block describing what this project is, for
search engines. It is data, not code — nothing executes it, it loads nothing and it observes
nothing.

## The donate page

The exception is [`/donate`](/donate), which embeds a Ko-fi payment widget in an `<iframe>`. It is
the one place on this site where code from another party runs, it runs only on that page, and it
loads only when a reader deliberately opens it. Ko-fi serves that frame, may set its own cookies
inside it, and handles anything entered there — including any payment detail — under
[its own privacy policy](https://more.ko-fi.com/privacy). None of it reaches this site, and this
site passes nothing to it. Every other page still loads nothing from anyone.

## Hosting and request logs

The documentation is hosted on Cloudflare. Like any web host, Cloudflare processes the request
metadata needed to deliver and protect the site — including the requesting IP address — under its
own terms. See the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).

If aggregate traffic measurement is added later it will be a cookieless, edge-side count that
identifies no individual reader, and this page will say so before it ships.

## Contact and changes

Questions or correction requests can be filed in the
[Scrollcase issue tracker](https://github.com/suffro/scrollcase/issues). Material changes to this
notice will be recorded in the project changelog.
