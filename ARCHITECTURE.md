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

Page content lives as Markdown files under
`content/pages/<locale>/<slug>.md` (one directory per locale). Offerings and
legal documents use the same repository under `content/offerings/` and
`content/legal/` respectively.

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
  `PageContentRepository` port (generic over the content shape so the
  offerings collection keeps its extra fields without casts).
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

Detail collections are **statically generated**: `offerings/[slug]` and
`legal/[slug]` export `generateStaticParams` (derived from canonical slugs via
the same content/config seams the sitemap uses) with `dynamicParams = false`,
so every canonical localized detail page is prerendered at build time and any
other slug returns a 404 — no on-demand server rendering, no ISR.

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
  page's optional region. The dynamic route `app/[locale]/[slug]/page.tsx` is
  the ONLY consumer of page→region resolution; it statically lists per-locale
  content slugs minus those owned by static routes (`about`, `contact`,
  `resources`), so page existence stays content-driven and per-locale.
- **Route/timezone authority.** A regional page's timezone, address, phone,
  email, geo, hours, holidays, status, directions, and JSON-LD come ONLY from
  its resolved region — never inferred from locale, and never merged with the
  legacy global `business` block. `locale → timezone` is not a rule: `/en/toronto`
  (America/Toronto) and `/en/vancouver` (America/Vancouver) are different
  timezones for one locale; `/en/toronto` and `/fr/toronto` share one region.
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
  landing), `/{locale}/{region}/{page}` (regional page). Site-level static
  routes (`about`, `contact`, `resources`, `offerings*`, `legal*`) keep
  deterministic precedence. The dynamic route `[locale]/[item]/page.tsx`
  dispatches segment two (regional landing vs flat content page) and
  `[locale]/[item]/[slug]/page.tsx` renders configured regional pages; both
  `dynamicParams = false`, so an unconfigured combination is a proper 404
  (e.g. `/ja/toronto`, `/en/montreal/contact`).
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
- **Page independence (per locale × region).** Any region may expose any page
  inventory under any locale (EN/Toronto {landing, about, contact};
  EN/Vancouver {landing, about}; FR/Montreal {landing, about}; …). The demo
  proves same locale → different timezones (en/toronto vs en/vancouver), same
  region → multiple locales (en+fr toronto), and per-locale region sets
  (ja/ko/zh/es/id have no regions and no selector).
- **SEO.** Regional pages emit canonical URLs, hreflang only for genuinely
  configured `(locale, region, page)` equivalents (with landing fallback for
  a region that lacks the exact page), and `x-default` only when the default
  locale has a destination. The sitemap contains only real configured
  combinations — regional content slugs are not double-emitted as flat routes.

## Selector semantics, Connect & template identity (Phase M)

Phase M makes the two-dimensional UX explicit and unambiguous without
redesigning the Phase K/L model.

- **Location selector inventory.** The **Location** selector lists every
  CONFIGURED operating location (`business.regions` is authoritative; page
  bindings only decide which combinations exist) regardless of the current
  language, plus a permanent **Unspecified** option. A region may exist with
  only a landing (or no bindings yet) and still be selectable. `configuredRegionIds`
  is the single inventory source; the generic context is never lost.
- **Unspecified location.** Explicitly labeled (never a bare "Location" that
  reads like a real location). Selecting it returns to the equivalent
  non-regional page: `/en/toronto/about` → `/en/about`, `/de/berlin` → `/de`
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
### Trust & publishing primitives (Phase T)

Testimonials, portfolio/case studies, and the filesystem blog extend the SAME
content/config → pure resolution → boundary → presentation pipeline as the
foundational collections (pages, offerings, legal) — no new service layer, no
CMS, no provider.

- **Collections.** `content/testimonials/`, `content/portfolio/`,
  `content/posts/` are served by the existing `fs-page-content-repository`
  (dedicated parsers per collection; default-locale fallback; canonical-set =
  default-locale slugs with offerings-style enforcement). Route directories
  (`/testimonials`, `/portfolio`, `/blog`) take precedence over the `[item]`
  dynamic route and are listed in its `STATIC_ROUTE_SLUGS` defensively.
- **Chrome + feature gating.** `features.testimonials/portfolio/blog` are
  booleans (content existence, exposure, and `navigation[]` are separate, as
  with offerings). Optional dictionary sections with an F1-style
  `assertDictionarySectionPresent` lock: feature on ⇒ every configured locale
  has the chrome block, else the build fails naming offenders. Article /
  testimonial / case-study BODIES are never translation-gated (default-locale
  fallback is the established contract).
