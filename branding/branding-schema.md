### Provelopment Brand Identity & Design System Specification

> **Scope:** the brand *system* specification — identity, palette, typography,
> logo anatomy and the downstream contract. The **authoritative technical asset
> contract** (every runtime role, filename, format, geometry rule, availability
> behaviour and swap procedure) lives in [`../BRAND_ASSETS.md`](../BRAND_ASSETS.md).
> This document points at it rather than duplicating it; where the two differ,
> `BRAND_ASSETS.md` governs.
>
> Brand artwork is **downstream-configurable and file-swappable**. Foundation
> source code carries **no** brand identity: a downstream site brands itself
> through `site.config.json`, content and CSS variables only.

**Brand Identity & Platform Overview**

- **Brand Name**: Provelopment
- **Parent open-source initiative**: the Provelopment Foundation
- **Commercial platform**: provelopment.com — a downstream *expression* of this
  system, not the template's identity
- **Tagline**: Open-Source Web Platform for Modern Business
- **Mission**: a clean, accessible, multi-lingual, hexagonal web-platform template
  that empowers small businesses to build a durable digital presence
- **Core philosophy**: the Foundation owns presentation, content and external
  integration seams — never internal operational systems (CRMs, scheduling
  backends, billing ledgers)

---

### Brand Color Palette & Design Tokens

All tokens are defined in `src/app/globals.css` as standard Tailwind CSS v4
variables. Downstream sites re-theme by overriding the CSS variables — not by
editing components.

| Role | Color Name | Hex Code | Purpose & Usage |
| --- | --- | --- | --- |
| **Primary** | Provelopment Crimson | `#C5161D` | Network-node globe emblem, primary action CTAs, active states, key focal points. |
| **Primary Hover** | Deep Crimson Accent | `#A11217` | Hover and active tap states on primary interactive elements. |
| **Neutral Dark** | Dark Slate Navy | `#0F172A` / `#1E293B` | Main typography, primary wordmark, dark-mode backgrounds, deep headers. |
| **Accent / Auxiliary** | Regulatory Amber Gold | `#B45309` | Trust badges, statutory fee tags, credential verifications, secondary highlights. |
| **Accent Hover** | Deep Amber | `#92400E` | Hover states for auxiliary badges and interactive tags. |
| **Surface (Light)** | Pure White | `#FFFFFF` | Default canvas background, card surfaces, squircle icon containers. |
| **Surface Subtle** | Cold Ice / Off-White | `#F8FAFC` | Sub-sections, subtle hero gradient tints, alternating table stripes, card borders. |
| **Border / Divider** | Crisp Slate Border | `#E2E8F0` | Separation lines, input borders, structured grid dividers. |
| **Body Text** | Slate Gray | `#334155` | Paragraphs, documentation prose, body copy. |

---

### Typography & Hierarchy

The brand uses a geometric, high-contrast sans-serif pairing designed for
legibility across web and mobile viewports:

- **Primary heading typeface**: Inter, Plus Jakarta Sans or Geist Sans
  - *Weights*: Bold (`700`), ExtraBold (`800`)
  - *Letter spacing*: negative tracking (`-0.025em`) for modern technical authority.
- **Secondary subheading / eyebrow**: all-caps tracking (`letter-spacing: 0.15em`)
  - *Weights*: Medium (`500`) or SemiBold (`600`)
  - *Usage*: section badges, Foundation labels, statutory metadata.
