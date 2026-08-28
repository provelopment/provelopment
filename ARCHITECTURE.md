# Architecture

## Purpose

The platform is a reusable, re-brandable web template intended to support
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

Application and site configuration, loaded from `site.config.json`.

The JSON file is the primary customization boundary for downstream website
clones: branding, languages, navigation, contact details, and feature flags
are all edited there without touching application code.

Rules:

- `site.config.json` is validated against the Zod schema in
  `src/config/schema.ts` by the loader (`src/config/loader.ts`). A bad edit
  fails the build with an actionable message.
- Application code reads configuration only through the loader's exported
  `siteConfig`; importing the JSON directly elsewhere bypasses validation.
- Optional functionality is expressed as feature flags under `features`
  and consumed by adapters (for example `features.analytics.provider`).
- UI-string dictionaries live in `config/i18n/<locale>.json`; they are
  content, not settings — edited as JSON and validated against the Zod
  `dictionarySchema` at load time.

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

The port also lists which pages exist for a locale
(`PageContentRepository.listSlugs`). The sitemap derives its per-locale route
set from the default-locale content files (plus the locale root), so a new
page joins the sitemap as soon as its content file exists — there is no
hard-coded route list to update. Navigation config controls exposure and
ordering only; it does not define route existence.

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

## Hosting and Deployment

The platform targets Vercel as its primary infrastructure provider.

Constraints and rules:

- The locale-detection proxy (`src/proxy.ts`) requires a host with
  edge-middleware support. Plain static-file hosting without middleware is
  not sufficient for this application.
- GitHub triggers deployments: pushes to `main` deploy to production, and
  pull requests receive preview deployments gated by CI.
- Vercel-specific APIs must not leak into `core`, `application`, or
  `adapters`. Hosting is an infrastructure detail composed at the outermost
  boundary.
- No environment variables are required today; deployment-specific values
  (such as the production origin) are owned by `src/config`.

See `DEPLOYMENT.md` for the operational runbook.

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

## Internationalization

The platform supports multiple locales as a first-class concern.

### Locale routing

All user-facing routes live under a `[locale]` dynamic segment, for example
`/en/about`. Supported locales and the default locale are defined in
`src/config`.

