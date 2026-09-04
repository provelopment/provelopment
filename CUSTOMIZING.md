# Customizing Your Site

This guide is for users who cloned the Provelopment Foundation template and
want to turn it into their own website. The core idea:

> **You customize configuration, content, and assets only.**
> Platform code (`src/core`, `src/application`, `src/adapters`,
> `src/components`) should not need modification for rebranding.

---

## 1. Site Configuration — `site.config.json`

This file is the single source of truth for your site's settings. It is
validated by a [Zod](https://zod.dev) schema at load time; invalid values
fail the build with actionable error messages.

| Section | What it controls |
| --- | --- |
| `site` | Production URL, site name, tagline, meta description, optional logo |
| `i18n` | Locales and the default locale |
| `contact` | Public contact email |
| `socialLinks` | Footer/header social links |
| `navigation` | Header navigation entries (label + href) |
| `features` | Feature flags, e.g. `analytics.provider` |
| `ui` | Intent-level UI namespace — presets, navigation patterns, density, CTA, theme; see below |

Set `site.url` to your final production origin before go-live — it drives
the sitemap, canonical URLs, and hreflang alternates.

Read configuration only through the loader exports from `src/config`; never
import the JSON file directly from components.

### The `ui` namespace (UI-05 — presets are live; the resolved default personality is Adaptive)

The optional top-level `ui` key is the intent-level UI configuration namespace
(preset, shell, navigation, density, content width, CTA, theme), validated at
build time. `resolveUiConfig` resolves it deterministically: **explicit
developer overrides → preset profile (explicit preset OR the resolved default
personality) → neutral Foundation defaults → completeness guard.**

**You configure semantic intent, never component internals or CSS.** One JSON
switch selects a complete modern UI personality:

```jsonc
// Adaptive (the resolved Foundation default personality): expanded collapsible
// sidebar on desktop, compact sidebar rail on tablet, bottom navigation + "More"
// drawer on mobile.
{ "ui": { "preset": "adaptive" } }
```

Individual JSON switches override any dimension without canceling the preset:

```jsonc
{
  "ui": {
    "preset": "adaptive",
    "navigation": { "mobile": "drawer" },   // override one dimension
    "density": "compact"
  }
}
```

**Preset personality ≠ effective composition.** `resolved.preset` identifies the
selected/default UI personality; the resolved leaves are the effective behavior.
An override does not cancel the preset — it overrides a single dimension:

```jsonc
{ "ui": { "navigation": { "desktop": "top" } } }
// → preset = "adaptive" (personality), desktop = "top", tablet = "collapsed-sidebar",
//   mobile = "bottom-bar" (adaptive profile fills the remaining dimensions)
```

**Default:** omitting `preset` resolves the **Adaptive default personality**
(`FOUNDATION_UI_DEFAULTS.defaultPreset`, selected at the resolver's single
`raw.preset ?? …` point). This changes the OUT-OF-THE-BOX experience for a
fresh clone (sidebar shell) but never overrides explicit leaves — the shipped
demo explicitly selects `"preset": "classic"` (UI-06), so it renders the
familiar top-bar + drawer shell.

Every other preset stays explicitly selectable and unaffected:

```jsonc
{ "ui": { "preset": "classic" } }     // top navigation + drawer (today's shipped demo)
{ "ui": { "preset": "focus" } }       // minimal nav + prominent CTA style
{ "ui": { "preset": "workspace" } }   // sidebar + collapsed-sidebar + drawer shell (UI-08: grouped nav + secondary panel deferred)
{ "ui": { "preset": "immersive" } }   // floating nav + overlay menu (UI-09: overlay CTA proven; distinct floating/minimal treatments deferred)
```

**Classic (UI-06) is the declarative proof:** it required zero Foundation code
changes — the profile → resolver → engine pipeline built in UI-01–05 already
composes top navigation + the mobile drawer. The demo's `ui` block shows the
recommended pattern: `"preset": "classic"` plus optional explicit leaves that
override individual dimensions of the profile.

**Focus (UI-07) is conversion-first with a prominent primary CTA.** It required
the smallest declarative extension — one adopter-owned `cta.href` destination,
the content-layer drawer CTA consumer, and the vocabulary-driven `prominent`
treatment:

```jsonc
{
  "ui": {
    "preset": "focus",
    "cta": {
      "enabled": true,
      "action": "book",          // semantic action (never auto-routed)
      "label": "Book Now",
      "href": "/booking"         // adopter-owned destination (UI-07 D1)
    }
  }
}
```

- The CTA renders in the header at ≥`md` and inside the mobile drawer at <`md`
  (when it materially exists — enabled + label + href).
- `cta.href` is optional and NEVER inferred from `action`. An enabled CTA
  without label+href renders nothing (the Foundation never invents a destination
  or route).
- `style: \"prominent\"` (the Focus default) applies a filled, token-pure
  treatment; `standard` stays a plain link. The `minimal` header/navigation
  values resolve but their chrome/content treatment is **deferred** (no
  doc-established contract; see ARCHITECTURE — Focus preset).

**Workspace (UI-08) is an information-rich shell** — the third declarative proof
after Classic and Focus. It required **zero production-code change**: the
profile → resolver → engine pipeline already composes the sidebar ≥md,
collapsed-sidebar tablet, drawer <md shell (shared with Adaptive):

```jsonc
{
  "ui": {
    "preset": "workspace",
    "cta": { "enabled": true, "action": "book", "label": "Book Now", "href": "/booking" }
  }
}
```

The CTA renders in the sidebar at ≥`md` (aside slot) and inside the mobile drawer
at <`md` (existing UI-07 consumer). **Truthful scope:** the **Workspace shell** is
implemented and proven; **grouped navigation** and the **optional secondary/context
panel** remain **deferred pending explicit contracts** (no group data shape, no
content source, no consumer as of UI-08 — see ARCHITECTURE — Workspace preset). Do
not expect `navigation.groups` / `secondaryPanel` configuration in this release.


**Immersive (UI-09) is the visual-first shell.** It required **one minimal,
vocabulary-driven content-layer consumer fix** (not a new architecture) to make the
already-declared mobile **overlay** CTA observable:

```jsonc
{
  "ui": {
    "preset": "immersive",
    "cta": { "enabled": true, "action": "book", "label": "Book Now", "href": "/booking" }
  }
}
```

Desktop/tablet `floating` resolves through the existing **aside** (sidebar)
composition; mobile `overlay` uses the existing `OverlayNavigation` path. The CTA
renders in the aside at ≥`md` and inside the **open overlay** at <`md` (the UI-09
consumer extends the existing UI-07 drawer-CTA consumer to admit the `overlay`
pattern). `disabled`/no-`href` → no CTA (never invented). **Truthful scope:** a
distinct `floating` visual treatment and the `minimal` header treatment remain
**deferred** (no concrete contract defines them); **overlay interaction behavior**
(animation, backdrop, dismissal, Escape, focus, reduced motion) remains the
**UI-10** gate. Do not expect a distinct floating look or a reduced header in this
release.



**Responsive behavior (owner-applied wording):** desktop/tablet (≥`md`)
preserves the existing composition for header-slot layouts; mobile (<`md`) is
intentionally modernized to the declared mobile pattern (Classic drawer, or
Adaptive bottom bar + More drawer). The bottom bar's content rule is
deterministic: the first **4** configured `navigation` items render in the bar;
the remainder (when non-empty) is exposed through the "More" drawer.

`cta.enabled` resolves `false` by default — the shell renders no CTA, and the
Foundation never invents a business action. When you enable a CTA, supply
`action`, `label`, and `href` (the adopter-owned destination), and keep `style`
semantic (`standard`/`prominent`). The Foundation never derives `href` from
`action` — an enabled CTA without label+href renders nothing.

## 2. Content — Markdown Pages

Pages live at `content/pages/<locale>/<slug>.md`. Frontmatter sets the page
title; the body is rendered as Markdown.

- Wire new pages into `navigation` in `site.config.json`.
- Missing translations fall back to the default locale automatically.
- The sitemap is derived from the **content model** (every page that has a
  `<slug>.md` file in the default locale, plus the locale root), not from
  `navigation`. Navigation controls exposure and order; a page joins the
  sitemap as soon as its content file exists.
- Markdown (including any raw HTML in the file) is rendered as-is. These are
  authored, site-owner files — treat them like source code, never as
  untrusted user input.
- Interface strings (buttons, headings outside page bodies) live in the
  dictionaries under `config/i18n/<locale>.json` (see §4).

> **Navigation is deliberate, not derived.** `navigation[]` may legally point
> at a route whose feature is disabled or whose content is missing — the link
> simply leads to a 404. Navigation never filters itself against feature or
> content state, so when you disable a feature (e.g. `features.offerings`)
> or remove content, remove (or leave) the matching navigation entry yourself.

All content bodies (pages, offerings, legal) are localized the same way: a
locale-specific file at `content/<type>/<locale>/<slug>.md` is served when
present; otherwise the repository falls back to the default-locale body. The
shipped template localizes every page and the demo content to all 9 locales.

> **Fallback is intentional, not a bug.** A localized URL (e.g.
> `/de/legal/privacy`) with a missing translation serves the default-locale
> body under that URL, and `<html lang>` still reflects the requested locale.
> That is the documented behavior — localize the file when you want a
> true per-locale page.

### Offerings catalog (`content/offerings/`)

Offerings (services, products, packages, programs, consultations — one
type-agnostic model) live at `content/offerings/<locale>/<slug>.md`:

```markdown
---
title: "Web design"               # required
blurb: "A short one-liner."       # required
order: 1                          # optional, listing sort
featured: true                    # optional, listed first
price: "From $180"                # optional display-only text (no currency math)
image: "/images/offerings/x.jpg"  # optional, file under public/
deliverables:                     # optional "What's included" checklist
  - "Wireframe"
  - "Design review"
faq:                              # optional Q&A (native <details> disclosure)
  - question: "How long does it take?"
    answer: "Outcome summary."
action:                           # optional single call-to-action
  intent: book                    # book | contact | external
  # label: "Book a call"          # optional label override
  # href: "https://.../book"    # required ONLY for intent: external
---
Long-form detail body.
```

**An Offering is descriptive visitor-facing content, not an operational
entity.** Prices are display-only strings (no currency math); ordering is
display ordering; actions are outbound provider-neutral links — never booking,
scheduling, cart, checkout, payment, inventory, ordering/fulfillment, CRM, or
account logic.

**The `action` block (Phase C) is strict:**

- `book` → the platform's booking seam (`features.booking`). Never set `href`;
  the platform resolves the destination. When booking is disabled the detail
  page shows no CTA (never a broken link).
- `contact` → the Foundation contact route. Never set `href`; the platform
  resolves `/{locale}/contact`.
- `external` → an explicit external/deep link; `href` is **required** and is
  validated syntactically only (an internal `/route`, or a scheme link such as
  `https:`, `mailto:`, `viber:`). No ownership/reachability checks are made.
- `label` is an optional override; the default comes from the localized
  dictionary (`booking.book`, `connect.methods.message`,
  `offerings.externalCta`).

The frontmatter parser accepts a deliberately constrained block subset
(string lists, `question`/`answer` object lists, and the fixed `action` object)
and fails the build with an actionable message naming the offering/field for
anything outside it — malformed content never silently misparses.

Offering interfaces are localized in `config/i18n/<locale>.json` under
`offerings` (`heading`, `emptyState`, `backToOfferings`, plus the Phase C keys
`featured`, `deliverables`, `faq`, `externalCta` — all required across every
configured locale).

Three independent controls:

1. **Content** decides which offerings exist — the canonical set is the
   default-locale slugs. A slug that exists only in a non-default locale is not
   listed and its URL returns a 404 (no ambiguous English fallback).
2. **`features.offerings`** decides whether the catalog is exposed: `true`
   enables `/offerings` (+ each detail page, and sitemap coverage); `false` or
   missing disables it entirely — the routes return a 404.
3. **`navigation[]`** decides whether the catalog is linked, e.g.
   `{ "label": "Offerings", "href": "/offerings" }` (plus the localized label
   in `config/i18n/<locale>.json` under `navigation.items["/offerings"]`).
   Navigation is never generated from content automatically.

With the feature on and no offerings yet, the page shows a friendly empty
state. Images for the catalog go in `public/` (e.g. `public/images/offerings/`).

### Testimonials (`features.testimonials` + `content/testimonials/`)

Customer quotes live at `content/testimonials/<locale>/<slug>.md` and render as a
listing-only grid at `/testimonials` (no per-testimonial detail routes):

```markdown
---
author: "Demo Client"               # required
role: "Founder"                     # optional
company: "Example"                  # optional
rating: 5                           # optional integer 1-5 (loud build failure if invalid)
featured: true                      # optional badge
order: 1                            # optional listing sort (ascending, then slug)
quote: "…"                          # required — the canonical quote (body unused)
---
```

- Enabled by `features.testimonials: true`; content existence, exposure, and
  `navigation[]` discoverability are separate, exactly like offerings.
- Demo content ships on (clearly-worded template quotes with `Demo Client` /
  `Demo Partner` authors). **Replace it with real, attributable reviews before
  publishing** — the template never fabricates customer evidence.
- The listed set is the default-locale slugs; each locale reads its own
  translation or falls back to the default locale.
- Chrome (heading/emptyState/featured/ratingAria) is localized under
  `testimonials` in `config/i18n/<locale>.json` and is REQUIRED in every
  configured locale while the feature is on (F1-style build lock).

### Portfolio / case studies (`features.portfolio` + `content/portfolio/`)

Projects live at `content/portfolio/<locale>/<slug>.md`; the body is the
long-form case study rendered through the standard Markdown renderer:

```markdown
---
title: "Brand refresh for a growing studio"  # required
summary: "A short card description."          # required
year: 2026                                    # optional
tags:
  - "Branding"                                # optional display-only tags
featured: true                                # optional badge
order: 1                                      # optional listing sort
image: "/images/portfolio/x.jpg"              # optional, file under public/
---
Case-study body (Markdown).
```

- Routes: `/portfolio` listing + `/portfolio/[slug]` detail. Canonical-slug
  enforcement matches offerings exactly (a non-default-locale-only slug 404s).
- Demo content ships on and is clearly marked **template**; replace before
  publishing. `year`/`tags`/`featured`/`order` are descriptive/presentation
  metadata only (no tag-index routes).
- Chrome (`portfolio` block: heading, emptyState, featured, tags,
  backToPortfolio) is localized in every configured locale while enabled.

### Blog & RSS (`features.blog` + `content/posts/`)

Articles live at `content/posts/<locale>/<slug>.md`; the app routes are
`/blog`, `/blog/[slug]`, and `/blog/rss.xml`:

```markdown
---
title: "Getting started"             # required
excerpt: "Short card/feed summary."   # required
date: "2026-08-15"                    # required ISO YYYY-MM-DD
tags:
  - "Foundation"                      # optional display-only
draft: false                          # optional — true EXCLUDES the post
---
Article body (Markdown).
```

- **Drafts** (`draft: true`) are excluded completely from routes, the sitemap,
  and the RSS feed.
- Listing sorts date-descending; reading time is a deterministic pure helper
  (latin words + CJK characters, ~200 tokens/min).
- **RSS**: a static, per-locale feed is generated at build time
  (`/blog/rss.xml`, linked from `/blog` via `<link rel="alternate">`). Feeds
  contain published posts only, excerpt-based descriptions, fully escaped XML.
  RSS is part of the publishing primitive, not an SEO architecture.
- Chrome (`blog` block: heading, emptyState, backToBlog, readingTime, rss) is
  localized in every configured locale while enabled.
### Legal documents (`legal` + `content/legal/`)

Optional legal pages (privacy policy, terms, etc.) are reached from the footer.

1. **Author content** at `content/legal/<locale>/<slug>.md` (frontmatter `title`
   + Markdown body). Documents only exist for the slugs in your default
   (e.g. `en`) content folder; other locales fall back to it automatically.
2. **List them in `site.config.json`** to expose them:
   ```jsonc
   "legal": [
     { "slug": "privacy", "label": "Privacy Policy" },
     { "slug": "terms",   "label": "Terms of Service" }
   ]
   ```
   A document appears in the footer (and its `/legal/<slug>` route responds)
   only when it is **both** in `legal` **and** has content. Missing content → the
   entry is hidden and the URL returns a 404.
3. **Localize the footer labels** in `config/i18n/<locale>.json` under
   `legal.labels["<slug>"]` (falls back to the config `label`).

### Legal document bodies vs. footer labels

Legal **bodies** are localized independently of the footer **labels**:

- **Footer labels** come from `dictionary.legal.labels["<slug>"]`
  (`config/i18n/<locale>.json`), falling back to the `label` in `site.config.json`.
  They only affect the text of the footer links.
- **Document bodies** come from the content files. A locale-specific body at
  `content/legal/<locale>/<slug>.md` is served when present; otherwise the
  repository falls back to the default-locale body (`content/legal/en/<slug>.md`)
  automatically — exactly the same fallback used everywhere else. So an adopter
  who has translated the footer but not a document's body still gets a working
  page until they add the translation.
- The shipped demo docs include translated bodies for all 9 locales, all
  preserving the same generic, **replaceable-template / not legal advice**
  nature as the English originals. There is no separate translation system and
  no per-locale schema — just the standard content files and the standard
  repository fallback.

The demo `privacy.md`, `terms.md`, and `cookies.md` shipped with the template
are clearly marked **placeholders — not legal advice**. Replace them before
going live.

## 3. Branding, Design Tokens & Visual Identity

The visual identity of the whole site is controlled by **one sanctioned
surface**: the design-token section at the top of `src/app/globals.css`
(colors, radius, container width) plus the brand font mapping (below) and
`public/` assets. You change values in `globals.css` — never in components.

> **Same components, different tokens.** There is no theme switcher, marker
> class, or preset mechanism — the same Foundation components read the same
> semantic tokens, and a downstream site re-brands by changing token values.

### Design tokens (`src/app/globals.css`)

Every semantic color token exists for the light scheme (`:root`) and the dark
scheme (the `@media (prefers-color-scheme: dark)` block). Dark mode follows the
system preference by design (CSS-only — zero flash, zero JavaScript, no manual
toggle).

| Token | Purpose |
| --- | --- |
| `--background` / `--foreground` | base canvas / default text |
| `--muted` / `--muted-foreground` | secondary surfaces / subdued text |
| `--card` / `--card-foreground` | card surfaces (offerings, connect, FAQ) / text on them |
| `--border` | hairline borders |
| `--input` | form control borders |
| `--ring` | keyboard focus ring |
| `--accent` | highlight / badge surfaces |
| `--primary` / `--primary-foreground` | brand color / text on brand |
| `--secondary` / `--secondary-foreground` | secondary action surfaces |
| `--success` | "Open now" status text |
| `--destructive` / `--destructive-foreground` | error text / error surfaces |
| `--radius-sm` / `--radius-md` / `--radius-lg` | corner radii (`rounded-*`) |
| `--container-page` | page/container width (`max-w-page`) |

Shape and layout tokens are declared in the `@theme` block (so they generate
Tailwind utilities); the color mapping lives in `@theme inline` which keeps
utilities referencing your `:root` values at runtime.

### Changing colors

Edit the hex values in the light block and, for a proper dark experience, the
corresponding values in the dark block — then run
`pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`.
`tests/unit/design-tokens.test.ts` verifies the **default** token set meets
WCAG 2.1 AA contrast (≥ 4.5:1) for every documented pair in both schemes.

> **Accessibility is your responsibility when you customize.** The Foundation's
> default tokens are contrast-verified, but an arbitrary downstream color
> override cannot be guaranteed accessible automatically. After changing any
> color, re-check the pairs you touched (a contrast checker will do):
> `foreground`/`background`, `muted-foreground` on `background`/`muted`/`card`,
> `primary-foreground`/`primary`, `success`/`background`,
> `destructive-foreground`/`destructive`, `primary`/`background`. Text needs
> ≥ 4.5:1 (3:1 for large text). The focus ring color is `--ring` (visible
> against both `--background` and `--card`).

### Typography

- The brand sans/monospace families are **Geist** via `next/font/google`,
  loaded in `src/app/[locale]/layout.tsx`; `--font-sans` / `--font-mono` live
  in the `@theme inline` block of `globals.css`.
- **To change the brand font:** swap the `next/font/*` call in `layout.tsx`
  (another `next/font/google` family, or `next/font/local` for a self-hosted
  file — nothing else changes) and keep `--font-sans` pointing at its CSS
  variable. This is the one sanctioned code-surface change for fonts.
- **Multi-script note:** Geist is loaded `latin`-only. Japanese/Chinese/Korean
  and Russian render through the documented system-font fallback stack in the
  `body` rule (`Noto Sans JP/KR/SC`, system CJK/Cyrillic). Do not add CJK
  webfonts — the payload cost is not justified. If a translated page's
  fallback looks wrong, adjust the fallback stack in `globals.css`.
- **Type conventions** (component-level, not tokens): page headings
  `text-3xl font-bold tracking-tight`, section headings `text-xl font-semibold`,
  meta/overline `text-sm font-semibold uppercase tracking-wide
  text-muted-foreground`, body `text-sm/base`, status `text-xs`. Font sizes and
  weights stay Tailwind utilities so every locale inherits fluid behavior.
- **RTL:** not currently supported (no RTL locale in the inventory). Layouts
  use flex/grid with gap-based spacing, so a future RTL locale is mostly a
  `dir` + text-alignment change, but it is not part of the current contract.

## 4. Interface Translations — `config/i18n/*.json`
### Ready-to-use palette recipes

Paste each pair (light `:root` values + dark block values) into `globals.css`
to preview a whole different brand. Validate the pairs you use per the note
above.

**Corporate Slate** — navy/slate on crisp white:

```css
/* light */ --background:#ffffff; --foreground:#0f172a; --muted-foreground:#475569;
--muted:#f1f5f9; --card:#f1f5f9; --card-foreground:#0f172a; --border:#e2e8f0;
--input:#e2e8f0; --accent:#f1f5f9; --primary:#1d4ed8; --primary-foreground:#ffffff;
--secondary:#e2e8f0; --secondary-foreground:#0f172a; --success:#15803d;
--destructive:#dc2626; --destructive-foreground:#ffffff; --ring:#1d4ed8;
/* dark */ --background:#0f172a; --foreground:#e2e8f0; --muted-foreground:#94a3b8;
--muted:#1e293b; --card:#1e293b; --card-foreground:#e2e8f0; --border:#334155;
--input:#334155; --accent:#1e293b; --primary:#93c5fd; --primary-foreground:#0f172a;
--secondary:#1e293b; --secondary-foreground:#e2e8f0; --success:#4ade80;
--destructive:#f87171; --destructive-foreground:#450a0a; --ring:#93c5fd;
```

**Modern Tech** — charcoal with emerald accents:

```css
/* light */ --background:#ffffff; --foreground:#111827; --muted-foreground:#4b5563;
--muted:#f3f4f6; --card:#f3f4f6; --card-foreground:#111827; --border:#e5e7eb;
--input:#e5e7eb; --accent:#ecfdf5; --primary:#047857; --primary-foreground:#ffffff;
--secondary:#e5e7eb; --secondary-foreground:#111827; --success:#047857;
--destructive:#dc2626; --destructive-foreground:#ffffff; --ring:#047857;
/* dark */ --background:#111827; --foreground:#f9fafb; --muted-foreground:#9ca3af;
--muted:#1f2937; --card:#1f2937; --card-foreground:#f9fafb; --border:#374151;
--input:#374151; --accent:#064e3b; --primary:#34d399; --primary-foreground:#064e3b;
--secondary:#1f2937; --secondary-foreground:#f9fafb; --success:#34d399;
--destructive:#f87171; --destructive-foreground:#450a0a; --ring:#34d399;
```

**Warm Minimalist** — sand, terracotta, warm neutrals:

```css
/* light */ --background:#faf9f6; --foreground:#292524; --muted-foreground:#57534e;
--muted:#f5f0e8; --card:#f5f0e8; --card-foreground:#292524; --border:#e7e0d3;
--input:#e7e0d3; --accent:#f5f0e8; --primary:#c2410c; --primary-foreground:#ffffff;
--secondary:#e7e0d3; --secondary-foreground:#292524; --success:#15803d;
--destructive:#b91c1c; --destructive-foreground:#ffffff; --ring:#c2410c;
/* dark */ --background:#1c1917; --foreground:#e7e5e4; --muted-foreground:#a8a29e;
--muted:#292524; --card:#292524; --card-foreground:#e7e5e4; --border:#44403c;
--input:#44403c; --accent:#44403c; --primary:#fdba74; --primary-foreground:#431407;
--secondary:#292524; --secondary-foreground:#e7e5e4; --success:#4ade80;
--destructive:#fca5a5; --destructive-foreground:#450a0a; --ring:#fdba74;
```

**Bold Vibrant** — midnight indigo with violet accents:

```css
/* light */ --background:#ffffff; --foreground:#1e1b4b; --muted-foreground:#6b7280;
--muted:#eef2ff; --card:#eef2ff; --card-foreground:#1e1b4b; --border:#e0e7ff;
--input:#e0e7ff; --accent:#eef2ff; --primary:#4f46e5; --primary-foreground:#ffffff;
--secondary:#e0e7ff; --secondary-foreground:#1e1b4b; --success:#15803d;
--destructive:#dc2626; --destructive-foreground:#ffffff; --ring:#4f46e5;
/* dark */ --background:#131135; --foreground:#e0e7ff; --muted-foreground:#a5b4fc;
--muted:#1e1b4b; --card:#1e1b4b; --card-foreground:#e0e7ff; --border:#312e81;
--input:#312e81; --accent:#312e81; --primary:#a5b4fc; --primary-foreground:#1e1b4b;
--secondary:#1e1b4b; --secondary-foreground:#e0e7ff; --success:#4ade80;
--destructive:#f87171; --destructive-foreground:#450a0a; --ring:#a5b4fc;
```

### SEO & social preview

Every page is search-, crawler-, and social-ready **by default** — there is no
per-page SEO configuration to fill in:

- **Metadata** — each route emits `title`, `description`, canonical URL,
  `hreflang` alternates, OpenGraph (`og:title`, `og:description`, `og:url`,
  `og:type`, `og:site_name`, `og:locale`, `og:locale:alternate`,
  `og:image`) and Twitter card metadata. All of it is derived deterministically
  from `site.config.json`, the localized content, and the regional page
  bindings — never hardcoded.
- **Social preview image** — the generated `/{locale}/opengraph-image` route is
  referenced automatically by every page's `og:image`/`twitter:image`. It is
  generated from your config values (site name, localized tagline) by
  `src/app/[locale]/opengraph-image.tsx`; edit that file's fixed brand colors
  only if you want the preview to match your palette.
- **Sitemap & robots** — `sitemap.xml` covers every configured locale, content
  page, offering, legal document, and regional page (only genuinely configured
  combinations — never a 404); `robots.txt` references your absolute sitemap
  URL. Both derive from `site.url`.
- **Structured data (JSON-LD)** — global `Organization`/`LocalBusiness`,
  regional `LocalBusiness`, and per-offering `Service` are emitted
  automatically from the same resolved business/region data the visible UI
  uses, so machine-readable and human-readable data never drift.
  - Optional `site.logo` (an absolute URL, validated) feeds the JSON-LD `logo`.
  - `sameAs` comes from your configured `socialLinks` (never invented).
  - An offering's `Service.offers.price` is emitted ONLY when its `price`
    display string is a bare parseable number (an optional leading currency
    symbol is stripped but never recorded); `priceCurrency` is never emitted.
    Prices like `From $150` or `Custom Quote` simply omit `offers` — the
    Foundation never guesses a price or implies commerce semantics.
- **When you change `site.url`** (before go-live), every canonical, hreflang,
  sitemap, and robots reference updates automatically.

### Favicon & social preview
### Favicon & app icon

- Favicon / app icon: replace `src/app/icon.svg`.
- Social preview image: generated at build time by
  `src/app/[locale]/opengraph-image.tsx` from your config values. Its brand
  colors are fixed literals in that file (a generated brand asset) — edit them
  there if you want the preview to match your palette; the rest of the site
  re-brands purely through the token section above.

User-facing interface strings (nav labels, hero copy, section headings, 404
copy, the language-selector label) live in one JSON file per locale under
`config/i18n/`. These are the customizable translation data.

Adding a locale is **config + data work only** — no `src/` code needs to
change:

1. Register the locale in `i18n.locales` in `site.config.json`.
2. Create `config/i18n/<code>.json` matching the shape of the existing files.
   Each file carries:
   - `home.tagline` / `home.description` — the localized home-page hero copy
   - `navigation.items` — localized navigation labels keyed by href
     (`"/"`, `"/about"`, …). Missing keys fall back to the label configured
     in `site.config.json`, so pages you don't localize still work.
   - `language.label` — accessible label for the header language selector
   - `error` — copy for the error-recovery page (`title`, `message`,
     `tryAgain`, `returnHome`). Localized the same way the 404 copy is; the
     error page automatically follows the active locale.
   - `business` / `a11y` — business-hours and accessibility strings
3. Dictionaries are discovered automatically from the `config/i18n/`
   directory at build time and validated against the **Zod** `dictionarySchema`.
   A malformed file, a missing key, or a *configured locale with no dictionary
   file* fails the build with an actionable error — it never silently falls
   back to English. (`getDictionary()` falls back to the default locale only
   for locales that are NOT configured.)
4. Optionally translate pages under `content/pages/<code>/`.

Every locale is statically rendered and included in the sitemap with
hreflang alternates.

## 5. Features & Business Profile

Optional functionality is expressed as feature flags under `features` in
`site.config.json` and consumed by dedicated adapters. Every integration is
**optional** — the Foundation provides seams, not mandatory third-party
accounts. A site with no `features` block (or with a feature omitted) still
builds and runs normally; unconfigured integrations simply do not render.

Current feature flags:

- `analytics` — visitor analytics provider (e.g. `vercel`).
- `maps` — directions-deep-link provider for business locations (e.g. `google`).
- `booking` — static external booking action (e.g. `external-url`).
- `contact` — contact inquiry provider (`webhook` or the `stub` demo default).
- `offerings` — enables the offerings catalog routes.
- `testimonials` — enables the `/testimonials` listing (content-driven). *(Phase T)*
- `portfolio` — enables the `/portfolio` listing + `/portfolio/[slug]` case studies. *(Phase T)*
- `blog` — enables `/blog`, `/blog/[slug]`, and the static per-locale `/blog/rss.xml` feed. *(Phase T)*

### Business profile, locations & hours (`business` in `site.config.json`)

- **Timezone:** values must be valid IANA identifiers (e.g. `Asia/Jakarta`,
  `America/New_York`). Invalid zones fail configuration at build time.
  Resolution precedence: `location.timezone → business.timezone → "Etc/UTC"`.
- **Hours:** `intervals` list weekday ranges with 24-hour `HH:mm` times.
  `close < open` means *overnight* — `22:00–02:00` opens at 22:00 and stays
  open until 02:00 the next day. `open === close` is rejected as ambiguous.
- **Exceptional days:** `exceptional` entries override a single calendar date
  (in the location's timezone) — either `closed: true` or a custom interval,
  overnight included. They follow the same model as regular intervals.
- **UI:** the footer shows each location's weekly schedule with localized day
  labels, any exceptional/holiday dates, a timezone indicator, and a live
  "Open now"/"Closed" badge computed in the location's timezone.
- **Structured data:** the JSON-LD `LocalBusiness`/`Organization` block
  includes an `openingHoursSpecification` built from the configured intervals.

### Regionalized pages & operating context (`business.regions` + `business.pages`) — Phase K

When a business operates in more than one place — or wants different pages to
show different operational identities — configure **regions** instead of (or
alongside) the global model. A **Page** is `locale + content slug + optional
region`; a **Region** is the complete operational identity of that page.

```jsonc
"business": {
  "regions": {
    "toronto": {
      "timezone": "America/Toronto",          // required, valid IANA
      "name": "Toronto Studio",
      "address": { "street": "…", "city": "Toronto", "country": "Canada" },
      "geo": { "lat": 43.6473, "lng": -79.3963 },
      "phone": "+1 416 555 0142",
      "email": "toronto@example.com",
      "hours": {
        "monday":  [{ "open": "09:00", "close": "17:00" }],
        "tuesday": [{ "open": "09:00", "close": "17:00" }],
        // … every day is independently configurable …
        "saturday": [{ "open": "10:00", "close": "14:00" }],
        "sunday": [],                          // [] = closed, structurally
        "holidays": [
          { "date": "2026-12-25", "name": "Christmas Day", "closed": true },
          { "date": "2026-12-24", "name": "Christmas Eve",
            "intervals": [{ "open": "09:00", "close": "13:00" }] }
        ]
      }
    },
    "new-york": { /* America/New_York, its own address/hours/holidays */ }
  },
  "pages": [
    { "locale": "en", "slug": "toronto",   "region": "toronto" },
    { "locale": "en", "slug": "new-york",  "region": "new-york" },
    { "locale": "fr", "slug": "toronto",   "region": "toronto" }   // one region, many locales
  ]
}
```

Key rules:

- **Seven explicit days.** Hours are `monday` … `sunday`, each a list of
  `HH:mm` intervals. `[]` or an omitted day = closed (no fake times). Multiple
  intervals per day (e.g. split lunch hours) are supported; `close < open` is
  overnight and carries into the next day.
- **Holidays are structured overrides.** Precedence:
  *weekly schedule → holiday/special-date → resolved hours*. A holiday with
  `closed: true`, or one listed with only a `name`, closes the date; special
  `intervals` replace the weekly schedule for that date.
- **Timezone is region-authoritative.** Each region requires a valid IANA
  identifier. It is used for visible timezone text, hours evaluation, open/
  closed status, overnight carry, DST, and holiday evaluation. The timezone is
  NEVER inferred from locale, address, or any global/default value.
- **Isolation.** A regional page shows ONLY its region's address, phone, email,
  timezone, hours, holidays, status, directions, and JSON-LD. Other regions'
  data and any legacy global `business`/`locations` values never appear.
- **Deterministic modal precedence.** `business.regions` non-empty → regional
  mode (legacy footer NAP + global JSON-LD are suppressed). `business.regions`
  absent → the legacy global model renders exactly as before. The two never mix.
- **Pages are independent.** Create `content/pages/<locale>/<slug>.md` for each
  page (its existence makes the route real), add a `pages` binding to attach a
  region, and add navigation entries for discoverability. Locales may have
  different page sets; one locale may host several regional pages; one region
  may be reached from several locales.
- **Page→region errors fail the build:** a binding to a missing region, a
  duplicate `(locale, slug)`, an unconfigured locale, `local-international`
  without `addressInternational`, invalid holiday dates/names, bad `HH:mm`, or
  `open === close` are all rejected at configuration time.
- All demonstration region data is **fictional** — replace it before go-live.

### Locale + Location selectors and regional page URLs (`business.pages`) — Phase L

Locations are **selectors**, not navigation links. The location selector sits
beside the language selector in the header; together they determine which
page/footprint you are viewing. This removes the old location entries from the
main menu.

```jsonc
"business": {
  "regions": { "toronto": { …, "label": "Toronto" }, "new-york": { … } },
  "pages": [
    { "locale": "en", "region": "toronto" },                   // /en/toronto (Home)
    { "locale": "en", "region": "toronto", "slug": "about" },     // /en/toronto/about
    { "locale": "en", "region": "toronto", "slug": "connect" },   // /en/toronto/connect
    { "locale": "en", "region": "new-york" },                 // /en/new-york (Home)
    { "locale": "en", "region": "new-york", "slug": "about" },
    { "locale": "en", "region": "new-york", "slug": "connect" }
  ]
}
```

Key points:

- **URL model:** `/{locale}` (home), `/{locale}/{region}` (regional landing),
  `/{locale}/{region}/{page}` (regional page). Static routes (About/Contact/
  Resources/Offerings/Legal) stay where they are; a region whose id collides
  with a static route is rejected at build time.
- **Every bound `(locale, region)` needs a landing entry** (the bare `{
  locale, region }` line). A page entry without its landing fails the build.
  The Phase K `{ locale, slug: "toronto", region: "toronto" }` form is still
  accepted and migrated automatically.
- **Standardized 4-page layout & inventories:** The shipped template binds
  `Home` (landing), `About`, `Connect`, and `Offerings` for every configured operating city.
  Downstream adopters may configure different page inventories per locale × region;
  one region may exist in several locales.
- **Regional currency & offerings presentation:** Each region in `business.regions` can configure
  an ISO 4217 `currency` (e.g. `"AUD"`, `"GBP"`, `"EUR"`, `"JPY"`) and `currencySymbol` (e.g. `"A$"`,
  `"£"`, `"€"`, `"¥"`). The offerings catalog (`/{locale}/{region}/offerings`) automatically displays
  amounts in the selected city's currency, with an explicit demonstration disclaimer banner clarifying
  that the catalog items are template placeholders.
- **Switching behavior (deterministic, pure core):**
  - Location: keep the language; go to the same page in the target region, or
    its landing, or (as a defensive fallback) its first configured page.
  - Language: keep the region; go to the same page in the target locale, or
    its landing; locales that have no page for the current region are simply
    not offered (never a silent region change, never a dead link).
- **`region.label`** (falls back to `name`, then the id) is what the location
  selector shows. The selector is hidden for locales with no configured
  regions.
- **SEO:** canonical URLs, hreflang only for existing locale/region/page
  combinations, and the sitemap lists only configured routes.

### Selector semantics, region-aware navigation, Connect & identity (`connect` + region `defaultLocale`) — Phase M

Locations are **selectors**: the Location dropdown shows every configured
operating location (from `business.regions`) in alphabetical order, plus an
explicit **Unspecified** option — the list is never filtered by the current
language and is never lost after selecting a region. Option display labels
use contextual parenthetical notation:
- When viewing in a non-English language (`ko`, `ja`, `zh`, etc.): the city
  name in that language is displayed first, followed by the English name in
  brackets if distinct (e.g. `서울 (Seoul)`, `東京 (Tokyo)`, `Londres (London)`).
- When viewing in English: the English name is displayed; for cities whose
  primary operating language is non-English, the local name is appended in
  brackets if distinct (e.g. `Tokyo (東京)`, `Seoul (서울)`, `Moscow (Москва)`),
  while English-primary locations omit brackets (`London`, `Sydney`, `Toronto`).
The Language dropdown lists the default language (English) first, followed by
remaining languages in alphabetical order.

```jsonc
"business": {
  "regions": {
    "toronto": { …, "defaultLocale": "en" },   // the default audience language
    "new-york": { … }
  },
  "pages": [
    { "locale": "en", "region": "toronto" },
    { "locale": "fr", "region": "toronto" },
    { "locale": "fr", "region": "toronto", "slug": "about" },
    { "locale": "fr", "region": "toronto", "slug": "connect" }
  ]
},
"connect": {
  "methods": [
    { "id": "message", "label": "Message Us", "href": "/contact" },
    { "id": "email", "label": "Email", "href": "mailto:…", "demoOnly": true },
    { "id": "whatsapp", "label": "WhatsApp", "href": "https://wa.me/…", "demoOnly": true },
    { "id": "viber", "label": "Viber", "href": "viber://chat?number=…", "demoOnly": true }
  ]
}
```

Key behavior:

- **`region.defaultLocale` (optional).** The deterministic locale chosen when a
  location switch arrives from an unsupported language (`/de` → Toronto →
  `/en/toronto`). Must be a configured locale AND bound to the region (build
  error otherwise). Absent → derived from the region's first landing binding.
  Never inferred from country/timezone/browser.
- **Unspecified returns you to generic:** `/en/toronto/about` → *Location:
  Unspecified* → `/en/about`; `/de/berlin` → `/de`. Generic pages have no
  operating identity (no invented address/timezone/JSON-LD).
- **Region-aware navigation.** Inside a region, primary/footer navigation shows
  only pages that exist for that locale + region (e.g. Home/About/Connect, no
  fake Resources). Home always means **this region's home**. A nav item never
  silently redirects.
- **Connect first-class.** Primary nav exposes **Connect** (not Contact). The
  `/connect` page renders the configured `connect.methods` (internal page or
  `mailto:`/`tel:`/`https:` deep link), badges `demoOnly` entries, and always
  shows a visible demo notice. The Contact page (`/contact`) remains, with a
  visible "not connected to a real backend" notice. Footer: **Contact** lives
  under a dedicated **Connect** column (never under Navigate).
- **`connect.methods`** are the adopter's configurable connection inventory —
  no provider integrations; `demoOnly` = template demonstration.
- **Template identity.** The Foundation demo names itself **Your Business
  Site**; keep or replace it. The old "My Site" placeholder is gone from
  visitor-facing copy.

### Presentation localization, timezone heading & Connect gateway (Phase M refinement)

- **Localized + English display names.** Add `englishLabel` to each
  `i18n.locales[]` entry (`Français` + `englishLabel: "French"` → the Language
  selector shows `Français (French)`; never `English (English)`). Add
  `region.labels[locale]` for localized **location** names — canonical English
  stays `region.label ?? name ?? id` (`labels: { "ja": "東京" }` shows
  `東京 (Tokyo)`; `Montréal` + `labels: { "fr": "Montréal" }` shows
  `Montréal (Montreal)` in French and `Montreal` in English). Presentation
  only — region ids remain language-neutral.
- **Timezone inside the Business Hours heading.** `RegionBlock`/`BusinessInfo`
  render `Hours (Time Zone: <localized (<English>) — <IANA>)` as ONE heading.
  Human names come from the platform `Intl` table (no translation data); the
  English parenthetical is omitted when identical; the IANA identifier is
  always shown. Requires `dictionary.business.hoursTimeZoneLabel` per locale.
- **Footer Connect = gateway.** The section heading IS the `/connect` link
  (resolved exactly like the header). Beneath it only the configured
  connection methods appear — no duplicate Connect, no separate Contact item.
  The `/contact`-backed action is called **Message Us** (`connect.methods`
  label + `dictionary.connect.methods.message` override); the route stays
  `/contact`. Internal actions are omitted in regional contexts where `/contact`
  is not a regional page; external deep links (mailto/tel/https/viber) never
  reset locale or location.
- **`getDictionary(locale).connect.methods`** optionally override method labels
  per locale (the footer and Connect page share `connectMethodLabel`); proper
  nouns (WhatsApp, Telegram, Viber) typically keep the config label.
- **Viber.** Add it like any other method: `{ "id": "viber", "label": "Viber",
  "href": "viber://chat?number=…", "demoOnly": true }`. Configuration-only —
  no SDK/API/backend.

### Locale-specific business address, phone & geo (`locations[].locales`)

By default a location's address, phone and geo are **global** — the same for
every locale. If you want a visitor to a specific locale to see market-appropriate
business data instead of the global/head-office location, add a per-locale
override to that location:

```jsonc
"business": {
  "locations": [
    {
      "id": "main",
      "address": {
        "street": "1 Demo Street",
        "city": "Jakarta",
        "country": "Indonesia"
      },
      "phone": "+62 21 0000 0000",
      "geo": { "lat": -6.2, "lng": 106.816 },
      "locales": {
        "de": {
          "address": { "city": "Example City", "country": "Example Land" },
          "phone": "+49 30 0000 0000",
          "geo": { "lat": 52.52, "lng": 13.405 }
        }
      }
    }
  ]
}
```

Key points:

- **`locales` is optional.** A location without it behaves exactly as today
  (global data for every locale).
- The `locales` map is keyed by **BCP-47 locale code** (the same codes used in
  `i18n.locales`). Adding an override for a locale is a pure
  configuration/data change — no `src/` platform code edit.
- **A locale is a visitor context, not a geographic mapping.** The Foundation
  makes no assumption that `de`⇄Germany, `ja`⇄Japan, `id`⇄Indonesia, etc. You
  decide, in this file, whether a given locale should present different data.
- **Each override is partial.** Only the fields you set replace the global
  values: `address` is merged **per field** (unset fields like `street`,
  `postalCode`, `country` are inherited from the global address), and unset
  `phone`/`geo` are inherited.
- **Fallback chain:** locale override → global location data → existing behavior.
  A locale with no entry always falls back to the global data, never an error.
- **Timezone and hours are NOT localized in this model.** They stay at the
  location level and are a single global truth (operating schedules, not
  identity/presentation).
- **Structured data follows the same rule:** the footer *and* the JSON-LD
  resolve through the same mechanism, so a localized address never diverges
  between the visible footer and structured data.
- **Only supply real business/location data** appropriate to your own
  operation. The Foundation ships no fabricated localized addresses as
  production data; treat the example above (clearly fictional) as schema
  illustration only.

> **What the shipped Foundation demo configuration uses.** To visually prove the
> Phase G pipeline (`locale → locale-resolved location → address → geo →
> directions`), the Foundation's default `site.config.json` ships per-locale
> overrides pointing at recognizable **public landmarks** (e.g. `en` → Big Ben /
> Westminster, London; `id` → Monas, Jakarta; `de` → Brandenburg Gate, Berlin;
> `fr` → Eiffel Tower, Paris; `es` → Puerta del Sol, Madrid; `ja` → Tokyo Tower,
> Tokyo; `ko` → Gyeongbokgung Palace, Seoul; `zh` → The Bund, Shanghai).
> **This is Foundation demonstration data only** — it does NOT imply that the
> template author or Provelopment operates from those locations. Replace all of
> it with your real business data before go-live.

### Customer-facing contact per locale (`business.contact.locales`)

The footer's **customer-facing** contact channels (email + phone) can be
configured independently for each locale. Configure them once on the business
contact block; a visitor to a locale sees that locale's values instead of a
silently global number:

```jsonc
"business": {
  "contact": {
    "email": "hello@example.com",  // global fallback
    "locales": {
      "de": { "phone": "+49 30 0000 0000", "email": "hallo@example.de" },
      "fr": { "phone": "+33 1 0000 0000" } // partial: email inherits global
    }
  }
}
```

- **`locales` is optional.** No `locales` (or no entry for a locale) falls back
  to the global contact values — a globally-fixed business is a valid state.
- **A locale is a customer context, not a country.** The Foundation never infers
  a phone number from a locale; you supply exactly the per-market values you want.
- **Precedence:** locale override → global business contact. Locale-specific
  email and phone are independent (per-field fallback).
- The location-level `locations[].phone` capability remains supported — use it
  for a specific branch's number. **Customer-facing contact display** (the
  footer top block + JSON-LD) reads `business.contact` (locale-resolved). If you
  want a per-market number shown to visitors, configure
  `business.contact.locales`.

### Native/local + optional Latin/international address

A location can carry **two structured representations** of the same place:

- `address` — the native/local form (what a local customer reads).
- `addressInternational` — an optional Latin/international form for global /
  cross-border consumers (**owner-supplied**; the Foundation never transliterates).
- `addressMode` — `"local"` (default) or `"local-international"`.

```jsonc
"locations": [{
  "id": "main",
  "address": { "street": "東京都港区芝公園4丁目2-8", "city": "東京都港区", "country": "日本" },
  "addressInternational": { "street": "4-2-8 Shibakoen, Minato City", "city": "Tokyo", "country": "Japan" },
  "addressMode": "local-international"
}]
```

- **`"local"`** (the default, or omitted) shows only the native/local address.
  This is right for a business serving primarily local customers, or any
  Latin-script locale where there is no meaningful second representation — no
  artificial duplication is needed.
- **`"local-international"`** shows the native/local address **followed by** the
  Latin/international address. **It requires `addressInternational`** — requesting
  this mode without one is a **configuration error** (fail-fast at build time,
  naming the offending location/locale), because silently dropping the Latin form
  would hide a mistake. Local-only businesses simply omit `addressInternational`
  and use the default `local` mode.
- Both representations are **owner-supplied business data**. No transliteration,
  translation or geocoding service is invoked.
- **Precedence / inheritance** mirrors Phase G: a locale override can supply its
  own `address`, `addressInternational` and/or `addressMode`; each is inherited
  per-field / per-value from the location base when not overridden. Absent mode
  defaults to `local`.
- **What each consumer uses (all from the same resolved location):**
  - **Visible footer** follows `addressMode` (native only, or native + Latin).
  - **JSON-LD (structured data)** uses `addressInternational` when supplied,
    otherwise `address` — for global machine readability.
  - **Directions/maps** use geo coordinates when present; otherwise the address
    query prefers `addressInternational`, else `address`.
- The Foundation ships `ja`/`ko`/`zh` demo locales in **local-international** mode
  and the Latin-script locales (`id`/`en`/`de`/`fr`/`es`) in **local** mode —
  **demonstration landmarks only**, replace with your real data.

### Booking label requirement (when `features.booking` is enabled)

If you enable booking (`features.booking.provider = "external-url"`), **every
configured locale** must provide a localized `booking.book` label in
`config/i18n/<locale>.json`. A missing label is a build/configuration error
naming the offending locale(s) — an enabled booking CTA must never silently
disappear just because one locale lacks its button text. Disabling booking (or
omitting it) requires no label.

### Maps directions (`features.maps`)

The footer turns each business-location address into a "Get directions" link via
a **provider-neutral** seam. Configure which provider builds the link:

```jsonc
"features": {
  "maps": { "provider": "google" } // or "none"
}
```

- **`google`** (default demo) — a **keyless** deep link to Google Maps built from
  the **locale-resolved** location (geo coordinate when present, otherwise the
  address query). No API key, no account, no SDK, no network call.
- **`none`** or **no `features.maps`** — no directions link is rendered; the
  address still shows as plain text. The site works unchanged.
- The directions link always follows Phase G localization: a German visitor sees
  the German location's coordinates, an English visitor the London coordinates,
  etc. There is no locale→geography inference in platform code.
- Adding a different maps provider later (Apple Maps, OpenStreetMap, …) is a
  new adapter + a config value change — no component or platform-code rewrite.

### Booking action (`features.booking`)

The home page can show a modest static "Book" CTA linking to your external
scheduler or booking page:

```jsonc
"features": {
  "booking": {
    "provider": "external-url",
    "url": "https://your-scheduler.example/book"
  }
}
```

- **`external-url`** — renders a static external-link CTA to the **public**
  `url` (this is configuration, not a secret).
- **`none`** or **no `features.booking`** — no CTA is rendered; the site works
  unchanged.
- **Misconfiguration fails loudly:** `external-url` without a valid `url` is
  rejected at build/schema time (and throws a typed
  `BookingMisconfigurationError` at runtime) — it never silently degrades to a
  hidden `none` state, so a deployment error is caught immediately.
- This phase is a **static action only**: no Calendly/Google Calendar SDK, no
  OAuth/account credentials, no embedded scheduling widget. Future calendar
  providers (Calendly, Google Calendar, Apple Calendar, ICS, …) plug in as
  adapters behind the same seam.

### Analytics (`features.analytics`)

```jsonc
"features": {
  "analytics": { "provider": "vercel" } // or "none" — the explicit off state
}
```

- **`vercel`** mounts Vercel Web Analytics exactly as before — no new data
  collection is introduced.
- **`none`** (or **no `features.analytics`**) — no analytics is mounted; the
  site works unchanged. `provider: "none"` is an additive schema capability
  that makes the disabled state explicit (`features.analytics` untouched or
  absent behaves identically).
- **Loud failure:** a provider value that reaches the adapter factory with no
  registered adapter throws `AnalyticsMisconfigurationError` (the config
  schema rejects unknown providers at build time first; the factory throw is
  the defensive runtime contract). Analytics never silently disappears.
- Provider selection happens in the analytics adapter factory, not in
  application/layout code. Adding another provider later (GA4, Plausible, …) is
  an adapter + config change, not an application rewrite.

### Analytics privacy posture (audited — documentation only, Phase U)

The Foundation ships **no consent gate** — no banner, no consent cookie, no opt-in
gating of the analytics element. The following is the technically verified posture of the
shipped `features.analytics: { "provider": "vercel" }` integration (audited during
Phase U against the installed `@vercel/analytics` v2.0.1 package and the built
output), plus Vercel's own product description where noted:

- **Loads client-side only.** Analytics is composed through the Phase I adapter factory
  and injected by the **browser after hydration** (a `defer` script appended to
  `document.head`, deduplicated by `src`). It never appears in SSR HTML;the built
  server output contains no `/_vercel/insights` or analytics markup.
- **The inspected client loader writes no browser cookies/storage.** The
  `@vercel/analytics` client runtime (`dist/index.mjs`) contains zero references to
  `cookie`, `localStorage`, or `sessionStorage`;the package's only `cookie`
  references live in its server-side request-forwarding helper (`dist/server/*`),
  which the Foundation does not use.
- **The production script is same-origin.** The client injects
  `/_vercel/insights/script.js` (or `{basePath}/insights/script.js`) served from
  the site's own origin;events post to same-origin `/_vercel/insights/*`.
- **Vercel describes Web Analytics as cookieless and anonymized.** Vercel's docs state
  it "only stores anonymized dataand does not use cookies" and is built into its
  platform (no third-party service required). That is Vercel's claim about its
  product — attributed as such — not a Foundation legal conclusion.

- **Adopter responsibility.** When you change providers, add tracking or marketing
  integrations, or operate in a jurisdiction with specific rules, **you** determine
  whatever privacy/consent requirements apply to your configuration. The shipped
  template Cookie Policy (`content/legal/<locale>/cookies.md`) is replaceable template
  content, not legal advice—and `features.analytics: { "provider": "none" }`
  disables analytics entirely if you prefer.

### Contact inquiries (`features.contact` + `/contact`)

The `/contact` page and contact form are the inquiry capability. It is
**content-driven** (`content/pages/<locale>/contact.md` — the sitemap picks the
route up automatically) and **config-driven**:

```jsonc
"features": {
  "contact": {
    "provider": "webhook",        // or "stub" (the explicit demo default)
    "fields": { "subject": true } // optionally hide the subject field
  }
}
```

- **No `features.contact`** → the page shows an explicit "contact form is not
  configured" state. **`provider: "stub"`** (default) → the form works but every
  submission shows "Demo mode: nothing was sent." **`provider: "webhook"`** →
  the form delivers to your endpoint. Foundation never stores, emails, or
  processes inquiries itself — it only forwards to the receiver you connect.
- **Webhook configuration is environment-only** (never in `site.config.json`):
  - `CONTACT_WEBHOOK_URL` — the receiver endpoint (must be `https://` for
    non-local endpoints).
  - `CONTACT_WEBHOOK_TOKEN` (optional) — sent as an `Authorization: Bearer`
    header.
  - If `provider: "webhook"` is set but `CONTACT_WEBHOOK_URL` is missing, the
    form fails loudly with a "misconfigured" state (it will NOT pretend to be
    the demo).
- **Payload** (POST, `application/json`):
  `{ id (UUID), name, email, subject?, message, locale, submittedAt }` — a
  minimal, stable contract. No visitor IP/user-agent/cookies are included.
- **Success wording is precise:** "Your inquiry was submitted successfully"
  means your receiver accepted it — not that a human read it.
- **Security/privacy built in:** same-origin server action (Next.js origin
  check), invisible honeypot field that silently discards bots, shared Zod
  validation, `aria-live` status, no inquiry contents logged.
- **Rate limiting/anti-abuse at scale is your responsibility** — enforce at
  your edge/receiver. Foundation is a frontend + integration seam, not an
  email/spam platform.

### Outbound integration seams — at a glance

Every outbound connection a visitor can trigger is modeled as a **visitor
intent** and served through a small, provider-neutral seam. The Foundation
ships the seams, not the providers: there is no provider SDK, no vendor
account, and no provider-specific code outside `src/adapters/<capability>/`.
Phase I (release `v2026.09.03-foundation-phase-i-outbound-seams`) verified
this contract as a whole; per-capability detail lives in the sections above.

| Intent | Feature key | Providers | Off state | Misconfigured → | Env secrets |
| --- | --- | --- | --- | --- | --- |
| Book | `features.booking` | `external-url` | `none` (or absent) | loud `BookingMisconfigurationError` (never a silent no-CTA) | none |
| Directions | `features.maps` | `google` (keyless) | `none` (or absent) | none by construction (keyless) | none |
| Inquiry | `features.contact` | `webhook` / `stub` | `stub` (explicit demo) | loud `ContactInquiryMisconfigurationError` (never the demo) | `CONTACT_WEBHOOK_URL` (+ optional token) **env-only** |
| Analytics | `features.analytics` | `vercel` | `none` (or absent) | loud `AnalyticsMisconfigurationError` (never silent nothing) | none |
| Connect/Message | `connect.methods` | config deep links (`mailto:`, `tel:`, `https:`, `whatsapp:`, `viber:`, …) | omit the method; `demoOnly` badges mark template demos | schema rejects malformed `href`/duplicate ids | none |

Unifying rules:

- **Explicit off states.** Every seam has an explicit disabled state; absent
  config and `"none"` behave identically.
- **No breaking schema or public contract changes across releases; additive
  configuration support only where required.** Phase I added no provider and
  no new dependency; the only schema addition is the explicit
  `analytics: "none"` off state.
- **Secrets are environment-backed only.** Nothing secret ever lives in
  `site.config.json`, `config/`, or `content/`; webhook secrets are read
  lazily from `process.env` by the contact server action.
- **Privacy by default.** Contact webhook payloads are minimal
  (`id`, `name`, `email`, `subject?`, `message`, `locale`, `submittedAt`) —
  no IP, user-agent, cookies, or referrer. Every outbound anchor renders with
  `rel="noreferrer" target="_blank"`.
- **Loud failure.** A configured-but-invalid provider is rejected by the
  config schema at build time and, defensively, throws a typed
  `*MisconfigurationError` at its factory — it never silently degrades to the
  disabled/demo state.

Adding a new provider (e.g. a second maps provider) is a local change: a new
adapter file in the capability directory, a factory branch, and a schema enum
extension — **no** `src/app`, `src/components`, `src/core`, or
`src/application` rewrite. This milestone deliberately ships no new provider.
## 6. Deploying

The template deploys to Vercel directly from a Git repository. Follow
[`DEPLOYMENT.md`](DEPLOYMENT.md): create a Vercel project from your repo,
add your custom domain, and run through the go-live checklist.

## 7. Staying Up to Date With Upstream

Keep your clone connected to the template repository so you can pull
improvements:

```bash
git remote add upstream https://github.com/provelopment/provelopment.git
git fetch upstream
git merge upstream/main
```

Because your changes are confined to configuration, content, and assets,
merges are usually clean. When conflicts appear, your versions of
`site.config.json`, `content/`, and asset files win; upstream wins for
platform code unless you deliberately changed it.

## 8. Validating Your Changes

Before committing or deploying, run the validation gate:

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build
```
