// deployment/tests/browser/reference-content.scenario.mjs
// THE REFERENCE DEPLOYMENT'S OWN BROWSER ACCEPTANCE (R1A — FOUNDATION-DEPLOYMENT-ISO-B2A).
//
// This scenario belongs to ONE deployment, so it lives INSIDE that deployment's capsule
// (`deployment/tests/browser/**`) instead of in the Foundation harness. It is a browser
// acceptance test of the SHIPPED configuration and the SHIPPED pages: it reads the deployment's
// configuration and never writes it, and it starts its dev server WITHOUT the synthetic override,
// because its subject is the real deployment.
//
// OWNERSHIP
//   The Foundation owns the runner, the CDP client (`tests/browser/cdp.mjs`) and the dev-server
//   mechanics; this file owns the deployment's expectations. There is exactly ONE browser
//   framework — this scenario reuses it and ships no second one.
//
// HOW IT IS RUN
//   `pnpm test:browser` (`tests/browser/matrix.mjs`) discovers every `*.scenario.mjs` in this
//   directory and calls its `run(chrome, harness)`, which returns check rows. The `harness`
//   supplies the generic pieces — its port, its viewports, its assertion collector, its dev
//   server, and the deployment configuration path it resolved the way the BUILD resolves it
//   (`src/config/deployment-build.ts`) — so this scenario names no repository path of its own.

import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

// The FOUNDATION's CDP client, reused (never re-implemented): the harness owns the browser
// mechanics, the deployment owns the expectations. Reading common Foundation code is what a
// deployment does; changing it is what it must not do.
import { Cdp } from "../../../tests/browser/cdp.mjs";

/** The dev server THIS scenario started, as a visitor addresses it (set below, per run). */
let BASE_URL = "";

/** The scenario's id, used as the report's `presentation` label (unchanged since R1A). */
export const id = "reference-content";
/**
 * R1A — THE REFERENCE DEPLOYMENT'S OWN CONTENT + SHARED-UI CONTRACT.
 *
 * This scenario runs against the SHIPPED reference configuration, UNMODIFIED (it
 * never writes `site.config.json`): it proves that what the public repository
 * ships is what the owner reviews live — the first intentional reference Home
 * page (JSON mode), a real About page (Markdown mode), the visitor Layout
 * control, the reference origin, and the sidebar disclosure's two visual states.
 *
 * The disclosure contract is a GEOMETRY + SURFACE contract, measured on the real
 * control: OPEN keeps its background/border with its 24px icon inset INSIDE its
 * own box (never flush against the edge it read as clipped by); CLOSED is
 * transparent with no border (no pill) while keeping its hit target, its
 * accessible name and the shared keyboard focus ring.
 */
const REFERENCE_HOME_TITLE = "Build a website you own.";
const REFERENCE_ABOUT_TITLE = "About this Foundation website";
const REFERENCE_ORIGIN = "https://foundation-template.provelopment.com";
/**
 * R1A1 — the reference site's copy is OWNER-AUTHORED and FINAL, so the expectations
 * below quote the owner's current files. The content is never adjusted to satisfy a
 * check; a copy-dependent expectation moves when the owner edits the page.
 */
const REFERENCE_REPOSITORY_URL = "https://github.com/provelopment/provelopment-foundation";

const DISCLOSURE_PROBE = `(() => {
  const r2 = (v) => Math.round(v * 100) / 100;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r2(r.left), r: r2(r.right), w: r2(r.width), h: r2(r.height) }; };
  const rail = [...document.querySelectorAll('#shell-sidebar-desktop-rail, #shell-sidebar-tablet-rail')]
    .find((el) => el && el.getBoundingClientRect().width > 0) || null;
  const toggle = rail ? rail.querySelector('.ui-sidebar-toggle') : null;
  // The disclosure CONTROL declares BOTH states' artwork and label and the stylesheet presents exactly one,
  // so this probe measures the variant that is actually rendered — never the state pair's first element (for
  // a collapsed rail that is the HIDDEN open-state variant: a 0x0 box and the other state's copy).
  const presented = (selector) => [...(toggle ? toggle.querySelectorAll(selector) : [])]
    .find((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0) || null;
  const icon = presented('.ui-sidebar-toggle-icon');
  const label = presented('.ui-sidebar-toggle-label');
  const cs = toggle ? getComputedStyle(toggle) : null;
  return JSON.stringify({
    collapsed: rail ? rail.getAttribute('data-collapsed') : null,
    rail: box(rail),
    toggle: box(toggle),
    icon: box(icon),
    // A VISIBLE label (not the sr-only one the collapsed rail keeps as the control's accessible name).
    labelVisible: label ? label.getBoundingClientRect().width > 1 : false,
    label: label ? (label.textContent || '').trim() : null,
    background: cs ? cs.backgroundColor : null,
    borderColor: cs ? cs.borderTopColor : null,
    // UI1-A3-A1 — what the control CLAIMS about the state it presents (the property assistive technology
    // reads), which must agree with the rail's collapsed state in every one of the reference states.
    expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    accessibleName: toggle ? (toggle.getAttribute('aria-label') || (label ? (label.textContent || '').trim() : '')) : null,
    iconInsetFromControlLeft: toggle && icon ? r2(icon.getBoundingClientRect().left - toggle.getBoundingClientRect().left) : null,
    fullyInsideRail: !!(rail && toggle) &&
      toggle.getBoundingClientRect().left >= rail.getBoundingClientRect().left - 0.5 &&
      toggle.getBoundingClientRect().right <= rail.getBoundingClientRect().right + 0.5,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  });
})()`;

