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
config/pages-json/<locale>/<slug>.json
```

For example:

```text
config/pages-json/en/services.json   →   /en/services
```

The same rules as the Markdown mode apply:

- `<locale>` is one of the site's configured languages;
- `<slug>` becomes the URL segment (lowercase words joined by hyphens);
- **this README is never a page** — only files inside a language directory are
  pages, and `README` is not a well-formed slug;
- an **empty language directory publishes nothing**; creating
  `config/pages-json/de/` prepares a language and creates no route.
- a JSON page **takes precedence** over a Markdown page for the same language and
  slug, because it is the more capable declaration.

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
`../pages-markdown/`.

Because a JSON page takes precedence over a Markdown page for the same language and
slug, a JSON file that WOULD be served **stops the build with an error naming the
file**. It is never silently ignored, and it never quietly disappears from the site.

## What will not change when it lands

- No JSON page will ever be executable: the mode is data plus a platform-supplied
  vocabulary of supported sections and components.
- The Markdown mode stays the simple, safe option; this mode is purely additive.
- Both modes are resolved in one order — requested language first, then the site's
  default language — so a page is served the same way whichever mode authored it.
