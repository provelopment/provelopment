# Provelopment Foundation

An open-source, re-brandable web platform template that helps small
businesses establish and maintain a web presence. Starts frontend-only,
architected to grow into full-stack without a rewrite.

Clone it, make it yours by editing **configuration, content, and assets
only**, then deploy — [`CUSTOMIZING.md`](CUSTOMIZING.md) walks you through
the whole process.

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
3. Swap the placeholder icon (`src/app/icon.svg`) for your logo.
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
src/app         # Next.js routes under src/app/[locale]
src/components  # Presentation components
src/core        # Framework-independent domain concepts
src/application # Use-case ports
src/adapters    # Concrete integrations (filesystem content, …)
src/config      # Site configuration, i18n dictionaries, design tokens
content/pages   # Per-locale Markdown content
tests           # Cross-boundary unit and architecture tests
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


