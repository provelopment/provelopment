# Pages — JSON (the advanced, developer authoring mode)

This directory is the **advanced** authoring mode: a page written as structured,
**schema-validated data** instead of prose, for a page that needs presentation
ordinary Markdown cannot express. Foundation ships exactly two page-authoring
modes, and this is the second of them. It lives in the human-facing content area —
see [`../../README.md`](../../README.md) for the map, and
[`../markdown/README.md`](../markdown/README.md) for the mode almost everyone should
use instead.

| | Safe Markdown (`../markdown/`) | Declarative JSON (this directory) |
| --- | --- | --- |
| **For** | an ordinary, non-technical author | an advanced author / developer |
| **Written as** | ordinary Markdown text | validated JSON data |
| **Gives you** | ease and safety, deliberately limited | a broad, declarative vocabulary of platform-supported page components |
| **Never** | executable behaviour | executable behaviour |

A JSON page is **data, never code**: no scripts, no expressions, no imports, no
author-supplied component names. Its power comes from a validated vocabulary of
components the platform supports, and a page that names something the platform does
not support fails loudly instead of being guessed at.

## Where a page goes

```text
content/pages/json/<language>/<page-name>.json
```

For example:

```text
content/pages/json/en/services.json                →   /en/services
content/pages/json/en/services/web-design.json     →   /en/services/web-design
```

A JSON page's address comes from its folders exactly as a Markdown page's does, and a
second language mirrors the same structure (`content/pages/json/de/services.json` →
`/de/services`).

The same rules as the Markdown mode apply:

- `<language>` is one of the site's configured languages;
- `<page-name>` becomes the last part of the URL (lowercase words joined by hyphens),
  and folders are allowed up to four deep;
- **this README is never a page** — neither is any other README, at any level; only
  files with a well-formed page name are pages;
- an **empty language directory publishes nothing**; creating
  `content/pages/json/de/` prepares a language and creates no route;
- a JSON page **takes precedence** over a Markdown page for the same language and
  route, because it is the more capable declaration — and that applies to a nested
  route exactly as to a top-level one.

## Status — the vocabulary is still to come

**This mode is declared, discovered and ordered, but its component vocabulary is not
implemented yet.** The increment that completes it is `FOUNDATION-PAGES-A2`, which
will define and validate:

- the page-level data (title, summary and the sections a page is built from);
- the platform-supported component vocabulary — the reusable, accessible building
  blocks an advanced author composes a page from;
- the renderer that turns a validated page into the same Foundation presentation a
  Markdown page gets.

**No components are documented here yet, because none of them exist.** Do not invent
a JSON page in the meantime: until the vocabulary lands, author pages in
[`../markdown/`](../markdown/README.md).

Because a JSON page takes precedence over a Markdown page for the same language and
route, a JSON file that WOULD be served **stops the build with an error naming the
file** — whether it sits at a top-level route or inside a folder. It is never silently
ignored, and it never quietly disappears from the site.

## What will not change when it lands

- No JSON page will ever be executable: the mode is data plus a platform-supplied
  vocabulary of supported sections and components.
- The Markdown mode stays the simple, safe option; this mode is purely additive.
- Both modes are resolved in one order — requested language first, then the site's
  default language — so a page is served the same way whichever mode authored it.
