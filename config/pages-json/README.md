# Pages — JSON (the advanced, declarative authoring mode)

This directory is the **advanced** authoring mode: a page expressed as validated
**data** rather than prose, for a page that needs presentation ordinary Markdown
does not offer.

Like the Markdown mode, nothing here is executable: a JSON page is **data**, never
code. No scripts, no expressions, no imports — and a page that names something the
platform does not support fails loudly instead of being guessed at.

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

## Status — not yet interpretable

**This mode is declared, discovered and ordered, but its vocabulary is not
implemented yet.** The increment that supplies it is `FOUNDATION-PAGES-A2`.

The page-source order is:

```text
requested-locale JSON  →  requested-locale Markdown  →  requested-locale legacy content
(default-locale JSON   →  default-locale Markdown    →  default-locale legacy content)
```

so a JSON page **takes precedence** over a Markdown or legacy page for the same
language and slug. Because the vocabulary that renders a JSON page does not exist
yet, a JSON file that would be served **stops the build with an error naming the
file** — it is never silently ignored, and it never quietly disappears from the
site.

Until `FOUNDATION-PAGES-A2` lands, author pages in `config/pages-markdown/`.

## What will not change

- No JSON page will ever be executable: the mode is data plus a platform-supplied
  vocabulary of supported sections and components.
- The Markdown mode stays the simple, safe option; this mode is additive.
- Pages already under `content/pages/` keep working exactly as before.
