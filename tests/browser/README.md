# UI-10 Browser Validation (D5)

The committed behavioral/accessibility gate. It drives a real
headless Chrome/Chromium/Edge through **CDP** (Chrome DevTools Protocol) using
**Node's built-in WebSocket + fetch** — deliberately **no** Playwright/Cypress/
WebdriverIO/jsdom. It reuses the repository's established headless-Chrome/CDP
convention (previously run ad-hoc in Phases K/M2 and discarded; this is the
committed, reproducible version).

## Requirements

- A Chrome/Chromium/Edge binary on `PATH`-discoverable paths or `CHROME_PATH`.
  Local Windows checks Program Files; CI (ubuntu-latest) uses the preinstalled
  `google-chrome-stable`.
- Node >= 21 (global `WebSocket`).

## Run

```sh
pnpm test:browser              # everything: the Foundation's generic scenarios + the deployment's own
pnpm test:browser:foundation   # the Foundation's generic scenarios ONLY
pnpm test:browser:deployment   # the SELECTED deployment's own scenarios ONLY
node tests/browser/production-continuity.mjs   # the production-mode proof only (builds; not part of any route)
```

Every command runs this ONE harness with one ownership scope; the scope semantics live in
`tests/browser/scope.mjs` (`--scope foundation|deployment|all`, default `all`). An unknown or
malformed scope is refused — never silently widened — and `--scope deployment` is honest about an
empty surface: a repository with no deployment, or a deployment that ships no scenario, fails with an
explicit message instead of reporting success for having run nothing.

### Two owners, one framework

This harness is **Foundation-owned**: the runner, the CDP client (`cdp.mjs`), the dev-server
mechanics and every **generic** scenario, which runs against a disposable copy of the committed
synthetic deployment (`tests/fixtures/synthetic-deployment`) so no generic contract depends on — or
writes — the repository's own deployment. The generic scenarios are defined INSIDE this harness, so
they are never discoverable as deployment scenarios and a deployment-scoped run can never execute
one.

A **deployment's** own browser acceptance belongs to that deployment and lives in that deployment's
own tree — `tests/browser/` inside the root the deployment authority selected, i.e. the capsule's
`deployment/tests/browser/` in this repository. Ownership is FILESYSTEM-DRIVEN: this harness
discovers every `*.scenario.mjs` there and runs it, so a deployment ships expectations rather than a
second browser framework, and adding a deployment edits no list.

### What the harness may write

That isolation is MECHANICAL, not conventional. Every MUTATING filesystem call this harness makes —
the configuration edits, the page and dictionary fixtures, the machine-readable report, the readability
screenshots — is routed through `tests/browser/scratch.mjs`, which refuses any target inside the selected
deployment (or the capsule directory), and any target outside the two domains this harness owns: the OS
temporary directory and this directory's ignored `.report/`. A regression that reached for the
deployment's shipped `site.config.json` would therefore fail loudly, naming the target, and write nothing.
READS are untouched — the shipped configuration a deployment scenario describes, the committed fixture
and the repository's own files are read directly, exactly as before.
`tests/architecture/write-ownership-guard.test.ts` proves both the guard's answers and that no mutating
call bypasses it.

### The production-mode proof (`production-continuity.mjs`)

The scenarios above drive a **development** server, which is the right trade-off for a 500+ check suite:
fast, and honest about the contracts it asserts. It is not, however, what a visitor runs — and two defects
were only visible there: FOUNDATION-UI1-A1, where navigating while the sidebar was OPEN re-created the rail,
the canonical CLOSED state was committed and corrected inside one commit, so no wrong frame was painted —
but the browser still started the rail's `width 200ms` CSS transition, and the rail visibly collapsed and
expanded again on the way; and FOUNDATION-UI1-A2, where a FULL RELOAD with the preference stored OPEN
painted the canonical CLOSED rail and expanded it after hydration.

