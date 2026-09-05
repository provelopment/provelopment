// tests/browser/matrix.mjs
// UI-10 D5: the committed cross-preset browser-validation matrix. It:
//  - swaps `ui.preset` (plus a matrix CTA) in site.config.json per preset,
//  - runs `next dev` for that preset,
//  - drives a real headless-Chrome/CDP session across desktop/tablet/mobile,
//  - performs REAL interaction (clicks, Tab/Shift+Tab/Escape, backdrop taps,
//    reduced-motion emulation) and asserts the shared behavioral contract,
//  - emits a machine-readable report and exits non-zero on any failure.
// Run: `pnpm test:browser` (requires a local Chrome/Chromium/Edge binary).
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { Cdp, findChrome } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const CONFIG_PATH = join(ROOT, "site.config.json");
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const BASE_PORT = 3800 + (Math.floor(Math.random() * 900) % 900);

let BASE_URL = "";

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 900, height: 800 },
  mobile: { width: 390, height: 844 },
};

const CTR = { enabled: true, action: "book", label: "Book Now", href: "/en/contact" };

const PRESETS = [
  { name: "adaptive", ui: { preset: "adaptive", cta: { ...CTR, style: "standard" } } },
  { name: "classic", ui: { preset: "classic", cta: { ...CTR, style: "standard" } } },
  { name: "focus", ui: { preset: "focus", cta: { ...CTR, style: "prominent" } } },
  { name: "workspace", ui: { preset: "workspace", cta: { ...CTR, style: "standard" } } },
  { name: "immersive", ui: { preset: "immersive", cta: { ...CTR, style: "standard" } } },
];

function check(rows, name, ok, detail = "") {
  rows.push({ name, ok, detail });
}

