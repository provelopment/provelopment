# Provelopment Foundation

An **open-source**, re-brandable web platform template for small businesses: a
**configuration-first** site foundation that turns JSON, Markdown and assets into a
complete, accessible, multilingual website. Starts frontend-only, architected to
grow into full-stack without a rewrite.

This repository is the **reusable product**. It ships **no brand of its own** — a
starter page, neutral placeholder graphics, one default language and a complete,
reusable architecture. You make it yours by editing **configuration, content and
assets only**; platform code does not need to change.

## Why it exists

Most small-business sites are rebuilt from scratch. The Foundation provides the
proven parts once — routing, a content system, localization, a configurable shell,
theme tokens, asset roles, accessibility, SEO metadata, validation and deployment —
so a new site starts from a working baseline instead of an empty folder.

## Quick start

Tested from a fresh clone (Node.js 22+, pnpm):

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you are redirected to the
default locale. The starter renders immediately: no content or artwork has to be
deleted first.

Before production, **replace the placeholder values**: `site.url`, `site.name`,
`site.tagline` and `site.description` in `site.config.json`, the starter copy in
`config/i18n/en.json`, and the graphics in `content/assets/placeholders/`.

## Repository structure

```
src/app         # Next.js App Router routes under src/app/[...segments], layouts, globals.css tokens
src/components  # Presentation components (site, shell, shared ui primitives)
src/core        # Framework-independent domain concepts and the UI engine
src/application # Use-case ports and services
src/adapters    # Concrete integrations (filesystem content, analytics, booking, maps)
src/config      # Site configuration schema and loaders
config/i18n     # Localized JSON dictionaries (one shipped locale: en)
content         # EVERYTHING you author lives here — start at content/README.md
  pages/markdown #   Safe Markdown pages — content/pages/markdown/<site>/<locale>/<route>.md  (see its README)
  pages/json     #   Declarative JSON pages — content/pages/json/<site>/<locale>/<route>.json  (see its README)
  assets         #   YOUR artwork: logos, favicons, icons, graphics  (see assets/README.md)
public/assets   # GENERATED mirror of content/assets/** — never edit by hand (scripts/sync-runtime-assets.mjs)
scripts         # Deterministic asset mirror (assets:sync / assets:check)
tests           # Architecture-boundary, unit, integration and CDP browser-matrix tests
```

## Where your content lives

**One folder holds everything you write or upload:** [`content/`](content/README.md).
Pages and the artwork they use — all of it.

```text
content/
├── README.md            ← the map: "where do I edit my website?"
├── pages/
│   ├── markdown/        ← simple, safe pages  (content/pages/markdown/<site>/<locale>/<route>.md)
│   └── json/            ← advanced pages      (content/pages/json/<site>/<locale>/<route>.json)
└── assets/              ← logos, favicons, icons, graphics  (you edit here)
```

**If authored content has its own URL, it is a page.** A services page, one service, a
blog article, a portfolio project, a privacy policy and "About" are all pages: they
differ only in where you put the file, and a page's address comes from its folders.

```text
## Your folder is your address

A page's address is built from the folders it lives in: **mode → site → language → page**.

```
content/pages/markdown/ww/en/services.md               →  /ww/en/services
content/pages/markdown/ww/en/services/web-design.md    →  /ww/en/services/web-design
content/pages/markdown/ww/en/legal/privacy.md          →  /ww/en/legal/privacy
```

- **site** — a recognized lowercase country code (`ca`, `fr`, `ch`…) or `ww` for a
  worldwide/global site. The complete list is in
  [`content/COUNTRY-CODES.md`](../COUNTRY-CODES.md); a folder that is not one of those
  codes is not a site, and its pages are never published.
- **language** — `en`, `fr`, `fr-ca`… (lowercase).

If you have only one website and one language, your folders are `ww/en/…` — the site
folder is still there, because every address carries it.


content/pages/markdown/ww/en/services/web-design.md    →  /ww/en/services/web-design
content/pages/markdown/ww/en/legal/privacy.md          →  /ww/en/legal/privacy
```

Content that only ever appears *inside* another page — customer quotes, cards,
statistics, FAQ rows — is written in that page. It needs no file of its own.

