# Provelopment

An open-source, re-brandable web platform that helps small businesses
establish and maintain a web presence. Starts frontend-only, architected to
grow into full-stack without a rewrite.

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

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — boundaries, dependency direction,
  internationalization blueprint
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — launch runbook (Vercel, domains,
  verification checklist)
- [`AGENTS.md`](AGENTS.md) — operating contract for AI coding agents

## Deployment

The site deploys to Vercel directly from the repository. See
[`DEPLOYMENT.md`](DEPLOYMENT.md) for the complete runbook.