`tests/browser/production-continuity.mjs` is the smallest proof that closes that gap, rather than a second
suite: it runs `next build` and `next start` against the repository's own (reference) deployment and asserts
the same continuity invariant through the same real controls — no opposite-state commit on the rail
(replacement nodes included) and no width transition during a navigation, with the explicit toggle still
animating as it must — plus the whole-document `firstPaint.*` rows (the stored preference must be the first
painted state and every painted state of a reloaded document, with no boot-induced transition and with the
boot presentation equal to the runtime presentation). It is **owned by this directory**, deliberately **NOT
wired into any CI route** (a production build is minutes, not seconds), and writes nothing itself:

```sh
node tests/browser/production-continuity.mjs
```

Its `continuity.*` siblings in `matrix.mjs` run the equivalent rows against the development server on every
browser gate, so the invariant is covered continuously; this script is the production-mode confirmation the
owner-visible defect requires.


```js
export const id = "reference-content";           // the report's `presentation` label
export async function run(chrome, harness) { … }  // returns the same check rows as a scenario here
```

The `harness` argument carries the generic pieces a scenario needs — its port, its viewports, its
assertion collector, its dev server (`startDevServer`/`stopServer`/`waitForServer`/`waitReady`), its
layout helper, and `configFile`: the deployment's configuration path, resolved exactly as the build
resolves it (a capsule at `<repo>/deployment/site.config.json` when one exists, otherwise the
repository root). A deployment scenario therefore names no repository path of its own, and a
repository without a capsule discovers nothing.

### Readiness: two layers, and the one a client transition needs

`waitReady(cdp)` waits for the DOCUMENT layer — the document finished loading and the shell's chrome is in
the DOM. That is what a full navigation (`cdp.navigate`) reaches.

A **visitor action** — a Site, Language or Location choice — navigates WITHOUT loading a document, so both
of those facts are already true when the transition starts and can never observe it. A scenario that
dispatches one therefore passes the state its next assertion actually reads:

```js
await cdp.evaluate(multisiteChoose("language", "en"));
await waitReady(cdp, { path: "/ca/en/about", body: "…ENGLISH BODY…" });
```

Probing the page without that expectation asserts against whatever page happened to be current, which is
the historical transient these two layers exist to end: two language-switch checks failed naming the
PREVIOUS route while the third — which only required the other site's marker to be ABSENT — passed against
that same stale page.

The conditions, the 20 s budget, the 200 ms poll and the 400 ms settle live in `readiness.mjs` (one
vocabulary, proved without a browser by `tests/architecture/browser-readiness-contract.test.ts`). A failed
wait reports what was awaited and what the document reported — its URL, `readyState`, and whether the shell
was present — instead of claiming a cause, because a document that never had the shell (a localized 404, a
dev-server error page) is exactly as "complete" as a healthy one.

A Layout choice is not a transition: it changes presentation, not the route.

For the Foundation's **one canonical presentation** the harness:
1. writes the canonical UI configuration (plus a matrix CTA) into `site.config.json`;
2. boots `next dev`;
3. drives a real CDP session across **desktop (1280) / tablet (900) / mobile
   (390)** and the md (768) / lg (1024) boundary widths;
4. performs **real interaction**: clicks/taps, Tab / Shift+Tab / Escape,
   backdrop dismissal, reduced-motion and dark-scheme emulation;
5. writes a machine-readable JSON report to `%TEMP%/ui10-browser-report.json` and
   `tests/browser/.report/ui10-browser-report.json` (gitignored);
6. exits non-zero on any failure (CI-friendly).

`site.config.json` is restored to its exact original bytes afterwards; the working
tree stays clean.

## What it exercises

- closed-SSR inertness (no dialog, no backdrop, nothing focusable);
- trigger/panel `aria-controls` + `aria-labelledby` resolution (B1);
- `aria-current="page"` on the active nav link in every placement (B2);
- focus entry + Tab / Shift+Tab containment + focus-return-to-trigger (D1);
- background `inert` while open, restored on close (D2);
- backdrop present + dismisses; Escape dismisses (D3);
- scroll lock restored across open/close cycles (D4);
- reduced-motion media query + no animation on the modal (PMR);
- CTA reachability in each declared placement (header/aside/bottom/drawer/overlay);
- P0-2 CTA composition convergence: ONE shared CTA capability path; exactly ONE
  interactive CTA reachable per viewport (the ≥md header CTA instance is hidden
  below `md` when the mobile disclosure/bottom-bar owns the CTA slot — resolves
  the deferred C2 observation); the aside CTA follows sidebar collapse (not
  reachable when the panel is collapsed; restored on expand); while a
  drawer/overlay is open exactly one CTA is reachable (no duplicate pair);