const LAYOUT_STATE_PROBE = `(() => {
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rail = [...document.querySelectorAll('#shell-sidebar-desktop-rail, #shell-sidebar-tablet-rail')].find(shown) || null;
  const topNav = [...document.querySelectorAll('nav[data-ui-shell-part="top-nav"]')].find(shown) || null;
  const control = document.querySelector('[data-ui-layout-switcher]');
  // NAV1B — the header's two semantic rows, the menu-bar sticky bar, and the sidebar's OWN disclosure.
  const topRow = document.querySelector('.ui-site-header-top');
  const contextRow = document.querySelector('.ui-site-header-context');
  const headerInner = document.querySelector('.ui-site-header > div');
  const bar = document.querySelector('.ui-shell-bottom-bar');
  const disclosure = document.querySelector('[data-ui-shell-part="mobile-drawer"]');
  const barLinks = bar ? [...bar.querySelectorAll('ul > li a')].filter(shown) : [];
  const barItems = bar ? [...bar.querySelectorAll('ul > li')] : [];
  return JSON.stringify({
    attribute: document.documentElement.getAttribute('data-ui-shell-layout'),
    stored: window.localStorage.getItem('foundation.layout'),
    railVisible: !!rail,
    topNavVisible: !!topNav,
    controlValue: control ? control.value : null,
    controlOptions: control ? [...control.options].map((option) => option.textContent.trim()) : null,
    controlLabel: control ? control.getAttribute('aria-label') : null,
    controlVisible: shown(control),
    bottomBarVisible: shown(bar),
    bottomBarPosition: bar ? getComputedStyle(bar).position : null,
    barLinkCount: barLinks.length,
    barRowCount: new Set(barItems.map((li) => Math.round(li.getBoundingClientRect().top))).size,
    barLinksInsideInset:
      barLinks.length > 0 &&
      barLinks.every((a) => {
        const r = a.getBoundingClientRect();
        return r.left >= 8 && r.right <= window.innerWidth - 8;
      }),
    disclosureVisible: shown(disclosure),
    disclosureInHeader: !!disclosure && !!disclosure.closest('.ui-site-header'),
    selectorInTopRow: !!control && !!topRow && topRow.contains(control),
    selectorInControlRow: !!control && !!contextRow && contextRow.contains(control),
    selectorRightInset:
      control && headerInner
        ? Math.round(
            headerInner.getBoundingClientRect().right -
              (parseFloat(getComputedStyle(headerInner).paddingRight) || 0) -
              control.getBoundingClientRect().right,
          )
        : null,
    contextRowPresent: !!contextRow,
    contextRowTop: contextRow ? Math.round(contextRow.getBoundingClientRect().top) : null,
    topRowBottom: topRow ? Math.round(topRow.getBoundingClientRect().bottom) : null,
  });
})()`;

/** Any fully-transparent colour spelling the browser may serialise. */
const isTransparent = (value) =>
  typeof value === "string" &&
  (value === "transparent" || /^rgba?\(0, 0, 0, 0\)$/.test(value) || /,\s*0\)$/.test(value));

/** One authored page's rendered facts: outline, copy, links, metadata, nav. */
const REFERENCE_PROBE = `(() => {
  const main = document.querySelector('main');
  const text = main ? (main.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  return JSON.stringify({
    path: location.pathname,
    // The visitor's own presentation choice (never part of a URL) — read from the document, where
    // the shell records it.
    shellLayout: document.documentElement.getAttribute('data-ui-shell-layout'),
    h1s: [...document.querySelectorAll('h1')].map((h) => (h.textContent || '').trim()),
    headings: [...document.querySelectorAll('main h2, main h3')].map((h) => (h.textContent || '').trim()),
    text,
    aboutAnchors: [...document.querySelectorAll('main a[href*="about"]')].map((a) => (a.getAttribute('href') || '') + ' :: ' + a.textContent.trim()),
    repositoryLink: !!document.querySelector('main a[href*="${REFERENCE_REPOSITORY_URL}"]'),
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
    ogUrl: (document.querySelector('meta[property="og:url"]') || {}).content || null,
    visibleNav: [...document.querySelectorAll('nav a')]
      .filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((a) => (a.getAttribute('href') || '') + '|' + (a.getAttribute('aria-current') || '')),
    // The VISIBLE navigation vocabulary — how the dictionary's labels actually read to a visitor.
    navTexts: [...document.querySelectorAll('nav a')]
      .filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((a) => (a.textContent || '').trim()),
  });
})()`;

/** The visitor-facing selector row, and the standards metadata of the page it is on. */
const REFERENCE_SELECTORS_PROBE = `(() => {
  const select = (name) => document.querySelector('select[data-selector="' + name + '"]');
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const language = select('language');
  const site = select('site');
  return JSON.stringify({
    languagePresent: shown(language),
    languageLabel: language ? language.getAttribute('aria-label') : null,
    languageValue: language ? language.value : null,
    languageOptions: language ? [...language.options].map((option) => option.textContent.trim()) : [],
    sitePresent: shown(site),
    siteValue: site ? site.value : null,
    siteLabel: site ? site.getAttribute('aria-label') : null,
    siteOptions: site ? [...site.options].map((option) => option.textContent.trim()) : [],
    locationPresent: shown(select('location')),
    locationValue: (() => { const el = select('location'); return el ? el.value : null; })(),
    locationOptions: (() => {
      const el = select('location');
      return el ? [...el.options].map((option) => option.textContent.trim()) : [];
    })(),
    layoutPresent: shown(select('layout')),
    // The controls in DOCUMENT order — the documented Site → Location → Language → Layout rule.
    selectorOrder: [...document.querySelectorAll('select[data-selector]')].map((el) =>
      el.getAttribute('data-selector'),
    ),
    lang: document.documentElement.lang,
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
    description: (document.querySelector('meta[name="description"]') || {}).content || null,
  });
})()`;

