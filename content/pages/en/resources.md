---
title: Resources
---

## Resources

This page demonstrates the Foundation's Markdown-based content model: the
text you are reading lives in a single Markdown file,
`content/pages/en/resources.md`, and is rendered as part of the site.

What you can put on a page like this:

- Guides and tutorials
- Downloadable material
- Links to external resources

### How content works

Each page lives at `content/pages/<locale>/<slug>.md`. Frontmatter sets the
title, and the body is rendered as Markdown. To add a page you create a new
file there and add it to the `navigation` array in `site.config.json` (with a
localized label in `config/i18n/<locale>.json`). When a translation is
missing for a locale, the default locale's version is served automatically,
so a page is never broken.

Other collections follow the same pattern:

- Offerings — `content/offerings/`
- Portfolio — `content/portfolio/`
- Blog posts — `content/posts/`
- Testimonials — `content/testimonials/`
- Legal documents — `content/legal/`

The legal documents listed in the footer are template placeholders for
demonstration and are not legal advice.

### The Foundation architecture

New capabilities are added to the Foundation incrementally and behind
configuration, without a rewrite. The ports-and-adapters structure described
in `ARCHITECTURE.md` keeps content, configuration, and presentation cleanly
separated.