Everything else is **configuration**, not content: `site.config.json` and `config/`
change how the site *behaves* (business name, contact details, languages, menu
entries, feature switches). You change your words and images under `content/`; you
change settings in `site.config.json`.

**Two ways to author a page**, and you almost certainly want the first one:

| Mode | Who it is for | Where |
| --- | --- | --- |
| **Simple, safe Markdown** | anyone who can edit a text file — no programming needed | `content/pages/markdown/<site>/<locale>/<slug>.md` |
| **Advanced declarative JSON** | an experienced author/developer who needs page composition Markdown cannot express | `content/pages/json/<site>/<locale>/<route>.json` |

Both are documented for the person doing the authoring:
[`content/pages/markdown/README.md`](content/pages/markdown/README.md) explains what
Markdown is, where the file goes, exactly what you can write and how to link to a
section of your own page;
[`content/pages/json/README.md`](content/pages/json/README.md) explains the advanced
mode's role and its current status. Your artwork lives in
[`content/assets/`](content/assets/README.md).

Whichever mode you choose, **the page title is the page's only top-level heading**.
Headings you write inside a page are placed below it automatically, so `#` is still how
you write a section and `##` the parts inside it — you never have to start at `##` or
delete a heading to keep the page valid.

## Publishing your changes

Editing a file is not publishing it. A change reaches the website when it is
**committed and pushed** to this repository:

```bash
git status                                  # see what you changed
git add content/pages/markdown/ww/en/about.md  # stage the file(s) you edited
git commit -m "Update About page"           # record the change
git push                                    # send it; automated checks then build the site
```

A saved-but-uncommitted file cannot be pushed, and an unpushed commit cannot reach
the site — those four commands are the whole workflow, and it is the same for every
file under `content/`.

> **Public deployment — live technical baseline.** This repository is deployed
> directly to **`https://foundation-template.provelopment.com/`**: Vercel builds
> this public repository (production branch `main`), so every accepted change
> merged to `main` updates that same live site. Nothing is added to make it work —
> the public repository is the deployment.
>
> What is live today is the **first reference increment**: the deployment has its own
> name, description and origin (`site.url`), a Home page authored in the JSON mode, an
> About page authored in Markdown, and the visitor Layout control enabled. The rest of
> the reference site — further pages, more languages, Locations, and the link back to
> `https://foundation.provelopment.com/` — is the next body of work and has **not**
> landed yet; this note changes when it does rather than describing it in advance.
>
> Two things are already decided for that reference site and are recorded here so no
> increment invents its own answer:
>
> 1. **An unobtrusive, configurable link to `https://foundation.provelopment.com/`**
>    will appear in the shipped reference pages/site chrome. It is a
>    reference-site/configuration concern — generic platform runtime logic must not
>    hard-code it — and the starter content that carries it lands with the reference
>    work, not before.
> 2. **A shell layout switcher (available now).** A Foundation site can optionally let a
>    visitor switch between the **Sidebar** and **Menu-bar** layouts from a simple
>    dropdown, without changing the page, the locale or the content: same content
>    authority, same current route, presentation only. It is **off by default**, an
>    adopter enables it with one configuration block (`ui.layoutSwitcher` — see
>    CUSTOMIZING.md), and the reference deployment **ships with it enabled** — the header
>    control is live on this site today. The capability itself is generic platform
>    behaviour; the reference site's own choice to enable it is reference configuration.

The repository also authors its own **two reference pages** — Home
(`content/pages/json/ww/en/home.json`, the advanced JSON mode) and About
(`content/pages/markdown/ww/en/about.md`, the simple Markdown mode) — so both authoring
modes are demonstrated by the live site. A site that authors no home page still gets the
configuration-driven starter landing page, and the two authoring roots' own documentation
is never content. Technical routes (`/sitemap.xml`, `/robots.txt`) and generated metadata
are not content pages.

## Customize identity

1. **Configuration** — `site.config.json` is validated at build time (a bad edit
   fails with an actionable message). It drives the site name, tagline,
   description, contact details, social links, navigation, an optional secondary
   footer navigation group, enabled capabilities and the resolved UI.