- P0-1 SIDEBAR capability: structural collapse/expand on collapsible desktop
  bands (toggle present, panel hidden from layout + tab order when collapsed,
  expand restores navigation + CTA), tablet `collapsed-sidebar` bands
  collapsed-by-default + always expandable (never a dead-end), immersive
  `floating` rail static/non-collapsible, and the immersive OVERLAY mobile
  contract (vertical navigation, content-appropriate bounded width, explicit
  "Close navigation" control that closes with focus-return + inert/scroll restore);
- responsive landmark exclusivity and deterministic unique ids;
- Adaptive's bottom-bar **More** disclosure through the same Drawer path;
- **persistent navigation** (`persistent-navigation` scenario): the rail's content
  column stays in view while the page scrolls (bounded by the viewport, its
  control and destinations reachable, expanding the collapsed tablet rail while
  scrolled), the shell's top region takes over below `md`, exactly ONE of the two
  regions is persistent at each breakpoint boundary, a long navigation scrolls
  inside the rail column with its last destination still reachable, a fragment
  target clears the sticky header (and the clearance is removed where the rail is
  persistent), the bottom-bar More disclosure keeps its focus/inert/Escape/scroll
  behaviour while scrolled, the primary CTA stays in normal flow, and the
  configured destinations are unchanged. The tall fixture is authored as **safe
  Markdown**, and its fragment target is an **authored heading** (`## Anchor Section`
  → `#anchor-section`, FOUNDATION-PAGES-A1D), so the shell's clearance contract is
  measured on a target the author created; a raw-HTML anchor attempt in the same
  fixture must stay inert, and the scenario asserts both.
- **sidebar state + navigation continuity** (`sidebar-state` scenario): the rail's
  open/closed state is the visitor's preference — no preference opens CLOSED, a
  rejected stored value falls back to CLOSED, a refresh keeps the choice, a real
  navigation icon keeps it (CLOSED stays CLOSED, OPEN stays OPEN), the tablet band
  and the desktop band share ONE state, a Site switch does not partition it, the
  Layout switcher is independent of it, and the `<md` drawer/bottom bar is a
  separate ephemeral model it never opens. Since FOUNDATION-UI1-A1 the scenario
  judges the whole navigation INTERVAL rather than its end state: a transition
  observer records every `data-collapsed` write on a rail and every `width`
  transition on one, so the interval must commit **no opposite state** (a
  replacement rail node is permitted, a CLOSED commit on it is not) and start **no
  width transition** — the owner-visible flicker that a destination-state
  assertion cannot see. `toggle.stillAnimatesTheRail` calibrates that observer on
  the one control allowed to move the rail, so the fix can never be "no animation".
- **sidebar first paint of a whole document** (`firstPaint.*` rows, same scenario,
  FOUNDATION-UI1-A2): the frame recorder samples the rail's PAINTED geometry (its
  rendered width) and its presentation fingerprint, not only its attribute, because
  the refresh defect was pure geometry: the canonical CLOSED rail was painted and
  then expanded after hydration. On a REAL reload the rows require the first painted
  state to be the stored one, **every** painted frame of that document to be the
  stored state, the presentation captured at boot to be identical to the runtime
  presentation (geometry, rail padding, control inset/justification, label
  visibility, list inset and the state-paired icons), the pre-paint bridge marker to
  have been present at boot and **relinquished** afterwards, and the boot interval
  to have started no width transition. Reverting the bridge flips them (measured: the
  first painted state becomes CLOSED and a `36px → 220px` transition starts), which
  is what makes them the durable proof rather than a description.
  `toggle.closedActuallyLooksClosed` closes the loop: a document that BOOTED on the
  bridge must still *look* closed after an explicit toggle, so a stale bridge cannot
  survive as a competing authority.