/** Choose a SITE exactly as a visitor does (value + change event on the control). */
const chooseSite = (code) => `(() => {
  const control = document.querySelector('select[data-selector="site"]');
  if (!control) return false;
  control.value = ${JSON.stringify(code)};
  control.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

/** Choose a LOCATION exactly as a visitor does (value + change event on the control). */
const chooseLocation = (region) => `(() => {
  const control = document.querySelector('select[data-selector="location"]');
  if (!control) return false;
  control.value = ${JSON.stringify(region)};
  control.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

/** Choose a language exactly as a visitor does (value + change event on the control). */
const chooseLanguage = (locale) => `(() => {
  const control = document.querySelector('select[data-selector="language"]');
  if (!control) return false;
  control.value = ${JSON.stringify(locale)};
  control.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

export async function run(chrome, harness) {
  // The FOUNDATION-owned harness supplies the generic pieces; everything below belongs to this
  // deployment. Binding them to the names the body already used keeps this move mechanical: no
  // assertion, message, expectation or check order changes.
  const {
    basePort: BASE_PORT,
    viewports: VIEWPORTS,
    check,
    startDevServer,
    stopServer,
    waitForServer,
    waitReady,
    chooseLayout,
    configFile: SHIPPED_CONFIG_PATH,
  } = harness;

  const rows = [];
  const port = BASE_PORT + 410;
  const url = `http://localhost:${port}/ww/en`;
  BASE_URL = `http://localhost:${port}`;
  // The SHIPPED configuration, READ ONLY: writing it here would prove a
  // configuration the repository does not ship.
  const reference = JSON.parse(await readFile(SHIPPED_CONFIG_PATH, "utf8"));
  check(rows, "reference.config.siteUrl", reference.site?.url === REFERENCE_ORIGIN, String(reference.site?.url));
  check(
    rows,
    "reference.config.layoutSwitcherEnabled",
    reference.ui?.layoutSwitcher?.enabled === true && reference.ui?.layoutSwitcher?.default === "sidebar",
    JSON.stringify(reference.ui?.layoutSwitcher ?? null),
  );
  check(
    rows,
    "reference.config.faviconOnReferenceOrigin",
    typeof reference.site?.assets?.favicon === "string" &&
      reference.site.assets.favicon.startsWith(`${REFERENCE_ORIGIN}/`),
    String(reference.site?.assets?.favicon),
  );
  check(
    rows,
    "reference.config.navigationHomeAndAbout",
    JSON.stringify((reference.navigation ?? []).map((item) => item.href)) === JSON.stringify(["/", "/about"]),
    JSON.stringify((reference.navigation ?? []).map((item) => item.href)),
  );

  const server = startDevServer(port, { synthetic: false });
  let cdp = null;
  try {
    await waitForServer(url);
    cdp = await Cdp.connect(chrome);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.evaluate("window.localStorage.clear(); true").catch(() => undefined);
    await cdp.navigate(url);
    await waitReady(cdp);

    // ── The visitor Layout control, from the shipped configuration ───────────
    const initial = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(rows, "reference.layout.controlVisible", initial.controlVisible === true, JSON.stringify(initial));
    check(rows, "reference.layout.controlLabelled", initial.controlLabel === "Layout", String(initial.controlLabel));
    check(
      rows,
      "reference.layout.exactVocabulary",
      (initial.controlOptions ?? []).join(" | ") === "Sidebar | Menu bar",
      String(initial.controlOptions),
    );
    check(
      rows,
      "reference.layout.defaultSidebar",
      initial.attribute === "sidebar" && initial.controlValue === "sidebar" && initial.railVisible && !initial.topNavVisible,
      JSON.stringify(initial),
    );
    check(rows, "reference.layout.switchApplies", await cdp.evalBool(chooseLayout("menu-bar")));
    await waitReady(cdp);
    const switched = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    // NAV1B — MENU BAR MEANS THE STICKY BOTTOM BAR AT EVERY WIDTH: the former top navigation is
    // retired from this mode, so the bar IS the navigation at desktop/tablet/mobile alike.
    check(
      rows,
      "reference.layout.menuBarExposedAsStickyBottomBar",
      switched.attribute === "menu-bar" &&
        switched.bottomBarVisible === true &&
        switched.bottomBarPosition === "sticky" &&
        !switched.railVisible,
      JSON.stringify(switched),
    );
    check(
      rows,
      "reference.layout.menuBarHasNoTopNavigation",
      switched.topNavVisible === false,
      JSON.stringify(switched),
    );
    check(
      rows,
      "reference.layout.menuBarLinksHorizontalAndInset",
      switched.barLinkCount > 0 &&
        switched.barRowCount < switched.barLinkCount &&
        switched.barLinksInsideInset === true,
      `rows=${switched.barRowCount} links=${switched.barLinkCount} inset=${switched.barLinksInsideInset}`,
    );
    // NAV1B — THE HEADER'S SEMANTIC ROWS DO NOT MOVE: the navigation-MODE selector keeps its
    // top-right place, and the contextual controls keep the row below it.
    check(
      rows,
      "reference.header.selectorInTopRowAtDesktop",
      initial.selectorInTopRow === true && initial.selectorInControlRow === false,
      JSON.stringify({ topRow: initial.selectorInTopRow, controlRow: initial.selectorInControlRow }),
    );
    check(
      rows,
      "reference.header.selectorRightAnchoredAtDesktop",
      Math.abs(initial.selectorRightInset) <= 1,
      String(initial.selectorRightInset),
    );
    check(
      rows,
      "reference.header.controlRowBelowTopRowAtDesktop",
      initial.contextRowPresent === false || initial.contextRowTop >= initial.topRowBottom,
      `contextTop=${initial.contextRowTop} topBottom=${initial.topRowBottom}`,
    );
    check(rows, "reference.layout.persistedToBrowserStorage", switched.stored === "menu-bar", String(switched.stored));
    await cdp.reload();
    await waitReady(cdp);
    const reloaded = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(
      rows,
      "reference.layout.survivesReload",
      reloaded.attribute === "menu-bar" && reloaded.controlValue === "menu-bar",
      JSON.stringify(reloaded),
    );
    await cdp.evaluate(chooseLayout("sidebar"));
    await waitReady(cdp);

    // ── NAV1B — the CONSTRAINED-WIDTH sidebar disclosure, and the header rows at a phone width ──
    // The sidebar stays the navigation architecture at every width: below `md` it presents its OWN
    // disclosure at the sidebar boundary (never inside the page header, never between header rows),
    // while the navigation-MODE selector keeps its top-right place.
    await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
    await waitReady(cdp);
    const mobileSidebar = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(
      rows,
      "reference.header.selectorStillTopRightAtMobile",
      mobileSidebar.selectorInTopRow === true &&
        mobileSidebar.selectorInControlRow === false &&
        Math.abs(mobileSidebar.selectorRightInset) <= 1,
      JSON.stringify({
        topRow: mobileSidebar.selectorInTopRow,
        controlRow: mobileSidebar.selectorInControlRow,
        rightInset: mobileSidebar.selectorRightInset,
      }),
    );
    check(
      rows,
      "reference.sidebar.disclosureAtSidebarBoundary",
      mobileSidebar.disclosureVisible === true && mobileSidebar.disclosureInHeader === false,
      `visible=${mobileSidebar.disclosureVisible} inHeader=${mobileSidebar.disclosureInHeader}`,
    );
    check(
      rows,
      "reference.sidebar.noBottomBarForTheSidebarMode",
      mobileSidebar.bottomBarVisible === false,
      String(mobileSidebar.bottomBarVisible),
    );
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await waitReady(cdp);

    // ── The sidebar disclosure's two visual states (desktop), and its STATE LIFE-CYCLE (UI1) ──
    // UI1 — the rail's canonical no-preference state is CLOSED, so the STATE a visitor first meets is the
    // closed one, and the OPEN state below follows the visitor's own toggle. Both states' visual contract
    // is unchanged; only the way they are reached is explicit now.
    const canonicalState = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.initialIsCanonicalClosed",
      // The closed control keeps its accessible name while saying "Show navigation". UI1-A3 — that copy is the
      // state pair's PRESENTED variant (`label`), and `labelVisible` is false in this state: the collapsed
      // rail keeps the label as the control's sr-only name, it does not paint it.
      canonicalState.collapsed === "true" &&
        canonicalState.accessibleName === "Show navigation" &&
        canonicalState.label === "Show navigation" &&
        canonicalState.labelVisible === false &&
        canonicalState.expanded === "false",
      JSON.stringify(canonicalState),
    );
    await cdp.clickCenter(".ui-sidebar-toggle");
    await sleep(600);
    const openState = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.openState",
      openState.collapsed === "false" && openState.labelVisible === true && openState.label === "Hide navigation" && openState.expanded === "true",
      JSON.stringify(openState),
    );
    check(
      rows,
      "reference.disclosure.openKeepsSurface",
      !isTransparent(openState.background) && !isTransparent(openState.borderColor),
      `background=${openState.background} border=${openState.borderColor}`,
    );
    check(
      rows,
      "reference.disclosure.openIconInsideControl",
      openState.fullyInsideRail === true && (openState.iconInsetFromControlLeft ?? 0) >= 8 && openState.icon?.w === 24,
      `insideRail=${openState.fullyInsideRail} iconInset=${openState.iconInsetFromControlLeft} icon=${openState.icon?.w}x${openState.icon?.h}`,
    );
    await cdp.clickCenter(".ui-sidebar-toggle");
    await sleep(600);
    const closedState = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(rows, "reference.disclosure.collapses", closedState.collapsed === "true", JSON.stringify(closedState));
    check(
      rows,
      "reference.disclosure.closedIsTransparent",
      isTransparent(closedState.background) && isTransparent(closedState.borderColor),
      `background=${closedState.background} border=${closedState.borderColor}`,
    );
    check(
      rows,
      "reference.disclosure.closedKeepsHitTarget",
      (closedState.toggle?.w ?? 0) >= 24 && (closedState.toggle?.h ?? 0) >= 24 && !!closedState.accessibleName && closedState.expanded === "false",
      `box=${closedState.toggle?.w}x${closedState.toggle?.h} name="${closedState.accessibleName}"`,
    );
    check(
      rows,
      "reference.disclosure.closedNotClipped",
      closedState.fullyInsideRail === true && closedState.icon?.w === 24,
      `insideRail=${closedState.fullyInsideRail} icon=${closedState.icon?.w}x${closedState.icon?.h}`,
    );
    // Keyboard: the collapsed control keeps the shared focus ring. The sweep starts
    // from the SKIP LINK — a deterministic sequential-focus origin — because the click
    // above left focus ON the control, so the next Tab would step PAST it. The budget is
    // generous because the header now carries up to four visitor controls before the rail.
    await cdp.evaluate(
      `(() => { const skip = document.querySelector('a[href="#main"]'); if (skip) skip.focus(); return !!skip; })()`,
    );
    let ring = null;
    for (let step = 0; step < 14 && ring === null; step += 1) {
      await cdp.pressKey("Tab");
      ring = await cdp.evaluate(`(() => {
        const el = document.activeElement;
        if (!el || !el.classList || !el.classList.contains('ui-sidebar-toggle')) return null;
        const cs = getComputedStyle(el);
        return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
      })()`);
    }
    check(
      rows,
      "reference.disclosure.closedKeepsFocusRing",
      !!ring && ring.outlineStyle !== "none" && ring.outlineWidth !== "0px",
      JSON.stringify(ring),
    );
    check(
      rows,
      "reference.disclosure.noHorizontalOverflow",
      closedState.scrollWidth <= closedState.clientWidth + 1,
      `scrollW=${closedState.scrollWidth} clientW=${closedState.clientWidth}`,
    );
    // ── UI1 — THE OWNER-OBSERVED LIFE-CYCLE DEFECTS, ON THE REAL SITE ───────────────────────────
    // The rail is CLOSED here (the row above proved the collapse), which is the exact state the owner
    // reported: it used to return OPEN after a refresh, and to arrive OPEN after a navigation icon click.
    await cdp.reload();
    await waitReady(cdp);
    const closedAfterReload = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.closedSurvivesReload",
      closedAfterReload.collapsed === "true",
      JSON.stringify(closedAfterReload),
    );
    // A REAL navigation icon click, awaited by the route it produces (FOUNDATION-BR1).
    const navigatedClosed = await cdp.clickCenter('#shell-sidebar-desktop-rail a[href$="/about"]');
    await waitReady(cdp, { path: "/ww/en/about" });
    const closedAfterNavigation = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.closedSurvivesNavigationIcon",
      !!navigatedClosed && closedAfterNavigation.collapsed === "true",
      JSON.stringify(closedAfterNavigation),
    );
    // …and the OPEN case through the same controls: open, navigate home, reload.
    await cdp.clickCenter(".ui-sidebar-toggle");
    await sleep(400);
    const reopenAfterNavigation = await cdp.clickCenter("#shell-sidebar-desktop-rail ul li:first-child a");
    await waitReady(cdp, { path: "/ww/en" });
    const openAfterNavigation = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.openSurvivesNavigationIcon",
      !!reopenAfterNavigation && openAfterNavigation.collapsed === "false" && openAfterNavigation.labelVisible === true && openAfterNavigation.label === "Hide navigation",
      JSON.stringify(openAfterNavigation),
    );
    await cdp.reload();
    await waitReady(cdp);
    const openAfterReload = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.openSurvivesReload",
      openAfterReload.collapsed === "false",
      JSON.stringify(openAfterReload),
    );
    // The visitor is back on Home, which is where the next block expects them.

    // ── HOME: the authored JSON document, served at the locale root ─────────
    const home = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    check(rows, "reference.home.isLocaleRoot", home.path === "/ww/en", home.path);
    check(
      rows,
      "reference.home.oneH1AuthoredTitle",
      home.h1s.length === 1 && home.h1s[0] === REFERENCE_HOME_TITLE,
      JSON.stringify(home.h1s),
    );
    check(
      rows,
      "reference.home.jsonSectionsRender",
      [
        "Two ways to create a page",
        "You own your website",
        "About this website",
        "Built for different needs",
        "The complete site is public",
      ].every((heading) => home.headings.includes(heading)),
      JSON.stringify(home.headings),
    );
    check(
      rows,
      "reference.home.ownershipPrinciple",
      home.text.includes("Using Provelopment services is optional."),
      "the portability statement is delivered on Home",
    );
    check(
      rows,
      "reference.home.linksTheRepository",
      home.repositoryLink === true,
      "Home links the public repository (the owner-final hero action)",
    );
    check(
      rows,
      "reference.home.aboutTeaserLinksToAbout",
      home.aboutAnchors.length > 0 &&
        home.aboutAnchors.every((anchor) => anchor.includes("/about")),
      JSON.stringify(home.aboutAnchors),
    );
    check(
      rows,
      "reference.nav.siteAwareHomeAndAbout",
      home.visibleNav.some((entry) => entry.startsWith("/ww/en|")) &&
        home.visibleNav.some((entry) => entry.startsWith("/ww/en/about")),
      JSON.stringify(home.visibleNav),
    );
    check(
      rows,
      "reference.nav.activeEntryMarksCurrentPage",
      home.visibleNav.some((entry) => entry.endsWith("|page")),
      JSON.stringify(home.visibleNav),
    );
    check(
      rows,
      "reference.metadata.canonicalOnReferenceOrigin",
      home.canonical === `${REFERENCE_ORIGIN}/ww/en`,
      String(home.canonical),
    );
    check(
      rows,
      "reference.metadata.openGraphUrlOnReferenceOrigin",
      home.ogUrl === `${REFERENCE_ORIGIN}/ww/en`,
      String(home.ogUrl),
    );

    // ── HOME → ABOUT: the teaser really reaches the authored page ───────────
    const homeAction = home.aboutAnchors[0].split(" :: ")[0];
    await cdp.navigate(`${BASE_URL}${homeAction}`);
    await waitReady(cdp);
    await sleep(300);
    const followed = await cdp.evaluate("location.pathname");
    check(rows, "reference.home.aboutTeaserReachesAbout", followed === "/ww/en/about", `landed ${followed}`);

    // ── ABOUT: the authored Markdown page, in the other authoring mode ──────
    const about = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    check(
      rows,
      "reference.about.oneH1AuthoredTitle",
      about.h1s.length === 1 && about.h1s[0] === REFERENCE_ABOUT_TITLE,
      JSON.stringify(about.h1s),
    );
    check(
      rows,
      "reference.about.markdownSectionsRender",
      [
        "What this site demonstrates",
        "A website you control",
        "Two ways to create pages",
        "Sites, languages, locations and layout",
        "This configuration is an example",
        "Open source as the foundation",
        "Learn more",
      ].every((heading) => about.headings.includes(heading)),
      JSON.stringify(about.headings),
    );
    check(
      rows,
      "reference.about.deliversThePrinciples",
      about.text.includes(
        "Foundation is free and open source: download it, deploy it, modify it and make it your own.",
      ) && about.text.includes("Provelopment services are optional."),
      "the owner-final open-source and optional-services statements are delivered",
    );
    check(
      rows,
      "reference.about.linksTheRepository",
      about.repositoryLink === true,
      "About links the public repository",
    );
    check(
      rows,
      "reference.nav.aboutMarksCurrentPage",
      about.visibleNav.some((entry) => entry.startsWith("/ww/en/about") && entry.endsWith("|page")),
      JSON.stringify(about.visibleNav),
    );
    check(
      rows,
      "reference.metadata.aboutCanonicalOnReferenceOrigin",
      about.canonical === `${REFERENCE_ORIGIN}/ww/en/about`,
      String(about.canonical),
    );

    // ── THE FOUR DIMENSIONS, ON THE SHIPPED CONFIGURATION (R1C) ─────────────
    // The deployment now declares TWO sites: `ww` (Global) and `de` (Germany, a country site with
    // the demonstration locations Berlin and Frankfurt). The EXISTING controls appear because that
    // configuration is real: the Site selector because two sites exist, and the Location selector
    // only on Germany, which is the one that binds locations.
    const germanConfig = (reference.i18n?.locales ?? []).find((locale) => locale.code === "de");
    const declaredSites = reference.sites ?? [];
    check(
      rows,
      "reference.sites.declaresGlobalAndGermany",
      declaredSites.length === 2 &&
        declaredSites[0]?.code === "ww" &&
        declaredSites[0]?.label === "Global" &&
        declaredSites[1]?.code === "de" &&
        declaredSites[1]?.label === "Germany" &&
        reference.defaultSite === "ww",
      JSON.stringify(declaredSites),
    );
    check(
      rows,
      "reference.sites.germanyServesGermanAndEnglish",
      JSON.stringify(declaredSites[1]?.locales ?? null) === JSON.stringify(["de", "en"]) &&
        declaredSites[1]?.defaultLocale === "de",
      JSON.stringify(declaredSites[1] ?? null),
    );
    check(
      rows,
      "reference.locations.berlinAndFrankfurtBoundToGermanyOnly",
      JSON.stringify(Object.keys(reference.business?.regions ?? {})) ===
        JSON.stringify(["berlin", "frankfurt"]) &&
        JSON.stringify(reference.business?.pages ?? null) ===
          JSON.stringify([
            { site: "de", locale: "de", region: "berlin" },
            { site: "de", locale: "en", region: "berlin" },
            { site: "de", locale: "de", region: "frankfurt" },
            { site: "de", locale: "en", region: "frankfurt" },
          ]),
      JSON.stringify(reference.business ?? null),
    );
    check(
      rows,
      "reference.german.configDeclaresGermanOnTheDefaultLocale",
      germanConfig?.label === "Deutsch" && reference.i18n?.defaultLocale === "en",
      JSON.stringify(reference.i18n ?? null),
    );
    check(
      rows,
      "reference.dictionaries.useDistinctNeutralLocationLabel",
      reference.i18n?.locales?.length === 2,
      "the neutral Location label is the dictionary's All locations / Alle Standorte",
    );

    // At Global's English About: the Site selector appeared; Location did NOT (Global has none),
    // and the documented order is Site → Language → Layout.
    const englishSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.sites.haveOwnSiteSelector",
      englishSelectors.sitePresent === true,
      JSON.stringify(englishSelectors),
    );
    check(
      rows,
      "reference.sites.exactVisibleChoices",
      (englishSelectors.siteOptions ?? []).join(" | ") === "Global | Germany",
      String(englishSelectors.siteOptions),
    );
    check(
      rows,
      "reference.sites.globalIsCurrentOnGlobal",
      englishSelectors.siteValue === "ww",
      String(englishSelectors.siteValue),
    );
    check(
      rows,
      "reference.locations.absentOnGlobal",
      englishSelectors.locationPresent === false,
      JSON.stringify(englishSelectors),
    );
    check(
      rows,
      "reference.german.languageControlAppeared",
      englishSelectors.languagePresent === true,
      JSON.stringify(englishSelectors),
    );
    check(
      rows,
      "reference.german.exactVisibleChoices",
      (englishSelectors.languageOptions ?? []).join(" | ") === "English | Deutsch",
      String(englishSelectors.languageOptions),
    );
    check(
      rows,
      "reference.german.englishIsCurrent",
      englishSelectors.languageValue === "en",
      String(englishSelectors.languageValue),
    );
    check(
      rows,
      "reference.selectors.orderOnGlobal",
      // NAV1B — the navigation-MODE control now owns the TOP row, so it LEADS the document order;
      // the contextual group follows in its documented Site → Location → Language order.
      JSON.stringify(englishSelectors.selectorOrder ?? null) ===
        JSON.stringify(["layout", "site", "language"]),
      JSON.stringify(englishSelectors.selectorOrder ?? null),
    );

    // ── SITE SWITCHING: Global ↔ Germany keeps the page where the target serves it ──
    await cdp.navigate(`${BASE_URL}/ww/en/about`);
    await waitReady(cdp);
    check(rows, "reference.sites.switchToGermanyApplies", await cdp.evalBool(chooseSite("de")));
    await sleep(1000);
    await waitReady(cdp);
    const germanyEnglishAbout = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    check(
      rows,
      "reference.sites.englishRoutePreservedAcrossSites",
      germanyEnglishAbout.path === "/de/en/about",
      String(germanyEnglishAbout.path),
    );
    check(
      rows,
      "reference.sites.germanyServesItsOwnPage",
      germanyEnglishAbout.h1s[0] === "About the Germany site",
      JSON.stringify(germanyEnglishAbout.h1s),
    );
    await cdp.navigate(`${BASE_URL}/ww/de/about`);
    await waitReady(cdp);
    check(rows, "reference.sites.switchFromGermanGlobalToGermany", await cdp.evalBool(chooseSite("de")));
    await sleep(1000);
    await waitReady(cdp);
    const germanyGermanAbout = await cdp.evaluate("location.pathname");
    check(
      rows,
      "reference.sites.germanRoutePreservedAcrossSites",
      germanyGermanAbout === "/de/de/about",
      String(germanyGermanAbout),
    );
    check(rows, "reference.sites.switchBackToGlobal", await cdp.evalBool(chooseSite("ww")));
    await sleep(1000);
    await waitReady(cdp);
    const backOnGlobal = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    check(
      rows,
      "reference.sites.backToGlobalPreservesRoute",
      backOnGlobal.path === "/ww/de/about",
      String(backOnGlobal.path),
    );
    check(
      rows,
      "reference.sites.noCrossSiteContent",
      backOnGlobal.text.includes("Zwei Arten, Seiten zu erstellen") &&
        !backOnGlobal.text.includes("Berlin und Frankfurt sind Demonstrationsdaten"),
      "Global's German About is Global's own page, not Germany's",
    );

    // English About → Deutsch: the SAME page, in German. The route is preserved.
    check(rows, "reference.german.switchApplies", await cdp.evalBool(chooseLanguage("de")));
    await sleep(900);
    await waitReady(cdp);
    const germanAboutPath = await cdp.evaluate("location.pathname");
    check(
      rows,
      "reference.german.aboutRoutePreserved",
      germanAboutPath === "/ww/de/about",
      String(germanAboutPath),
    );
    const germanAbout = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    const germanSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.german.aboutOneH1AuthoredTitle",
      germanAbout.h1s.length === 1 && germanAbout.h1s[0] === "Über diese Foundation-Website",
      JSON.stringify(germanAbout.h1s),
    );
    check(
      rows,
      "reference.german.aboutSectionsRender",
      [
        "Was diese Website zeigt",
        "Eine Website unter Ihrer Kontrolle",
        "Zwei Arten, Seiten zu erstellen",
        "Sites, Sprachen, Standorte und Layout",
        "Diese Konfiguration ist ein Beispiel",
        "Mehr erfahren",
      ].every((heading) => germanAbout.headings.includes(heading)),
      JSON.stringify(germanAbout.headings),
    );
    check(
      rows,
      "reference.german.dictionaryIsGerman",
      germanSelectors.languageLabel === "Sprache" && germanSelectors.languageValue === "de",
      JSON.stringify(germanSelectors),
    );
    check(
      rows,
      "reference.german.navigationIsGerman",
      germanAbout.navTexts.includes("Startseite") && germanAbout.navTexts.includes("Über uns"),
      JSON.stringify(germanAbout.navTexts),
    );
    check(
      rows,
      "reference.german.htmlLangAndCanonical",
      germanSelectors.lang === "de" && germanSelectors.canonical === `${REFERENCE_ORIGIN}/ww/de/about`,
      `lang=${germanSelectors.lang} canonical=${germanSelectors.canonical}`,
    );
    check(
      rows,
      "reference.german.aboutSpeaksGermanMetadata",
      typeof germanSelectors.description === "string" &&
        germanSelectors.description.length > 0 &&
        germanSelectors.description !== reference.site?.description,
      String(germanSelectors.description),
    );

    // The Layout choice is the VISITOR's, not the language's: switch it, change language, keep it.
    await cdp.evaluate(chooseLayout("menu-bar"));
    await sleep(500);
    const germanLayout = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(
      rows,
      "reference.german.layoutSwitchedInGerman",
      germanLayout.attribute === "menu-bar",
      JSON.stringify(germanLayout),
    );
    check(rows, "reference.german.backToEnglishApplies", await cdp.evalBool(chooseLanguage("en")));
    await sleep(900);
    await waitReady(cdp);
    const backInEnglish = await cdp.evaluate("location.pathname");
    const englishLayoutAfter = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(
      rows,
      "reference.german.englishRoutePreserved",
      backInEnglish === "/ww/en/about",
      String(backInEnglish),
    );
    check(
      rows,
      "reference.german.layoutSurvivesLanguageChange",
      englishLayoutAfter.attribute === "menu-bar" && englishLayoutAfter.stored === "menu-bar",
      JSON.stringify(englishLayoutAfter),
    );
    await cdp.evaluate(chooseLayout("sidebar"));
    await sleep(400);

    // ── GERMAN HOME: the JSON document at `/ww/de`, whose action really reaches German About ──
    await cdp.navigate(`${BASE_URL}/ww/de`);
    await waitReady(cdp);
    await sleep(300);
    const germanHome = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    const germanHomeSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.german.homeOneH1AuthoredTitle",
      germanHome.h1s.length === 1 && germanHome.h1s[0] === "Eine Website, die Ihnen gehört.",
      JSON.stringify(germanHome.h1s),
    );
    check(
      rows,
      "reference.german.homeSectionsRender",
      [
        "Zwei Arten, Seiten zu erstellen",
        "Ihre Website gehört Ihnen",
        "Über diese Website",
        "Für unterschiedliche Anforderungen ausgelegt",
        "Die vollständige Website ist öffentlich",
      ].every((heading) => germanHome.headings.includes(heading)),
      JSON.stringify(germanHome.headings),
    );
    check(
      rows,
      "reference.german.localeRootSpeaksGerman",
      // `site.config.json`'s `i18n.locales[].description` is what the locale root advertises: the
      // German sentence, never the deployment's English one.
      germanHomeSelectors.description === germanConfig?.description,
      String(germanHomeSelectors.description),
    );
    check(
      rows,
      "reference.german.repositoryLinkIntact",
      germanHome.repositoryLink === true,
      "the owner-final external destination is preserved in German",
    );
    // The internal action states the SITE-SCOPED destination it means (`/ww/de/about`), because
    // `de` is now BOTH a locale key and the Germany site's code: the site-less locale form
    // (`/de/about`) would be read as the Germany site. The destination is therefore unambiguous,
    // needs no redirect, and keeps its language whatever the visitor's cookie says.
    await cdp.evaluate(`document.cookie = "NEXT_LOCALE=en; path=/"; true`);
    const germanAction = germanHome.aboutAnchors[0]?.split(" :: ")[0];
    check(
      rows,
      "reference.german.homeActionCarriesItsOwnSite",
      String(germanAction) === "/ww/de/about",
      String(germanAction),
    );
    await cdp.navigate(`${BASE_URL}${germanAction}`);
    await waitReady(cdp);
    await sleep(300);
    const landedInGerman = await cdp.evaluate("location.pathname");
    check(
      rows,
      "reference.german.homeActionReachesGermanAbout",
      landedInGerman === "/ww/de/about",
      `landed ${landedInGerman} (the cookie said en)`,
    );

    // ── GERMANY: locations inside ONE site ──────────────────────────────────
    await cdp.navigate(`${BASE_URL}/de/de`);
    await waitReady(cdp);
    await sleep(300);
    const germanyHomeSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.germany.hasAllFourControls",
      germanyHomeSelectors.sitePresent === true &&
        germanyHomeSelectors.locationPresent === true &&
        germanyHomeSelectors.languagePresent === true &&
        germanyHomeSelectors.layoutPresent === true,
      JSON.stringify(germanyHomeSelectors),
    );
    check(
      rows,
      "reference.germany.selectors.orderOnGermany",
      JSON.stringify(germanyHomeSelectors.selectorOrder ?? null) ===
        JSON.stringify(["layout", "site", "location", "language"]),
      JSON.stringify(germanyHomeSelectors.selectorOrder ?? null),
    );
    check(
      rows,
      "reference.germany.currentSiteAndLanguage",
      germanyHomeSelectors.siteValue === "de" &&
        germanyHomeSelectors.languageValue === "de" &&
        germanyHomeSelectors.locationValue === "",
      JSON.stringify(germanyHomeSelectors),
    );
    check(
      rows,
      "reference.germany.locationVocabulary",
      JSON.stringify(germanyHomeSelectors.locationOptions ?? null) ===
        JSON.stringify(["Alle Standorte", "Berlin", "Frankfurt"]),
      JSON.stringify(germanyHomeSelectors.locationOptions ?? null),
    );
    check(
      rows,
      "reference.germany.siteVocabulary",
      JSON.stringify(germanyHomeSelectors.siteOptions ?? null) ===
        JSON.stringify(["Global", "Germany"]),
      JSON.stringify(germanyHomeSelectors.siteOptions ?? null),
    );
    // The Layout choice is the visitor's: set it once, then change location and site around it.
    await cdp.evaluate(chooseLayout("menu-bar"));
    await sleep(500);

    check(
      rows,
      "reference.germany.locationBerlinApplies",
      await cdp.evalBool(chooseLocation("berlin")),
    );
    await sleep(900);
    await waitReady(cdp);
    const inBerlin = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    const berlinSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.germany.locationStaysInsideGermany",
      inBerlin.path === "/de/de/berlin",
      String(inBerlin.path),
    );
    check(
      rows,
      "reference.germany.locationKeepsSiteLanguageAndLayout",
      berlinSelectors.siteValue === "de" &&
        berlinSelectors.languageValue === "de" &&
        berlinSelectors.locationValue === "berlin" &&
        inBerlin.shellLayout === "menu-bar",
      JSON.stringify({ ...berlinSelectors, shellLayout: inBerlin.shellLayout }),
    );
    check(
      rows,
      "reference.germany.locationRendersItsOwnPage",
      inBerlin.h1s.length === 1 && inBerlin.h1s[0] === "Berlin",
      JSON.stringify(inBerlin.h1s),
    );

    check(
      rows,
      "reference.germany.locationFrankfurtApplies",
      await cdp.evalBool(chooseLocation("frankfurt")),
    );
    await sleep(900);
    await waitReady(cdp);
    const inFrankfurt = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    const frankfurtSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.germany.secondLocationIsReachable",
      inFrankfurt.path === "/de/de/frankfurt" && frankfurtSelectors.locationValue === "frankfurt",
      `${inFrankfurt.path} / ${frankfurtSelectors.locationValue}`,
    );
    check(
      rows,
      "reference.germany.locationNeverChangesTheLanguage",
      frankfurtSelectors.languageValue === "de" && inFrankfurt.shellLayout === "menu-bar",
      JSON.stringify({ language: frankfurtSelectors.languageValue, layout: inFrankfurt.shellLayout }),
    );

    // The neutral choice returns to the site's own pages — still inside Germany.
    check(
      rows,
      "reference.germany.neutralChoiceReturnsToTheSite",
      await cdp.evalBool(chooseLocation("")),
    );
    await sleep(900);
    await waitReady(cdp);
    const backToAllLocations = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    const allLocationsPath = await cdp.evaluate("location.pathname");
    check(
      rows,
      "reference.germany.allLocationsIsNonRegional",
      allLocationsPath === "/de/de" && backToAllLocations.locationValue === "",
      `${allLocationsPath} / ${backToAllLocations.locationValue}`,
    );
    check(
      rows,
      "reference.germany.allLocationsUsesTheNeutralWording",
      (backToAllLocations.locationOptions ?? [])[0] === "Alle Standorte",
      String((backToAllLocations.locationOptions ?? [])[0]),
    );

    // ── A LOCATION NEVER LEAKS ACROSS A SITE SWITCH ─────────────────────────
    await cdp.navigate(`${BASE_URL}/de/en/berlin`);
    await waitReady(cdp);
    await sleep(300);
    const englishBerlin = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.germany.locationIsReadableInEnglishToo",
      englishBerlin.locationValue === "berlin" &&
        englishBerlin.languageValue === "en" &&
        JSON.stringify(englishBerlin.locationOptions ?? null) ===
          JSON.stringify(["All locations", "Berlin", "Frankfurt"]),
      JSON.stringify(englishBerlin),
    );
    check(rows, "reference.germany.leaveForGlobal", await cdp.evalBool(chooseSite("ww")));
    await sleep(1000);
    await waitReady(cdp);
    const afterLeaving = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    const afterLeavingPath = await cdp.evaluate("location.pathname");
    check(
      rows,
      "reference.germany.locationDoesNotLeakIntoGlobal",
      afterLeaving.locationPresent === false &&
        !afterLeavingPath.includes("berlin") &&
        afterLeaving.siteValue === "ww",
      `${afterLeavingPath} / location=${afterLeaving.locationPresent}`,
    );
    check(
      rows,
      "reference.germany.layoutSurvivesSiteAndLocationChanges",
      (await cdp.evaluate(`document.documentElement.getAttribute('data-ui-shell-layout')`)) ===
        "menu-bar",
      "the visitor's Layout choice outlives a location and a site switch",
    );
    await cdp.evaluate(chooseLayout("sidebar"));
    await sleep(400);

    // ── FOUR CONTROLS AT EVERY WIDTH, IN BOTH PRESENTATIONS AND LANGUAGES ───
    // German text is longer than English, and this is the first reference state with four controls
    // at once: the row must wrap rather than overflow, in either Layout, on Germany's site.
    for (const [name, viewport] of [
      ["desktop", VIEWPORTS.desktop],
      ["tablet", VIEWPORTS.tablet],
      ["mobile", VIEWPORTS.mobile],
    ]) {
      await cdp.setViewport(viewport.width, viewport.height);
      for (const surface of ["sidebar", "menu-bar"]) {
        for (const localePath of ["de", "en"]) {
          await cdp.navigate(`${BASE_URL}/de/${localePath}`);
          await waitReady(cdp);
          await cdp.evaluate(chooseLayout(surface));
          await sleep(250);
          const state = JSON.parse(
            await cdp.evaluate(`JSON.stringify({
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              shellLayout: document.documentElement.getAttribute('data-ui-shell-layout'),
              selectors: [...document.querySelectorAll('select[data-selector]')].map((el) => el.getAttribute('data-selector')),
            })`),
          );
          check(
            rows,
            `reference.germany.noHorizontalOverflow.${name}.${surface}.${localePath}`,
            state.scrollWidth <= state.clientWidth + 1,
            `scrollW=${state.scrollWidth} clientW=${state.clientWidth}`,
          );
          check(
            rows,
            `reference.germany.fourControlsAt.${name}.${surface}.${localePath}`,
            JSON.stringify(state.selectors) ===
              JSON.stringify(["layout", "site", "location", "language"]) &&
              state.shellLayout === surface,
            JSON.stringify({ selectors: state.selectors, shellLayout: state.shellLayout }),
          );
        }
      }
    }
    await cdp.evaluate(`document.cookie = "NEXT_LOCALE=; path=/; max-age=0"; true`);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(url);
    await waitReady(cdp);

    // ── The reference origin reaches the technical routes too ───────────────
    const technical = await cdp.evaluate(`(async () => {
      const sitemap = await (await fetch('/sitemap.xml')).text();
      const robots = await (await fetch('/robots.txt')).text();
      const locs = sitemap.split('<loc>').slice(1).map((part) => part.split('</loc>')[0]);
      return JSON.stringify({ locs, robots });
    })()`);
    const parsed = JSON.parse(technical);
    check(
      rows,
      "reference.sitemap.everyUrlOnReferenceOrigin",
      // The FIRST entry is the deployment's own origin (the locale-root home page),
      // so both the bare origin and its sub-paths are correct here.
      parsed.locs.length >= 2 &&
        parsed.locs.every((loc) => loc === REFERENCE_ORIGIN || loc.startsWith(`${REFERENCE_ORIGIN}/`)),
      JSON.stringify(parsed.locs),
    );
    check(
      rows,
      "reference.sitemap.publishesAuthoredAboutPage",
      parsed.locs.includes(`${REFERENCE_ORIGIN}/ww/en/about`),
      JSON.stringify(parsed.locs),
    );
    check(
      rows,
      "reference.robots.referencesSitemapOnReferenceOrigin",
      parsed.robots.includes(`${REFERENCE_ORIGIN}/sitemap.xml`),
      parsed.robots.replace(/\s+/g, " ").trim(),
    );
  } catch (error) {
    check(rows, "reference-content.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
  }
  return rows;
}