- **Body typeface**: Inter or the system UI sans-serif
  (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`)
  - *Weights*: Regular (`400`), Medium (`500`)
  - *Line height*: comfortable (`1.6 – 1.7`) for documentation and
    legal/informational readability.

---

### Visual Mark & Logo Anatomy

- **The emblem**: a 3D-perspective network globe constructed from interconnected
  circular nodes and dynamic connective lattice links.
  - *Meaning*: global scale, modular architecture (Hexagonal Ports & Adapters),
    interconnected systems, and open-source infrastructure.
  - *Geometry*: asymmetric, forward-leaning perspective with satellite nodes
    floating around the primary core lattice.
- **The wordmark**:
  - **"Provelopment"**: heavy sans-serif bold, sentence case, in `#0F172A`
    (or `#FFFFFF` on dark backgrounds).
  - **"FOUNDATION"**: positioned directly beneath or adjacent to the wordmark in
    clean, widely spaced uppercase (`letter-spacing: 0.25em`).
- **Minimum clear space**: maintain clear space equal to 50% of the emblem's
  diameter around all logo compositions.

---

### Digital Asset Architecture

> The **complete and authoritative** role / filename / format / geometry contract
> — every runtime asset role, its config key, its fallback and availability
> behaviour, and the replacement procedure — is
> [`../BRAND_ASSETS.md`](../BRAND_ASSETS.md). The summary below is orientation
> only; where the two differ, `BRAND_ASSETS.md` governs.

Asset roles are **config-driven**. Each role is declared under `site.assets` in
`site.config.json` as a URL, and the runtime resolves it to a same-origin
`public/assets/<basename>` path — so a swap is a file operation, never a code
change.

- **Identity mark / logo** — `site.assets.logo`: rendered in the site header as
  the brand link's `<img>`.
- **Footer logo** — `site.assets.logoFooter`: the independent footer identity
  mark (distinct from any decorative footer graphic).
- **Favicon** — `site.assets.favicon`: the **single authoritative** tab icon. The
  locale layout declares it once inside `generateMetadata()`
  (`icons.icon = assetPathFromUrl(siteConfig.assets?.favicon)`), which re-derives
  the same-origin path so the icon can never 404 on a hostname mismatch. There is
  **no** competing file-based icon route.
- **Open Graph / social image** — `site.assets.ogImage`: the Open Graph and
  Twitter card image, resolved per locale by `resolveOgImageUrl`.
- **Decorative graphics** (each optional and independently omittable):
  `site.assets.banners`, `site.assets.backgrounds`, `site.assets.headerGraphic`,
  `site.assets.footerGraphic`, `site.assets.statusGraphic`.

**No PWA / installable-app icon roles exist.** The Foundation emits no web-app
manifest, no service worker and no `apple-touch-icon`; there are no
installable-app icon roles to replace or maintain. The `viewport` `theme-color`
declaration is mobile-browser chrome, not a manifest `theme_color`.

---

### Downstream Contract & Layout Integration

All branding is downstream-configurable, preserving the invariant: **Foundation
source code remains unbranded; downstream sites brand purely via config, content
and CSS variables.**

**Site configuration — illustrative shape.** Every value below is a placeholder;
a real deployment replaces them with its own. The shape mirrors the Foundation's
own `site.config.json`.

```json
{
  "$schema": "./src/config/schema.json",
  "site": {
    "url": "https://www.example.com",
    "name": "Example Business",
    "tagline": "A production-grade, configurable website foundation for small businesses",
    "description": "…",
    "assets": {
      "logo": "https://www.example.com/assets/logo-header.svg",
      "logoFooter": "https://www.example.com/assets/logo-footer.svg",
      "favicon": "https://www.example.com/assets/favicon.svg",
      "ogImage": "https://www.example.com/assets/og-image.png"
    }
  },
  "i18n": {
    "defaultLocale": "en",
    "locales": [{ "code": "en", "label": "English", "englishLabel": "English" }]
  },
  "ui": { "preset": "adaptive" }
}
```

`site.url` — not a hardcoded hostname — is the single source of the site's origin.
It drives `metadataBase`, canonical URLs, hreflang alternates, the sitemap and the
Open Graph URLs; asset URLs are authored against it so every asset resolves
same-origin.

**Metadata is generated, not hardcoded.** `src/app/[locale]/layout.tsx` exports
`generateMetadata()`, which derives the title template, description, Open Graph,
Twitter card, favicon and language alternates from `site.config.json`. There is no
static icon block and no per-deployment metadata edit:

```typescript
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
    description: siteConfig.description,
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      ...(siteConfig.assets?.ogImage ? { images: [{ url: siteConfig.assets.ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(siteConfig.assets?.ogImage ? { images: [siteConfig.assets.ogImage] } : {}),
    },
    icons: { icon: assetPathFromUrl(siteConfig.assets?.favicon) },
    alternates: {
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
      }),
    },
  };
}
```

To change any branding value, edit `site.config.json` (or replace the file in
`public/assets/`) — never the component or the metadata generator. See
[`../CUSTOMIZING.md`](../CUSTOMIZING.md) for the full configuration schema and
[`../BRAND_ASSETS.md`](../BRAND_ASSETS.md) for the asset contract.