/** A JS expression string that evaluates to whether `selector` is visibly rendered. */
function visible(selector) {
  return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`;
}

async function waitReady(cdp) {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const ready = await cdp.evaluate(
      `(() => { const rd = document.readyState; const t = !!document.querySelector('#shell-mobile-nav'); const b = !!document.querySelector('.ui-shell-bottom-bar'); return rd === 'complete' && (t || b); })()`,
    );
    if (ready) { await sleep(400); return; }
    await sleep(200);
  }
  throw new Error("page did not hydrate in time");
}

/** Click a point on the backdrop that is NOT covered by the left-anchored panel. */
async function clickBackdrop(cdp) {
  const point = await cdp.evaluate(
    `(() => { const p = document.querySelector('.ui-drawer-panel'); const pr = p ? p.getBoundingClientRect() : null; const w = document.documentElement.clientWidth; const h = document.documentElement.clientHeight; const pright = pr ? pr.right : w - 30; const x = Math.max(pright + 12, Math.min(w - 10, pright + 12)); return { x: Math.min(x, w - 6), y: Math.max(8, Math.min(100, h - 10)) }; })()`,
  );
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

async function openTrigger(cdp, triggerSelector, panelSelector, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    const clicked = await cdp.clickCenter(triggerSelector);
    await sleep(250);
    const opened = clicked && (await cdp.evalBool(`!!document.querySelector(${JSON.stringify(panelSelector)})`));
    if (opened) return true;
  }
  return false;
}

/** Dev-server process helpers. */
function startDevServer(port) {
  const proc = spawn(process.execPath, [NEXT_BIN, "dev", "--port", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let log = "";
  proc.stdout.on("data", (d) => { log += d.toString(); });
  proc.stderr.on("data", (d) => { log += d.toString(); });
  return { proc, log: () => log };
}

function stopServer(server) {
  if (!server) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(server.proc.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      server.proc.kill("SIGTERM");
    }
  } catch { /* noop */ }
}

async function waitForServer(url, timeoutMs = 240000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12000) });
      if (res.status === 200) return;
    } catch { /* not ready yet */ }
    await sleep(1500);
  }
  throw new Error(`dev server not ready: ${url}`);
}

async function writeReport(rows, totalFails) {
  const report = {
    generatedAt: new Date().toISOString(),
    totalChecks: rows.length,
    failedChecks: totalFails,
    rows,
  };
  const tmp = join(tmpdir(), "ui10-browser-report.json");
  await writeFile(tmp, JSON.stringify(report, null, 2), "utf8");
  try {
    await mkdir(join(HERE, ".report"), { recursive: true });
    await writeFile(join(HERE, ".report", "ui10-browser-report.json"), JSON.stringify(report, null, 2), "utf8");
  } catch { /* report dir is gitignored; tmp is authoritative */ }
  console.log(`REPORT=${tmp}`);
  console.log(`TOTAL=${rows.length} PASSED=${rows.length - totalFails} FAILED=${totalFails}`);
  const fails = rows.filter((r) => !r.ok);
  for (const f of fails) console.log(`  FAIL [${f.preset}/${f.name}] ${f.detail}`);
}
/**
 * P1-3 — the VISIBLE focus-ring contract (the single global `:focus-visible`
 * rule driven by the `--ring` token). This is distinct from the UI-10 focus
 * LIFECYCLE (entry/return/inert, asserted elsewhere). We prove:
 *  - keyboard focus (real Tab dispatch / a real focus()) yields a VISIBLE
 *    `:focus-visible` outline on the shared link family;
 *  - pointer-only interaction does NOT falsely force the ring (Chromium's
 *    `:focus-visible` heuristic: mouse interaction does not match);
 *  - a keyboard Tab sweep lands on an interactive element (button/select/a)
 *    that carries the visible ring.
 * No configuration, no preset branching — the single global rule applies to
 * whichever interactive elements each composition renders.
 */
async function runFocusVisibleRing(rows, cdp, label) {
  // Fresh navigation so focus heuristics start clean (no prior keyboard/paint).
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);

  // 1) POINTER (real mouse click): a REAL CDP mouse click deterministically
  //    sets Chromium's input modality to "mouse"; `:focus-visible` must NOT
  //    match for a plain anchor focused by a mouse (unlike a script `.focus()`,
  //    which inherits the stale WebContents keyboard-modality from earlier
  //    assertions — the cause of the original flake). The target is a plain
  //    header/footer anchor; a one-shot `click` preventDefault stops navigation
  //    so the element stays inspectable.
  const LINK_SELECTOR = 'nav[aria-label="Primary navigation"] a, footer a, header a';
  await cdp.evaluate(`(() => {
    const a = document.querySelector(${JSON.stringify(LINK_SELECTOR)});
    if (!a) return;
    a.addEventListener("click", function once(e) {
      e.preventDefault();
      a.removeEventListener("click", once);
    }, { capture: true });
  })()`);
  await cdp.clickCenter(LINK_SELECTOR);
  await sleep(80);
  const pointer = await cdp.evaluate(`(() => {
    const a = document.querySelector(${JSON.stringify(LINK_SELECTOR)});
    if (!a) return { ok: false, detail: "no nav/footer/header link" };
    const cs = getComputedStyle(a);
    const forced = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px';
    const fv = a.matches(':focus-visible');
    const self = document.activeElement === a;
    return { ok: !forced && !fv && self, forced, fv, self, style: cs.outlineStyle + ' ' + cs.outlineWidth };
  })()`);
  check(rows, `${label}.focusVisible.pointer.noRing`, !!pointer && !!pointer.ok, (pointer && pointer.detail) || `forced=${pointer && pointer.forced} fv=${pointer && pointer.fv} self=${pointer && pointer.self} ${pointer && pointer.style}`);

  // 2) KEYBOARD: real Tab dispatch until an interactive family is active;
  //    Chromium matches `:focus-visible` for keyboard modality, so the VISIBLE
  //    ring (the single global `--ring` rule) must be present.
  let keyboard = null;
  for (let i = 0; i < 8 && !keyboard; i += 1) {
    await cdp.pressKey("Tab");
    await sleep(60);
    keyboard = await cdp.evaluate(`(() => {
      const el = document.activeElement;
      if (!el) return null;
      if (!/^(A|BUTTON|SELECT|TEXTAREA|INPUT)$/i.test(el.tagName)) return null;
      const cs = getComputedStyle(el);
      const ring = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px';
      return { ok: ring, tag: el.tagName, style: cs.outlineStyle + ' ' + cs.outlineWidth };
    })()`);
  }
  check(rows, `${label}.focusVisible.link.ring`, !!keyboard && !!keyboard.ok, (keyboard && keyboard.detail) || `active=${keyboard && keyboard.tag}: ${keyboard && keyboard.style}`);
}
/** Header-slot presets (classic / focus) — desktop + tablet ≥md structure + C2 observation. */
async function runHeaderPreset(rows, preset, prominent, cdp) {
  for (const [vpName, vp] of [["desktop", VIEWPORTS.desktop], ["tablet", VIEWPORTS.tablet]]) {
    await cdp.setViewport(vp.width, vp.height);
    await cdp.navigate(`${BASE_URL}/en`);
    await waitReady(cdp);
    const s = await cdp.evaluate(`(() => ({
      navVisible: ${visible('nav[aria-label="Primary navigation"]')},
      navCurrent: !!document.querySelector('nav[aria-label="Primary navigation"] a[aria-current="page"]'),
      // P0-5: the active item renders through the shared NavItem path — the
      // item wrapper class 'aria-current-page' is emitted only by NavItem
      // (ContextNavLinks, header + drawer/overlay placements, now compose it).
      liSharedMarker: (() => { const a = document.querySelector('nav[aria-label="Primary navigation"] a[aria-current="page"]'); return !!a && !!a.parentElement && a.parentElement.classList.contains('aria-current-page'); })(),
      ctaVisible: ${visible('.ui-shell-header-row .ui-shell-cta')},
      ctaProminent: !!document.querySelector('.ui-shell-header-row .ui-cta-prominent'),
      triggerHidden: (() => { const t = document.querySelector('#shell-mobile-nav'); return t && getComputedStyle(t).display === 'none'; })(),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      bottomBar: ${visible('.ui-shell-bottom-bar')},
      aside: !!document.querySelector('.ui-shell-sidebar'),
    }))()`);
    check(rows, `${vpName}.nav.visible`, s.navVisible);
    check(rows, `${vpName}.nav.ariaCurrent`, !!s.navCurrent);
    check(rows, `${vpName}.nav.liSharedMarker`, !!s.liSharedMarker);
    check(rows, `${vpName}.cta.reachable`, !!s.ctaVisible);
    check(rows, `${vpName}.ctaProminent`, prominent ? !!s.ctaProminent : !s.ctaProminent);
    check(rows, `${vpName}.mobile.triggerHidden`, !!s.triggerHidden);
    check(rows, `${vpName}.no.dialog`, s.dialogs === 0);
    check(rows, `${vpName}.no.bottomBar`, !s.bottomBar);
    check(rows, `${vpName}.no.aside`, !s.aside);
  }
  // P0-2 (resolves the deferred C2 observation): a header-slot preset whose
  // mobile disclosure also owns the CTA slot must NEVER expose a duplicate
  // interactive CTA. At <md the ≥md header CTA instance is hidden, so at rest
  // (drawer/overlay closed) ZERO interactive CTAs are reachable; opening the
  // disclosure exposes exactly the one panel CTA (asserted in
  // runDrawerOverlayMobile via `open.cta.single`).
  await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  const mob = await cdp.evaluate(`(() => {
    const headerCta = document.querySelector('.ui-shell-header-row .ui-shell-cta');
    const headerCtaRect = headerCta ? headerCta.getBoundingClientRect() : null;
    const reachableCtas = [...document.querySelectorAll('.nav-item-cta')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length;
    return { headerCtaVisible: !!headerCtaRect && headerCtaRect.width > 0, reachableCtas };
  })()`);
  check(rows, "mobile.headerCta.hiddenBelowMd", !mob.headerCtaVisible);
  check(rows, "mobile.noDuplicateCta", mob.reachableCtas === 0);
}

/** Aside-slot presets (adaptive / workspace / immersive) — desktop + tablet bands. */
async function runAsidePreset(rows, preset, cdp) {
  // P0-1: presets resolving `shell.sidebar.collapsible: true` get the SAME
  // structural contract here (the harness drives per preset; runtime never does).
  const collapsible = preset.name === "adaptive" || preset.name === "workspace";
  for (const [vpName, vp] of [["desktop", VIEWPORTS.desktop], ["tablet", VIEWPORTS.tablet]]) {
    await cdp.setViewport(vp.width, vp.height);
    await cdp.navigate(`${BASE_URL}/en`);
    await waitReady(cdp);
    const controlsId = vpName === "desktop" ? "shell-sidebar-desktop-panel" : "shell-sidebar-tablet-panel";
    const railSel = vpName === "desktop" ? "#shell-sidebar-desktop-rail" : "#shell-sidebar-tablet-rail";
    const toggleSel = `${railSel} [aria-controls="${controlsId}"]`;

    // P0-1 INITIAL state — a real collapse is NOT aria-only: a collapsed band
    // hides its panel from layout + tab order; the toggle stays (expand control).
    const init = await cdp.evaluate(`(() => {
      const rail = document.querySelector(${JSON.stringify(railSel)});
      const panel = document.querySelector(${JSON.stringify(vpName === "desktop" ? "#shell-sidebar-desktop-panel" : "#shell-sidebar-tablet-panel")});
      const toggle = rail ? rail.querySelector('[aria-controls="${controlsId}"]') : null;
      const pr = panel ? panel.getBoundingClientRect() : null;
      return {
        hasRail: !!rail,
        panelVisible: !!pr && pr.width > 0 && pr.height > 0,
        panelHiddenClass: !!panel && panel.classList.contains('hidden'),
        togglePresent: !!toggle,
        toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
      };
    })()`);
    check(rows, `${vpName}.aside.present`, !!init.hasRail);
    if (collapsible) {
      check(rows, `${vpName}.aside.toggle.present`, !!init.togglePresent);
      if (vpName === "desktop") {
        check(rows, `${vpName}.aside.expanded.initial`, init.toggleExpanded === "true" && init.panelVisible);
      } else {
        // `collapsed-sidebar` MEANS collapsed-by-default + always expandable.
        check(rows, `${vpName}.aside.collapsed.initial`, init.toggleExpanded === "false" && init.panelHiddenClass && !init.panelVisible);
        check(rows, `${vpName}.aside.collapsed.notDeadEnd`, init.togglePresent);
      }
    } else {
      // immersive floating rail: static, expanded, no toggle (capability off).
      check(rows, `${vpName}.aside.static.panelVisible`, init.panelVisible);
      check(rows, `${vpName}.aside.static.noToggle`, !init.togglePresent);
    }

    if (collapsible && vpName === "tablet") {
      await cdp.clickCenter(toggleSel); // expand before content checks
      await sleep(250);
    }

const s = await cdp.evaluate(`(() => ({
      sidebar: !!document.querySelector('.ui-shell-sidebar'),
      desktopRail: ${visible('#shell-sidebar-desktop-rail')},
      tabletRail: ${visible('#shell-sidebar-tablet-rail')},
      ctaVisible: (() => { for (const sel of ['#shell-sidebar-desktop-rail', '#shell-sidebar-tablet-rail']) { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().width > 0) { const c = el.querySelector('.ui-shell-cta'); return !!c && c.getBoundingClientRect().width > 0; } } return false; })(),
      currentInAside: (() => { for (const sel of ['#shell-sidebar-desktop-rail', '#shell-sidebar-tablet-rail']) { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().width > 0 && el.querySelector('a[aria-current="page"]')) return true; } return false; })(),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      bottomBar: ${visible('.ui-shell-bottom-bar')},
    }))()`);
    check(rows, `${vpName}.aside.present`, !!s.sidebar);
    check(rows, `${vpName}.aside.bandExclusive`, (s.desktopRail && !s.tabletRail) || (!s.desktopRail && s.tabletRail));
    check(rows, `${vpName}.aside.cta.reachable`, !!s.ctaVisible);
    check(rows, `${vpName}.aside.ariaCurrent`, !!s.currentInAside);
    check(rows, `${vpName}.no.dialog`, s.dialogs === 0);
    check(rows, `${vpName}.no.bottomBar`, !s.bottomBar);

    // P0-1 REAL interaction — desktop collapse → expand cycle (same toggle stays
    // reachable; navigation + panel restore).
    if (collapsible && vpName === "desktop") {
      await cdp.clickCenter(toggleSel);
      await sleep(250);
      const collapsed = await cdp.evaluate(`(() => {
        const panel = document.querySelector("#shell-sidebar-desktop-panel");
        const toggle = document.querySelector("#shell-sidebar-desktop-rail [aria-controls='shell-sidebar-desktop-panel']");
        const pr = panel ? panel.getBoundingClientRect() : null;
        const cta = panel ? panel.querySelector('.nav-item-cta') : null;
        return {
          collapsedStructural: !!panel && panel.classList.contains('hidden'),
          notVisible: !pr || (pr.width === 0 && pr.height === 0),
          togglePresent: !!toggle,
          toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
          // P0-2: the CTA must follow the sidebar's structural collapse —
          // when the panel is collapsed the CTA inside it is NOT reachable.
          ctaReachable: !!cta && cta.getBoundingClientRect().width > 0,
        };
      })()`);
      check(rows, `${vpName}.aside.collapse.structural`, collapsed.collapsedStructural && collapsed.notVisible);
      check(rows, `${vpName}.aside.collapse.toggleRemains`, collapsed.togglePresent);
      check(rows, `${vpName}.aside.collapse.expandedFalse`, collapsed.toggleExpanded === "false");
      check(rows, `${vpName}.aside.collapse.ctaNotReachable`, !collapsed.ctaReachable);
      await cdp.clickCenter(toggleSel);
      await sleep(250);
      const restored = await cdp.evaluate(`(() => {
        const panel = document.querySelector("#shell-sidebar-desktop-panel");
        const toggle = document.querySelector("#shell-sidebar-desktop-rail [aria-controls='shell-sidebar-desktop-panel']");
        const pr = panel ? panel.getBoundingClientRect() : null;
        const link = panel ? panel.querySelector('a[aria-current="page"], a[href*="/en"]') : null;
        const cta = panel ? panel.querySelector('.nav-item-cta') : null;
        return { panelVisible: !!pr && pr.width > 0, toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null, linkReachable: !!link && link.getBoundingClientRect().width > 0, ctaReachable: !!cta && cta.getBoundingClientRect().width > 0 };
      })()`);
      check(rows, `${vpName}.aside.expand.restores`, restored.panelVisible);
      check(rows, `${vpName}.aside.expand.expandedTrue`, restored.toggleExpanded === "true");
      check(rows, `${vpName}.aside.expand.navReachable`, restored.linkReachable);
      // P0-2: re-expanding restores the CTA (it follows the same collapse
      // semantics as the navigation — never orphaned, never stranded).
      check(rows, `${vpName}.aside.expand.ctaReachable`, restored.ctaReachable);
    } else if (collapsible && vpName === "tablet") {
      const restored = await cdp.evaluate(`(() => { const panel = document.querySelector("#shell-sidebar-tablet-panel"); const pr = panel ? panel.getBoundingClientRect() : null; return !panel.classList.contains('hidden') && pr.width > 0 && pr.height > 0; })()`);
      check(rows, `${vpName}.aside.expand.restores`, restored);
    }
  }
}

/** Responsive landmark exclusivity across the md (768) and lg (1024) boundaries. */
async function runAsideBoundaries(rows, preset, mobileBar, cdp) {
  for (const width of [767, 768, 1023, 1024]) {
    await cdp.setViewport(width, 820);
    await cdp.reload();
    await waitReady(cdp);
    const s = await cdp.evaluate(`(() => ({
      desktop: ${visible('#shell-sidebar-desktop-rail')},
      tablet: ${visible('#shell-sidebar-tablet-rail')},
      bar: (() => { const el = document.querySelector('.ui-shell-bottom-bar'); return !!el && el.getBoundingClientRect().width > 0; })(),
      trigger: (() => { const el = document.querySelector('#shell-mobile-nav'); return !!el && el.getBoundingClientRect().width > 0; })(),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    }))()`);
    check(rows, `boundary.${width}.bandExclusive`, (!s.desktop && !s.tablet) || (s.desktop !== s.tablet));
    check(rows, `boundary.${width}.noBothBands`, !(s.desktop && s.tablet));
    if (mobileBar) check(rows, `boundary.${width}.bottomBarResponsive`, width < 768 ? s.bar : !s.bar);
    else check(rows, `boundary.${width}.triggerResponsive`, width < 768 ? s.trigger : !s.trigger);
    check(rows, `boundary.${width}.no.dialog`, s.dialogs === 0);
  }
}

/** Drawer/overlay mobile path (classic/focus/workspace drawer; immersive overlay). */
async function runDrawerOverlayMobile(rows, preset, prominent, cdp) {
  const TRIGGER = "#shell-mobile-nav";
  const PANEL = "#shell-mobile-nav-panel";
  await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);

  const ids1 = await cdp.evaluate(`(() => [...document.querySelectorAll('[id]')].map((e) => e.id).sort().join('\\n'))()`);
  const idArr = ids1 === "" ? [] : ids1.split("\n");
  check(rows, "ids.unique", new Set(idArr).size === idArr.length && idArr.length > 0);
  await cdp.reload();
  await waitReady(cdp);
  const ids2 = await cdp.evaluate(`(() => [...document.querySelectorAll('[id]')].map((e) => e.id).sort().join('\\n'))()`);
  check(rows, "ids.deterministic", ids1 === ids2 && ids1.length > 0);

  const closed = await cdp.evaluate(`(() => {
    const t = document.querySelector(${JSON.stringify(TRIGGER)});
    return {
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      mainInert: !!document.querySelector('main').closest('[inert]'),
      triggerId: t ? t.id : null,
      expanded: t ? t.getAttribute('aria-expanded') : null,
      controls: t ? t.getAttribute('aria-controls') : null,
      ariaCurrent: document.querySelectorAll('a[aria-current="page"]').length,
    };
  })()`);
  check(rows, "closed.dialogs", closed.dialogs === 0);
  check(rows, "closed.mainNotInert", closed.mainInert === false);
  check(rows, "closed.trigger.id", closed.triggerId === "shell-mobile-nav");
  check(rows, "closed.trigger.expanded", closed.expanded === "false");
  check(rows, "closed.trigger.controls", closed.controls === "shell-mobile-nav-panel");
  check(rows, "closed.ariaCurrent", closed.ariaCurrent >= 1);

  const opened = await openTrigger(cdp, TRIGGER, PANEL);
  check(rows, "open.triggerOpens", opened);
  const o = await cdp.evaluate(`(() => {
    const d = document.querySelector(${JSON.stringify(PANEL)});
    const t = document.querySelector(${JSON.stringify(TRIGGER)});
    if (!d) return null;
    const cc = t ? t.getAttribute('aria-controls') : null;
    const lb = d.getAttribute('aria-labelledby');
    const cta = d.querySelector('.nav-item-cta');
    return {
      role: d.getAttribute('role'),
      modal: d.getAttribute('aria-modal'),
      labelBy: lb,
      labelResolves: lb === 'shell-mobile-nav' && document.getElementById(lb) === t,
      controlsResolves: cc === 'shell-mobile-nav-panel' && document.getElementById(cc) === d,
      tabIdx: d.getAttribute('tabindex'),
      className: d.className || '',
      backdrop: !!document.querySelector('.ui-drawer-backdrop'),
      focusInside: d.contains(document.activeElement),
      overflow: document.body.style.overflow,
      mainInert: !!document.querySelector('main').closest('[inert]'),
      panelInert: !!d.closest('[inert]'),
      ctaInPanel: !!cta,
      ctaReachable: !!cta && cta.getBoundingClientRect().width > 0,
      prominentInPanel: !!d.querySelector('.ui-cta-prominent'),
      currentInPanel: !!d.querySelector('a[aria-current="page"]'),
      // P0-5: the active panel item renders through the shared NavItem path —
      // only NavItem emits the 'aria-current-page' item-wrapper marker.
      currentLiShared: (() => { const a = d.querySelector('a[aria-current="page"]'); return !!a && !!a.parentElement && a.parentElement.classList.contains('aria-current-page'); })(),
      footerBadgeShared: (() => { const b = document.querySelector('footer .nav-item-badge'); return !!b && b.getBoundingClientRect().width > 0; })(),
    };
  })()`);
  check(rows, "open.dialog.role", !!o && o.role === "dialog");
  check(rows, "open.dialog.ariaModal", !!o && o.modal === "true");
  check(rows, "open.dialog.labelBy", !!o && o.labelBy === "shell-mobile-nav" && o.labelResolves);
  check(rows, "open.dialog.controlsResolves", !!o && o.controlsResolves);
  check(rows, "open.dialog.focusablePanel", !!o && o.tabIdx === "-1");
  check(rows, "open.dialog.panelClass", !!o && o.className.includes("ui-drawer-panel"));
  check(rows, "open.dialog.backdrop", !!o && !!o.backdrop);
  check(rows, "open.focus.entry", !!o && !!o.focusInside);
  check(rows, "open.scroll.locked", !!o && o.overflow === "hidden");
  check(rows, "open.inert.background", !!o && !!o.mainInert);
  check(rows, "open.inert.notDialog", !!o && !o.panelInert);
  check(rows, "open.cta.inPanel", !!o && !!o.ctaInPanel);
  check(rows, "open.cta.reachable", !!o && !!o.ctaReachable);
  check(rows, "open.ctaProminent", prominent ? !!o && !!o.prominentInPanel : !!(o && !o.prominentInPanel));
  // P0-2: exactly ONE interactive CTA is reachable while the mobile disclosure
  // is open (the ≥md header instance is hidden below md now; the aside bands
  // are display:none at <md) — no duplicate desktop+mobile pair, no dual CTA.
  const reachableCtasOpen = await cdp.evaluate(`(() => [...document.querySelectorAll('.nav-item-cta')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length)()`);
  check(rows, "open.cta.single", !!o && reachableCtasOpen === 1);
  check(rows, "open.ariaCurrent.inPanel", !!o && !!o.currentInPanel);
  check(rows, "open.nav.liSharedMarker", !!o && !!o.currentLiShared);
  check(rows, "open.footer.badgeShared", !!o && !!o.footerBadgeShared);

  // P0-1 — immersive OVERLAY sidebar contract: vertical navigation,
  // content-appropriate bounded width, and an explicit bottom close control.
  if (preset.name === "immersive") {
    const ov = await cdp.evaluate(`(() => {
      const d = document.querySelector(${JSON.stringify(PANEL)});
      if (!d) return null;
      const ul = d.querySelector('ul');
      const closeBtn = d.querySelector('.ui-drawer-close');
      const pr = d.getBoundingClientRect();
      const closeRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
      return {
        navVertical: ul ? getComputedStyle(ul).flexDirection === 'column' : false,
        panelWidth: Math.round(pr.width),
        viewportWidth: document.documentElement.clientWidth,
        closeLabel: closeBtn ? closeBtn.textContent.trim() : null,
        closeVisible: !!closeBtn && closeRect.width > 0 && closeRect.height > 0,
        closeBelowNav: !!closeBtn && !!ul && closeBtn.getBoundingClientRect().top > ul.getBoundingClientRect().bottom - 4,
      };
    })()`);
    check(rows, "overlay.nav.vertical", !!ov && ov.navVertical);
    check(rows, "overlay.panel.bounded", !!ov && ov.panelWidth >= 240 && ov.panelWidth < ov.viewportWidth && ov.panelWidth <= Math.min(288, ov.viewportWidth * 0.8) + 2);
    check(rows, "overlay.close.visible", !!ov && ov.closeVisible);
    check(rows, "overlay.close.label", !!ov && ov.closeLabel === "Close Sidebar");
    check(rows, "overlay.close.belowNav", !!ov && ov.closeBelowNav);
  }

  let trapped = true;
  for (let i = 0; i < 6 && trapped; i += 1) {
    await cdp.pressKey("Tab");
    await sleep(30);
    trapped = await cdp.evalBool(`document.querySelector(${JSON.stringify(PANEL)}).contains(document.activeElement)`);
  }
  check(rows, "open.tab.contained", trapped);
  let trappedShift = true;
  for (let i = 0; i < 6 && trappedShift; i += 1) {
    await cdp.pressKey("Tab", { shift: true });
    await sleep(30);
    trappedShift = await cdp.evalBool(`document.querySelector(${JSON.stringify(PANEL)}).contains(document.activeElement)`);
  }
  check(rows, "open.shiftTab.contained", trappedShift);

  await cdp.pressKey("Escape");
  await sleep(200);
  const esc = await cdp.evaluate(`(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, activeId: document.activeElement && document.activeElement.id, mainInert: !!document.querySelector('main').closest('[inert]'), overflow: document.body.style.overflow }))()`);
  check(rows, "escape.closed", esc.dialogs === 0);
  check(rows, "escape.focusReturn", esc.activeId === "shell-mobile-nav");
  check(rows, "escape.inertCleared", esc.mainInert === false);
  check(rows, "escape.scrollRestored", esc.overflow === "");

  await openTrigger(cdp, TRIGGER, PANEL);
  await clickBackdrop(cdp);
  await sleep(250);
  const bd = await cdp.evaluate(`(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, activeId: document.activeElement && document.activeElement.id, mainInert: !!document.querySelector('main').closest('[inert]') }))()`);
  check(rows, "backdrop.closed", bd.dialogs === 0);
  check(rows, "backdrop.focusReturn", bd.activeId === "shell-mobile-nav");
  check(rows, "backdrop.inertCleared", bd.mainInert === false);

  let clean = true;
  for (let i = 0; i < 3 && clean; i += 1) {
    await openTrigger(cdp, TRIGGER, PANEL);
    await cdp.pressKey("Escape");
    await sleep(150);
    const s2 = await cdp.evaluate(`(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, mainInert: !!document.querySelector('main').closest('[inert]'), overflow: document.body.style.overflow }))()`);
    if (s2.dialogs !== 0 || s2.mainInert || s2.overflow !== "") clean = false;
  }
  check(rows, "cycles.clean", clean);

  // P0-1 — activating the explicit "Close Sidebar" control closes the mobile
  // disclosure, returns focus to the trigger, and restores inert + scroll
  // (the SAME Drawer close mechanism as Escape/backdrop — not a second path).
  if (preset.name === "immersive") {
    const reopen = await openTrigger(cdp, TRIGGER, PANEL);
    check(rows, "closeBtn.opens", reopen);
    const closeBtnClick = await cdp.clickCenter("#shell-mobile-nav-panel .ui-drawer-close");
    await sleep(250);
    const cc = await cdp.evaluate(`(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, activeId: document.activeElement && document.activeElement.id, mainInert: !!document.querySelector('main').closest('[inert]'), overflow: document.body.style.overflow }))()`);
    check(rows, "closeBtn.clicked", closeBtnClick);
    check(rows, "closeBtn.closed", cc.dialogs === 0);
    check(rows, "closeBtn.focusReturn", cc.activeId === "shell-mobile-nav");
    check(rows, "closeBtn.inertCleared", cc.mainInert === false);
    check(rows, "closeBtn.scrollRestored", cc.overflow === "");
  }
}

/** Adaptive mobile: bottom bar + its More disclosure (the shared drawer path). */
async function runAdaptiveMobile(rows, cdp) {
  await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  const s = await cdp.evaluate(`(() => ({
    barVisible: ${visible('.ui-shell-bottom-bar')},
    barNavCurrent: !!document.querySelector('.ui-shell-bottom-bar a[aria-current="page"]'),
    // P0-5: the bottom bar already renders NavItem — the active item's wrapper
    // class 'aria-current-page' proves it stays on the shared path.
    barLiShared: (() => { const a = document.querySelector('.ui-shell-bottom-bar a[aria-current="page"]'); return !!a && !!a.parentElement && a.parentElement.classList.contains('aria-current-page'); })(),
    footerBadgeShared: (() => { const b = document.querySelector('footer .nav-item-badge'); return !!b && b.getBoundingClientRect().width > 0; })(),
    barCta: (() => { const c = document.querySelector('.ui-shell-bottom-bar .nav-item-cta'); return !!c && c.getBoundingClientRect().width > 0; })(),
    moreTrigger: !!document.querySelector('#shell-bottom-more'),
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  }))()`);
  check(rows, "bar.visible", !!s.barVisible);
  check(rows, "bar.ariaCurrent", !!s.barNavCurrent);
  check(rows, "bar.nav.liSharedMarker", !!s.barLiShared);
  check(rows, "bar.footer.badgeShared", !!s.footerBadgeShared);
  check(rows, "bar.cta.reachable", !!s.barCta);
  check(rows, "bar.no.dialog", s.dialogs === 0);

  if (!s.moreTrigger) {
    check(rows, "more.trigger", true, "More drawer not present (≤4 nav items) — skipped");
    return;
  }
  const moreOpen = await openTrigger(cdp, "#shell-bottom-more", "#shell-bottom-more-panel");
  check(rows, "more.open", moreOpen);
  const mo = await cdp.evaluate(`(() => {
    const d = document.querySelector('#shell-bottom-more-panel');
    if (!d) return null;
    return {
      role: d.getAttribute('role'),
      labelResolves: d.getAttribute('aria-labelledby') === 'shell-bottom-more' && document.getElementById('shell-bottom-more') != null,
      controlsResolves: (() => { const t = document.getElementById('shell-bottom-more'); return t && document.getElementById(t.getAttribute('aria-controls')) === d; })(),
      focusInside: d.contains(document.activeElement),
      mainInert: !!document.querySelector('main').closest('[inert]'),
      overflow: document.body.style.overflow,
    };
  })()`);
  check(rows, "more.dialog.semantics", !!mo && mo.role === "dialog" && mo.labelResolves && mo.controlsResolves);
  check(rows, "more.focus.inside", !!mo && !!mo.focusInside);
  check(rows, "more.inert.background", !!mo && !!mo.mainInert);
  check(rows, "more.scroll.locked", !!mo && mo.overflow === "hidden");

  let trapped = true;
  for (let i = 0; i < 4 && trapped; i += 1) {
    await cdp.pressKey("Tab");
    await sleep(30);
    trapped = await cdp.evalBool('document.querySelector("#shell-bottom-more-panel").contains(document.activeElement)');
  }
  check(rows, "more.tab.contained", trapped);

  await cdp.pressKey("Escape");
  await sleep(200);
  const mc = await cdp.evaluate(`(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, activeId: document.activeElement && document.activeElement.id, mainInert: !!document.querySelector('main').closest('[inert]') }))()`);
  check(rows, "more.escape.closed", mc.dialogs === 0);
  check(rows, "more.escape.focusReturn", mc.activeId === "shell-bottom-more");
  check(rows, "more.escape.inertCleared", mc.mainInert === false);

  await openTrigger(cdp, "#shell-bottom-more", "#shell-bottom-more-panel");
  await clickBackdrop(cdp);
  await sleep(250);
  const mb = await cdp.evaluate(`(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, mainInert: !!document.querySelector('main').closest('[inert]') }))()`);
  check(rows, "more.backdrop.closed", mb.dialogs === 0);
  check(rows, "more.backdrop.inertCleared", mb.mainInert === false);
}

/**
 * P1-4 — real-usage proof for the shared Section + Button primitives. The
 * `/en/contact` route renders the page-content frame (`<Section as="article">`,
 * an `<article>` with the shared frame class) and the contact submit action
 * (the shared `Button`, a NATIVE `<button type="submit">`, never a link)
 * in EVERY preset composition. This proves the primitives are actually
 * composed and rendering — not source-only.
 */
async function runPagePrimitives(rows, cdp, label) {
  await cdp.navigate(`${BASE_URL}/en/contact`);
  await waitReady(cdp);
  const s = await cdp.evaluate(`(() => {
    const article = document.querySelector('main article, article');
    const frame = article && article.className && article.className.includes('mx-auto max-w-page px-4 py-12');
    const submit = document.querySelector('button[type="submit"]');
    return {
      article: !!article && article.tagName === 'ARTICLE',
      frame,
      submitNative: !!submit && submit.tagName === 'BUTTON',
      submitToken: !!submit && submit.className.includes('bg-primary') && submit.className.includes('text-primary-foreground'),
      ariaBusy: !!submit && submit.hasAttribute('aria-busy'),
    };
  })()`);
  check(rows, `${label}.pagePrimitive.sectionFrame`, !!s.article && !!s.frame);
  check(rows, `${label}.pagePrimitive.submitButton`, !!s.submitNative && !!s.submitToken && !!s.ariaBusy);
}

/**
 * P1-7 — real-usage proof for the shared Grid + Stack primitives. The
 * `/en/offerings` route renders the shared collection `<Grid>` (a semantic
 * `<ul>` with the responsive columns class) and the `/en` page header renders
 * the shared `<Stack>` (a `flex` alignment row) in every preset composition.
 * This proves the layout primitives are actually composed and rendering —
 * not source-only.
 */
async function runGridStack(rows, cdp, label) {
  await cdp.navigate(`${BASE_URL}/en/offerings`);
  await waitReady(cdp);
  const g = await cdp.evaluate(`(() => {
    const ul = document.querySelector('main ul.grid');
    const gridClass = ul ? ul.className : '';
    return {
      gridList: !!ul && ul.tagName === 'UL',
      responsiveColumns: gridClass.includes('sm:grid-cols-2'),
      gap: gridClass.includes('gap-6'),
    };
  })()`);
  check(rows, `${label}.grid.rowList`, !!g.gridList);
  check(rows, `${label}.grid.responsive`, !!g.gridList && !!g.responsiveColumns && !!g.gap);

  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  const st = await cdp.evaluate(`(() => {
    const header = document.querySelector('header');
    const stack = header ? header.querySelector('div.flex') : null;
    return {
      stack: !!stack,
      flexWrap: !!stack && stack.className.includes('flex-wrap'),
    };
  })()`);
  check(rows, `${label}.stack.inHeader`, !!st.stack && !!st.flexWrap);
}

/** Reduced motion: the global PMR rule applies and the modal never animates. */
async function runReducedMotion(rows, trigger, panel, cdp) {
  await cdp.setReducedMotion(true);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  check(rows, "reduced.match", await cdp.evalBool('matchMedia("(prefers-reduced-motion: reduce)").matches'));
  await openTrigger(cdp, trigger, panel);
  const info = await cdp.evaluate(`(() => {
    const read = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { anim: cs.animationName, trans: parseFloat(cs.transitionDuration) }; };
    return { p: read(document.querySelector('.ui-drawer-panel')), b: read(document.querySelector('.ui-drawer-backdrop')) };
  })()`);
  const p = info.p || {};
  const b = info.b || {};
  const noAnim = (p.anim === "none" || !p.anim || p.anim === undefined) && (b.anim === "none" || !b.anim || b.anim === undefined);
  const noTrans = (Number.isNaN(p.trans) || p.trans < 0.01) && (Number.isNaN(b.trans) || b.trans < 0.01);
  check(rows, "reduced.noAnimationOnModal", noAnim && noTrans);
  check(rows, "reduced.scrollBehaviorAuto", await cdp.evalBool('getComputedStyle(document.documentElement).scrollBehavior === "auto"'));
  await cdp.pressKey("Escape");
  await sleep(150);
  await cdp.setReducedMotion(false);
}

/** Drive one preset: boot dev with its config, run its scenarios, stop the server. */
async function runPreset(preset, chrome) {
  const port = BASE_PORT + PRESETS.indexOf(preset);
  // IMPORTANT: navigate over `localhost`, NOT `127.0.0.1`. Next.js's dev server
  // blocks JS/HMR chunks from `127.0.0.1` as a cross-origin dev request unless
  // `allowedDevOrigins` is set; `localhost` is an allowed dev origin by default.
  // With `127.0.0.1` the app would never hydrate and every interaction would be
  // inert. (This requires no production config change.)
  const url = `http://localhost:${port}/en`;
  BASE_URL = `http://localhost:${port}`;
  const server = startDevServer(port);
  const rows = [];
  let cdp = null;
  try {
    await waitForServer(url);
    cdp = await Cdp.connect(chrome);
    if (preset.name === "adaptive") {
      await runAsidePreset(rows, preset, cdp);
      await runAsideBoundaries(rows, preset, true, cdp);
      await runAdaptiveMobile(rows, cdp);
      await runReducedMotion(rows, "#shell-bottom-more", "#shell-bottom-more-panel", cdp);
    } else if (preset.name === "classic" || preset.name === "focus") {
      await runHeaderPreset(rows, preset, preset.name === "focus", cdp);
      await runDrawerOverlayMobile(rows, preset, preset.name === "focus", cdp);
      await runReducedMotion(rows, "#shell-mobile-nav", "#shell-mobile-nav-panel", cdp);
    } else {
      await runAsidePreset(rows, preset, cdp);
      await runAsideBoundaries(rows, preset, false, cdp);
      await runDrawerOverlayMobile(rows, preset, false, cdp);
      await runReducedMotion(rows, "#shell-mobile-nav", "#shell-mobile-nav-panel", cdp);
    }
    // P1-3 — visible focus-ring contract (link + pointer-distinction + keyboard Tab).
    await runFocusVisibleRing(rows, cdp, `focus.${preset.name}`);
    // P1-4 — the shared Section + Button primitives render on a real route.
    await runPagePrimitives(rows, cdp, `p14.${preset.name}`);
    // P1-7 — the shared Grid + Stack primitives render on real routes.
    await runGridStack(rows, cdp, `p17.${preset.name}`);
  } catch (error) {
    check(rows, "scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    stopServer(server);
  }
  return rows.map((r) => ({ preset: preset.name, ...r }));
}

