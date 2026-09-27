# Site Customization — configuration-first operation

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-27.3`
> **Procedure validated against:** Foundation template release `v2026.09.17-foundation-generic-template` (`b9f7a18`) + the current public/private topology (the public reusable product `provelopment-foundation`, and the live Foundation site implemented as a site profile in the private downstream `provelopment-web`)
> **Content model described:** Foundation release `v2026.09.27-foundation-markdown-single-h1` (`df50fc250c6beb1c237f32b7f0a0d91fd55b0c37`) — the **final multisite model**: the one-page authoring model (author-facing collections retired by `FOUNDATION-PAGES-A1E`) with the **delivered declarative JSON authoring mode** (`FOUNDATION-PAGES-A2`), **independent sites and localization** (`FOUNDATION-S1`, `v2026.09.27-foundation-multisite-localization`) — the page address is authoring mode → site → language → page, so a page is identified by site + locale path key + route path — and the **single-H1 Markdown closure** (`FOUNDATION-PAGES-H1`): the page title is a page's only level-1 heading
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## The principle

> **Prefer configuration, content and assets before source-code modification.**

The Foundation is a validated configuration-driven platform. Almost everything a
business needs — identity, navigation, calls to action, presentation, locale,
feature enablement — is **data**, validated at build time. Reaching into the
platform source to change behaviour breaks the upgrade path and the fidelity
guard, and is almost always unnecessary.

Full schema reference: the Foundation's `CUSTOMIZING.md`. This manual is the
**procedure**; that document is the **specification**. Do not duplicate the schema here.

## What you may change (adopter-owned)

- site configuration (identity, URL, contact, navigation, features, CTA, theme), including the
  per-site overrides a deployment needs when it serves independent sites
- per-site interface wording (`config/i18n/sites/<site>/<language>.json`), which refines the
  shared language dictionary
- business content
- business imagery/artwork and its wiring
- the adopter's own locale dictionaries
- project documentation

## What you must not change

- platform implementation reproduced into the site (the fidelity/divergence guard
  enforces byte-fidelity; see `validation.md`).

If a requirement genuinely cannot be met by configuration, content or assets, that
is an escalation — see `agent-operating-rules.md` — not a licence to fork the platform.

## Procedure

### Site identity

Set the business name, tagline and description. These drive page titles, metadata,
structured data and the visible brand text. Keep them consistent across content,
dictionaries and metadata.

### Site URL

Set the site's canonical URL to the **actual production hostname** before deploying.

> **Configured canonical URL and actual production hostname must agree.** A
> mismatch silently publishes wrong canonical/OpenGraph/sitemap/robots URLs — a
> production defect that local validation cannot catch. See `troubleshooting.md`.

### Presentation

The Foundation ships **ONE canonical presentation**: a coherent presentation
intent (typography, rhythm, surface, header, hero, density, content width,
radius) resolved by the shared UI engine from the shipped configuration.
Presentation is **not an adopter-selectable surface** — there is no preset
selector, no preset switching and no multi-presentation deployment map (the
former preset-comparison feature was retired in 2026-09). Do not add one.

### Theme

Theme mode (light/dark/system) and radius are configuration. Do not hand-edit
design tokens to fake a theme change.

### Navigation

Navigation is configuration: order, labels, targets, regions/groups where the
project uses them, and permitted per-item icons. Keep labels business-meaningful
and targets real routes. **Removing an item does not remove the page:** there is no
content feature flag, a page exists because its file exists, and it stays live at its URL
— so to stop publishing it you must remove (or unpublish) the file itself.

### Call to action (CTA)

The primary CTA is configuration: enabled, label, destination, style, icon,
icon position and state.

Current platform behaviour — treat as the contract:

- The CTA renders **once**, in the shell's **top region** (below the header, above
  the main content), at **every** width.
- It is never rendered inside the sidebar, the bottom bar, or a mobile
  menu/overlay, so it cannot be duplicated, collapsed away, or obscured.
- Disabled, or missing a label/destination, renders **nothing** — the platform
  never invents a destination or an accessible name.

### Sites, and per-site configuration

A deployment may serve **independent sites** — a country, or `ww` for Worldwide/Global. Each
site owns its own page tree, its own languages and its own **page-facing** configuration, and
any of these may differ per site:

- navigation items, and the secondary footer navigation group;
- the legal destinations the footer surfaces;
- the Connect configuration;
- the shell CTA''s page destination;
- the site''s locale and fallback configuration;
- the pages and locations bound to the site.

Everything generic stays **shared** unless it genuinely differs: theme and design tokens,
business artwork (`content/assets/` is one shared tree), the component vocabulary, and the
shell/layout system. You do **not** need a duplicated complete configuration file for every
country — configure once at the top level and override only the part that differs.

The full schema for site-scoped keys is the Foundation''s `CUSTOMIZING.md`.

### Sites and locations are different things

A **site is not a location.** Another office, city or region inside the same website is a
**location** within the site — Canada and France may be sites, while Toronto, Montreal and
Vancouver are locations inside one of them. **Do not create a site because a business opened
another office.** See `content-management.md`, *Sites and locations are different things*.

### The four dimensions, and their controls

**Site**, **Language**, **Location** and **Layout** are independent: site selects the website,
language the locale inside it, location a physical/regional context inside it, and layout only
the Sidebar/Menu-bar presentation. Switching one never changes another, and a control a
deployment does not need **does not appear** — a single-language, single-location site renders
no language or location selector at all.

### Contact information

Contact values are configuration. Where the platform wires a contact route, all
touchpoints must point at that route consistently — including the CTA, connect
methods and footer.

### Business metadata

Keep description, OpenGraph/social art and any structured-data inputs aligned with
the real business. Metadata must not make claims the business cannot support.

### Configuration validation

Every configuration change ends with the gate (`validation.md`):

```bash
pnpm validate        # schema, typecheck, lint, routes, build
pnpm test:browser    # rendered contract, responsive, accessibility
```

A schema failure is a **loud, intended** signal — never work around it by editing
the schema.

## Common mistakes

- Editing platform source to achieve a configuration outcome.
- Publishing a canonical URL that does not match the live hostname.
- Removing a navigation item while leaving the route reachable (or vice versa).
- Configuring a language or location control the deployment does not need, or adding one by
  hand: a single-language or single-location site renders no such selector.
- Treating another office as another site — an office is a location inside a site.
- Duplicating a complete configuration file per country instead of overriding only what
  differs.
- Configuring two language folders that mean the same locale (`ca/en` together with
  `ca/en-ca`): Foundation refuses it as a hard error — choose one form.
- Changing a locale dictionary key structure rather than its values.
- Forgetting that presentation differences come from the shipped presentation
  configuration, not from ad-hoc CSS.
