### Provelopment Brand Identity & Design System Specification

**Brand Identity & Platform Overview**

* **Brand Name**: Provelopment
* **Parent Open-Source Initiative**: Provelopment Foundation[cite: 1]
* **Commercial Platform**: provelopment.com[cite: 2]
* **Tagline**: Open-Source Web Platform for Modern Business[cite: 1]
* **Mission**: A clean, accessible, multi-lingual, and hexagonal web platform template empowering small businesses to build a durable digital presence[cite: 1].
* **Core Philosophy**: Foundation owns presentation, content, and external integration seams—never internal operational systems (CRMs, scheduling backends, or billing ledgers)[cite: 1, 2].

---

### Brand Color Palette & Design Tokens

All tokens are defined in `src/app/globals.css` using standard Tailwind CSS v4 variables[cite: 1, 2, 7]:

| Role | Color Name | Hex Code | Purpose & Usage |
| --- | --- | --- | --- |
| **Primary** | Provelopment Crimson | `#C5161D` | Network node globe emblem, primary action CTAs, active states, key focal points[cite: 2, 8]. |
| **Primary Hover** | Deep Crimson Accent | `#A11217` | Hover and active tap states on primary interactive elements. |
| **Neutral Dark** | Dark Slate Navy | `#0F172A` / `#1E293B` | Main typography, primary wordmark, dark-mode backgrounds, deep headers[cite: 2]. |
| **Accent / Auxiliary** | Regulatory Amber Gold | `#B45309` | Trust badges, statutory fee tags, credential verifications, secondary highlights[cite: 2]. |
| **Accent Hover** | Deep Amber | `#92400E` | Hover states for auxiliary badges and interactive tags[cite: 2]. |
| **Surface (Light)** | Pure White | `#FFFFFF` | Default canvas background, card surfaces, squircle icon containers[cite: 2, 8]. |
| **Surface Subtle** | Cold Ice / Off-White | `#F8FAFC` | Sub-sections, subtle hero gradient tints, alternating table stripes, card borders[cite: 2]. |
| **Border / Divider** | Crisp Slate Border | `#E2E8F0` | Separation lines, input borders, structured grid dividers[cite: 2]. |
| **Body Text** | Slate Gray | `#334155` | Paragraphs, documentation prose, body copy[cite: 2]. |

---

### Typography & Hierarchy

The brand uses a geometric, high-contrast sans-serif pairing designed for legibility across web and mobile viewports:

* **Primary Heading Typeface**: Inter, Plus Jakarta Sans, or Geist Sans
* *Weights*: Bold (`700`), ExtraBold (`800`)
* *Letter Spacing*: Negative tracking (`-0.025em`) for modern technical authority.


* **Secondary Subheading / Eyebrow**: All-caps tracking (`letter-spacing: 0.15em`)
* *Weights*: Medium (`500`) or SemiBold (`600`)
* *Usage*: Section badges, Foundation labels, statutory metadata[cite: 2].


* **Body Typeface**: Inter or System UI Sans-Serif (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`)
* *Weights*: Regular (`400`), Medium (`500`)
* *Line Height*: Comfortable (`1.6 – 1.7`) for documentation and legal/informational readability[cite: 1, 2].



---

### Visual Mark & Logo Anatomy

* **The Emblem**: A 3D perspective network globe constructed from interconnected circular nodes and dynamic connective lattice links.
* *Meaning*: Global scale, modular architecture (Hexagonal Ports & Adapters), interconnected systems, and open-source infrastructure[cite: 1, 2].
* *Geometry*: Asymmetric, forward-leaning perspective with satellite nodes floating around the primary core lattice.


* **The Wordmark**:
* **"Provelopment"**: Heavy sans-serif bold, sentence-case, colored in `#0F172A` (or `#FFFFFF` on dark backgrounds)[cite: 2].
* **"FOUNDATION"**: Positioned directly beneath or adjacent to the wordmark in clean, widely spaced uppercase (`letter-spacing: 0.25em`)[cite: 1].


* **Minimum Clear Space**: Maintain clear space equal to 50% of the emblem's diameter around all logo compositions.

---

### Favicon & Digital Asset Architecture

Conforming to the Next.js App Router and PWA specifications[cite: 2, 7]:

* **Vector Master (`src/app/icon.svg`)**: Single resolution-independent SVG scaling from `16×16` up to `512×512`[cite: 1, 4].
* **Browser Favicon (`favicon.ico` / `16×16`, `32×32`)**: Direct crimson network mark on a transparent or white container for tab clarity[cite: 2].
* **Apple Touch Icon (`apple-touch-icon.png` / `180×180`)**: Solid crimson `#C5161D` squircle tile with an inverted pure white silhouette[cite: 2].
* **Social / OpenGraph Card (`opengraph-image.png` / `1200×630`)**: Sleek off-white `#F8FAFC` canvas, crimson emblem on the left, clear typography on the right, and the primary tagline[cite: 2].

---

### Downstream Contract & Layout Integration

All branding is downstream-configurable to preserve the invariant rule: **Foundation source code remains unbranded; downstream sites brand purely via config, content, and CSS variables**[cite: 1, 2].

**Site Configuration (`site.config.json`)**[cite: 1, 2]

```json
{
  "$schema": "./src/config/schema.json",
  "site": {
    "name": "Provelopment Foundation",
    "legalName": "Provelopment Foundation",
    "description": "Open-Source Web Platform for Modern Business",
    "url": "https://provelopment.com",
    "defaultLocale": "en",
    "locales": ["en"]
  },
  "ui": {
    "preset": "focus",
    "cta": {
      "enabled": true,
      "style": "prominent",
      "label": "Get Started",
      "action": "inquire",
      "href": "/contact"
    }
  }
}

```

**Metadata Manifest (`src/app/[locale]/layout.tsx`)**[cite: 2, 7]

```typescript
export const metadata = {
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    title: "Provelopment Foundation",
    description: "Open-Source Web Platform for Modern Business",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }]
  }
};

```