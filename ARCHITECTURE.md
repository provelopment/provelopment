# Provelopment Architecture

## Purpose

Provelopment is a reusable, re-brandable web platform intended to support
small businesses in establishing and maintaining a web presence.

The application is initially frontend-only but must remain capable of evolving
into a full-stack application without requiring a fundamental architectural
rewrite.

## Architectural Style

The application follows Hexagonal Architecture / Ports and Adapters principles.

The objective is to keep business and application concerns independent from
frameworks, infrastructure, and external services.

## Architectural Boundaries

### `src/app`

Next.js App Router entry points.

Responsibilities:

- routing
- route composition
- framework-specific page/layout metadata
- framework-specific request/response concerns

This layer should remain thin.

### `src/components`

Reusable presentation components.

Responsibilities:

- UI composition
- visual presentation
- interaction
- accessibility

Components should not contain domain business rules.

### `src/core`

Domain concepts and business rules.

This is the most framework-independent part of the application.

Core code must not depend on:

- Next.js
- React
- Tailwind CSS
- Vercel
- browser APIs
- external service SDKs

### `src/application`

Application-level use cases and ports.

Responsibilities:

- orchestrating application behavior
- defining interfaces required by use cases
- coordinating core concepts

Application code may depend on `core`.

Application code must not depend directly on concrete infrastructure
implementations.

### `src/adapters`

Concrete implementations of external integrations and application ports.

Examples may include:

- content repositories
- external APIs
- persistence
- analytics
- email
- third-party services

Adapters may depend on external technologies.

### `src/config`

Typed application and site configuration.

This is a primary customization boundary for downstream website clones.

Configuration should allow common branding and site behavior to be changed
without modifying application logic.

### `content`

Human-authored content such as:

- pages
- documentation
- articles
- educational material

Content should remain separate from application implementation.

#### Content system

Page content lives as Markdown files under `content/pages/<slug>.md`.

Each file begins with minimal frontmatter containing a `title`:

```markdown
---
title: Page Title
---

Body copy in Markdown.
```

The content pipeline follows the ports and adapters boundaries:

- `src/core/page-content.ts` defines the `PageContent` concept.
- `src/application/page-content-repository.ts` defines the
  `PageContentRepository` port.
- `src/adapters/content/fs-page-content-repository.ts` implements the port
  against the filesystem.
- Framework code in `src/app` composes the adapter with the port and renders
  Markdown to HTML only at the presentation boundary.

Application code must depend on the port, never directly on the adapter,
except at composition time in `src/app`.

### `public`

Static assets served directly by the web application.

### `tests`

Tests that cross application boundaries or require external/runtime behavior.

Unit tests should remain close to the code they test where practical.

## Dependency Direction

The intended dependency direction is:

`core`
↓
`application`
↓
`adapters`

Presentation/framework code composes these capabilities.

The dependency direction must not be reversed.

In particular:

- `core` must not import from `application`, `adapters`, `components`, or `app`.
- `application` must not import concrete adapters.
- `components` must not contain domain business rules.
- `app` should remain a thin framework boundary.
- Concrete infrastructure must remain replaceable.

## Backend Evolution

The initial implementation is frontend-only.

Future backend capabilities should be introduced through application ports and
adapters rather than coupling the domain directly to a backend technology.

Possible future infrastructure includes:

- APIs
- databases
- authentication
- external content systems
- hosted services

The architecture should allow these to be introduced incrementally.

## Re-brandability

A downstream project should be able to change its:

- brand identity
- visual theme
- content
- navigation
- contact information
- social links
- enabled features

without modifying the platform's core business/application logic wherever
practical.

## AI Development

The repository is intentionally designed to provide strong context for AI
coding agents.

Agents must understand and preserve:

- dependency direction
- architectural boundaries
- configuration boundaries
- content/application separation
- framework isolation

Before making architectural changes, an agent should inspect the relevant
repository instructions and existing implementation.