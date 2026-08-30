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
| `site` | Production URL, site name, tagline, meta description |
| `i18n` | Locales and the default locale |
| `contact` | Public contact email |
| `socialLinks` | Footer/header social links |
| `navigation` | Header navigation entries (label + href) |
| `features` | Feature flags, e.g. `analytics.provider` |

Set `site.url` to your final production origin before go-live — it drives
the sitemap, canonical URLs, and hreflang alternates.

Read configuration only through the loader exports from `src/config`; never
import the JSON file directly from components.

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
shipped template localizes every page and the demo content to all 8 locales.

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
title: "Web design"            # required
blurb: "A short one-liner."    # required
order: 1                       # optional, listing sort
featured: true                 # optional, listed first
price: "From $180"             # optional display-only text (no currency math)
image: "/images/offerings/x.jpg"  # optional, file under public/
---
Long-form detail body.
```

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
- The shipped demo docs include translated bodies for all 8 locales, all
  preserving the same generic, **replaceable-template / not legal advice**
  nature as the English originals. There is no separate translation system and
  no per-locale schema — just the standard content files and the standard
  repository fallback.

The demo `privacy.md`, `terms.md`, and `cookies.md` shipped with the template
are clearly marked **placeholders — not legal advice**. Replace them before
going live.

## 3. Branding Assets

- Favicon / app icon: replace `src/app/icon.svg`.
- Social preview image: generated by
  `src/app/[locale]/opengraph-image.tsx` from your config values.
- Colors and typography: design tokens in `src/app/globals.css`.

## 4. Interface Translations — `config/i18n/*.json`

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
    "vancouver": { /* America/Vancouver, its own address/hours/holidays */ }
  },
  "pages": [
    { "locale": "en", "slug": "toronto",   "region": "toronto" },
    { "locale": "en", "slug": "vancouver", "region": "vancouver" },
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
  "regions": { "toronto": { …, "label": "Toronto" }, "vancouver": { … } },
  "pages": [
    { "locale": "en", "region": "toronto" },                // /en/toronto
    { "locale": "en", "region": "toronto", "slug": "about" },  // /en/toronto/about
    { "locale": "en", "region": "vancouver" },              // /en/vancouver
    { "locale": "de", "region": "berlin" }                  // /de/berlin
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
- **Inventories are per locale × region.** Toronto and Vancouver may expose
  different pages; one region may exist in several locales; locales may have
  no regions at all (then the location selector is hidden).
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
operating location (from `business.regions`) plus an explicit **Unspecified**
option — the list is never filtered by the current language and is never lost
after selecting a region.

```jsonc
"business": {
  "regions": {
    "toronto": { …, "defaultLocale": "en" },   // the default audience language
    "vancouver": { … }
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
    { "id": "message", "label": "Message form", "href": "/contact" },
    { "id": "whatsapp", "label": "WhatsApp", "href": "https://wa.me/…", "demoOnly": true }
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
  "analytics": { "provider": "vercel" }
}
```

- **`vercel`** mounts Vercel Web Analytics exactly as before — no new data
  collection is introduced.
- **No `features.analytics`** — no analytics is mounted; the site works
  unchanged.
- Provider selection happens in the analytics adapter factory, not in
  application/layout code. Adding another provider later (GA4, Plausible, …) is
  an adapter + config change, not an application rewrite.

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
