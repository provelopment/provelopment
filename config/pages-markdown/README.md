# Pages — Markdown (the simple, safe authoring mode)

This directory holds **ordinary Markdown pages** for this site. It is the
accessible authoring mode: if you can write a text file, you can add a page.

Nothing here is code. There are no commands to run, no components to know about
and no special syntax to learn.

## Where a page goes

```text
config/pages-markdown/<locale>/<slug>.md
```

For example:

```text
config/pages-markdown/en/opening-hours.md   →   /en/opening-hours
```

- `<locale>` is one of the site's configured languages (`en`, `de`, …) — the same
  codes used in `site.config.json` and `config/i18n/`.
- `<slug>` becomes the URL segment, so use lowercase words joined by hyphens
  (`opening-hours`, not `Opening Hours`).

## A page can be nothing but prose

Frontmatter is **optional**. This file is a complete page:

```markdown
# Opening hours

We are open Monday to Friday, 9am to 5pm.
```

If you write no heading and no frontmatter, the title is derived from the
filename. If you prefer to be explicit, supply a title (and an optional summary
used in search results and link previews):

```markdown
---
title: Opening hours
description: When we are open, including public holidays.
---

We are open Monday to Friday, 9am to 5pm.
```

`title` and `description` are the only supported keys — and neither is required.
An unexpected key is reported as an error when the site is built, so a typo is
never silently ignored.

Ordinary Markdown is all there is: headings, paragraphs, lists, quotes, links,
images, tables, fenced code blocks. There are no shortcodes, no embedded code and
no secret commands.

## It is safe by design

Markdown written here cannot introduce active behaviour in the browser:

- any raw HTML you type is shown as **text**, never as markup — `<script>` or
  `<div onclick="...">` appears as the words you typed;
- a link to an unsafe destination (anything other than a same-site path, a
  fragment, a relative path, `https:`, `http:`, `mailto:` or `tel:`) keeps its
  words and loses its link;
- the rendered page is checked against a fixed list of allowed elements and
  attributes before it is served.

That is why this is the recommended mode for day-to-day page authoring.

## Two things that are deliberate, not mistakes

- **This README is never a page.** Only files *inside* a language directory are
  pages. The same is true of any other file that is not a well-formed slug, such
  as `.gitkeep`.
- **An empty language directory publishes nothing.** You may create
  `config/pages-markdown/de/` before you have anything to put in it. A directory
  is a place to prepare content; it is not a published page, a route or a sitemap
  entry. What the public site serves is decided by the site's configured
  languages in `site.config.json`.

## What happens to a file you add

A page file becomes a real page the next time the site is built: it is served at
`/<locale>/<slug>`, it is listed in the sitemap, and it appears in the
site's own metadata (`title`, `description`) if you supplied them. Adding a page
does not change the navigation menu — put a link to it wherever you want it, or
add it to `navigation` in `site.config.json` if it belongs in the menu.

The reserved filename `home.md` is special: it is served at the locale root
(`/<locale>`) instead of at `/<locale>/home`.

## Where the advanced mode lives

If a page needs more than Markdown can express, the advanced declarative mode
lives in `config/pages-json/` — see its README for its current status.

If you already have pages under `content/pages/`, they keep working exactly as
before: that is the **legacy compatibility** mechanism, and this directory does
not replace or modify them.
