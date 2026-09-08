# Provelopment Foundation

An open-source, re-brandable web platform template that helps small
businesses establish and maintain a web presence. Starts frontend-only,
architected to grow into full-stack without a rewrite.

Clone it, make it yours by editing **configuration, content, and assets
only**, then deploy — [`CUSTOMIZING.md`](CUSTOMIZING.md) walks you through
the whole process.

## Five presentations, one Foundation

The Foundation is demonstrated through **five deployments — five
presentations of the SAME canonical site** (same `content/`, `config/i18n/`,
`site.config.json`, `public/assets/`): **Adaptive** (the canonical
`foundation.provelopment.com`), plus **Classic**, **Focus**, **Workspace** and
**Immersive** preset demonstrations (`*.foundation.provelopment.com`). Each
preset resolves a coherent presentation intent (typography, rhythm, surface,
header, hero + density/content-width/radius) onto the **shared** renderer via
`data-ui-*` attributes — no preset-specific CSS, no per-preset forks. See
`CUSTOMIZING.md` → *The `ui.presentation` block* for the full matrix.

## Tech Stack

- [Next.js](https://nextjs.org) 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4
- Vitest
- pnpm package manager
- Multi-lingual by design (`[locale]` routing, dictionaries, per-locale
  content)

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected
to the default locale.

## Making It Yours

1. Edit `site.config.json` — site name, tagline, contact, social links,
   navigation, enabled features. Every field is validated at build time.
2. Replace the Markdown pages in `content/pages/<locale>/` with your own.
3. Swap the placeholder icon (`src/app/icon.svg`) and assets (`public/assets/logo.svg`) for your logo.
4. Add locales, deploy to Vercel, and keep up to date with upstream —
   all documented in [`CUSTOMIZING.md`](CUSTOMIZING.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit and architecture-boundary tests |
| `pnpm exec tsc --noEmit` | Typecheck |

## Project Layout

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the authoritative description
of the hexagonal (ports and adapters) boundaries:

```
src/app         # Next.js routes under src/app/[locale], layouts, globals.css tokens
src/components  # Presentation components (site, shell, and shared ui primitives)
src/core        # Framework-independent domain concepts and UI preset engine
src/application # Use-case ports and services
src/adapters    # Concrete integrations (filesystem content, analytics, booking, maps)
src/config      # Site configuration schema and loaders
config/i18n     # Localized JSON dictionaries (9 supported locales)
content         # Markdown collections (pages, legal, offerings, posts, testimonials, portfolio)
public/assets   # Canonical brand assets (logo.svg, og-image.png)
tests           # Architecture boundary, unit, and CDP browser matrix tests
```

## Documentation

- [`CUSTOMIZING.md`](CUSTOMIZING.md) — downstream user guide: what to edit,
  adding locales, deploying, syncing with upstream
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — boundaries, dependency direction,
  internationalization blueprint
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — launch runbook (Vercel, domains,
  verification checklist)
- [`AGENTS.md`](AGENTS.md) — operating contract for AI coding agents

## Deployment

Your site deploys to Vercel directly from your own repository. See
[`DEPLOYMENT.md`](DEPLOYMENT.md) for the complete runbook.


