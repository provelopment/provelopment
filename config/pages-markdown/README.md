# Pages — Markdown (the simple, safe way to add a page)

This directory holds this site's **pages**. It is the everyday authoring mode: if
you can write a text file, you can add a page. Nothing here is code, there are no
commands to run, and no special syntax to learn.

**Markdown** is plain text with a few simple conventions: `# Heading` for a
heading, blank lines between paragraphs, `**bold**`, `*italic*`, `- item` for a
list, `[text](/link)` for a link. If you can write an email, you can write
Markdown.

## Where a page file goes

```text
config/pages-markdown/<locale>/<slug>.md
```

Two things decide the two parts of that path:

- **`<locale>`** (the folder) — one of the site's languages, for example `en`.
  Use the same codes the site is configured with.
- **`<slug>`** (the filename) — becomes the end of the page's web address. Use
  lowercase words joined by hyphens: `opening-hours.md` is the page
  `/en/opening-hours`, and `about-us.md` is `/en/about-us`.

So, to add a page in English:

```text
config/pages-markdown/en/opening-hours.md
```

…which the site serves at `/en/opening-hours`.

## The smallest complete page

A file with nothing but a heading and a sentence is a complete page:

```markdown
# Opening hours

We are open Monday to Friday, 9am to 5pm.
```

You do not need any other setup, and you do not need to tell the site about the
file: it becomes a page (and appears in the sitemap) as soon as the file exists.
If you write no heading, the page is named after the file.

## Optional extras

If you want to be explicit about the page's name, or give it a short summary for
search results and link previews, start the file with a small block between two
`---` lines:

```markdown
---
title: Opening hours
description: When we are open, including public holidays.
---

We are open Monday to Friday, 9am to 5pm.
```

`title` and `description` are the only two settings, and **neither is required**.
A misspelled setting is reported as an error when the site is built, so a typo can
never be silently ignored.

## What you can write

Ordinary Markdown, all of it: headings, paragraphs, **bold**, *italic*, lists,
numbered lists, quotes, links, images, tables, horizontal rules and fenced code
blocks (write the language after the opening ``` for a code block, e.g. ```js).

There are deliberately **no** secret commands, shortcodes, embedded code or
components to remember. If a page needs more than this, the advanced mode exists —
but you almost never need it.

## Why this mode is safe

Markdown written here cannot make the site do anything unexpected in a visitor's
browser:

- **anything that looks like a web page instruction is shown as text.** If you type
  `<script>` or `<div onclick="...">`, a visitor sees those words — they do not
  become part of the page;
- **an unsafe link is not a link.** Links to same-site paths (`/contact`),
  fragments (`#section`), relative paths (`./photo.jpg`) and `https:`, `http:`,
  `mailto:` or `tel:` addresses work. Anything else keeps its words but loses its
  destination;
- **what a page may contain is a fixed list**, so a stray character cannot smuggle
  in a form, a frame or an embedded document.

## Two things that are deliberate, not mistakes

- **This README is never a page.** Only files *inside* a language folder are
  pages; the same is true of any differently-named file, such as `.gitkeep`.
- **An empty language folder publishes nothing.** You may create
  `config/pages-markdown/de/` before you have anything to put in it. A folder is a
  place to prepare content; by itself it publishes no page, no address and no
  sitemap entry. What the public site serves is decided by the site's configured
  languages.

## The home page, and the menu

- `home.md` is special: it is served at the site's front page for that language
  rather than at `/en/home`.
- Adding a page does **not** change the menu. Put links to the page wherever you
  want them, or add an entry to `navigation` in `site.config.json`.

## The other authoring mode

For the rare page that needs more than Markdown can express, there is an advanced
mode using structured data — see `../pages-json/README.md`. It is for developers,
it is not finished yet, and you do not need it to write ordinary pages.