- **shell layout presentation** (`layout-switcher` scenario): with `ui.layoutSwitcher`
  enabled, the header offers one labelled **Layout** control (Sidebar / Menu bar). The
  sidebar layout exposes the rail and hides the header navigation; choosing Menu bar does
  the reverse — and a Tab sweep proves the hidden structure is never focusable. The
  document, its main content, the route, the locale and the usable content column are
  unchanged, persistent navigation and fragment clearance follow the active layout, the
  choice survives client-side navigation and a full reload (and an unusable stored value
  falls back to the configured default), and at mobile width the control is not offered
  because both layouts share the same mobile navigation.
- **advanced JSON** (`advanced-json` scenario): a declarative document authored under
  `content/pages/json/en/` is discovered, validated and served by the real application —
  exactly one `<h1>` (the document title), a Markdown field rendered (`**bold**`), a table
  with real column headings, a FAQ disclosure whose question is a heading, an action whose
  `route` resolved to `/en/services`, no element carrying an event handler, and the
  author's raw HTML present as TEXT but never executed.
- **nested pages** (`nested-pages` scenario): a page authored in a FOLDER
  (`content/pages/markdown/en/zz-nested/web-design.md`) is served at its nested URL
  (`/en/zz-nested/web-design`) through the ONE page route, with its authored title, its
  own generated heading fragment reachable in the browser, and its Markdown capability
  intact (a table renders). Documentation beside it (`…/zz-nested/README.md`) is NOT a
  route, and a URL that names no page — including the retired collection URLs
  (`/en/offerings`, `/en/blog`, `/en/testimonials`) — is a proper localized 404.
- **safe Markdown** (`safe-markdown` scenario): an authored page under
  `content/pages/markdown/en/` is served through the normal route with its authored
  title, its ordinary Markdown rendered, and no active markup anywhere — no author
  script, no event-handler attribute, no unsafe `href`, no forbidden element inside
  the content — while the author's raw HTML remains readable as inert text and the
  page raises no runtime error. The same served page proves the documented
  capability (a GFM table with real cells, nested lists, a quotation,
  strikethrough) and the authored **heading fragments**: `## Fixture Section`
  becomes `#fixture-section` (a repeat becomes `#fixture-section-2`), the author's
  `[jump](#fixture-section)` link reaches it, and the sticky header's clearance
  keeps the target visible — measured on a target the AUTHOR created. An id typed
  in raw HTML stays inert.
- **the deployment's own content** (`reference-content` scenario, R1A — **owned by the deployment**,
  sourced from `deployment/tests/browser/reference-content.scenario.mjs` and run by this harness): runs
  against the **shipped configuration, unmodified** — the JSON Home page (advanced mode) and the Markdown
  About page at their real URLs, each with exactly one `<h1>`; the Home → About destination; Home +
  About in the site-aware navigation; the visitor Layout control (its exact vocabulary, the sidebar
  default, switching, browser-local persistence and reload survival); the sidebar disclosure's two
  visual states (OPEN keeps its surface with the 24px icon inset INSIDE the control; CLOSED is
  transparent with no pill while keeping its hit target, its accessible name and its focus ring);
  and canonical / Open Graph / sitemap / robots all serving the reference origin.
- **multisite / multilingual** (`multisite` scenario, FOUNDATION-S1): one temporary deployment
  with TWO independent country sites (`ca` with French + English, `fr` with French) whose pages,
  chrome, languages and locations genuinely differ. It proves, through the four visitor dimensions:
  the Site selector appears (and lists both sites) while a one-site deployment offers none; the
  Language selector offers only the ACTIVE site's languages; Site and Location are distinct,
  labelled controls; `/ca/fr/about` and `/fr/fr/about` render their OWN bodies (and not each
  other's); switching Language stays inside the site; switching Site preserves the route when the
  target site serves it and lands on the target's HOME when it does not (never a 404); the target
  site's own navigation appears; the Location belongs to its site only and never leaks across; the
  chosen Layout survives BOTH a site and a language switch; the layout control's keyboard
  reachability survives switching; exactly one navigation structure stays exposed; and no band
  shows horizontal overflow. The configuration and every fixture page are restored/removed in
  `finally`, so the shipped template still ships one site and no pages.