- **Blog + RSS.** `draft: true` posts are excluded from routes, sitemap, and
  RSS. Reading time is a deterministic pure helper (latin words + CJK chars,
  ~200 tokens/min). `buildRssXml` produces fully-escaped RSS 2.0; a static
  per-locale `/blog/rss.xml` route handler is pre-rendered at build time and
  linked from `/blog` (`alternates.types`). RSS is a publishing primitive, not
  an SEO mechanism — no `BlogPosting`/`Review`/`AggregateRating` JSON-LD.
- **Deterministic route accounting.** The demo inventory is locked: 3
  testimonials (no detail routes), 2 portfolio items, 3 post files (2
  published). That yields exactly 7 new HTML routes per locale (× 9 = 63;
  139 → **202** prerendered HTML pages), 63 new sitemap `<loc>` entries
  (129 → **192**), and 9 static RSS artifacts (2 items each; drafts never
  present). The build gate asserts these exact numbers.
- **Demo content is template/demo.** Testimonials use `Demo Client` /
  `Demo Partner` placeholders and honest template wording; portfolio and blog
  bodies are clearly marked template. Adopters must replace them before
  publishing — the template never fabricates real customer evidence.
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

## Error handling & recovery (Phase E)

Unexpected failures have a three-tier boundary model, each of which is a
**Client Component** (App Router requirement) and never surfaces any detail of
the thrown error (message, stack, internal path, or environment) to users:

- **`[locale]/not-found.tsx`** — expected missing routes and resources
  (unknown in-locale paths via the `[...rest]` catch-all, unknown locales via
  `dynamicParams = false`). It is a Server Component that preserves the locale
  via `next/root-params` `locale()` and renders localized copy from
  `dictionary.notFound` within the `[locale]` layout.
- **`[locale]/error.tsx`** — recoverable render errors in the locale segment
  and its children. Because it renders inside `[locale]/layout.tsx`, the site
  header, footer, and current locale are preserved. It offers a working
  `reset()` ("Try again") and a "Return home" link to `/{locale}`.
- **`[locale]/global-error.tsx`** — catastrophic/root-layout failures. It is a
  sibling of the root `[locale]/layout.tsx` and must render its own
  `<html>`/`<body>` (the failed root layout is replaced), so it is intentionally
  minimal and unlocalized with no dependency on header/footer or a known locale.

Both `error.tsx` and `global-error.tsx` are Client Components, so their recovery
UI renders on the client during hydration; the server still returns the correct
status (500) and never leaks exception details. The recovery copy for
`error.tsx` is the canonical `dictionary.error` block, transported from the
`[locale]` layout (which already resolves the per-locale dictionary) into the
client boundary through the minimal `ErrorMessagesProvider` context seam in
`src/components/site/error-messages-context.tsx`. There is no client-side locale
registry and no duplicated translation data — adding a locale (or changing the
default) is configuration/data work only. `global-error.tsx` stays deliberately
minimal and unlocalized because it renders when the layout itself may have
failed.

- **Security rule (hard acceptance):** no error UI may render `error.message`,
  a stack trace, internal paths, environment details, or `console` output. A
  regression guard in `tests/architecture/boundaries.test.ts` enforces this.

### Why `global-error.tsx` lives at `[locale]/global-error.tsx` (not `app/global-error.tsx`)

Next.js requires `global-error.js` to be a **sibling of the root layout** — the
layout that renders `<html>`/`<body>`. In most projects that is the conventional
`app/layout.tsx`, which is why the docs show `app/global-error.tsx`.

This project intentionally has **no root `app/layout.tsx`**: the root layout is
the dynamic `[locale]/layout.tsx` (the documented, recommended i18n layout that
renders `<html lang>`/`<body>` and owns `generateStaticParams` +
`dynamicParams`). The Step 0 empirical finding (Phase E, verified against a
Next.js 16.3.1 production build) is that introducing a true root
`app/layout.tsx` **breaks the existing locale contract**: `[locale]` must remain
the root segment for `next/root-params` `locale()` to resolve. With a root
`app/layout.tsx` added, the production build fails with
`Error: Export locale doesn't exist in target module` at
`src/app/[locale]/not-found.tsx` (the same build failure also breaks every
server component reading the locale via `next/root-params`).

Per the Phase E implementation gate ("do not introduce a broader layout
refactor unless Next.js requires it"), that trade-off was rejected. The global
error boundary is therefore placed as the sibling of this project's root layout
at **`src/app/[locale]/global-error.tsx`** — it still renders its own
`<html>`/`<body>`, still catches catastrophic failures in the root layout, and
remains intentionally minimal and unlocalized because the root layout (and with
it the header, footer, and known locale) is exactly what failed.

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