2. **Text and colour** — the visible landing-page copy lives in
   `config/i18n/en.json`; the single theme accent is one value in
   `src/app/globals.css` (`--ui-foundation-accent`). Change it and the whole site
   re-colours; keep it dark enough to meet the WCAG AA contrast gate.
3. **Graphics** — replace the neutral files in `content/assets/placeholders/`
   (`logo-header.svg` serves the header **and** footer logo role, `favicon.svg`,
   `header-graphic.svg`, `footer-graphic.svg`, `sidebar-*.svg`), then run
   `pnpm assets:sync`. You may equally point `site.assets.*` at your own absolute
   URLs. [`BRAND_ASSETS.md`](BRAND_ASSETS.md) is the complete role contract
   (filename, format, dimensions, config key, replacement and disable procedure).

The template ships **no** `content/assets/branding/` tree and no example artwork: identity
is yours to supply. Artwork-only roles (page banners, page background, status
graphic, social-preview image) ship nothing and stay off until configured.

## Add a page

Create one file under the human-facing content area (see
[Where your content lives](#where-your-content-lives) for the two modes):

```text
content/pages/markdown/<site>/<locale>/<page>.md
```

Put it in a folder and the folder becomes part of its URL, so a section and its pages
sit together:

```text
content/pages/markdown/ww/en/services.md              →  /ww/en/services
content/pages/markdown/ww/en/services/web-design.md   →  /ww/en/services/web-design
```

Ordinary Markdown is enough — frontmatter is optional, and a file that is nothing
but prose is a complete page (the title comes from frontmatter, then the first
`# heading`, then the filename). The page is served at `/<locale>/<page>` and
listed in the sitemap as soon as the file exists for a configured language; no
configuration change is needed to publish the route — only committing and pushing it
(see [Publishing your changes](#publishing-your-changes)).

It is **safe by design**: raw HTML you type is shown as text, unsafe link
destinations are dropped, and the rendered page is checked against a fixed
element/attribute allowlist. `## Opening hours` also gains the predictable fragment
`#opening-hours`, so an author can link to their own sections — at any depth. The
author-facing guide is [`content/pages/markdown/README.md`](content/pages/markdown/README.md);
the advanced mode is [`content/pages/json/README.md`](content/pages/json/README.md) (a
JSON page file currently stops the build with an error naming the file rather than
being ignored, because nothing yet interprets it).

## Sections, listings and embedded content

There is no separate "collection" to configure. A section is a folder, a listing is a
page, and the items are pages inside that folder:

```text
content/pages/markdown/ww/en/offerings.md                 ← the offerings overview (a page)
content/pages/markdown/ww/en/offerings/website-design.md  ← one offering (a page)
content/pages/markdown/ww/en/blog.md                      ← the index of your articles
content/pages/markdown/ww/en/blog/choosing-a-domain.md    ← one article
```

Quotes, cards, statistics and FAQ rows are **embedded**: you write them in the page
that shows them, because they have no URL of their own. (The declarative JSON mode is
where structured page sections live — the declarative JSON mode, documented in
[`content/pages/json/README.md`](content/pages/json/README.md).)

Navigation entries are configuration (`navigation[]`), their labels come from
`config/i18n/en.json` → `navigation.items`, and a policy document is surfaced in the
footer by listing it in `legal[]` while authoring it as a page
(`content/pages/markdown/ww/en/legal/privacy.md`).

### Author your home page (optional)

The locale root is configuration-driven by default. To author it as **content**
instead, add `content/pages/markdown/<site>/<locale>/home.md` (or
`content/pages/json/<site>/<locale>/home.json`) — the locale-root route then renders it
through the same page-source composition as every other page (same precedence, same
per-locale fallback). A site that authors no `home.md` keeps the generic starter
homepage, so this is purely additive.

The slug is reserved: `/home` is never generated as a public route and never listed in
the sitemap, because the home page's real URL is the locale root.

## Enable capabilities

Optional capabilities are off in the starter and are enabled purely by
configuration: analytics (`vercel`), maps directions links (`google`), booking
(`external-url`) and the contact inquiry provider (`stub` or `webhook`). Their
adapters and components ship with the template — see
[`CUSTOMIZING.md`](CUSTOMIZING.md).

Content needs no enablement: a page exists because its file exists.

## Validate

These are the repository's real gates (all runnable locally; the first five also
run in CI):

```bash
pnpm assets:check            # runtime mirror is byte-identical to its sources
pnpm exec tsc --noEmit       # types
pnpm lint                    # eslint
pnpm test                    # unit + architecture-boundary tests (vitest)
pnpm build                   # production build
pnpm audit                   # dependency audit
pnpm test:browser            # headless-Chrome CDP browser matrix (needs Chrome)
```

## Deploy

Your site deploys from **your own repository** to Vercel. Follow
[`DEPLOYMENT.md`](DEPLOYMENT.md). No environment variables are required for a default
build.

> This repository is also its own live deployment: **`https://foundation-template.provelopment.com/`**
> is built directly from this public repository by Vercel (production branch `main`).
> GitHub remains its distribution and documentation surface and CI its gate; a merge
> to `main` reaches that URL.

## Upgrade

Keep your clone connected to the template repository and absorb new revisions the
documented way:

```bash
git remote add upstream https://github.com/provelopment/provelopment-foundation.git
git fetch upstream
```

Then follow
[`instruction-manuals/foundation-upgrade.md`](instruction-manuals/foundation-upgrade.md),
which classifies platform-owned vs adopter-owned material and protects your
configuration, content, assets and branding.

## Documentation

- [`CUSTOMIZING.md`](CUSTOMIZING.md) — the downstream user guide: what to edit, adding locales, deploying, staying in sync
- [`BRAND_ASSETS.md`](BRAND_ASSETS.md) — the authoritative **brand-asset swap contract**: every replaceable graphic role
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — the launch runbook
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — boundaries, dependency direction, internationalization blueprint
- [`instruction-manuals/README.md`](instruction-manuals/README.md) — the operating manuals: adoption, upgrade, customization, branding, content, validation, deployment, troubleshooting
- [`AGENTS.md`](AGENTS.md) — the operating contract for AI coding agents

## The live Foundation site

The real-world example is **<https://foundation.provelopment.com>** — the Provelopment
Foundation's own website: real content, its own brand installation, and the capabilities
this template provides.

Its source is **not** in this repository and is **not** part of the public template
distribution. That site is served by the private downstream application
`provelopment/provelopment-web`, where it is one **site profile** among several — a
multi-site application that derives from this template. A previously separate
reference-site repository (`provelopment-foundation-site`) was archived when those sites
were consolidated, and it is **not** the current implementation.

You do not need that site, its application or its content to use this template: this
repository is a complete, standalone starting point.

## Licence

**Provelopment Foundation is licensed under the Apache License, Version 2.0** — see
[`LICENSE`](LICENSE). You may use, modify, distribute and commercially exploit the
Foundation's own code and documentation, including inside your own proprietary website
projects, on the terms that licence sets out.

The licence grants no rights in the **Provelopment name, logos or branding**: Apache-2.0
is a copyright licence and expressly excludes trademark rights. A separate Provelopment
trademark/brand policy is planned and is **not** part of this repository.

### Third-party material is NOT relicensed

Apache-2.0 covers the Foundation's own material. Bundled third-party work keeps its own
licence and attribution, exactly as it was:

- **Tabler Icons** (MIT) — the icon library under `content/assets/icon-library/`. The upstream
  MIT notice is bundled at
  [`content/assets/icon-library/licensing/TABLER-ICONS-MIT.txt`](content/assets/icon-library/licensing/TABLER-ICONS-MIT.txt),
  with per-icon provenance in
  [`icon-provenance.json`](content/assets/icon-library/licensing/icon-provenance.json).
- **Third-party platform marks** (WhatsApp, Telegram, Facebook, Messenger, Instagram,
  LinkedIn, GitHub) — brand-owner assets governed by each owner's own brand rules, held
  under `content/assets/platform-marks/` alongside their provenance records.

No `NOTICE` file is included, because the work ships no upstream `NOTICE` text to
reproduce — Apache-2.0 §4(d) only applies when the distributed work already contains one.
The attribution obligations above are recorded next to the material they belong to.

Documentation is covered by the same Apache-2.0 grant as the code for now; a dedicated
documentation-licensing decision may be revisited later. The private `provelopment.com`
application and its content are **not** made open source by this licence.