Requests without a locale prefix are redirected by `src/proxy.ts` (Next.js
16's renamed middleware) using, in order:

1. the `NEXT_LOCALE` cookie,
2. the `Accept-Language` header,
3. the configured default locale.

### UI strings

User-facing interface strings ("dictionaries") live in
`config/i18n/<locale>.json` and must validate against the Zod `dictionarySchema`.
Hard-coded user-facing copy in reusable components is a violation of this
boundary.

Dictionaries are **discovered from the data surface**: the registry
(`src/config/i18n/registry.ts`) reads every `config/i18n/<locale>.json` at
load time, validates each against `dictionarySchema`, and verifies every
locale enabled in `site.config.json` has a matching file. There is no
hard-coded import list, so adding a locale is `site.config.json` + one JSON
file. A malformed dictionary or a configured locale with no dictionary fails
the build with an actionable error; only locales that are NOT configured fall
back to the default locale's dictionary.

### Localized content

Markdown content is organized per locale under `content/pages/<locale>/`.
The content port accepts a locale and falls back to the default locale when
a translation has not been authored yet. Missing translations must not
produce broken routes.

### SEO

Each locale is treated as a distinct page:

- `<html lang>` reflects the active locale.
- Pages expose `alternates.languages` (hreflang) including `x-default`.
- The sitemap lists every route for every supported locale.

Adding a new locale is a configuration-level change: register the locale in
`site.config.json`, add `config/i18n/<code>.json`, and author its content.
Platform logic must not require modification (dictionaries are discovered
from `config/i18n/` at load time).

## Business profile & hours

- **Configuration owns the data.** The `business` block in `site.config.json`
  (locations, hours, contact, timezone, type) is validated by the config
  schema and normalized by the loader to the framework-free `Business` shape
  in `src/core/business.ts`.
- **Timezone safety.** Timezones are validated against the runtime `Intl`
  timezone table at build time; an invalid identifier fails configuration with
  an actionable error. Evaluation precedence:
  `location.timezone → business.timezone → "Etc/UTC"`.
- **One hours model.** `src/core/business-hours.ts` evaluates regular and
  exceptional intervals identically. `close < open` is an overnight interval
  that carries into the next morning; an exceptional `closed` suppresses its
  date; a prior night's overnight interval is never revoked by the next day's
  schedule. `open === close` is rejected as ambiguous. All evaluation uses
  wall-clock resolution in the location's IANA timezone (DST-safe via `Intl`).
- **UI.** The footer renders each location's weekly schedule with localized
  day labels, its exceptional/holiday dates, a timezone indicator, and a live
  "Open now/Closed" badge computed client-side in the location's timezone —
  statically generated pages therefore never bake a build-time timestamp.
- **Structured data.** The config-driven JSON-LD (`Organization` /
  `LocalBusiness`) includes an `openingHoursSpecification` built from the
  configured intervals.

## Contact inquiry (Phase B)

The inquiry capability is a frontend + integration seam: `/contact` renders a
config-driven, localized form; submissions flow through a server action into a
framework-free application port; the adopter owns the receiving system.

- **Layering:** browser → `src/app/[locale]/contact/page.tsx` +
  `src/app/contact-actions.ts` (thin Next.js boundary) →
  `src/application/contact-inquiry-service.ts` (orchestration: honeypot →
  Zod validation → sender) → port `src/application/contact-inquiry-sender.ts`
  (`ContactInquirySender`) → adapters in `src/adapters/contact-inquiry/`
  (`webhook`, `stub`). Core `src/core/contact-inquiry.ts` owns the shared
  schema and types (framework-free; validated server-side and mirrored by the
  client).
- **Providers:** `features.contact: { provider: "webhook" | "stub" }`.
  No feature → explicit "not configured" page state. `stub` is the default and
  returns an explicit "nothing was sent" demo result; the webhook is the only
  production-capable path and there is **no mailto adapter**.
- **Misconfiguration:** a webhook provider without `CONTACT_WEBHOOK_URL`
  throws `ContactInquiryMisconfigurationError` at the server action (the
  earliest runtime boundary — no build-time secrets required) and surfaces as a
  distinct "misconfigured" state; it can never silently act as the demo stub.
  Non-loopback webhook endpoints must be HTTPS.
- **External contract (minimal):** POST
  `{ id, name, email, subject?, message, locale, submittedAt }`; a UUID `id`
  gives adopters a correlation/idempotency key without any Foundation storage.
  No visitor telemetry is collected.
- **Security model:** server actions are POST-only endpoints with an implicit
  per-build Action ID; Next.js enforces a same-origin check (Origin is compared
  against Host/configured origins; mismatch → HTTP 403), which is Next.js's
  CSRF mitigation. The honeypot (`website` field, discarded before validation)
  adds bot defense. Request/response payload limits are enforced by the shared
  Zod schema; no inquiry contents are ever logged; rate limiting is the
  adopter's responsibility.

## Offerings catalog (Phase C)

A single type-agnostic offering primitive (services, products, packages,
programs, consultations) backed by the **same** content port/adapter used for
pages — no parallel repository.

- **Reuse:** `PageContentRepository` + `createFileSystemPageContentRepository`
  gain a `collection` option (`"pages"` | `"offerings"`) with a per-collection
  parser (`parseOfferingsFile` in `src/adapters/content/frontmatter.ts`).
  `listSlugs` (canonical set) and `findBySlug` (locale→default fallback) work
  unchanged; the sitemap and JSON-LD-free metadata flow from the canonical
  content set + `features.offerings`.
- **Three-concern contract:** content = which offerings exist (canonical =
  default-locale slugs; locale-only slugs → 404, never an ambiguous fallback);
  `features.offerings` = capability/exposure (`false`/absent → 404 + no sitemap
  entries); `navigation[]` = discoverability only (config-authoritative; never
  derived from content).
- **Model:** `OfferingsContent` (extends `PageContent`) adds required `blurb`
  and optional `order`, `featured`, `price` (display-only string), `image`
  (site-root-relative asset). `sortOfferings` (featured → order → slug) and
  `isCanonicalOffering` live in `src/core/offerings.ts` (pure, framework-free).
- **No commerce semantics:** no pricing math, checkout, booking, payments,
  inventory, customer state, or JSON-LD `Product`/`Service`/`Offer` in Phase C.
- **Routes** are in `src/app/[locale]/offerings/` (listing + detail); the
  listing ships a localized empty state when enabled but no content exists.

## Legal documents (Phase D)

Optional, config-driven legal pages reached from the footer (no index page).

- **Reuse:** legal content uses the SAME `PageContentRepository` port + fs
  adapter (`collection: "legal"`) with the basic `parsePageFile` contract
  (title + body); no parallel repository.
- **Exposure = config ∧ canonical content.** A legal document is exposed only
  when it is BOTH in the `legal` config block (`{ slug, label }[]`) AND has a
  canonical (default-locale) file under `content/legal/`. Content alone never
  exposes a route; a configured-but-missing entry is dropped from the footer
  and its route 404s. Pure helpers in `src/core/legal.ts` (`resolveLegalDocs`,
  `isCanonicalLegalSlug`, `legalLabel`).
- **Footer discoverability:** the footer renders a legal `<nav>` (localized
  header + links) only when resolved legal docs exist; labels fall back from
  `dictionary.legal.labels[slug]` to the config label.
- **Body localization is independent of footer labels.** Legal document bodies
  come from `content/legal/<locale>/<slug>.md` and use the repository's standard
  locale → default fallback (`findBySlug`: locale file first, then `en`). A
  localized body is served when present; otherwise the canonical (default) body
  is served — no Legal-specific translation system. The shipped demo docs are
  localized to all 8 locales (identically-structured, generic, replaceable
  templates; no jurisdiction-specific claims).
- **Sitemap/SEO:** legal slugs (config ∩ canonical) feed `buildSitemapRoutes`;
  each detail page emits canonical + hreflang. Missing translations use the
  existing repository default-locale fallback. No JSON-LD, no legal-advice
  semantics; demo docs are clearly marked replaceable templates.

## Content body localization (all collections)

Content **bodies** are localized per-collection via the same repository
`findBySlug` locale → default fallback: a file at
`content/<type>/<locale>/<slug>.md` is served when present; otherwise the
default-locale (`en`) file is served. There is **no translation system** beyond
the content files — no per-locale schema, no dictionary involvement for bodies.
This applies uniformly to pages (`about`/`resources`/`contact`), offerings
(`consultation`/`gift-card`/`starter-package`), and legal
(`privacy`/`terms`/`cookies`). The shipped template localizes every one of these
to all 8 locales; adopters who omit a locale still get a working page via the
default-locale fallback. Localized frontmatter fields (e.g. offering
`title`/`blurb`/`price`) travel in the same files and are served together with
each locale's body. (Footer **labels** are dictionary-owned and independent —
see Legal and i18n sections.)

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