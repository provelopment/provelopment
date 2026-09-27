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
pnpm test:browser
```

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