/** Iterate the five presets (config swap + dev server each), restoring config at the end. */
async function runMatrix(chrome, onlyPreset) {
  let allRows = [];
  const original = await readFile(CONFIG_PATH, "utf8");
  const toRun = onlyPreset ? PRESETS.filter((p) => p.name === onlyPreset) : PRESETS;
  if (toRun.length === 0) throw new Error(`unknown preset: ${onlyPreset}`);
  try {
    for (const preset of toRun) {
      const config = JSON.parse(original);
      config.ui = preset.ui;
      await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
      const rows = await runPreset(preset, chrome);
      allRows = allRows.concat(rows);
      const fails = rows.filter((r) => !r.ok).length;
      console.log(`[matrix] ${preset.name}: ${rows.length - fails}/${rows.length} checks passed${fails ? ` FAIL=${fails}` : ""}`);
    }
  } finally {
    await writeFile(CONFIG_PATH, original, "utf8");
  }
  const failed = allRows.filter((r) => !r.ok).length;
  await writeReport(allRows, failed);
  return failed > 0;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error("No Chrome/Chromium/Edge binary found. Install one or set CHROME_PATH.");
    process.exit(2);
  }
  const onlyPreset = process.argv[2];
  process.exitCode = 0;
  const failed = await runMatrix(chrome, onlyPreset);
  if (failed) process.exitCode = 1;
}

main();

