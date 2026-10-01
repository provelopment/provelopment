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

Application and site configuration, loaded from the deployment's
`site.config.json` — the configuration file at the DEPLOYMENT ROOT (see
[The deployment root](#the-deployment-root) below). In this repository that is
the capsule's `deployment/site.config.json`.

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
- UI-string dictionaries live in the deployment's `config/i18n/<locale>.json`; they are
  content, not settings — edited as JSON and validated against the Zod
  `dictionarySchema` at load time.

#### The deployment root

ONE authority — `src/config/deployment-root.ts` — resolves every DEPLOYMENT-OWNED
filesystem location: the configuration file, the `config/i18n/` dictionaries, the
`content/pages/` authoring roots and the `content/assets/` source tree. Foundation core
never spells those locations itself, and `tests/architecture/deployment-root-guard.test.ts`
keeps it that way. Three layouts are resolved once per build:

| Layout | Deployment root | When it applies |
| --- | --- | --- |
| **capsule** | `<repo>/deployment/` | a real deployment capsule exists. It is the accepted long-term write boundary for one deployment — the layout THIS repository uses, and the one `deployment/README.md` and `deployment/AGENTS.md` describe |
| **repository** | `<repo>/` | a standalone repository that owns its own deployment — a SPOKE with no platform capsule, where those locations sit at its own root. It is a supported capability, and the layout THIS repository must NOT use: a combined platform repository carries its reference deployment in the capsule |
| **override** | `FOUNDATION_DEPLOYMENT_ROOT` | the dev/test escape hatch that points a dev server at a synthetic deployment. Never a production mechanism |

The three layouts are a CAPABILITY of the platform, not a description of this
repository's install: an independent SPOKE repository — one deployment, no
platform capsule — legitimately keeps `site.config.json`, `config/i18n/**` and
`content/**` at its own root, and keeps resolving the `repository` layout. The
combined Foundation repository is the other shape: it carries a reference
deployment, so it owns that state in `deployment/**` alone. Deployment-owned
locations therefore have exactly ONE home per repository, and no code branches on
repository identity to decide which — the selector answers every repository the
same way, and `tests/architecture/deployment-root-guard.test.ts` proves both
halves: a standalone spoke still selects the `repository` layout, while
`site.config.json`, `config/i18n/**` or `content/**` reappearing at THIS
repository's root fails architectural validation.

`public/assets/**` is NOT deployment-owned: Next.js serves static files from `public/`
only, so it is GENERATED build output — ignored by Git and installed by `pnpm install`
(postinstall), `pnpm dev` and `pnpm build` (`pnpm assets:sync` / `pnpm assets:check`,
byte-verified by the deployment's own asset suites).

### `content`

Human-authored content such as:

- pages
- documentation
- articles
- educational material

Content should remain separate from application implementation.

#### Content system

**One human-facing content area.** Everything a normal user authors as website
content has ONE obvious home: the deployment's `content/` tree (relative to the
deployment root — the capsule's `deployment/content/` in this repository), and
`content/README.md` is the map
that answers "where do I edit my website?". Content is never authored under
`config/` (configuration changes how the site *behaves*; content is what it *says*),
and unrelated technical configuration is never moved into `content/` to make the tree
look uniform. The layout is:

```text
                            every path below is relative to the deployment root
content/README.md      the human-facing map
content/pages/markdown/<site>/<locale>/<route-path>.md   simple, safe pages
content/pages/json/<site>/<locale>/<route-path>.json     advanced, declarative pages
content/assets/**      the ONE user-editable asset authority (see below)
```

**If authored content has its own URL, it is a page.** There are no separate
author-facing collections (offerings, portfolio, posts, testimonials, legal) and no
second content store: every one of those is a PAGE, authored in one of the two modes
above and served by the ONE page route. A collection-shaped directory under
`content/` is neither read nor shipped.

**A page's URL is its route path** — the path between the locale and the extension,
built from the folders the page is authored in:

```text
content/pages/markdown/ww/en/offerings/website-design.md   →  /ww/en/offerings/website-design
content/pages/markdown/ww/en/blog/choosing-a-domain.md     →  /ww/en/blog/choosing-a-domain
```

The rule for that value lives ONCE in `src/core/page-route-path.ts`: every segment is
a content slug (`src/core/page-content.ts`), so `.`/`..`, an empty segment, a leading
or trailing `/`, a backslash and a percent-encoded traversal are all refused before a
filesystem path is built. Depth (`PAGE_ROUTE_PATH_MAX_SEGMENTS`) and length
(`PAGE_ROUTE_PATH_MAX_LENGTH`) are capped and documented there rather than chosen ad
hoc, so discovery, routing and the sitemap cannot disagree about what exists.

**Pages** are authored in exactly two ways — safe Markdown and declarative JSON — see
[Page authoring](#page-authoring--two-first-class-modes) below.

**Assets** are authored under the deployment's `content/assets/**` and mirrored byte-for-byte into
`public/assets/**` by `scripts/sync-runtime-assets.mjs` (`pnpm assets:sync` /
`assets:check`). `content/assets/**` is the source of truth a human edits;
`public/assets/**` is a GENERATED derivative that is never edited by hand, is NOT
version-controlled (installed by the package lifecycle instead), and a test
asserts that no second user-editable asset authority exists at the repository root.

The content pipeline follows the ports and adapters boundaries:

- `src/core/page-content.ts` defines the `PageContent` concept and the ONE
  content-segment rule.
- `src/core/page-source.ts` declares the two modes, their roots and the ONE
  precedence order; `src/core/page-route-path.ts` declares what a page's route path
  may be.
- `src/application/page-source-resolution.ts` applies that order behind the two mode
  readers; `src/adapters/content/page-sources.ts` wires the concrete readers and is
  the composition every page route and the sitemap consume.
- Framework code in `src/app` renders the resolved page through the safe Markdown
  renderer; Markdown becomes HTML only at that presentation boundary.

Route discovery is the ONE inventory: it walks the authoring tree recursively
(`src/adapters/content/authoring-source-discovery.ts`), and the sitemap derives its
per-locale route set from the same composition, so a new page (at any depth) joins
the sitemap as soon as its file exists — there is no hard-coded route list to update.
Navigation config controls exposure and ordering only; it does not define route
existence.

**Every page is statically generated by ONE route**: `src/app/[...segments]/page.tsx`
exports `generateStaticParams` (the discovered route paths plus the configured
regional landings and regional pages) with `dynamicParams = false`, so every page is
prerendered at build time and any other path returns a 404 — no on-demand rendering,
no ISR. The home page is served by the locale root (`src/app/[...segments]/page.tsx`), and
`/connect` + `/contact` keep their own route files for their specialised chrome; both
resolve their page through the same composition.

#### Page authoring — two first-class modes, and no third

A page is authored in exactly ONE of two first-class modes:

| Mode | Root | What it is |
| --- | --- | --- |
| **safe Markdown** | `content/pages/markdown/<site>/<locale>/<slug>.md` | ordinary Markdown for a non-technical author; the recommended mode |
| **safe declarative JSON** | `content/pages/json/<site>/<locale>/<slug>.json` | validated data for a page needing presentation Markdown cannot express (its vocabulary is delivered by a later increment) |

Both modes are CONTENT and DATA, never executable code. The Markdown mode's policy
is enforced in TWO independent layers: the renderer
(`src/adapters/markdown/safe-markdown.ts`) turns author raw HTML into inert text,
escapes code, and asks `src/core/safe-url.ts` about every destination (which fails
closed and refuses executable/unknown schemes); the generated HTML is then
re-parsed against the allowlist in `src/core/markdown-policy.ts` by
`sanitize-html`, so a mistake in the renderer cannot produce active markup either.

**Heading fragments are generated, never authored.** An author may link to a section
of their own page (`[hours](#opening-hours)`), which requires a target they cannot
write (raw HTML is inert and no attribute is author-settable). The renderer therefore
derives a deterministic id from each heading by the ONE rule in
`src/core/heading-anchor.ts` (`## Opening Hours` → `#opening-hours`, accents and case
ignored, punctuation dropped, repeats disambiguated `-2`, `-3`, …), and `id` is
allowed on headings only — with layer 2 re-checking the id's SHAPE. The shell's
fragment clearance (`scroll-padding-top`) therefore applies to authored targets
exactly as it does to any other in-page target.

There is no third page-source kind, and nothing else in `content/` is a page source.
Everything the platform publishes from `content/` is a PAGE: a file at any other shape
(`content/README.md`, a stray directory) is never read, so it can neither answer nor
shadow a page.

**Resolution order** (`src/core/page-source.ts` → `PAGE_RESOLUTION_ORDER`), applied
by the ONE resolver (`src/application/page-source-resolution.ts`) through the ONE
composition the routes and the sitemap consume
(`src/adapters/content/page-sources.ts`):

```text
requested-locale JSON    →  requested-locale Markdown
default-locale JSON      →  default-locale Markdown     (only when fallback applies)
```

The default-locale steps apply only when fallback is permitted. **JSON wins over
Markdown within one locale**, and **an exact-locale page always beats a
fallback-locale page**, whatever the format. A JSON source that would be served
currently fails the build loudly, naming its file, rather than being silently
ignored — its interpreter does not exist yet.

Rules that hold for both roots:

- only a file INSIDE a locale directory, at any depth, is a page source — so a
  root-level `README.md` can never become a page, a README beside nested pages is
  equally inert, and `.gitkeep` is ignored;
- a locale directory, or any folder inside it, MAY BE EMPTY — **a directory's
  existence is not publication** — and an unconfigured locale publishes nothing,
  because both the route generation and the sitemap iterate the site's configured
  locales;
- the segment rule has ONE authority (`src/core/page-content.ts`) and the route-path
  rule that builds on it lives in `src/core/page-route-path.ts`, consumed by the
  page-source contract, the discovery adapter, the authoring reader and the
  configuration schema;
- discovery (`src/adapters/content/authoring-source-discovery.ts`) reports what
  the tree holds and nothing else: it decides no precedence and parses nothing;
- every page route — the locale root, the ONE generic `[...path]` route and the
  dedicated `/connect` + `/contact` routes — resolves through this ONE
  composition and renders through the safe page renderer
  (`SafeMarkdownContent`). The trusted collection renderer (`MarkdownContent`) is
  unreachable from a page route, so trusted raw HTML is not a page-authoring
  capability.

**Dependency note (why `sanitize-html`).** The allowlist guarantee cannot be made
honestly with a hand-written regular expression; a real HTML parser applying an
allowlist is the boundary this project accepts. `sanitize-html` (MIT, built on
htmlparser2) is server-side only, imported by exactly ONE module
(`src/adapters/markdown/safe-markdown.ts`), and replaceable behind
`renderSafeMarkdown` — an architecture test asserts the single-importer rule.
#### Declarative JSON page authoring — the second mode's vocabulary (A2)

The Markdown mode is for an ordinary author; the JSON mode is for an advanced one who
needs page composition instead of prose. A JSON page is **data, never code**: an explicit
envelope and an ordered list of sections, every one of them declared here — the
vocabulary IS the schema.

```text
content/pages/json/<site>/<locale>/<route-path>.json
{
  "schemaVersion": 1,
  "title": "…",            // required: page identity, metadata title and the ONLY h1
  "description": "…",      // optional: the page's summary
  "sections": [ … ]        // required, ordered, bounded (40)
}
```

- **ONE document contract** — `src/core/page-document.ts` holds the envelope, the sixteen
  section types (`hero`, `prose`, `media`, `gallery`, `actions`, `callout`, `cards`,
  `features`, `columns`, `steps`, `stats`, `quote`, `table`, `faq`, `list`, `divider`),
  the finite presentation vocabularies (`surface`, `align`, `columns`, `position`,
  `ratio`, `ordered`, `variant`, `tone`), the structural bounds, the list of
  Markdown-bearing fields and the heading outline (`page: 1, section: 2, item: 3`) as
  DATA, plus the ONE Zod schema the types are inferred from (`@/core/contact-inquiry` is
  the precedent for Zod in core). It is framework-free: no filesystem, no React, no
  configuration.
- **STRICT validation.** Every object in the schema is strict, so an undeclared property
  is refused rather than ignored: a typo fails the build and names the file and the
  property (`sections[2].items[0].title`), never silently producing a page with something
  missing. The section union is discriminated on `type`, which is what makes those paths
  precise.
- **Accessibility is structural, not remembered.** An image either carries `alt` or
  declares `decorative: true` — mutually exclusive, so an unnamed content image cannot be
  published. Actions require a label (an accessible name). A table requires column
  headings, and a row must fill them exactly. FAQ answers are required. No document can
  choose a heading level, so the outline cannot be chaotic.
- **Interpretation is ONE reader** — `src/adapters/content/json-page.ts` parses JSON
  syntax (distinguishing malformed JSON from schema-invalid data), refuses an unsupported
  `schemaVersion`, names an unknown section type by VALUE, and validates against the
  schema. It renders nothing.
- **The safe Markdown renderer is reused, never re-implemented.** Every Markdown-bearing
  field goes through the SAME `renderSafeMarkdown` path as the Markdown authoring mode
  (via `SafeMarkdownContent`), so raw HTML in a JSON page is inert and unsafe destinations
  fail closed by the same policy. Paths are validated with `@/core/page-route-path`, and
  destinations with `@/core/safe-url` — the same authorities the Markdown mode uses.
- **ONE presentation boundary** — `src/components/site/page-document-content.tsx` is the
  only place that maps a section type to a presentation, through
  `src/components/site/page-sections/*`, which compose the existing primitives (`Heading`,
  `Grid`, `NavItem`, `SafeMarkdownContent`) rather than new collection-shaped components.
  The switch is exhaustive over the section union (a `never` assignment), so a new type
  cannot be added without a presentation. The composer is site-neutral and
  configuration-independent; the four page routes branch on the MODE, never on a section
  type, and an architecture test asserts both.
- **Assets are the site's normal assets.** An image references a same-site path
  (`/assets/<file>`, mirrored from `content/assets/**`) or an absolute `http(s)` URL.
  There is no second asset subsystem, no source import, and no `next/image` requirement
  (plain `<img>`, like the banner and icon paths).
- **No second route, no second store.** JSON pages use the SAME discovery, resolution,
  precedence (`@/core/page-source`), route, static-param generation and sitemap as
  Markdown pages: a valid JSON page is served, JSON wins over Markdown for the same
  locale+route, nested JSON routes work, and fallback is unchanged. The A1 placeholder
  that refused to serve JSON is gone.

**Deliberately NOT part of the vocabulary.** No executable or author-supplied behaviour
(no JavaScript, expressions, imports, JSX, component names, `eval`, handlers), no raw HTML
or Markdown escape hatch, no styling (no classes, CSS, pixels or `style`), no unbounded
nesting (a section has items; no sections inside sections), and no publishing metadata
beyond title/summary — article dates, feeds and draft states belong to a publishing
capability that does not exist yet and would need its own increment.

**The page title is the ONLY level-1 heading, in both modes.** A JSON document's envelope title
is its `h1` (sections are level 2, item titles level 3, and no field selects a level). The
Markdown mode reaches the same document shape from the other direction: a heading written in a
body is rendered RELATIVE to the page title, so `# Services` becomes `<h2 id="services">` and
`## Website design` becomes `<h3>`, capping at `h6`. Authors therefore keep writing ordinary
Markdown — a `#` heading is still how a section is written, nothing is removed and no page is
refused — while the rendered page cannot contain an authored `h1` at all (`h1` is absent from
the Markdown allowlist, so even a renderer mistake could not add one). The heading's generated
fragment id is derived from its WORDS, not its level, so section links
(`[hours](#opening-hours)`) and their sticky-navigation clearance are unaffected by the shift.

### `public`


### `public`

Static files served directly by the web application. `public/assets/**` is a
GENERATED mirror of the user-editable source tree `content/assets/**` (written by
`scripts/sync-runtime-assets.mjs`); it is never edited by hand, and `assets:check`
fails on any drift between the two.

### `tests`

Tests that cross application boundaries or require external/runtime behavior.

Unit tests should remain close to the code they test where practical.

## Write Ownership

Repository tooling and tests write only into the domain they own. There are exactly THREE sanctioned
durable writers, each with the ONE target it derives from the deployment authority:

| Writer | The only domain it may write |
| --- | --- |
| `scripts/sync-runtime-assets.mjs` | `<repo>/public/assets/**` — the generated runtime mirror (B3C1) |
| `scripts/generate-country-code-reference.mjs` | `<selected deployment>/content/COUNTRY-CODES.md` (B3A) |
| `scripts/ci/change-scope.mjs` | `$GITHUB_OUTPUT` — the CI runner's own file, never repository state |

Everything else that writes is TEST SCRATCH: OS temp state, the synthetic deployment's disposable copy
(`tests/support/synthetic-deployment-root.ts`), a disposable copy of the SELECTED deployment
(`tests/support/disposable-deployment.ts`) and the owner's own ignored report directory
(`tests/browser/.report/**`). Foundation application code (`src/**`) contains no filesystem writer at all.

A deployment's authored state — `site.config.json`, `config/**`, `content/pages/**`, `content/assets/**`
and the generated `content/COUNTRY-CODES.md` — is READ by tests and by the browser harness, and is never
their fixture storage. A test that needs WRITABLE deployment state takes a disposable copy of the selected
deployment through the authority's own override selection, so no test depends on successful cleanup to
protect an owner's content (the ISO-C1 lesson).

This is NOT a ban on writing a deployment: a spoke's owner — or a workflow acting for them — authors its
own configuration, dictionaries, pages, artwork, generated documents and operational state. What is
forbidden is uncontrolled repository tooling and test execution treating shipped production state as
scratch space. Enforcement is deliberately small: an exact writer inventory plus sanctioned-writer
contracts (`tests/architecture/write-ownership-guard.test.ts`), a write guard around the browser harness
(`tests/browser/scratch.mjs`), and a runtime before/after manifest of the real deployment's authored state
around both Vitest projects (`tests/setup/production-state-integrity.ts`). Deployment-local rules are in
`deployment/AGENTS.md`; harness-specific ones in `tests/browser/README.md`.

## Dependency Direction

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

## Foundation releases

A Foundation **release** is a deterministic, platform-only **source set** constructed from one accepted
Foundation `main` commit and identified by an immutable contract tag: the canonical
`provelopment-foundation-vYYYYMMDD.HHMM` (the UTC publication minute) for every release after the first,
which is grandfathered as `v2026.09.30-foundation-release-initial`. A deployment **consumes and pins** a
release; it never consumes another deployment, and no Foundation release requires reference-deployment
state to exist.

- The release content boundary is **machine-owned, not prose**: every tracked path is classified by ONE
  policy as platform content or repository/deployment/build state, and a path nobody classified fails
  release construction rather than being silently included or silently dropped.
- `deployment/**` (the reference deployment's authored state and acceptance suite), this repository's
  own CI and every generated path (`public/**`, build output, dependencies) are excluded. The reference
  deployment is a bounded compatibility **canary** — never a release input.
- A release records its **source commit and tree** and a **normalised content digest** of its payload, so
  an adopted release can be verified by whoever received it and a previously adopted release can be
  re-materialised deterministically.

The mechanism, the content policy, the manifest schema, the digest definition and the
construction/verification procedure live in
[`scripts/release/README.md`](scripts/release/README.md).

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

All user-facing routes live under a `[...segments]` dynamic segment, for example
`/ww/en/about`. Supported locales and the default locale are defined in
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

Pages are organized per locale under `content/pages/markdown/<site>/<locale>/` (and
`content/pages/json/<site>/<locale>/`), and a nested page keeps the same structure one level
deeper (`content/pages/markdown/<site>/<locale>/offerings/website-design.md`), so a second
language mirrors the first exactly.
The page composition accepts a locale and falls back to the default locale when
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
- **Locale-aware NAP resolution (Phase G).** A location may carry an optional
  `locales` map keyed by BCP-47 locale code, each value a partial override of
  `address`/`phone`/`geo`. `resolveLocationForLocale(location, locale)` in
  `src/core/business.ts` resolves it (per-field address merge, deterministic
  fallback: locale override → global location → existing behavior); a missing
  override never throws. `resolveBusinessForLocale(business, locale)` resolves
  every location. The footer (`BusinessInfo`) and the JSON-LD (`StructuredData`)
  both consume these shared resolvers, so visible data and structured data can
  never diverge. A locale is a visitor context, not a geography mapping, and
  no locale list is hard-coded in `src/` — adding an override is a
  configuration/data change only. `timezone` and `hours` deliberately stay at
  the location level (single global operating schedule) and are not localized
  in Phase G.

## Locale-specific business identity & address representation (Phase I)

Business identity is **owner-configured, per market** — the Foundation provides
the model, resolution, validation and presentation, never the data. A locale is
a customer context, never an implicit country: no `locale → country → phone`
inference exists anywhere in `src/`.

- **Customer-facing contact per locale.** `business.contact` may carry a
  `locales` map (keyed by BCP-47) of partial `{ email?, phone? }` overrides.
  `resolveBusinessContactForLocale(contact, locale)` (in `src/core/business.ts`)
  applies a locale override's fields, falling back to the global contact
  per-field; `resolveBusinessForLocale` resolves **contact and every location
  together**. `BusinessInfo` (footer) and `StructuredData` both consume the
  resolved business, so visible and structured contact can never diverge.
  Precedence: locale override → global contact.
- **Two structured address representations.** A location has `address`
  (native/local) and an optional `addressInternational` (Latin/international
  form of the same place) plus `addressMode` (`"local"` → local only,
  `"local-international"` → local + Latin). Both forms are **owner-supplied** —
  no transliteration, translation or geocoding is ever performed.
  `addressMode` is a **display** control for human-facing pages only.
- **Resolution & validation.** `resolveLocationForLocale` merges the native
  form per-field, the international form per-field (override → base), and the
  mode per-value (default `"local"`). `assertValidAddressPresentation(business,
  locales)` — called by the loader at build time — enforces that
  `local-international` **requires** `addressInternational`, for the base
  location and every locale override, throwing a descriptive error naming the
  offending location/locale instead of silently dropping the Latin form.
- **Consumer rules (each reads the same resolved location):**
  - Visible UI (footer): follows `addressMode`.
  - JSON-LD / structured data: `addressInternational ?? address` (global machine
    readability — Latin is not treated as "more valid", it is simply preferred
    when owner-supplied).
  - Directions/maps: geo coordinates first; otherwise the address query prefers
    `addressInternational ?? address`. The provider adapter only formats the
    already-resolved location — no locale/address logic moves into it.
- **Adapter boundary enforced (F2).** A boundary guard in `boundaries.test.ts`
  asserts that concrete provider adapters under
  `adapters/{maps,booking,analytics,contact-inquiry}` are importable only by
  their directory factory (`index`) or by tests — arbitrary
  application/UI/domain code must consume the capability seam/factory. The
  pre-existing `adapters/content/**` content repository is explicitly excluded.
- **Booking label invariant (F1).** When `features.booking.provider =
  "external-url"`, every configured locale must provide a non-empty
  `dictionary.booking.book`. `assertBookingLabelPresent` (in
  `src/config/i18n/index.ts`, run at build time) throws a descriptive error
  naming the offending locales instead of silently hiding an enabled CTA.
  Disabled/absent booking requires no label.

## Regionalized pages & operating context (Phase K)

Phase K separates **Locale** (how the site communicates) from **Region**
(where and under what operational conditions the business operates) from
**Page** (which content/route the customer sees):

```text
Page = locale + content slug + optional region
Region = timezone + address + geo + contact + seven-day hours + holidays
```

- **Model (`src/core/region.ts`).** `OperationalRegion` carries its own
  required IANA `timezone`, address (+ optional international), geo, phone,
  email, and a seven-day `RegionSchedule` (monday…sunday, each an array of
  `HH:mm` intervals) plus structured `holidays` (`date` + `name` + `closed` /
  `intervals`). `PageRegionBinding` maps `(locale, slug) → region id`. Pure
  `resolvePageRegionBinding` / `resolveRegion` never throw; `assertRegionsValid`
  (build time, from the loader) rejects unknown regions, duplicate bindings,
  unconfigured locales, `local-international` without an international address,
  and invalid holiday dates/names.
- **Evaluation (`src/core/region-hours.ts`).** Regions reuse the ONE
  DST-safe time engine: `openStatusFromIntervalsStartingOnDay` in
  `src/core/business-hours.ts` (extracted so locations and regions share one
  algorithm). Holiday precedence is *weekly schedule → date override → resolved
  hours* — a listed holiday without intervals is closed. Overnight intervals
  (`close < open`) carry into the next day, including from a holiday.
- **Page context (`src/application/page-context.ts`).** The single, pure
  compositor: `resolvePageContext(regions, bindings, locale, slug)` yields the
  page's optional region. The dynamic route `app/[...segments]/[slug]/page.tsx` is
  the ONLY consumer of page→region resolution; it statically lists per-locale
  content slugs minus those owned by static routes (`about`, `contact`,
  `resources`), so page existence stays content-driven and per-locale.
- **Route/timezone authority.** A regional page's timezone, address, phone,
  email, geo, hours, holidays, status, directions, and JSON-LD come ONLY from
  its resolved region — never inferred from locale, and never merged with the
  legacy global `business` block. `locale → timezone` is not a rule: `/ww/en/toronto`
  (America/Toronto) and `/ww/en/los-angeles` (America/Los_Angeles) are different
  timezones for one locale; `/ww/en/toronto` and `/fr/toronto` share one region.
- **Consumers.** `components/site/region-block.tsx` renders the resolved
  region's visible identity (address, phone/email, IANA timezone, all seven
  days individually with locale-localized names, holidays, live open/closed
  status, directions via the existing maps seam — `regionToLocation` adapts a
  region to the `BusinessLocation` port without giving the adapter region
  awareness). `components/site/region-structured-data.tsx` emits ONE
  `LocalBusiness` node for the resolved region. Non-regional pages render no
  operational NAP/JSON-LD — they must not invent an identity.
- **Deterministic modal precedence.** `business.regions` present (non-empty)
  → the site is in regional mode: the layout/footer suppress the legacy global
  `BusinessInfo`/`StructuredData` so nothing can leak. `business.regions`
  absent → the legacy global model renders exactly as before (Phase G/I
  behavior). The two are never merged.
- **Sitemap.** Routes are derived per locale from that locale's content
  (page inventories may differ), so `/ja/toronto` is never emitted and a
  regional page only appears where it exists.

## Locale + Location as first-class page context (Phase L)

Locations are **not** ordinary navigation links. A rendered page is the
product of two independent selectors — **Language** and **Location** — plus the
content page:

```text
Page = locale + region + page      (e.g. /en/toronto/about)
```

- **URL model.** `/{locale}` (site home), `/{locale}/{region}` (regional
  landing), `/{locale}/{region}/{page}` (regional page). The ONE generic page
  route `[...segments]/[...path]/page.tsx` serves every page (flat or nested) and keeps
  `dynamicParams = false`, so a path that no page answers is a proper 404
  (e.g. `/ja/toronto`, `/ww/en/toronto/contact`).
- **Config shape (`business.pages`).** Entries are `{ locale, region }`
  (landing) or `{ locale, region, slug }` (regional page). Every bound
  `(locale, region)` MUST have a landing entry (validated at build time);
  duplicate `(locale, region, slug)` entries fail; region ids may not collide
  with static route slugs. The Phase K form `{ locale, slug, region }` with
  `slug === region` is migrated automatically by the loader.
- **Pure resolution (`src/core/regional-pages.ts`).** `regionsForLocale`,
  `pagesForRegion`, `hasPageEntry`, `resolveLocationDestination`,
  `resolveLocaleDestination`, `regionalPath`, `parseRegionalPath`, and
  `buildRegionalLanguageAlternates` answer every inventory + navigation
  question. Components receive resolved options/destinations; there is no
  `RegionalService<T>`-style abstraction.
- **Deterministic switching.** Switching LOCATION keeps the locale: same page
  → landing → (defensively) first configured page → option omitted (never a
  dead link). Switching LANGUAGE keeps the region: same page → landing → first
  page → the locale simply is not offered (never a silent region change).
  The header renders a Location `<select>` beside the Language `<select>`;
  both are config-driven, show the active selection, and produce real URLs
  (no client-side state determines the current location).
- **Page independence.** Any region may expose any page inventory under any locale: a
  regional page exists exactly when it is BOTH authored as a page AND bound for that
  `(locale, region)` in config. The private reference demo proves same locale →
  different timezones and currencies (e.g. en/sydney with AUD, en/london with GBP,
  en/toronto with CAD, en/new-york with USD) and same region → multiple locales
  (en+fr toronto).
- **Regional content is PAGES with region chrome (A1E).** `/{locale}/{region}` is the
  region's landing and `/{locale}/{region}/{page}` a configured regional page; both are
  ordinary page sources resolved through the ONE composition, and the region supplies
  the operational identity (timezone, address, contact, hours, holidays, status,
  directions, JSON-LD). Nothing else inside a region's namespace is served, so a
  regional URL can never render without its region. The former regional offerings
  routes (and their per-region price/currency resolution) went with the offerings
  collection.
- **SEO.** Regional pages emit canonical URLs, hreflang only for genuinely
  configured `(locale, region, page)` equivalents (with landing fallback for
  a region that lacks the exact page), and `x-default` only when the default
  locale has a destination. The sitemap contains only real configured
  combinations — regional content slugs are not double-emitted as flat routes.

## Selector semantics, Connect & template identity (Phase M)

Phase M makes the two-dimensional UX explicit and unambiguous without
redesigning the Phase K/L model.

- **Location selector inventory & alphabetical sorting.** The **Location** selector lists
  every CONFIGURED operating location (`business.regions` is authoritative) in strict
  alphabetical order (Berlin, Jakarta, London, Los Angeles, Madrid, Moscow, New York,
  Paris, Seoul, Shanghai, Sydney, Tokyo, Toronto) plus a permanent leading **Unspecified** option.
  Option text is computed via `regionDisplayName(locale, region)`:
  - In non-English locales: the selected language name appears first, followed by the English
    name in brackets if distinct (`서울 (Seoul)`, `東京 (Tokyo)`, `Londres (London)`).
  - In the English locale: the English name appears first; for locations whose primary
    language is non-English, the native name appears in brackets if distinct (`Tokyo (東京)`,
    `Seoul (서울)`, `Moscow (Москва)`), while English-primary locations omit brackets (`London`,
    `Sydney`, `New York`).
  The **Language** selector lists locales with the default locale (English) pinned first,
  followed by all remaining locales in alphabetical order.
- **Unspecified location.** Explicitly labeled (never a bare "Location" that
  reads like a real location). Selecting it returns to the equivalent
  non-regional page: `/ww/en/toronto/about` → `/ww/en/about`, `/ww/de/berlin` → `/de`
  (`unspecifiedDestination`). Generic pages still invent no operational
  identity.
- **Deterministic locale on a location switch.** When the current locale is
  not bound to the target region, the destination becomes the region's
  configured **`defaultLocale`** + its landing (a forced locale change ends at
  the landing; the page is never preserved across it). `defaultLocale` is
  explicit per region (validated at build time: it must be a configured locale
  AND bound to the region); absent, it derives from the region's first landing
  binding. Never inferred from country/browser/timezone.
- **Region-aware navigation.** Primary/footer navigation is resolved through
  the URL-authoritative `ContextNavLinks` client component + the pure
  `resolveNavHref` core function. In a regional context only pages that
  actually exist for `(locale, region)` are exposed — a nav item never
  promises one page and silently delivers another, and never silently drops
  the visitor into the generic context. `href === "/"` always resolves to the
  regional landing: **Home means home for the currently selected location**.
  Global pages reachable from regional contexts are an explicit future
  configuration concept, not an implicit fallback.
- **Connect page + configuration.** `site.config.json` gains a small
  domain-specific `connect.methods` array (`{ id, label, href, demoOnly? }`).
  The Connect page (`/{locale}/connect`, static route like About) renders each
  mode + a visible demo notice; `demoOnly` entries carry a demo badge. The
  Contact page stays at `/contact` with a visible "not connected to a real
  backend" notice (no fake backend, no provider). The footer's **Connect**
  column carries the Connect/Contact page links + methods + `socialLinks`;
  Contact no longer appears under **Navigate**.
- **Template identity.** The Foundation demo brand is "Your Business Site"
  (name, header, metadata, demo copy); "My Site" is gone from visitor-facing
  output. Adopters keep their own brand.

## Presentation localization & Connect UX (Phase M refinement)

A focused consistency pass over Phase M — no architecture redesign, no new
service layer, no changes to the hours/DST engine or the region authority
model. All presentation data is explicit configuration or the platform's
`Intl` table; nothing is inferred from country/browser/timezone.

- **Display-name helpers (`src/core/display-labels.ts`, framework-free).**
  `displayNameWithEnglish(localized, english)` shows `Localized (English)`
  only when the two differ (never `English (English)` / `Toronto (Toronto)`).
  `regionDisplayName(locale, region)` renders the **location selector** names:
  `region.labels[locale]` where configured, else the canonical English
  `region.label ?? name ?? id`, with the English suffix when different
  (`東京 (Tokyo)`, `Montréal (Montreal)`). `locale`'s are nothing more than
  labels; region ids stay language-neutral.
- **Language selector.** `i18n.locales[].englishLabel` (explicit config) +
  `displayNameWithEnglish`: `Français (French)`, `Deutsch (German)`, …
  applied in the one shared switch, on every page and regional context.
- **Timezone in the Business Hours heading.** The timezone is no longer a
  standalone element beside the hours block. Both `RegionBlock` and the
  legacy `BusinessInfo` render `Hours (Time Zone: <localized (<English>) —
  <IANA>)` as ONE heading unit. Human names come from
  `Intl.DateTimeFormat(...).timeZoneName` (the platform ICU table) against a
  fixed reference date for determinism; the English parenthetical is omitted
  when identical; the authoritative IANA identifier is always present. The
  DST/hours engine is untouched.
- **Footer Connect section = pure gateway.** The section **heading IS the
  `/connect` link** (`ContextConnectHeading`, resolved via the same
  URL-authoritative `resolveNavHref` the header uses — regional contexts get
  `/{locale}/{region}/connect`, absent regional pages render no link). Beneath
  it sit ONLY the configured connection methods through `ContextNavLinks` (no
  duplicate Connect item, no separate Contact item). Method labels come from
  ONE shared helper **`connectMethodLabel`** (`dictionary.connect.methods[id]`
  → config fallback), used identically by the Connect page and the footer.
  The `/contact`-backed **Message Us** action is the single message-form
  action and is omitted in regional contexts where `/contact` is not a
  regional page (no invented URLs, no silent locale/location reset — external
  deep links can never reset context).
- **Viber.** Added to the demo as a configured `connect.methods` entry
  (`viber://chat?number=…`, `demoOnly: true`) — Connect page + footer both
  derive it purely from configuration. No provider/SDK/backend.
- **Message Us naming.** The connection action is consistently "Message Us"
  (config label + `dictionary.connect.methods.message`); the technical route
  stays `/contact`; the Contact page keeps its explicit demo-only notice.

## Contact inquiry (Phase B)

The inquiry capability is a frontend + integration seam: `/contact` renders a
config-driven, localized form; submissions flow through a server action into a
framework-free application port; the adopter owns the receiving system.

- **Layering:** browser → `src/app/[...segments]/contact/page.tsx` +
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

## Provider Integration Pattern (Phase H)

External services are integrated through a small, **domain-specific** hexagonal
seam. There is deliberately **no generic `ExternalService<T>` abstraction, no
provider registry, and no DI container** — each capability owns its own port,
result types, configuration, and adapters, and they share a documented
convention rather than a shared runtime substrate.

```
Business capability
      ↓
small port                  (src/application/<domain>.ts)
      ↓
provider factory            (src/adapters/<domain>/index.ts)
      ↓
small adapter               (src/adapters/<domain>/<provider>.ts)
```

The four current seams:

| Capability | Port | Adapters | Provider config |
|---|---|---|---|
| **Maps directions** | `DirectionLinkResolver` (`direction-link.ts`) | `maps/{google,none}` | `features.maps` |
| **Booking action** | `BookingActionResolver` (`booking-action.ts`) | `booking/{external-url,none}` | `features.booking` |
| **Analytics** | `createAnalyticsProvider` factory | `analytics/{index,vercel-analytics}` | `features.analytics` |
| **Contact inquiry** | `ContactInquirySender` | `contact-inquiry/{webhook,stub}` | `features.contact` |

Guiding rules:

- **Domain-specific ports.** A port is the smallest interface that expresses the
  business capability (a directions action, a booking action, a sender). Ports
  live in `src/application`, depend only on `src/core`, and never import
  adapters or provider SDKs.
- **Adapters own provider behavior.** The concrete provider implementation
  (URLs, SDKs, network, secrets) lives entirely inside `src/adapters/<domain>/`.
  A deep-link maps provider is **keyless** (a public address/coordinate in a URL
  is not a secret); if a future provider needs credentials, it introduces its
  own env-backed configuration without contaminating the common contract.
- **Factories select, adapters do.** `src/adapters/<domain>/index.ts` resolves
  the configured provider to an adapter. The factory must not contain the
  provider's behavior in one giant file — provider logic lives in per-provider
  adapter files.
- **Composition boundary is `src/app`.** Provider selection is passed into
  `src/app` (e.g. `createDirectionLinkResolver(siteConfig.mapsFeature)`), and
  the composition result is passed down to presentational components. Components
  receive the **already-resolved** action (or nothing) — they must never
  construct provider URLs or branch on `provider ===`.
- **Optional by default.** Every integration is optional. No `features.*` block,
  or an explicit `"none"` provider, means the integration is intentionally
  disabled: no directions link, no booking CTA, no analytics, and the site works
  unchanged. There is no forced third-party account.
- **Misconfiguration fails loudly, never silently to `none`.** A configured-but-
  invalid provider (e.g. `features.booking` with `provider: "external-url"` but
  no url) is rejected by the schema at build time and, at the factory, throws a
  typed domain `MisconfigurationError` (analogous to
  `ContactInquiryMisconfigurationError`). It is never silently downgraded to the
  disabled adapter, so a deployment error is caught immediately.
- **Provider replacement is a local change.** Switching `maps: google` to a
  future `maps: apple` (or booking to another scheduler, or analytics to another
  provider) is an adapter + configuration change — never a rewrite of
  `src/app`, `src/components`, `src/core`, or `src/application`.
- **Static links vs interactive embeds.** Maps and booking are currently
  **static external actions** (keyless directions deep links; a public booking
  URL). An interactive embed (Calendly inline, a map iframe with a keyed tile
  provider, a hypothetical analytics widget) is a separate future capability
  and is explicitly deferred; the seam accommodates it additively.

### Outbound intent seams — verified contract (Phase I)

The Phase B/H/M/C outbound seams were verified in Phase I as a single,
cross-cutting contract rather than rebuilt:

- **`tests/unit/outbound-seams.test.ts`** proves the common principle across
  capabilities: each seam exposes a bounded, provider-neutral result
  appropriate to its intent (booking/maps link actions `{kind, provider, href}`
  or `{kind: "none"}`; contact's operation/status domain), honors explicit
  off/demo states, fails loudly for a configured-but-invalid provider (typed
  `*MisconfigurationError`, never a silent fallback), never substitutes one
  provider for another, and never fabricates a delivery (transport failure and
  the demo stub can never report success).
- **`tests/architecture/boundaries.test.ts`** ("outbound server-action &
  isolation boundaries") additionally proves the negative guarantees: the
  contact server action imports senders only through the contact-inquiry
  factory; webhook secrets are read lazily from `process.env` at the server
  action and exist nowhere in `src/config`, `src/core` (outside the sanctioned
  `ContactInquiryEnv` type in `contact-inquiry.ts`), `content/`, or
  `site.config.json`; presentation cannot import concrete provider adapters;
  core cannot import adapters or config (Phase I).
- **Naming note.** This roadmap *Phase I — Outbound Integrations & Action
  Seams* is distinct from the earlier locale-identity milestone whose release
  tag was `v2026.08.29-foundation-phase-i`. To disambiguate, the outbound
  milestone ships as **`v2026.09.03-foundation-phase-i-outbound-seams`**.

### Locale integration (Phase G composing)
### Trust & publishing content (Phase T, re-expressed by A1E)

Testimonials, portfolio/case studies, the blog and the offerings catalogue all used to
be author-facing **collections** with their own directories, parsers, feature flags,
chrome components and route files. FOUNDATION-PAGES-A1E removed that second model:
**if authored content has its own URL, it is a page**, so each of those is now
authored as ordinary pages under `content/pages/` and served by the ONE page route.

What that means in practice:

- **No collection store.** `fs-page-content-repository` and its port are gone, along
  with the `ContentCollection` union. Nothing but the two page modes can produce a
  route, and a test asserts that neither can return.
- **No collection roots.** `content/offerings/`, `content/legal/`,
  `content/testimonials/`, `content/portfolio/` and `content/posts/` are gone from
  the human-facing area and from the tree.
- **No feature-flag gating for content.** `features.offerings`,
  `features.testimonials`, `features.portfolio` and `features.blog` are gone: a page
  exists because a file exists, and it is exposed by linking to it (or by
  `navigation[]`). A flag that could hide an authored page would be a second,
  competing notion of existence.
- **No collection chrome.** The offering/portfolio/post/testimonial cards, lists,
  details, empty-state and card-image primitives, and their dictionary sections, went
  with the collections.
- **Testimonial quotes, feature cards, statistics and FAQ rows are EMBEDDED content**:
  they live inside the page that shows them — as Markdown today, or as declared sections
  (`cards`, `quote`, `stats`, `faq`, `features`) in the declarative JSON mode A2 added.
  They never needed a filesystem collection.
- **The booking CTA survives.** `features.booking` still composes the booking action
  seam the home page renders; it was never collection-specific.
- **Legal documents survive as configured links to pages.** `legal[]` still decides
  which policy documents the footer surfaces, in order, with a fallback label and
  localized labels; the document itself is a page
  (`content/pages/.../legal/<slug>.md`, served at `/{locale}/legal/<slug>`), and
  existence is checked through the page composition — so a configured entry without a
  page is never linked.
- **Deliberately removed with the collections:** the demo blog's per-locale
  `/blog/rss.xml` feed and its `buildRssXml` helper. A feed needs an ordered, dated
  list of records, which pages do not carry (a page has a title, a summary and a
  body); re-introducing one would be a structured-record capability, not a page
  capability. Reported rather than replaced speculatively.
- **Also removed:** the per-region offering price/currency resolution
  (`resolveOfferingPrice`), which existed to price a catalogue entry in a region's
  currency. The region `currency` / `currencySymbol` configuration keys were left in
  place — they are region identity data, not collection machinery — and a deployment
  that needs currency today states it in the page's own text.
### Analytics privacy posture(Phase U — audit, documentation only)

Phase U prosecuted the consent question against evidence instead of adding a consent
subsystem. Findings:

- **Client-side injection only.** The analytics element is composed through the Phase I
  adapter factoryand injected by the browser after hydration(script
  `/_vercel/insights/script.js`, same-origin; deduplicated by `src`). The built server
  HTML never references `/_vercel/insights`, so SSR/SSG output is identical with or
  without the feature enabled.
- **No client-side storage.** The inspected `@vercel/analytics` v2.0.1 client
  runtime(`dist/index.mjs`) reads/writes no cookies, `localStorage`, or
  `sessionStorage`;the package's only `cookie` references live in the unused server
  request-forwarding helper (`dist/server/*`).
- **Vercel describes Web Analytics as cookieless and anonymized** — vendor claim,
  attributed, not a Foundation legal conclusion. The Foundation ships **no consent
  gate** — no banner, no consent cookie, no analytics-gating capability. A future
  consent capability would require a concrete requirement that cannot be satisfied
  through configuration/documentation alone.
### Locale integration (Phase G composing)

Maps composes with the Phase G locale resolution — there is no second
localization mechanism:

```
locale
  ↓
resolveLocationForLocale(location, locale)
  ↓
resolved BusinessLocation (address / geo / phone)
  ↓
DirectionLinkResolver.resolve(resolvedLocation)
  ↓
provider directions URL
```

No geography is inferred from a locale anywhere in platform code
(`de` → Germany or `ja` → Japan never appears in `src/`); the locale merely
selects a configuration entry. The visible footer address, the structured-data
`PostalAddress`/`GeoCoordinates`, and the directions link all derive from the
**same** resolved location, preserving the Phase G invariant that visible
business data and structured data can never diverge.

## Offerings catalogue (Phase C, superseded by A1E)

The offerings catalogue was the first author-facing collection: a listing route, a
detail route per offering, a feature flag, a dedicated parser, its own
`OfferingsContent` model, sort/featured/price helpers and presentation components
served by a shared `PageContentRepository`.

**All of it is gone.** An offering — like any other authored content with its own URL —
is a PAGE:

```text
content/pages/markdown/ww/en/offerings.md                →  /ww/en/offerings        (the catalogue)
content/pages/markdown/ww/en/offerings/website-design.md →  /ww/en/offerings/website-design
```

That is the same two-mode authoring path as every other page, the same precedence, the
same per-locale fallback, the same safe Markdown policy and the same ONE route. Nothing
about it is special-cased, so there is no catalogue chrome to configure and no feature
flag that could disagree with a file's existence. (See
[Trust & publishing content](#trust--publishing-content-phase-t-re-expressed-by-a1e)
for the complete account of what the removal covered.)

## Legal documents (Phase D, re-expressed by A1E)

A legal document (privacy policy, terms, cookies) is a **PAGE**, reached from the footer
and never listed at an index URL:

```text
content/pages/markdown/ww/en/legal/privacy.md   →  /ww/en/legal/privacy
```

- **Exposure = config ∧ exists.** A document is surfaced only when it is BOTH listed in
  the `legal` config block (`{ slug, label }[]`) AND authored as a page. Configuration
  alone never invents a page and a page alone is never advertised; existence is checked
  through the SAME page composition every route uses, so there is no second store and no
  second notion of "exists". The pure helpers are `configuredLegalDocs`,
  `legalPageRoutePath` and `legalLabel` in `src/core/legal.ts`.
- **Footer discoverability:** the footer renders a legal `<nav>` (localized heading +
  links) only when a configured document's page exists; labels fall back from
  `dictionary.legal.labels[slug]` to the config label. The links point at the page's own
  URL (`/{locale}/legal/<slug>`), which is produced by the file being there.
- **Body localization is the page's own fallback**: a German page is served from
  `content/pages/markdown/ww/de/legal/<slug>.md` when it exists, and the default locale's
  page answers otherwise — the same rule as every other page. No legal-specific
  translation system exists.
- **Sitemap/SEO:** an authored legal page is a page, so it appears in the sitemap and
  carries canonical + hreflang through the ONE page route like any other page. No
  JSON-LD and no legal-advice semantics.

## Content body localization (all pages)

Content **bodies** are localized by the SAME rule for every page: the requested
locale's file is served when it exists, and the default locale's file answers
otherwise. A file at `content/pages/markdown/<site>/<locale>/<route-path>.md` is served when
present; otherwise the default locale answers. There is **no translation system**
beyond the content files — no per-locale schema, no dictionary involvement for bodies,
and no per-kind rule: a page is a page.

The rule applies to the COMPLETE route path, so a nested page falls back exactly as a
top-level one does (`offerings/website-design` resolves through the same four
candidates). Frontmatter travels with the file, so a localized `title`/`description`
is served together with that locale's body. (Footer **labels** and other interface
strings are dictionary-owned and independent — see the Internationalization sections.)

## Error handling & recovery (Phase E)

Unexpected failures have a three-tier boundary model, each of which is a
**Client Component** (App Router requirement) and never surfaces any detail of
the thrown error (message, stack, internal path, or environment) to users:

- **`[...segments]/not-found.tsx`** — expected missing routes and resources
  (unknown in-locale paths via the `[...rest]` catch-all, unknown locales via
  `dynamicParams = false`). It is a Server Component that preserves the locale
  via `next/root-params` `locale()` and renders localized copy from
  `dictionary.notFound` within the `[...segments]` layout.
- **`[...segments]/error.tsx`** — recoverable render errors in the locale segment
  and its children. Because it renders inside `[...segments]/layout.tsx`, the site
  header, footer, and current locale are preserved. It offers a working
  `reset()` ("Try again") and a "Return home" link to `/{locale}`.
- **`[...segments]/global-error.tsx`** — catastrophic/root-layout failures. It is a
  sibling of the root `[...segments]/layout.tsx` and must render its own
  `<html>`/`<body>` (the failed root layout is replaced), so it is intentionally
  minimal and unlocalized with no dependency on header/footer or a known locale.

Both `error.tsx` and `global-error.tsx` are Client Components, so their recovery
UI renders on the client during hydration; the server still returns the correct
status (500) and never leaks exception details. The recovery copy for
`error.tsx` is the canonical `dictionary.error` block, transported from the
`[...segments]` layout (which already resolves the per-locale dictionary) into the
client boundary through the minimal `ErrorMessagesProvider` context seam in
`src/components/site/error-messages-context.tsx`. There is no client-side locale
registry and no duplicated translation data — adding a locale (or changing the
default) is configuration/data work only. `global-error.tsx` stays deliberately
minimal and unlocalized because it renders when the layout itself may have
failed.

- **Security rule (hard acceptance):** no error UI may render `error.message`,
  a stack trace, internal paths, environment details, or `console` output. A
  regression guard in `tests/architecture/boundaries.test.ts` enforces this.

### Why `global-error.tsx` lives at `[...segments]/global-error.tsx` (not `app/global-error.tsx`)

Next.js requires `global-error.js` to be a **sibling of the root layout** — the
layout that renders `<html>`/`<body>`. In most projects that is the conventional
`app/layout.tsx`, which is why the docs show `app/global-error.tsx`.

This project intentionally has **no root `app/layout.tsx`**: the root layout is
the dynamic `[...segments]/layout.tsx` (the documented, recommended i18n layout that
renders `<html lang>`/`<body>` and owns `generateStaticParams` +
`dynamicParams`). The Step 0 empirical finding (Phase E, verified against a
Next.js 16.3.1 production build) is that introducing a true root
`app/layout.tsx` **breaks the existing locale contract**: `[...segments]` must remain
the root segment for `next/root-params` `locale()` to resolve. With a root
`app/layout.tsx` added, the production build fails with
`Error: Export locale doesn't exist in target module` at
`src/app/[...segments]/not-found.tsx` (the same build failure also breaks every
server component reading the locale via `next/root-params`).

Per the Phase E implementation gate ("do not introduce a broader layout
refactor unless Next.js requires it"), that trade-off was rejected. The global
error boundary is therefore placed as the sibling of this project's root layout
at **`src/app/[...segments]/global-error.tsx`** — it still renders its own
`<html>`/`<body>`, still catches catastrophic failures in the root layout, and
remains intentionally minimal and unlocalized because the root layout (and with
it the header, footer, and known locale) is exactly what failed.

## UI System Architecture & Configuration Contract (UI program)

The Foundation UI system is governed by `plan/foundation_ui_roadmap.md` (what)
and `plan/master-ui-phase.md` (the sequential implementation phases). UI-01
(this milestone) establishes the **contract layer only**: the `ui`
configuration namespace, the composition model, the precedence model (types
only), and the boundaries later phases build against. It introduces no new
rendering, no shell, and no responsive behavior; the existing classic-style
composition in `src/app/[...segments]/layout.tsx` is the pre-UI rendering and
remains untouched until later phases consume the contract.

### Configuration namespace

Intent-level configuration lives under the optional top-level `ui` key in
`site.config.json` (roadmap §11). Configuration describes intent; the
Foundation handles implementation — the namespace contains no pixel-level
switches.

| Key | Vocabulary | Meaning |
| --- | --- | --- |
| `shell.header` / `shell.footer` | `standard` \| `minimal` | Page-frame intent |
| `navigation.desktop` | `top` \| `sidebar` \| `minimal` \| `floating` | Desktop composition override |
| `navigation.tablet` | `top-compact` \| `collapsed-sidebar` \| `minimal` \| `floating` | Tablet composition override |
| `navigation.mobile` | `drawer` \| `bottom-bar` \| `top` \| `overlay` \| `persistent-sidebar` | Mobile composition override. NAV1D — `persistent-sidebar` presents the SAME persistent rail the ≥md bands present: it is how a configuration says "the sidebar, at every width" instead of letting a breakpoint substitute a drawer for it |
| `density` | `compact` \| `comfortable` \| `spacious` | Overall density intent |
| `content.width` | `narrow` \| `standard` \| `wide` \| `full` | Content area width intent |
| `cta.enabled/action/label/href/style` | boolean / semantic action / string(s) / `standard` \| `prominent` | Primary CTA intent (action/label/href adopter-owned) |
| `theme.mode` / `theme.radius` | `system` \| `light` \| `dark` / `none` \| `small` \| `medium` \| `large` | Visual theme intent |

Every value is validated by `src/config/schema.ts` (`uiConfigSchema`) and flows
through the single validated loader path as `siteConfig.ui`. The allowed values
derive from `src/core/ui/vocabulary.ts` (framework-neutral) — the single source
of truth shared by the schema and the engine. Unknown keys and invalid
values fail the build with an actionable message.

### Precedence model

```text
Explicit developer override (ui.* leaf)
        ↓
Foundation canonical default (FOUNDATION_UI_DEFAULTS)
        ↓
Completeness invariant (assertResolvedUiConfigComplete)
        ↓
Resolved UI configuration (ResolvedUiConfig)
```

UI-01 fixed the model and the types. **UI-02 delivers the single resolution
machinery** — `src/core/ui/resolve.ts` (`resolveUiConfig(raw: UiConfigInput): ResolvedUiConfig`,
pure, deterministic, framework-free, with the exported completeness guard
`assertResolvedUiConfigComplete`). The resolver never depends on the
configuration layer: the input shape `UiConfigInput` mirrors the validated
`UiConfig` surface structurally and lives in core (`siteConfig.ui` is directly
assignable to it).

### Foundation-level defaults (UI-02, owner-approved)

`src/core/ui/defaults.ts` — neutral platform defaults; no business action is
ever invented:

| Leaf | Foundation default |
| --- | --- |
| `shell.header` / `shell.footer` | `standard` |
| `navigation.desktop` | `top` |
| `navigation.tablet` | `top-compact` |
| `navigation.mobile` | `drawer` |
| `density` | `comfortable` |
| `content.width` | `standard` |
| `cta.enabled` | `false` |
| `cta.action` / `cta.label` / `cta.href` | `undefined` (adopter-only business strings; `href` never inferred from `action`, UI-07 D1) |
| `cta.style` | `standard` |
| `theme.mode` | `system` |
| `theme.radius` | `medium` |

### Shared UI Primitives (UI-03)

`src/components/ui/` — reusable, **identity-agnostic, prop-driven** primitives
the Shell Engine (UI-04) composes into the canonical presentation and later
reuse. They accept semantic intent as plain props (labels, hrefs, active state,
items) and never import configuration, core, adapters, `siteConfig`,
`ResolvedUiConfig`, or any presentation (boundary-enforced).

| Primitive | Responsibility | Client? |
| --- | --- | :-: |
| `AppShell` | Composition frame (header / nav / main / secondary / footer / mobile slots); the deterministic `<main id>` skip-link target. **Frame only — no shell-engine policy** | — |
| `Navigation` / `NavItem` | Landing landmark + list; NavItem is server-safe and data-only (label/href/active/external/badge/variant), `aria-current="page"` | — |
| `NavGroup` | Heading + items; collapsible variant = client disclosure (`aria-expanded`/`aria-controls`) | collapsible |
| `NavCta` / `NavBadge` | CTA variant + presentational chip | — |
| `BottomNavigation` | Bottom-bar landmark + list (touch-target spacing via tokens). The LANDMARK box and the LIST are separate props: the list owns its item rows, so horizontal flow, wrapping and the gap belong to it — never to the `<nav>` that wraps it (NAV1A) | — |
| `Sidebar` | Rail + disclosure toggle (`aria-expanded`/`aria-controls`). Its open/closed state is the ONE visitor-owned presentation preference of the rail: persisted browser-locally (`foundation.sidebar` open\|closed — the contract lives once, beside the primitive, in `src/components/ui/sidebar-contract.ts`) and resolved ONCE per document, so a rail re-created by a reload or a client-side navigation renders the visitor's state from its first render — no correction, and therefore no collapse/expand flicker while a destination loads. On a FRESH document the preference is applied by a synchronous pre-paint bridge (`@/components/ui/sidebar-preference-boot` + `src/components/ui/sidebar-contract.ts`, marking `<html>` for the boot interval only) so a stored OPEN rail is painted OPEN before hydration and the marker is relinquished at the first runtime commit; that same seam presents the rail's state-dependent CONTENT, because the disclosure CONTROL declares both states' artwork and label and the stylesheet presents exactly one of them (FOUNDATION-UI1-A3) — so the control's icon and its Show/Hide navigation copy belong to the visitor from the first painted frame as well, instead of being swapped at hydration — and it applies the OPEN state's SEMANTICS too (FOUNDATION-UI1-A3-A1): `aria-expanded` and the control's accessible name are single-valued attributes a static document can only carry canonically, so the same script writes them for every control as it appears (in the author-supplied-name modes the name is declared in the control's own markup) and stops at `DOMContentLoaded`, after which the runtime owns them — the presented state and what the control claims about it are therefore the same state from first paint through hydration; the canonical no-preference state is CLOSED and the toggler is the only thing that changes it (see `CUSTOMIZING.md` — the sidebar disclosure) | collapsible |
| `Drawer` | Generic overlay/dialog primitive behind the roadmap's "MobileDrawer"/overlay concepts (naming note); `role=dialog` + `aria-modal` + `aria-labelledby`, Escape closes, closed-by-default SSR (nothing rendered when closed) | ✅ |
| `OverlayNavigation` | Composition over `Drawer` (full-viewport overlay use) | ✅ |
| `state.ts` | Pure `disclosureReducer` / `createInitialDisclosure` (framework-free) | — |

**Composition boundary (preserved):** `Configuration → ResolvedUiConfig → Shared
Primitives (UI-03) → Shell Engine (UI-04) → Canonical presentation`. The primitives are
**not wired into the live layout in UI-03**; UI-04 owns shell composition and
responsive transformation (the primitives contain no breakpoint/media-query
policy and no presentation-selection logic).

**Accessibility contract — structural vs behavioral:** UI-03 ships the semantics
(landmarks, ARIA attributes, disclosure states, deterministic SSR-safe closed
defaults, conditional rendering so closed panels contribute nothing focusable).
The **behavioral matrix** (keyboard navigation, focus trap/return, Escape,
scroll locking, responsive interaction, reduced motion) is a **mandatory UI-10
browser-validation gate** — UI-03 implements the underlying behavior but does
not fake browser verification in unit tests.

### Shell Engine (UI-04)

`src/core/ui/shell.ts` + `src/components/shell/*` — the orchestration layer
that consumes the RESOLVED semantic intent (UI-02) and the shared primitives
(UI-03) to render the responsive shell.

- **Decision core (`src/core/ui/shell.ts`)** — pure, framework-free:
  `resolveShellPattern(resolved)` maps the resolved per-viewport navigation
  patterns + shell/CTA values into a deterministic `ShellPatternDecision`
  (primitive kind per viewport, slot, CTA placement, density/content-width
  utility classes). It is a pure function of the VOCABULARY VALUES — never
  presentation identity — so no composition needs a change here.
- **Engine (`shell-engine.tsx`, server)** — composes the `AppShell` frame with
  content slots; applies density/content classes; renders a primary CTA only
  when `resolved.cta.enabled` AND label+href are supplied (the Foundation never
  invents one by default); composes the aside/sidebar and mobile bottom-bar
  layers for aside/bottom-bar compositions (UI-05). The ≥md header-slot nav
  landmark and the <md mobile layer (`ShellMobileNav`: trigger + closed-by-
  default drawer/overlay) are composed into the header by the content layer
  (`SiteHeader`).
- **Boundaries (master §7):** the engine understands intent, not business
  content; it imports no configuration/adapters and receives resolved/config
  context (locale, pageBindings) via props; it branches ONLY on vocabulary/
  structural values, never presentation identity. The shared primitives stay
  breakpoint-free; the only responsive utilities are the Tailwind classes the
  engine/layout emit.
- **Wiring (UI-04/UI-05):** `layout.tsx` computes `resolveUiConfig(siteConfig.ui ??
  {})` once and renders through `ShellEngine`. Responsive behavior:
  * **Desktop/tablet (≥`md`) → existing composition preserved** — a
    header-slot (top-bar) composition renders byte-identically to the previous
    shell at those widths.
  * **Mobile (<`md`) → intentionally modernized** to the declared mobile
    pattern (the roadmap-Classic drawer; with Adaptive, the bottom bar + More
    drawer).
  Note: this is NOT a "zero visual delta" claim across all viewports — the
  mobile navigation is intentionally the declared (modernized) pattern.

### One canonical presentation (2026-09 closure)

The Foundation presents **one canonical composition**. There is no
presentation/profile selection layer anywhere in the active architecture:

- **No `ui.preset` key.** `uiConfigSchema` is `.strict()`, so a configuration
  that still carries the retired key fails validation as an unknown key rather
  than silently activating another presentation.
- **No profile table.** `src/core/ui/presets.ts` (the five semantic profiles and
  `uiPresetProfiles`) was deleted; `defaults.ts` declares no `defaultPreset`.
- **No selection point.** Resolution is exactly
  `override ?? FOUNDATION_UI_DEFAULTS.<leaf>` (see the precedence model above):
  `src/core/ui/resolve.ts` contains no profile lookup and no fallback selection
  string (source-scan tested).

The composition values the canonical presentation used are ordinary entries in
`FOUNDATION_UI_DEFAULTS` (`src/core/ui/defaults.ts`):

| Leaf | Value |
| --- | --- |
| `navigation.desktop` | `sidebar` |
| `navigation.tablet` | `collapsed-sidebar` |
| `navigation.mobile` | `bottom-bar` |
| `shell.header` / `shell.footer` | `standard` |
| `shell.sidebar.collapsible` | `true` |
| `presentation` | `PRESENTATION_DEFAULTS` (balanced / default) |
| `density` | `comfortable` |
| `content.width` | `standard` |
| `theme.mode` / `theme.radius` | `system` / `medium` |
| `cta.enabled` / `cta.style` | `false` / `standard` |

Because the flattening reused the exact effective values, the resolved
configuration and the rendered site are **unchanged** by the removal.

**Capability claims (P0-6).** `FOUNDATION_UI_CAPABILITIES`
(`src/core/ui/defaults.ts`) is the Foundation's single audited row of the roadmap
§24 capability matrix. A level may only be raised when the implementation +
composition + (for `supported`) the browser verification exist, and the claim
gate (`tests/architecture/capability-claims.test.ts`) is updated with the
evidence in the same change. The levels are `supported` (sidebar,
collapsibleSidebar, bottomMobileNavigation, mobileDrawer, primaryCta),
`optional` (topNavigation), `limited` (complexNavigation,
applicationDashboard) and `unsupported` (overlayNavigation, secondaryPanel,
visualFirst).

**Retired feature (historical).** UI-05–UI-10 built and shipped a *selectable*
presentation model: five semantic profiles (`classic`, `adaptive`, `focus`,
`workspace`, `immersive`), an adopter-facing header selector, and five externally
hosted demo deployments. The owner retired the feature in 2026-09: the selector,
the profile table, the `ui.presetComparison` deployment map and the
five-presentation browser permutations are gone, and the sibling demo repository
and its deployments were removed. The engine architecture those milestones
established — vocabulary-driven resolution, identity-free shared primitives, a
pure decision core, the shared modal/accessibility contract and the committed CDP
matrix — is unchanged, and is still exactly what the canonical presentation runs
on. The detailed milestone history is preserved in this repository's Git history.
### Theme/layout separation

The composition leaves (`shell`, `navigation`) select the layout & interaction
structure; `theme` selects visual styling. Visual styling stays token-driven in `src/app/globals.css` (Phase D).
A client-side theme controller for explicit `light`/`dark` modes is a
later-phase concern and is not introduced by the contract.

### Accessibility contract

Every later UI phase ships accessibility as part of the implementation
(master-ui-phase §22): semantic landmarks, full keyboard operability, the
single `--ring` focus contract, correct focus management for drawer/overlay/
bottom-bar patterns, adequate touch targets, `prefers-reduced-motion` support,
and WCAG 2.1 AA contrast (existing token pairs remain enforced by
`tests/unit/design-tokens.test.ts`).

A **persistent top region** additionally clears fragment targets:
`html:has(.ui-shell-top)` carries a `scroll-padding-top` clearance
(`--ui-shell-top-clearance`), removed in exactly the bands where the rail — not
the header — is persistent, so a skip link or an in-page anchor never lands
beneath the sticky header (see *Persistent navigation* below).

### Persistent navigation (shell top region + rail content column)

A visitor must never have to scroll back to the top of the page to reach another
page. The shell therefore composes **two persistent regions, never at the same
width**:

| Where | What persists | Why |
| --- | --- | --- |
| any width where a **rail band** is composed beside the content | the rail's **content column** (`.ui-sidebar-rail-sticky`: its show/hide control and its navigation list) | the composition already puts the navigation beside the content |
| everywhere else — a header-slot composition, and every width below `md` | the shell's **top region** (`.ui-shell-top`: the header — identity, the navigation-mode selector, any header-slot navigation, and the contextual controls) | the header is where the controls are |

- The engine (UI-04 `ShellEngine`) emits the rail-band markers
  (`ui-shell-top--rail-md` / `ui-shell-top--rail-lg`) as a pure function of the
  **resolved slot vocabulary** (`decision.{desktop,tablet}.slot === "aside"`).
  The stylesheet returns the top region to normal flow inside exactly those
  bands, so the two regions can never be sticky at once, can never overlap, and
  no measured offset between them is needed. Neither value carries presentation
  identity, configuration or business content.
- Both regions use `position: sticky`, never `fixed`: they stay in flow, reserve
  their own height, can never cover page content, and the footer still scrolls
  into view beneath them.
- The rail's content column is bounded by the **viewport** (`max-height: 100dvh`)
  and scrolls on its own when the navigation is taller than that
  (`overflow-y: auto`, `overscroll-behavior: contain`), so no destination becomes
  unreachable. The rail is therefore `overflow-x: clip`, never `hidden` —
  `hidden` would make the rail a scroll container and pin its sticky child to the
  rail instead of the viewport.
- The **primary CTA is deliberately NOT part of what persists**: it keeps its one
  top-region home and stays in normal flow (P6-3C), because persistence exists
  for navigation — a destination list — not for actions.
- Asserted by `tests/unit/shell-persistent-navigation.test.ts` (the composition
  and CSS contract) and by the browser matrix's `persistent-navigation` scenario
  (rendered behaviour: stickiness, reachability, one persistent region per width,
  no rail/content overlap, a long navigation scrolled inside the column, fragment
  clearance, the mobile disclosure while scrolled, and unchanged destinations).

### Shell layout presentation — the optional visitor switcher (N2)

A Foundation site has **one** shell composition. N2 adds the *optional* capability for a
visitor to choose between the platform's two layouts — a **sidebar** and a bottom **menu bar** —
which exists so a deployment can demonstrate the same site in two presentations.

- **A layout is a PRESET, not a second shell system.** It names three existing vocabulary
  leaves — one per viewport width: `sidebar` = `navigation.desktop: "sidebar"` +
  `navigation.tablet: "collapsed-sidebar"` + `navigation.mobile: "persistent-sidebar"`; `menu-bar` =
  `"top"` + `"top-compact"` + `"bottom-bar"` (`@/core/ui/layout.ts`). Every decision still
  flows through the ONE decision core (`resolveShellPattern`), so a layout cannot invent a
  composition the shell engine does not already implement.
- **The viewport changes HOW a mode is presented, never WHICH mode it is** (NAV1A). The
  mobile leaf belongs to the layout precisely so that narrowing a window cannot turn a
  sidebar site into a menu-bar site. One shared mobile surface for both — the shipped behaviour
  this contract corrects — made viewport width the owner of the navigation architecture,
  removed the mode control below `md` because there was "nothing to switch", and left the
  sidebar layout's bottom bar stacking its links one per row. No pre-existing mode was
  repurposed, and no navigation data is duplicated.
- **A viewport may not SUBSTITUTE a different navigation for the mode** (NAV1D). Changing HOW a
  mode is presented is not a licence to present something else: the sidebar preset used to name
  the capability's off-canvas drawer (`navigation.mobile: "drawer"`) and so, below `md`, replaced
  the sidebar with a `Show navigation` disclosure band — a substitute the owner rejects, because
  the site's navigation had become a button rather than the sidebar. The preset therefore names
  `persistent-sidebar`, the ONE `navigation.mobile` value meaning "the SAME persistent rail, here
  too": the three rail bands (mobile `<md`, tablet `md…lg`, desktop `≥lg`) render from ONE
  composition, with byte-identical rail markup per band and a single visitor-owned state, and the
  page frame is a wrapping row at every width, so the rail sits BESIDE the content there instead of
  stacking above it. Adding that value is a vocabulary extension made in the ONE place the closed
  vocabularies live (`@/core/ui/vocabulary.ts`; the schema derives from it), and it is deliberately
  NOT called `sidebar`, so each tier's vocabulary stays disjoint (`ui-architecture.test.ts`).
  Sidebar mode consequently composes no drawer, no disclosure band, no trigger and no dialog at
  all; the generic `Drawer`/`OverlayNavigation` capability, and a site that explicitly configures
  `navigation.mobile: "drawer"`, are untouched.
- **THE RAIL'S TWO STATES ARE A LAYOUT CONTRACT, AND OPEN MEANS OVERLAY** (NAV1D-V2 — owner
  decisions). The three bands are RETAINED as separate surfaces, deliberately, for future
  configurability; today they render from the ONE composition and behave identically. CLOSED, the
  rail reserves its narrow column and the page is laid out beside it. OPEN, the rail expands to its
  accepted 220px **as an overlay**: the rail's frame reserves the SAME narrow column in both states,
  so the page's own geometry never moves and the document never gets wider, and the rail leaves the
  flow inside that frame (`inset-inline-start: 0` keeps its left edge, `inset-block: 0` gives it the
  frame's full height so its sticky column still pins) on the persistent-navigation stacking band
  (`z-index: 30`, the value the shell's top region itself uses). It is scoped by the disclosure
  control's presence (`:has(.ui-sidebar-toggle)`), so a non-collapsible rail and every non-sidebar
  composition keep their accepted in-flow presentation. **SELECTING a destination dismisses the
  overlay**: the close goes through the rail's ONE state owner (`Sidebar.apply`, shared with the
  disclosure control), is decided by the SELECTION rather than by the route — so it also closes for
  the page the visitor is already on, and never depends on a breakpoint — and is reachable by
  pointer, keyboard and assistive technology alike, because it is one delegated click listener on
  the rail's own panel. `NavItem` stays plain data + href, and no routing API enters the state
  modules.
- **THE PAGE LAYOUT HAS A DELIBERATE MINIMUM WIDTH** (NAV1D-V2). `--ui-shell-min-inline-size`
  (320px, the platform's established support boundary) is applied to the shell frame only BELOW that
  boundary. At and above it the layout fits the viewport's own content box — no horizontal scrollbar,
  with the rail closed or with the overlay open — and a narrower viewport scrolls horizontally
  instead of deforming the layout.
- **MENU BAR MEANS THE STICKY BOTTOM BAR AT EVERY WIDTH** (NAV1B). The top navigation bar
  presentation is no longer part of Menu Bar mode: the layout's preset also CLOSES its ≥md top
  menu (`topMenu: "closed"` — the shipped three-state menu contract), so no ≥md header
  navigation is composed in any band, and the sticky bottom bar — which covers EVERY band the
  composition leaves without navigation — IS the navigation at desktop, tablet and mobile
  widths alike. Nothing is left behind: a closed menu composes no landmark at all, so there is
  no hidden duplicate to reach by keyboard or assistive technology.
- **Which BANDS a surface occupies is a composition property, never a call-site breakpoint.**
  `resolveShellPattern` reports, per band, whether the composition presents navigation of its own
  (`presentsNavigation`, and the slot it presents it in) and which bands it leaves open
  (`openBands`); `mobileSurfaceBands` + `bandClassName` turn that into the surface's width gate
  (an exhaustive table, unit-tested), while `railCompositions`/`railLayouts` read the same decision
  per band, INCLUDING the mobile band (NAV1D). The canonical sidebar composition therefore keeps
  the historic `<md` bottom bar EXACTLY as shipped, a Menu-bar composition presents it at every
  width, and a `persistent-sidebar` composition presents its rail in all three bands — one
  mechanism, no per-surface special case.
- **The Menu Bar surface spans the viewport** (NAV1D). The sticky bar is a flex item of the shell
  frame, and in the wrapping row an aside composition lays the page out in it shrinks to its
  content unless it carries a width basis — which is how the bar came to read as a small left-hand
  block at desktop/tablet widths. It therefore declares `w-full basis-full` (its own row, full
  viewport width) and its INNER region is bounded only by the page-edge inset: the page's own
  `max-w-page` container is deliberately not applied to a navigation SURFACE. The LIST still owns
  the rows and the wrapping, exactly as NAV1A established.
- **Configuration decides whether it exists.** `ui.layoutSwitcher: { enabled, default }`
  (`@/core/ui/defaults.ts` → `FOUNDATION_UI_DEFAULTS.layoutSwitcher`) is **disabled by
  default**: the Foundation's own composition offers no choice, exactly as it renders no
  CTA. When it is enabled the default layout's patterns ARE the resolved
  `navigation.desktop`/`tablet`/`mobile`, and the schema REFUSES enabling it alongside any
  of those three leaves (two answers to one question is a contradiction, and the Foundation
  fails loudly rather than picking one).
- **THE HEADER'S TWO SEMANTIC ROWS NEVER CHANGE OWNERSHIP** (NAV1B). The header composes two
  regions at every width: the TOP row owns the identity and the navigation-MODE selector, which
  is anchored to the right edge of the padded content (a TEXT identity too long to share the line
  wraps below the selector rather than moving it); the SECOND row owns every other header control
  — the contextual Site/Location/Language selectors, and the ≥md header navigation a CUSTOM
  composition presents. Responsive behaviour may wrap a region's own content, close the sidebar
  or wrap the bar's links; it may never move a control between rows, enlarge a navigation control
  because the viewport narrowed, or relocate a mode's navigation. The sidebar's constrained-width
  disclosure is composed by the ENGINE at the SIDEBAR BOUNDARY (`sidebarLead`, above the content
  row) for exactly that reason: inside the header it migrated between the rows as the visitor
  controls changed width, which is the reported defect.
- **A GRAPHIC IDENTITY UNDERLAYS THE SELECTOR — IT DOES NOT REFLOW AROUND IT** (NAV1B-V1). The
  owner's rule distinguishes the two identity kinds, and so does the shell: a text identity wraps
  inside its own column, while a configured logo keeps the row's ONE track (so its clamp is the
  header's content width — never a narrow column, never shrunk, never distorted) and may continue
  beneath the selector's occupied area, the selector staying right-aligned in the same cell and
  painting ABOVE it (`.ui-site-header-top--graphic` in the stylesheet). Nothing becomes
  interactive: the graphic keeps its existing identity semantics and the selector keeps every
  pointer event inside its own box.
- **One exposed navigation, by construction.** The shell composes the structures of both
  layouts and marks each one with the layouts it is the active navigation for
  (`data-ui-shell-part="rail" | "top-nav" | "bottom-bar" | "mobile-drawer"` +
  `data-ui-shell-layouts`); the stylesheet (`globals.css` — shell layout presentation)
  exposes exactly one for the active `data-ui-shell-layout` value on `<html>`. The gate is
  `display: none`, which is SEMANTIC: the inactive structure leaves the accessibility tree
  and the focus order, so there is never a second focusable navigation system and never a
  duplicate landmark. The MOBILE surfaces are part of that same contract (NAV1A/NAV1B): where
  a rail is not composed the sidebar layout exposes its drawer, and the menu-bar layout exposes
  its bar at every width — never both.
  An open drawer whose layout stops being active also CLOSES itself (the active layout is
  watched on `<html>`), so a withdrawn disclosure can never keep the body scroll lock or
  the background `inert` it applied. Persistent navigation and fragment clearance follow
  the active layout in the same CSS layer (in the menu-bar layout the top region becomes
  the persistent navigation at the widths where a hidden rail structure is also composed).
- **Static generation is untouched.** The server emits the attribute for the configured
  default and the preference lives in browser-local storage (`foundation.layout`) read by
  one small client control (`@/components/site/layout-switcher.tsx`) after hydration — no
  cookie, no session, no server state, so no route becomes dynamically rendered and
  hydration can never disagree with the server. Unavailable/blocked storage or a value the
  vocabulary does not declare falls back to the configured default. With the switcher
  disabled, no attribute, marker, control or extra structure is emitted at all: the markup
  is byte-identical to the single-composition shell.
- **Content is never duplicated.** There is one content tree, one route namespace and one
  locale model; `/ww/de/about` stays `/ww/de/about` under both layouts, and switching changes no
  DOM content — only which of the two composed navigation structures is exposed.
- Asserted by `tests/unit/ui-layout-switcher.test.ts` (vocabulary, resolution, the mobile
  leaf each layout owns, the band each surface covers, configuration coherence, completeness),
  by `tests/unit/shell-header-rows.test.ts` (the header's two semantic rows and their ownership),
  by `tests/unit/shell-layout-presentation.test.ts` (the composed markup, the scope markers
  including the two mobile surfaces, the byte-identity guarantee, and the stylesheet
  contract) and by the browser matrix's `layout-switcher` scenario (rendered behaviour:
  one exposed navigation, Tab never reaching the hidden structure, unchanged content/route/
  locale, persistence through client navigation and reload, an unusable stored value ignored,
  the control available at every width, the per-layout navigation at
  1280/1024/900/768/767/390/360/320 — the menu-bar sticky bar at EVERY width with no top
  navigation, and the SIDEBAR layout presenting the SAME persistent rail at every width (its
  geometry, its symmetrical padding, its focus-ring room and its sticky persistence measured at
  every requested width, with no disclosure band, trigger or header substitute anywhere) — real
  resize transitions, and mobile mode switching) plus its
  `bottom-nav-wrap` scenario (the sticky bar's list layout: one row when the links fit, genuine
  wrapping when they do not, page-edge inset, a full-width surface whose region uses the available
  width, no horizontal overflow, no clipping) and its `header-rows` scenario (the fixed semantic rows under a very
  long identity and under long contextual labels, with test-owned fixtures).

### Boundaries

### Boundaries

| Concern | Owner | Status |
| --- | --- | --- |
| Vocabulary, schema surface, composition semantics, contract types | UI-01 | ✅ shipped |
| Configuration resolution, canonical defaults, overrides, resolved configuration | UI-02 | ✅ shipped (`resolveUiConfig` / `FOUNDATION_UI_DEFAULTS`) |
| Shared UI primitives | UI-03 | ✅ shipped (`src/components/ui`; unwired until UI-04 — the next consumer) |
| Shell orchestration & responsive shell behavior | UI-04 | ✅ shipped (`ShellEngine` + `resolveShellPattern`; wired into the live layout) |
| Canonical aside + bottom-bar composition (**preset framing retired 2026-09**; values now `FOUNDATION_UI_DEFAULTS`) | UI-05 | ✅ shipped (aside rail + collapsed tablet rail + bottom bar) |
| Top-bar composition family (declarative proof — no engine change required) | UI-06 | ✅ shipped (explicit leaves; zero engine changes) |
| Minimal-header composition + the CTA contract (`cta.href`, one top placement, `prominent`) | UI-07 | ✅ shipped (D1–D3; `minimal` chrome DEFERRED) |
| Sidebar+drawer composition (shared sidebar machinery); **grouped nav + secondary panel DEFERRED** | UI-08 | ✅ shipped (zero production-code change; shell SSR-proven) |
| Floating/overlay composition + **overlay-CTA consumer fix**; distinct floating/minimal treatments DEFERRED | UI-09 | ✅ shipped (1 content-layer consumer fix; shell + overlay CTA SSR-proven) |
| Shared behavioral & accessibility gate — focus/inert/backdrop/Escape/scroll in the shared Drawer + B1/B2 ARIA-consumer fixes + committed CDP validation capability | UI-10 | ✅ shipped (browser-validated desktop/tablet/mobile matrix; collapsed-sidebar visual + mobile header-CTA placement DEFERRED) |

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

---

## S1 — sites, languages and the four visitor dimensions

The Foundation serves **one independent website per SITE**, and every public URL names it.

### Page identity

```
/<site>/<locale>/<route>
```

| Part | Meaning | Example |
| --- | --- | --- |
| `site` | one independent website: a recognized lowercase country code, or `ww` (Worldwide / Global, Foundation-defined, not a country) | `ca` |
| `locale` | the language, addressed by a lowercase **path key** | `fr`, `fr-ca`, `zh-hant` |
| `route` | the page's own path inside that site + locale | `about`, `services/web-design` |

Filesystem:

```
content/pages/markdown/<site>/<locale>/<route>.md
content/pages/json/<site>/<locale>/<route>.json
```

There is **no** hidden default site segment, no `main`, and no `pathPrefix`: the site code is
always the first segment. `/en/about` (the pre-S1 site-less form) is completed to the default
site's address by `src/proxy.ts`, so an old link still lands on a real page.

The ONE route that serves pages is `src/app/[...segments]/page.tsx`; the page chrome for the
dedicated URLs (home, connect, contact) is composed by `src/app/[...segments]/dedicated-pages.tsx`
from the SAME resolved page. Two invariants the architecture tests guard:

- a page never resolves across a site boundary — not even for a site that enabled cross-locale
  fallback, which is scoped to that site's own tree;
- a site code is never a locale candidate and a locale is never a site candidate, so a redirect can
  never move a visitor between sites.

### The generated social image lives OUTSIDE the catch-all

`src/app/[site]/[locale]/opengraph-image.tsx` — not `[...segments]/opengraph-image.tsx`. Next.js
requires a catch-all segment to be the LAST segment that modifies the path, so a static metadata
segment under `[...segments]` refuses to build (Turbopack panics before any page renders). The image
keeps the accepted URL (`/<site>/<locale>/opengraph-image`) by using the same two dynamic segments a
page URL carries.

### Locales

A path key is lowercase; standards-facing values use the canonical tag. A country site derives its
country for a simple key, and the reserved Worldwide site derives nothing:

```
ca/en → en-CA      ca/fr → fr-CA      ch/de → de-CH      br/pt → pt-BR
ww/fr → fr         ww/en → en-US      (explicit canonical mapping)
```

Two locale keys of ONE site that resolve to the same canonical tag (`en` and `en-ca` in `ca`, both
`en-CA`) are a HARD configuration error, never a warning: the author chooses one.

### Four independent visitor dimensions

| Dimension | What it changes | Where it lives |
| --- | --- | --- |
| **Site** | which independent website (own pages, chrome, languages, locations) | the first URL segment |
| **Language** | the locale used *inside* the active site | the second URL segment |
| **Location** | the office/city/region context *inside* the active site | `business.regions` + that site's `business.pages` bindings |
| **Layout** | presentation only (Sidebar / Menu bar) | the visitor's own preference, never part of a URL |

A control that has nothing to choose disappears: one site → no Site selector; the active site
serving one language → no Language selector; no locations bound to the ACTIVE site → no Location
selector; the Layout switcher disabled → no Layout control. The Location inventory is **the active
site's** (`regionsForSite`): a location belongs to one site's page tree, so a site that binds none
never offers another site's locations — and never a destination that does not exist.

### The reference deployment demonstrates the full model

The public reference deployment is configured as the worked example, so the architecture above has a
running counterpart:

```text
Global  (ww)  English + Deutsch, no locations, its own Home/About
Germany (de)  Deutsch + English, Locations Berlin and Frankfurt,
              an INDEPENDENT page tree (never a Global fallback)
```

Consequences it makes visible: the Site selector appears because two sites exist; Germany's
`de`/`en` path keys derive the canonical tags `de-DE`/`en-DE` because it is a COUNTRY site; the
Location control appears only on Germany and its neutral choice is *All locations* / *Alle
Standorte* (never the word used for a Site); Location switches stay inside Germany and change
neither the site nor the language; and Layout is untouched by all of them. **Germany, Berlin and
Frankfurt are demonstration data** — placeholders an adopter replaces, not claims about Provelopment.

### Site-scoped configuration and dictionaries

A site may override page-facing configuration (navigation, footer navigation, legal destinations,
Connect configuration, the page CTA destination, its locales/fallback, its region bindings) while
shared concerns stay shared (theme, assets, component vocabulary, the shell). Dictionaries resolve
in this order, and never across sites:

```
shared language base (e.g. config/i18n/fr.json answering fr, fr-ca and fr-fr)
  → optional exact shared locale dictionary        config/i18n/fr-ca.json
  → optional site language-base override           config/i18n/sites/ca/fr.json
  → optional site exact-locale override            config/i18n/sites/ca/fr-ca.json   (wins)
  → complete schema validation of the result
```

An unknown key in an override is refused; another site's override is never read.

## Establishment: making ONE complete installation (FOUNDATION-B4B)

The domain model of an installation is `src/core/foundation-installation/**`; the act of creating one is
**establishment**, and its shape follows from one distinction the platform keeps deliberately:

```text
complete Foundation installation = immutable release content + authored capsule + generated state
                                   (the platform)           (the seed)          (the operational record)
```

* A Foundation **release** is platform-only (`scripts/release/release-content-policy.mjs` excludes
  `deployment/**`), because a release must never carry one site's authored material. A release is therefore
  NOT a complete installation, and establishment cannot invent the rest: the authored material is an input.
* The authored material is a **seed**: `site.config.json`, `config/i18n/**`, `content/**` — the capsule, in
  this repository `deployment/`. What establishment copies is the seed's **portable** authored material, so
  an existing installation's capsule is the ordinary seed: the records a capsule carries about ITSELF — its
  `foundation-baseline.json`, which names the release that installation adopted — are excluded rather than
  refused (an installation always has one), while generated `operational-state.json` is machine state rather
  than authorship and is refused outright.
* Establishment writes exactly two things of its own: the installation's **adoption record**
  (`foundation-baseline.json`: which immutable release this installation adopted, written from the release it
  established) and its **operational record** (`operational-state.json`: generated state, never authored).

The dependency direction is unchanged and load-bearing:

```text
release tooling (scripts/release/**)  →  pure release contract (src/core/foundation-release)
                                      →  installation lifecycle (src/core/foundation-installation)
```

`src/**` never imports `scripts/**`. The establishment mechanism is
`src/application/establish-foundation-installation.ts` (a use case over ports) with
`src/adapters/installation/**` (the Node mechanisms: reading a release directory, reading a seed, the guarded
target writer, the operational-record store), and the operator surface is
`scripts/installation/index.mjs`. It writes ONLY beneath the target root it is given, it never overwrites or
deletes, and it records no connection to anything: an installation needs no network, no GitHub and no other
installation to operate.

**What the record may claim (FOUNDATION-B4B-A1).** A durable operational event describes an operation that
actually happened, and health is an OBSERVATION rather than a step. Establishment therefore records a
COMPLETE, verified, ACTIVATED installation — `live` names the exact candidate that became this installation's
Foundation state — and leaves health unevaluated (`offline`, `healthEvaluatedAt: null`), because no health
check ran. Promotion is not health, and only `recordInstallationHealth` — a real evaluation of the live
installation — can make it `online`.

