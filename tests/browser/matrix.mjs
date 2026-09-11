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
  // P5-5A — the P5-4 one-item-per-row mobile contract is verified across the
  // whole <md range (the DO "~390/700/900" acceptance), not only at 390px.
  mobileWide: { width: 700, height: 844 },
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
    // P6-1 — also captures the disclosure CONTROL contract: semantic element,
    // state-flipping label, real loaded icon, rail/content insets, no broken
    // image anywhere on the page.
    const init = await cdp.evaluate(`(() => {
      const rail = document.querySelector(${JSON.stringify(railSel)});
      const shell = document.querySelector('.ui-shell-sidebar');
      const panel = document.querySelector(${JSON.stringify(vpName === "desktop" ? "#shell-sidebar-desktop-panel" : "#shell-sidebar-tablet-panel")});
      const toggle = rail ? rail.querySelector('[aria-controls="${controlsId}"]') : null;
      const pr = panel ? panel.getBoundingClientRect() : null;
      const tr = toggle ? toggle.getBoundingClientRect() : null;
      const sr = shell ? shell.getBoundingClientRect() : null;
      const firstItem = rail ? rail.querySelector('ul li') : null;
      const fir = firstItem ? firstItem.getBoundingClientRect() : null;
      const toggleIcon = toggle ? toggle.querySelector('.ui-sidebar-toggle-icon, .ui-mobile-nav-icon') : null;
      return {
        hasRail: !!rail,
        panelVisible: !!pr && pr.width > 0 && pr.height > 0,
        panelHiddenClass: !!panel && panel.classList.contains('hidden'),
        // P6-3A — persistent-rail width state (collapse = a horizontal width).
        railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : null,
        dataCollapsed: rail ? rail.getAttribute('data-collapsed') : null,
        togglePresent: !!toggle,
        toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
        // P6-1 — the disclosure is a real interactive control with a visible,
        // LOADED icon and the state-correct Show/Hide Sidebar label.
        toggleTag: toggle ? toggle.tagName : null,
        toggleText: toggle ? toggle.textContent.trim() : null,
        toggleIcon: !!toggleIcon,
        toggleIconLoaded: !!toggleIcon && toggleIcon.complete && toggleIcon.naturalWidth > 0,
        // P6-1 — spacing/hierarchy (wrapper edge → toggle inset → item inset).
        railLeft: sr ? Math.round(sr.left) : null,
        toggleLeft: tr ? Math.round(tr.left) : null,
        itemLeft: fir ? Math.round(fir.left) : null,
        noBrokenImages: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      };
    })()`);
    check(rows, `${vpName}.aside.present`, !!init.hasRail);
    if (collapsible) {
      check(rows, `${vpName}.aside.toggle.present`, !!init.togglePresent);
      check(rows, `${vpName}.aside.toggle.semanticButton`, !!init.togglePresent && init.toggleTag === "BUTTON");
      check(rows, `${vpName}.aside.toggle.icon`, !!init.toggleIcon);
      check(rows, `${vpName}.aside.toggle.icon.loaded`, !!init.toggleIconLoaded);
      if (vpName === "desktop") {
        check(rows, `${vpName}.aside.expanded.initial`, init.toggleExpanded === "true" && init.panelVisible);
        // P6-1 — ONE vocabulary: open rail → "Hide Sidebar".
        check(rows, `${vpName}.aside.toggle.labelHide`, init.toggleText === "Hide Sidebar");
        // P6-1 — edge spacing + second-level inset (control vs navigation items).
        check(rows, `${vpName}.aside.spacing.railInset`, !!(init.railLeft != null && init.railLeft >= 16), `railLeft=${init.railLeft}`);
        check(rows, `${vpName}.aside.spacing.toggleInset`, !!(init.toggleLeft != null && init.railLeft != null && init.toggleLeft >= init.railLeft + 8), `toggle=${init.toggleLeft} rail=${init.railLeft}`);
        check(rows, `${vpName}.aside.spacing.itemDeeper`, !!(init.itemLeft != null && init.toggleLeft != null && init.itemLeft >= init.toggleLeft + 4), `item=${init.itemLeft} toggle=${init.toggleLeft}`);
        check(rows, `${vpName}.aside.spacing.noEdgeClip`, !!(init.itemLeft != null && init.itemLeft >= 24), `itemLeft=${init.itemLeft}`);
      } else {
        // `collapsed-sidebar` MEANS collapsed-by-default + always expandable —
        // and P6-3A means it is a PERSISTENT narrow rail (never display:none).
        check(rows, `${vpName}.aside.collapsed.initial`, init.toggleExpanded === "false" && init.dataCollapsed === "true" && init.panelVisible && !init.panelHiddenClass);
        check(rows, `${vpName}.aside.collapsed.persistentNarrow`, init.railWidth != null && init.railWidth > 0 && init.railWidth <= 64, `railWidth=${init.railWidth}`);
        check(rows, `${vpName}.aside.collapsed.notDeadEnd`, init.togglePresent);
        // P6-1 — collapsed rail → "Show Sidebar".
        check(rows, `${vpName}.aside.toggle.labelShow`, init.toggleText === "Show Sidebar");
      }
    } else {
      // immersive floating rail: static, expanded, no toggle (capability off).
      check(rows, `${vpName}.aside.static.panelVisible`, init.panelVisible);
      check(rows, `${vpName}.aside.static.noToggle`, !init.togglePresent);
    }
    // P6-1 — no broken-image placeholder anywhere on the rail viewport.
    check(rows, `${vpName}.aside.noBrokenImages`, !!init.noBrokenImages);

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
      // P5-4 — the sidebar band presents navigation as ONE vertical list, one
      // item per row (no two <li> share a horizontal line).
      itemsOnePerRow: (() => { const lis = [...document.querySelectorAll('.ui-shell-sidebar ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (lis.length === 0) return false; const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top)); return new Set(tops).size === tops.length; })(),
    }))()`);
    check(rows, `${vpName}.aside.present`, !!s.sidebar);
    check(rows, `${vpName}.aside.bandExclusive`, (s.desktopRail && !s.tabletRail) || (!s.desktopRail && s.tabletRail));
    check(rows, `${vpName}.aside.cta.reachable`, !!s.ctaVisible);
    check(rows, `${vpName}.aside.ariaCurrent`, !!s.currentInAside);
    check(rows, `${vpName}.no.dialog`, s.dialogs === 0);
    check(rows, `${vpName}.no.bottomBar`, !s.bottomBar);
    check(rows, `${vpName}.aside.nav.onePerRow`, !!s.itemsOnePerRow);

    // P0-1 REAL interaction — desktop collapse → expand cycle (same toggle stays
    // reachable; navigation + panel restore).
    if (collapsible && vpName === "desktop") {
      await cdp.clickCenter(toggleSel);
      await sleep(250);
      const collapsed = await cdp.evaluate(`(() => {
        const rail = document.querySelector("#shell-sidebar-desktop-rail");
        const panel = document.querySelector("#shell-sidebar-desktop-panel");
        const toggle = document.querySelector("#shell-sidebar-desktop-rail [aria-controls='shell-sidebar-desktop-panel']");
        const rr = rail ? rail.getBoundingClientRect() : null;
        const pr = panel ? panel.getBoundingClientRect() : null;
        const cta = panel ? panel.querySelector('.nav-item-cta') : null;
        return {
          railWidth: rr ? Math.round(rr.width) : null,
          // P6-3A — the rail is PERSISTENT: collapse is a HORIZONTAL WIDTH
          // state, never display:none.
          panelHiddenClass: !!panel && panel.classList.contains('hidden'),
          panelVisible: !!pr && pr.width > 0 && pr.height > 0,
          dataCollapsed: rail ? rail.getAttribute('data-collapsed') : null,
          togglePresent: !!toggle,
          toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
          toggleText: toggle ? toggle.textContent.trim() : null,
          toggleIcon: !!toggle && !!toggle.querySelector('.ui-sidebar-toggle-icon, .ui-mobile-nav-icon'),
          // P6-3A — nav (and CTA) stay reachable when collapsed.
          ctaReachable: !!cta && cta.getBoundingClientRect().width > 0,
        };
      })()`);
      check(rows, `${vpName}.aside.collapse.persistent`, !collapsed.panelHiddenClass && collapsed.panelVisible);
      check(rows, `${vpName}.aside.collapse.dataState`, collapsed.dataCollapsed === "true");
      check(rows, `${vpName}.aside.collapse.narrower`, collapsed.railWidth != null && init.railWidth != null && collapsed.railWidth < init.railWidth, `collapsed=${collapsed.railWidth} expanded=${init.railWidth}`);
      check(rows, `${vpName}.aside.collapse.toggleRemains`, collapsed.togglePresent);
      check(rows, `${vpName}.aside.collapse.expandedFalse`, collapsed.toggleExpanded === "false");
      check(rows, `${vpName}.aside.collapse.navReachable`, collapsed.ctaReachable);
      // P6-1 — the SAME toggle now says "Show Sidebar" and keeps its icon.
      check(rows, `${vpName}.aside.collapse.labelShow`, collapsed.toggleText === "Show Sidebar");
      check(rows, `${vpName}.aside.collapse.icon`, !!collapsed.toggleIcon);
      await cdp.clickCenter(toggleSel);
      await sleep(250);
      const restored = await cdp.evaluate(`(() => {
        const rail = document.querySelector("#shell-sidebar-desktop-rail");
        const panel = document.querySelector("#shell-sidebar-desktop-panel");
        const toggle = document.querySelector("#shell-sidebar-desktop-rail [aria-controls='shell-sidebar-desktop-panel']");
        const rr = rail ? rail.getBoundingClientRect() : null;
        const pr = panel ? panel.getBoundingClientRect() : null;
        const link = panel ? panel.querySelector('a[aria-current="page"], a[href*="/en"]') : null;
        const cta = panel ? panel.querySelector('.nav-item-cta') : null;
        return { railWidth: rr ? Math.round(rr.width) : null, dataCollapsed: rail ? rail.getAttribute('data-collapsed') : null, panelVisible: !!pr && pr.width > 0, toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null, toggleText: toggle ? toggle.textContent.trim() : null, linkReachable: !!link && link.getBoundingClientRect().width > 0, ctaReachable: !!cta && cta.getBoundingClientRect().width > 0 };
      })()`);
      check(rows, `${vpName}.aside.expand.restores`, restored.panelVisible && restored.railWidth != null && init.railWidth != null && restored.railWidth >= init.railWidth - 2, `restored=${restored.railWidth} expanded=${init.railWidth}`);
      check(rows, `${vpName}.aside.expand.expandedTrue`, restored.toggleExpanded === "true" && restored.dataCollapsed === "false");
      check(rows, `${vpName}.aside.expand.navReachable`, restored.linkReachable);
      // P6-1 — re-expanded rail returns to "Hide Sidebar".
      check(rows, `${vpName}.aside.expand.labelHide`, restored.toggleText === "Hide Sidebar");
      check(rows, `${vpName}.aside.expand.ctaReachable`, restored.ctaReachable);
      // P6-3A — the rail keeps its thin border in BOTH states (never a floating drawer).
      const border = await cdp.evaluate(`(() => { const el = document.querySelector("#shell-sidebar-desktop-rail"); if (!el) return null; const cs = getComputedStyle(el); return { w: parseFloat(cs.borderRightWidth) || 0, style: cs.borderRightStyle }; })()`);
      check(rows, `${vpName}.aside.border.present`, !!border && border.w >= 1 && border.style === "solid", JSON.stringify(border));
    } else if (collapsible && vpName === "tablet") {
      const restored = await cdp.evaluate(`(() => { const panel = document.querySelector("#shell-sidebar-tablet-panel"); const pr = panel ? panel.getBoundingClientRect() : null; return !panel.classList.contains('hidden') && pr.width > 0 && pr.height > 0; })()`);
      check(rows, `${vpName}.aside.expand.restores`, restored);
    }
  }

// P6-1 — desktop rail spacing/hierarchy/one-per-row validated at every
  // realistic desktop width (1280/1440/1920). The rail is a fixed-width
  // column with token insets, so these assertions prove the same result at
  // each width: a comfortable horizontal inset, the control inset before the
  // navigation items, the "Hide Sidebar" state, and zero broken images.
  if (collapsible) {
    for (const w of [1280, 1440, 1920]) {
      await cdp.setViewport(w, 900);
      await cdp.navigate(`${BASE_URL}/en`);
      await waitReady(cdp);
      const sp = await cdp.evaluate(`(() => {
        const rail = document.querySelector('#shell-sidebar-desktop-rail');
        const shell = document.querySelector('.ui-shell-sidebar');
        const toggle = rail ? rail.querySelector("[aria-controls='shell-sidebar-desktop-panel']") : null;
        const item = rail ? rail.querySelector('ul li') : null;
        const rr = shell ? shell.getBoundingClientRect() : null;
        const tr = toggle ? toggle.getBoundingClientRect() : null;
        const ir = item ? item.getBoundingClientRect() : null;
        const tops = [...rail.querySelectorAll('ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((li) => Math.round(li.getBoundingClientRect().top));
        return {
          railLeft: rr ? Math.round(rr.left) : null,
          toggleLeft: tr ? Math.round(tr.left) : null,
          itemLeft: ir ? Math.round(ir.left) : null,
          text: toggle ? toggle.textContent.trim() : null,
          onePerRow: tops.length > 0 && new Set(tops).size === tops.length,
          noBroken: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
        };
      })()`);
      check(rows, `p6-1.${w}.railInset`, !!sp && sp.railLeft != null && sp.railLeft >= 16, `rail=${sp && sp.railLeft}`);
      check(rows, `p6-1.${w}.toggleInset`, !!sp && sp.toggleLeft != null && sp.railLeft != null && sp.toggleLeft >= sp.railLeft + 8, `toggle=${sp && sp.toggleLeft} rail=${sp && sp.railLeft}`);
      check(rows, `p6-1.${w}.itemDeeper`, !!sp && sp.itemLeft != null && sp.toggleLeft != null && sp.itemLeft >= sp.toggleLeft + 4, `item=${sp && sp.itemLeft} toggle=${sp && sp.toggleLeft}`);
      check(rows, `p6-1.${w}.labelHide`, !!sp && sp.text === "Hide Sidebar", `text=[${sp && sp.text}]`);
      check(rows, `p6-1.${w}.onePerRow`, !!sp && sp.onePerRow);
      check(rows, `p6-1.${w}.noBrokenImages`, !!sp && sp.noBroken);
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
      triggerText: t ? t.textContent.trim() : null,
      triggerIcon: !!t && !!t.querySelector('.ui-mobile-nav-icon'),
      triggerIconLoaded: (() => { const ic = t ? t.querySelector('.ui-mobile-nav-icon') : null; return !!ic && ic.complete && ic.naturalWidth > 0; })(),
      // P5-5 — the trigger icon is a CONFIGURABLE asset (the shipped default
      // /assets/sidebar-open.svg) rendered with the shared ui-mobile-nav-icon
      // marker; the adopter replaces the file or the configured filename.
      triggerIconSrc: (() => { const ic = t ? t.querySelector('.ui-mobile-nav-icon') : null; return ic ? (ic.getAttribute('src') || '') : ''; })(),
      // P5-5 — the resolved control/menu modes surface on <html> as the same
      // generalized "data-ui-*" observability attributes as the presentation
      // layer (no preset identity).
      dataUiSidebar: document.documentElement.getAttribute('data-ui-sidebar-mode') || '',
      dataUiTop: document.documentElement.getAttribute('data-ui-top-mode') || '',
      dataUiBottom: document.documentElement.getAttribute('data-ui-bottom-mode') || '',
      dataUiCtaState: document.documentElement.getAttribute('data-ui-cta-state') || '',
      ariaCurrent: document.querySelectorAll('a[aria-current="page"]').length,
    };
  })()`);
  check(rows, "closed.dialogs", closed.dialogs === 0);
  check(rows, "closed.mainNotInert", closed.mainInert === false);
  check(rows, "closed.trigger.id", closed.triggerId === "shell-mobile-nav");
  check(rows, "closed.trigger.expanded", closed.expanded === "false");
  check(rows, "closed.trigger.controls", closed.controls === "shell-mobile-nav-panel");
  // P5-1/P6-1 — the closed mobile trigger is never a bare Primary
  // navigation/icon-only control: it exposes the recognizable open-sidebar icon
  // + the explicit label, using the ONE Show/Hide Sidebar vocabulary.
  check(rows, "closed.trigger.label.showSidebar", closed.triggerText === "Show Sidebar");
  check(rows, "closed.trigger.icon", !!closed.triggerIcon);
  // P6-1 — a real, LOADED icon (never a broken-image element on the page).
  check(rows, "closed.trigger.icon.loaded", !!closed.triggerIconLoaded);
  // P5-5 — the icon is the replaceable default ASSET (not hard-coded SVG):
  // file replacement or a configured filename changes it without source edits.
  check(rows, "closed.trigger.icon.assetDefault", closed.triggerIconSrc === "/assets/sidebar-open.svg");
  check(rows, "closed.ariaCurrent", closed.ariaCurrent >= 1);
  // P5-5 — the resolved control/menu modes are observable per generalized
  // vocabulary (the shipped canonical site uses the neutral open/open/default).
  check(rows, "p5-5.ui.sidebar.mode", closed.dataUiSidebar === "open");
  check(rows, "p5-5.ui.top.mode", closed.dataUiTop === "open");
  check(rows, "p5-5.ui.bottom.mode", closed.dataUiBottom === "open");
  check(rows, "p5-5.ui.cta.state", closed.dataUiCtaState === "default");

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

  // P0-1/P5-1 — every drawer/overlay mobile disclosure follows the ONE shared
  // sidebar contract: content-appropriate bounded width (never a full-viewport
  // takeover), vertical navigation for the overlay pattern,and an explicit bottom
  // Close Sidebar control with the recognizable close icon — for EVERY preset
  // (P5-1 extended the previously immersive-only contract to the drawer presets).
  if (preset.name !== "adaptive") {
    const ov = await cdp.evaluate(`(() => {
      const d = document.querySelector(${JSON.stringify(PANEL)});
      if (!d) return null;
      const ul = d.querySelector('ul');
      const closeBtn = d.querySelector('.ui-drawer-close');
      const pr = d.getBoundingClientRect();
      const closeRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
      return {
        navVertical: ul ? getComputedStyle(ul).flexDirection === 'column' : false,
        // P5-4 — one navigation item per row (no two items share a line).
        itemsPerRow: (() => { const lis = [...d.querySelectorAll('ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (lis.length === 0) return false; const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top)); return new Set(tops).size === tops.length; })(),
        panelWidth: Math.round(pr.width),
        viewportWidth: document.documentElement.clientWidth,
        closeLabel: closeBtn ? closeBtn.textContent.trim() : null,
        closeVisible: !!closeBtn && closeRect.width > 0 && closeRect.height > 0,
        closeBelowNav: !!closeBtn && !!ul && closeBtn.getBoundingClientRect().top > ul.getBoundingClientRect().bottom - 4,
        closeIcon: !!closeBtn && !!closeBtn.querySelector('.ui-mobile-nav-icon'),
        closeIconLoaded: (() => { const ic = closeBtn ? closeBtn.querySelector('.ui-mobile-nav-icon') : null; return !!ic && ic.complete && ic.naturalWidth > 0; })(),
        closeIconSrc: (() => { const ic = closeBtn ? closeBtn.querySelector('.ui-mobile-nav-icon') : null; return ic ? (ic.getAttribute('src') || '') : ''; })(),
      };
    })()`);
    check(rows, "panel.bounded", !!ov && ov.panelWidth >= 240 && ov.panelWidth < ov.viewportWidth && ov.panelWidth <= Math.min(288, ov.viewportWidth * 0.8) + 2, ov ? `w=${ov.panelWidth} vp=${ov.viewportWidth}` : "null");
    check(rows, "panel.close.visible", !!ov && ov.closeVisible);
    check(rows, "panel.close.label", !!ov && ov.closeLabel === "Hide Sidebar");
    check(rows, "panel.close.belowNav", !!ov && ov.closeBelowNav);
    check(rows, "panel.close.icon", !!ov && !!ov.closeIcon);
    // P6-1 — the close icon is a real, loaded asset (never broken-image).
    check(rows, "panel.close.icon.loaded", !!ov && !!ov.closeIconLoaded);
    check(rows, "panel.close.icon.assetDefault", !!ov && ov.closeIconSrc === "/assets/sidebar-close.svg");
    // P5-4 — the mobile sidebar disclosure is the SAME vertical list (one item
    // per row) on EVERY drawer/overlay preset: the behavior previously unique
    // to the immersive overlay is now the shared responsive nav contract.
    check(rows, "mobile.nav.vertical", !!ov && ov.navVertical);
    check(rows, "mobile.nav.onePerRow", !!ov && ov.itemsPerRow);
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

  // P0-1/P5-1 — activating the explicit "Close Sidebar" control closes the mobile
  // disclosure, returns focus to the trigger, and restores inert + scroll
  // (the SAME Drawer close mechanism as Escape/backdrop — not a second path).
  // P5-1: this behavioral coverage now runs for EVERY drawer/overlay preset
  if (preset.name !== "adaptive") {
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

  // P5-5A — the P5-4 one-item-per-row contract must hold across the WHOLE <md
  // range (the DO "~390/700/900" acceptance): re-verify the drawer/overlay
  // disclosure at 700px (still mobile primitives below the md = 768 breakpoint).
  await cdp.setViewport(VIEWPORTS.mobileWide.width, VIEWPORTS.mobileWide.height);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  const wideOpened = await openTrigger(cdp, TRIGGER, PANEL);
  check(rows, "wide700.open", wideOpened);
  const w = await cdp.evaluate(`(() => {
    const d = document.querySelector(${JSON.stringify(PANEL)});
    if (!d) return null;
    const t = document.querySelector(${JSON.stringify(TRIGGER)});
    const ul = d.querySelector('ul');
    const lis = [...d.querySelectorAll('ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (lis.length === 0) return { triggerVisible: !!t && t.getBoundingClientRect().width > 0, navVertical: false, onePerRow: false, empty: true };
    const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top));
    return {
      triggerVisible: !!t && t.getBoundingClientRect().width > 0,
      navVertical: ul ? getComputedStyle(ul).flexDirection === 'column' : false,
      onePerRow: new Set(tops).size === tops.length,
      empty: false,
    };
  })()`);
  check(rows, "wide700.trigger.visible", !!w && w.triggerVisible);
  check(rows, "wide700.nav.vertical", !!w && !!w.navVertical);
  check(rows, "wide700.nav.onePerRow", !!w && !!w.onePerRow);
  await cdp.pressKey("Escape");
  await sleep(120);
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

  // P5-5A — the one-item-per-row contract extends to the adaptive More drawer
  // across the whole <md range (the DO "~390/700/900" acceptance viewport).
  await cdp.setViewport(VIEWPORTS.mobileWide.width, VIEWPORTS.mobileWide.height);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  const wideMore = await openTrigger(cdp, "#shell-bottom-more", "#shell-bottom-more-panel");
  check(rows, "wide700.more.open", wideMore);
  const wm = await cdp.evaluate(`(() => {
    const d = document.querySelector('#shell-bottom-more-panel');
    if (!d) return null;
    const bar = document.querySelector('.ui-shell-bottom-bar');
    const lis = [...d.querySelectorAll('ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top));
    return {
      barVisible: !!bar && bar.getBoundingClientRect().height > 0,
      onePerRow: lis.length === 0 ? true : new Set(tops).size === tops.length,
    };
  })()`);
  check(rows, "wide700.more.barVisible", !!wm && !!wm.barVisible);
  check(rows, "wide700.more.onePerRow", !!wm && !!wm.onePerRow);
  await cdp.pressKey("Escape");
  await sleep(120);

  // P5-1 — adaptive More drawer follows the SAME shared sidebar contract:
  // bounded width + explicit Close Sidebar control with icon (preserved More entry).
  await openTrigger(cdp, "#shell-bottom-more", "#shell-bottom-more-panel");
  const mp = await cdp.evaluate(`(() => {
    const d = document.querySelector('#shell-bottom-more-panel');
    const t = document.getElementById('shell-bottom-more');
    if (!d) return null;
    const ul = d.querySelector('ul');
    const closeBtn = d.querySelector('.ui-drawer-close');
    const pr = d.getBoundingClientRect();
    const cr = closeBtn ? closeBtn.getBoundingClientRect() : null;
    return {
      panelWidth: Math.round(pr.width),
      viewportWidth: document.documentElement.clientWidth,
      closeLabel: closeBtn ? closeBtn.textContent.trim() : null,
      closeVisible: !!closeBtn && !!cr && cr.width > 0 && cr.height > 0,
      closeBelowNav: !!closeBtn && !!ul && cr.top > ul.getBoundingClientRect().bottom - 4,
      closeIcon: !!closeBtn && !!closeBtn.querySelector('.ui-mobile-nav-icon'),
      closeIconLoaded: (() => { const ic = closeBtn ? closeBtn.querySelector('.ui-mobile-nav-icon') : null; return !!ic && ic.complete && ic.naturalWidth > 0; })(),
      triggerIcon: !!t && !!t.querySelector('.ui-mobile-nav-icon'),
      triggerIconLoaded: (() => { const ic = t ? t.querySelector('.ui-mobile-nav-icon') : null; return !!ic && ic.complete && ic.naturalWidth > 0; })(),
      // P5-4 — one navigation item per row in the More disclosure too.
      itemsPerRow: (() => { const lis = [...d.querySelectorAll('ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (lis.length === 0) return false; const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top)); return new Set(tops).size === tops.length; })(),
    };
  })()`);
  check(rows, "more.panel.bounded", !!mp && mp.panelWidth > 0 && mp.panelWidth < mp.viewportWidth && mp.panelWidth <= Math.min(288, mp.viewportWidth * 0.8) + 2);
  check(rows, "more.trigger.icon", !!mp && !!mp.triggerIcon);
  check(rows, "more.trigger.icon.loaded", !!mp && !!mp.triggerIconLoaded);
  check(rows, "more.close.visible", !!mp && !!mp.closeVisible);
  // P6-1 — the More drawer uses the ONE vocabulary: "Hide Sidebar".
  check(rows, "more.close.label", !!mp && !!mp.closeLabel && mp.closeLabel === "Hide Sidebar", mp ? `label=[${mp.closeLabel}]` : "null");
  check(rows, "more.close.belowNav", !!mp && !!mp.closeBelowNav);
  check(rows, "more.close.icon", !!mp && !!mp.closeIcon);
  check(rows, "more.close.icon.loaded", !!mp && !!mp.closeIconLoaded);
  check(rows, "more.nav.onePerRow", !!mp && !!mp.itemsPerRow);
  const moreCloseClick = await cdp.clickCenter("#shell-bottom-more-panel .ui-drawer-close");
  await sleep(250);
  const mcc = await cdp.evaluate(`(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, activeId: document.activeElement && document.activeElement.id, mainInert: !!document.querySelector('main').closest('[inert]') }))()`);
  check(rows, "more.closeBtn.clicked", moreCloseClick);
  check(rows, "more.closeBtn.closed", mcc.dialogs === 0);
  check(rows, "more.closeBtn.focusReturn", mcc.activeId === "shell-bottom-more");
  check(rows, "more.closeBtn.inertCleared", mcc.mainInert === false);

  // P5-1 — footer clearance at mobile + tablet: the STICKY bar participates in
  // document flow after the footer (never obscuring it; no spacer needed).
  await cdp.evaluate("window.scrollTo(0, document.body.scrollHeight);");
  await sleep(300);
  const ft = await cdp.evaluate(`(() => {
    const bar = document.querySelector('.ui-shell-bottom-bar');
    const foot = document.querySelector('footer');
    const br = bar ? bar.getBoundingClientRect() : null;
    const fr = foot ? foot.getBoundingClientRect() : null;
    return {
      barVisible: !!br && br.height > 0,
      barSticky: !!bar && getComputedStyle(bar).position === 'sticky',
      footerVisible: !!fr && fr.height > 0,
      footerAboveBar: !!fr && !!br && fr.height > 0 && fr.bottom <= br.top + 1,
    };
  })()`);
  check(rows, "footer.bar.sticky", !!ft && !!ft.barSticky && !!ft.barVisible, ft ? `bs=${ft.barSticky} bv=${ft.barVisible}` : "null");
  check(rows, "footer.reachableAtEnd", !!ft && ft.footerVisible && ft.footerAboveBar, ft ? `fv=${ft.footerVisible} fab=${ft.footerAboveBar}` : "null");

  await cdp.setViewport(700, 820);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  await cdp.evaluate("window.scrollTo(0, document.body.scrollHeight);");
  await sleep(300);
  const ftT = await cdp.evaluate(`(() => {
    const bar = document.querySelector('.ui-shell-bottom-bar');
    const foot = document.querySelector('footer');
    const br = bar ? bar.getBoundingClientRect() : null;
    const fr = foot ? foot.getBoundingClientRect() : null;
    return {
      barVisible: !!br && br.height > 0 && br.top > 0 && br.top < document.documentElement.clientHeight,
      barSticky: !!bar && getComputedStyle(bar).position === 'sticky',
      footerAboveBar: !!fr && !!br && fr.height > 0 && fr.bottom <= br.top + 1,
    };
  })()`);
  check(rows, "tablet.bar.sticky", !!ftT && !!ftT.barVisible && !!ftT.barSticky, ftT ? `bv=${ftT.barVisible} bs=${ftT.barSticky}` : "null");
  check(rows, "tablet.footer.reachableAtEnd", !!ftT && !!ftT.footerAboveBar, ftT ? `fab=${ftT.footerAboveBar}` : "null");
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
    // P6-3B — favicon / header logo / page banner (every preset); sidebar rail
    // geometry only where the resolved composition actually has an aside rail.
    await runBrandingChecks(rows, preset.name, cdp);
    if (preset.name === "adaptive" || preset.name === "workspace" || preset.name === "immersive") {
      await runP6bSidebarChecks(rows, preset.name, cdp);
      await runP6bCollapsedChecks(rows, preset.name, cdp);
      await runP6bTabletSweep(rows, preset.name, cdp);
    }
  } catch (error) {
    check(rows, "scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    stopServer(server);
  }
  return rows.map((r) => ({ preset: preset.name, ...r }));
}

/**
 * P5-6 — duplicate-destination navigation acceptance (browser-real).
 * Two nav entries sharing one `href` are valid; their React identity must come
 * from the position-derived `key` (getSiteNavLinks), never `href`. Proves, in
 * real dev renders: desktop header (classic) + aside rail (adaptive) render
 * BOTH same-href entries with OWN label/icon/disabled state; mobile drawer +
 * bottom-More (390/700) keep both one-per-row; no duplicate-key console
 * warnings anywhere. Own dev server per preset; config restored after.
 */
async function runDuplicateNavScenario(chrome) {
  // P6-1: the fixture icons must be REAL shipped assets (a configured icon with
  // no backing file is now a LOUD build failure) — Alpha/Beta take the two
  // distinct shipped sidebar defaults to prove each same-`href` entry keeps
  // its OWN icon; the other entries are icon-less (their icons were never
  // asserted — only Alpha/Beta identity is).
  const DUP_NAV = [
    { label: "First", href: "/first", position: "middle" },
    { label: "Second", href: "/second", position: "middle" },
    { label: "Third", href: "/third", position: "middle" },
    { label: "Fourth", href: "/fourth", position: "middle" },
    { label: "Alpha", href: "/pricing", icon: "sidebar-open.svg", position: "top" },
    { label: "Beta", href: "/pricing", icon: "sidebar-close.svg", position: "bottom", disabled: true },
  ];
  const HOOK = `(() => { window.__dupKeyWarnings = []; const o = window.console.error; window.console.error = (...a) => { const s = a.map(String).join(" "); if (/same key|duplicate|two children/i.test(s)) window.__dupKeyWarnings.push(s); o.apply(window.console, a); }; })();`;
  const original = await readFile(CONFIG_PATH, "utf8");
  const rows = [];

  const bootPhase = async (preset, label, portSuffix) => {
    const port = BASE_PORT + 99 + portSuffix;
    const url = `http://localhost:${port}/en`;
    BASE_URL = `http://localhost:${port}`;
    const config = JSON.parse(original);
    config.ui = { preset };
    config.navigation = DUP_NAV;
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
    const server = startDevServer(port);
    let cdp = null;
    try {
      await waitForServer(url);
      cdp = await Cdp.connect(chrome);
      await cdp.send("Page.enable");
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: HOOK });
      await cdp.setViewport(1280, 900);
      await cdp.navigate(url);
      await waitReady(cdp);
      const d = await cdp.evaluate(`(() => {
        const root = ${preset === "classic"} ? document.querySelector("header nav ul") : document.querySelector("#shell-sidebar-desktop-panel ul");
        if (!root) return null;
        const labels = [...root.querySelectorAll("li .ui-nav-item-label")].map((s) => s.textContent);
        const alpha = [...root.querySelectorAll("a")].find((a) => a.querySelector(".ui-nav-item-label")?.textContent === "Alpha");
        const betaLi = [...root.querySelectorAll("li")].find((li) => li.querySelector(".ui-nav-item-label")?.textContent === "Beta");
        return {
          both: labels.includes("Alpha") && labels.includes("Beta"),
          alphaIsLink: !!alpha && alpha.getAttribute("href") === "/en/pricing",
          alphaIcon: !!alpha && !!alpha.querySelector("img[src$='sidebar-open.svg']"),
          betaDisabled: !!betaLi && !!betaLi.querySelector("[aria-disabled='true']"),
          betaIcon: !!betaLi && !!betaLi.querySelector("img[src$='sidebar-close.svg']"),
          warnings: window.__dupKeyWarnings.length,
        };
      })()`);
      if (d === null) { check(rows, `${label}.desktop.renders`, false); } else {
        check(rows, `${label}.desktop.bothPricingEntries`, d.both);
        check(rows, `${label}.desktop.alpha.navigable.ownIcon`, d.alphaIsLink && d.alphaIcon);
        check(rows, `${label}.desktop.beta.disabled.ownIcon`, d.betaDisabled && d.betaIcon);
        check(rows, `${label}.desktop.noDupKeyConsole`, d.warnings === 0);
      }
      // Mobile 390 + 700: disclosure (drawer for classic, More for adaptive).
      for (const w of [390, 700]) {
        await cdp.setViewport(w, 844);
        await cdp.navigate(url);
        await waitReady(cdp);
        const trigger = preset === "adaptive" ? "#shell-bottom-more" : "#shell-mobile-nav";
        const panel = preset === "adaptive" ? "#shell-bottom-more-panel" : "#shell-mobile-nav-panel";
        const opened = await openTrigger(cdp, trigger, panel);
        check(rows, `${label}.w${w}.opens`, opened);
        if (!opened) continue;
        const m = await cdp.evaluate(`(() => {
          const p = document.querySelector(${JSON.stringify(panel)});
          const lis = [...p.querySelectorAll("ul > li")].filter((li) => li.getBoundingClientRect().width > 0);
          const labels = lis.map((li) => li.querySelector(".ui-nav-item-label")?.textContent ?? "");
          const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top));
          const alpha = lis.find((li) => li.querySelector(".ui-nav-item-label")?.textContent === "Alpha");
          const beta = lis.find((li) => li.querySelector(".ui-nav-item-label")?.textContent === "Beta");
          return {
            onePerRow: new Set(tops).size === tops.length,
            hasBoth: labels.includes("Alpha") && labels.includes("Beta"),
            alphaLink: !!alpha && !!alpha.querySelector("a[href='/en/pricing']"),
            betaDisabled: !!beta && !!beta.querySelector("[aria-disabled='true']"),
            warnings: window.__dupKeyWarnings.length,
          };
        })()`);
        check(rows, `${label}.w${w}.onePerRow`, !!m && m.onePerRow);
        check(rows, `${label}.w${w}.both.in.disclosure`, !!m && m.hasBoth);
        check(rows, `${label}.w${w}.alpha.navigable`, !!m && m.alphaLink);
        check(rows, `${label}.w${w}.beta.disabled.identity`, !!m && m.betaDisabled);
        check(rows, `${label}.w${w}.noDupKeyConsole`, !!m && m.warnings === 0);
        await cdp.pressKey("Escape");
        await sleep(120);
      }
    } finally {
      if (cdp) await cdp.close();
      stopServer(server);
    }
  };

  await bootPhase("classic", "dup.classic", 1);
  await bootPhase("adaptive", "dup.adaptive", 2);
  await writeFile(CONFIG_PATH, original, "utf8");
  return rows;
}

/** P6-3B — favicon / header logo / page banner contract (every preset). */
async function runBrandingChecks(rows, tag, cdp) {
  await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  const s = await cdp.evaluate(`(() => {
    const icons = [...document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')];
    const logo = document.querySelector('.ui-site-header-logo');
    const logoRect = logo ? logo.getBoundingClientRect() : null;
    const banner = document.querySelector('.ui-page-banner');
    const bimg = document.querySelector('.ui-page-banner-image');
    const bcs = banner ? getComputedStyle(banner) : null;
    const br = banner ? banner.getBoundingClientRect() : null;
    const ir = bimg ? bimg.getBoundingClientRect() : null;
    return {
      iconCount: icons.length,
      iconHref: icons.length ? icons[0].getAttribute('href') : null,
      logoPresent: !!logo,
      logoSrc: logo ? logo.getAttribute('src') : null,
      logoAlt: logo ? logo.getAttribute('alt') : null,
      logoLoaded: !!logo && logo.complete && logo.naturalWidth > 0,
      logoBoxOk: !!(logoRect && logoRect.height > 0 && logoRect.height <= 48 && logoRect.width > logoRect.height),
      bannerPresent: !!banner,
      bannerImgSrc: bimg ? bimg.getAttribute('src') : null,
      bannerImgLoaded: !!bimg && bimg.complete && bimg.naturalWidth > 0,
      bannerPad: bcs ? [bcs.paddingTop, bcs.paddingRight, bcs.paddingBottom, bcs.paddingLeft].join("/") : null,
      bannerMargin: bcs ? [bcs.marginTop, bcs.marginRight, bcs.marginBottom, bcs.marginLeft].join("/") : null,
      bannerBorder: bcs ? bcs.borderTopWidth : null,
      bannerRadius: bcs ? bcs.borderTopLeftRadius : null,
      bannerWidth: br ? Math.round(br.width) : null,
      imgWidth: ir ? Math.round(ir.width) : null,
      imgHeight: ir ? Math.round(ir.height) : null,
      imgNatW: bimg ? bimg.naturalWidth : 0,
      imgNatH: bimg ? bimg.naturalHeight : 0,
      viewportWidth: document.documentElement.clientWidth,
      noBroken: [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    };
  })()`);
  check(rows, `${tag}.favicon.single`, s.iconCount === 1, `count=${s.iconCount}`);
  check(rows, `${tag}.favicon.href`, typeof s.iconHref === "string" && s.iconHref.endsWith("/assets/favicon.svg"), `href=${s.iconHref}`);
  check(rows, `${tag}.header.logo`, !!s.logoPresent && !!s.logoLoaded && typeof s.logoSrc === "string" && s.logoSrc.endsWith("/assets/logo-header.svg"), `src=${s.logoSrc}`);
  check(rows, `${tag}.header.logo.alt`, typeof s.logoAlt === "string" && s.logoAlt.length > 0, `alt=${s.logoAlt}`);
  check(rows, `${tag}.header.logo.aspect`, !!s.logoBoxOk);
  check(rows, `${tag}.banner.home.present`, !!s.bannerPresent && !!s.bannerImgLoaded && typeof s.bannerImgSrc === "string" && s.bannerImgSrc.endsWith("/assets/banner-home.jpg"), `src=${s.bannerImgSrc}`);
  check(rows, `${tag}.banner.noPadding`, s.bannerPad === "0px/0px/0px/0px", `pad=${s.bannerPad}`);
  check(rows, `${tag}.banner.noMargin`, s.bannerMargin === "0px/0px/0px/0px", `margin=${s.bannerMargin}`);
  check(rows, `${tag}.banner.noBorder`, s.bannerBorder === "0px" && s.bannerRadius === "0px", `border=${s.bannerBorder} radius=${s.bannerRadius}`);
  check(rows, `${tag}.banner.fullWidth`, s.bannerWidth != null && Math.abs(s.bannerWidth - s.viewportWidth) <= 1, `w=${s.bannerWidth} vw=${s.viewportWidth}`);
  // The banner is rendered at its graphic's OWN aspect ratio (intrinsic height —
  // no forced fixed height and no stretch/crop).
  check(
    rows,
    `${tag}.banner.intrinsicHeight`,
    s.imgNatW > 0 && s.imgNatH > 0 && s.imgWidth > 0 && s.imgHeight > 0 &&
      Math.abs(s.imgWidth / s.imgHeight - s.imgNatW / s.imgNatH) < 0.02,
    `rendered=${s.imgWidth}x${s.imgHeight} natural=${s.imgNatW}x${s.imgNatH}`,
  );
  check(rows, `${tag}.noBrokenImages`, !!s.noBroken);

  // A page with NO configured banner: no container and no reserved gap.
  await cdp.navigate(`${BASE_URL}/en/about`);
  await waitReady(cdp);
  const nb = await cdp.evaluate(`(() => {
    const banner = document.querySelector('.ui-page-banner');
    const header = document.querySelector('.ui-site-header');
    const hr = header ? header.getBoundingClientRect() : null;
    return { banner: !!banner, headerTop: hr ? Math.round(hr.top) : null };
  })()`);
  check(rows, `${tag}.banner.absentOnNoBannerPage`, nb.banner === false);
  check(rows, `${tag}.banner.noReservedGap`, nb.headerTop != null && nb.headerTop <= 40, `headerTop=${nb.headerTop}`);
}


/** P6-3B — sidebar rail geometry: toggle icon size, nav-item icons, labels, border. */
async function runP6bSidebarChecks(rows, tag, cdp) {
  await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  const exp = await cdp.evaluate(`(() => {
    const rail = document.querySelector('#shell-sidebar-desktop-rail');
    const main = document.querySelector('#main');
    if (!rail) return null;
    const toggle = rail.querySelector('.ui-sidebar-toggle-icon');
    const tr = toggle ? toggle.getBoundingClientRect() : null;
    const rr = rail.getBoundingClientRect();
    const mr = main ? main.getBoundingClientRect() : null;
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none'; };
    const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none'; };
    const items = [...rail.querySelectorAll('ul > li')];
    const navIcon = rail.querySelector('.ui-nav-item-icon-open') || rail.querySelector('.ui-nav-item-icon');
    const nir = navIcon ? navIcon.getBoundingClientRect() : null;
    const ends = (li, cls, suffix) => { const el = li.querySelector(cls); return !!(el && (el.getAttribute('src') || '').endsWith(suffix)); };
    return {
      hasToggle: !!rail.querySelector('.ui-sidebar-toggle'),
      navIconW: nir ? Math.round(nir.width) : null,
      toggleW: tr ? Math.round(tr.width) : null, toggleH: tr ? Math.round(tr.height) : null,
      railHeight: Math.round(rr.height), mainHeight: mr ? Math.round(mr.height) : null,
      border: getComputedStyle(rail).borderRightWidth, itemCount: items.length,
      allIcons: items.every((li) => !!li.querySelector('.ui-nav-item-icon')),
      openVisible: items.filter((li) => shown(li.querySelector('.ui-nav-item-icon-open'))).length,
      closedVisible: items.filter((li) => shown(li.querySelector('.ui-nav-item-icon-closed'))).length,
      labelsVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-label'))).length,
      defaultDots: items.filter((li) => ends(li, '.ui-nav-item-icon-open', 'sidebar-default-icon-open.svg')).length,
    };
  })()`);
  check(rows, `${tag}.p6b.desktop.navIcon64`, !!exp && exp.navIconW != null && exp.navIconW >= 64, `navIconW=${exp && exp.navIconW}`);
  if (exp && exp.hasToggle) {
    check(rows, `${tag}.p6b.desktop.toggleIcon64`, exp.toggleW >= 64 && exp.toggleH >= 64, `w=${exp.toggleW} h=${exp.toggleH}`);
  } else {
    // A deliberately NON-collapsible rail (e.g. immersive `floating`) has no
    // toggle control at all — the §3 toggle-size contract does not apply.
    check(rows, `${tag}.p6b.desktop.staticRailNoToggle`, !!exp && !exp.hasToggle);
  }
  check(rows, `${tag}.p6b.desktop.navIconsAll`, !!exp && exp.itemCount > 0 && exp.allIcons, `items=${exp && exp.itemCount}`);
  check(rows, `${tag}.p6b.desktop.openIconsVisible`, !!exp && exp.itemCount > 0 && exp.openVisible === exp.itemCount, `${exp && exp.openVisible}/${exp && exp.itemCount}`);
  check(rows, `${tag}.p6b.desktop.closedIconsHidden`, !!exp && exp.closedVisible === 0);
  check(rows, `${tag}.p6b.desktop.labelsVisible`, !!exp && exp.itemCount > 0 && exp.labelsVisible === exp.itemCount);
  check(rows, `${tag}.p6b.desktop.defaultDot`, !!exp && exp.itemCount > 0 && exp.defaultDots === exp.itemCount, `${exp && exp.defaultDots}/${exp && exp.itemCount}`);
  check(rows, `${tag}.p6b.desktop.border`, !!exp && exp.border === "1px");
  check(rows, `${tag}.p6b.desktop.borderFullHeight`, !!exp && exp.mainHeight > 0 && Math.abs(exp.railHeight - exp.mainHeight) <= 4, `rail=${exp && exp.railHeight} main=${exp && exp.mainHeight}`);
}


/** P6-3B — collapsed rail: derived width, closed icons, no stray labels. */
async function runP6bCollapsedChecks(rows, tag, cdp) {
  const collapsible = await cdp.evalBool(`!!document.querySelector('#shell-sidebar-desktop-rail .ui-sidebar-toggle')`);
  if (!collapsible) {
    check(rows, `${tag}.p6b.collapsed.notApplicable`, true, "non-collapsible aside (static rail)");
    return;
  }
  await cdp.clickCenter('#shell-sidebar-desktop-rail [aria-controls="shell-sidebar-desktop-panel"]');
  await sleep(350);
  const col = await cdp.evaluate(`(() => {
    const rail = document.querySelector('#shell-sidebar-desktop-rail');
    if (!rail) return null;
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none'; };
    const items = [...rail.querySelectorAll('ul > li')];
    const visibleIcon = rail.querySelector('.ui-nav-item-icon-closed') || rail.querySelector('.ui-nav-item-icon-open') || rail.querySelector('.ui-nav-item-icon');
    const ir = visibleIcon && getComputedStyle(visibleIcon).display !== 'none' ? visibleIcon.getBoundingClientRect() : null;
    return {
      dataCollapsed: rail.getAttribute('data-collapsed'),
      railWidth: Math.round(rail.getBoundingClientRect().width),
      iconW: ir ? Math.round(ir.width) : null,
      strayLabels: items.filter((li) => { const l = li.querySelector('.ui-nav-item-label'); if (!l) return false; const r = l.getBoundingClientRect(); return r.width > 2 && r.height > 2; }).length,
      labelsVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-label'))).length,
      closedVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-icon-closed'))).length,
      openVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-icon-open'))).length,
    };
  })()`);
  check(rows, `${tag}.p6b.collapsed.state`, !!col && col.dataCollapsed === "true");
  check(rows, `${tag}.p6b.collapsed.widthDerived`, !!col && col.iconW != null && col.railWidth >= Math.round(col.iconW * 1.15) && col.railWidth <= Math.round(col.iconW * 1.3), `rail=${col && col.railWidth} icon=${col && col.iconW}`);
  check(rows, `${tag}.p6b.collapsed.closedIconsVisible`, !!col && col.closedVisible > 0 && col.openVisible === 0);
  check(rows, `${tag}.p6b.collapsed.labelsHidden`, !!col && col.labelsVisible === 0);
  check(rows, `${tag}.p6b.collapsed.noStrayLabels`, !!col && col.strayLabels === 0, `stray=${col && col.strayLabels}`);
}

/** P6-3B — no width interval where the aside becomes a stacked top-of-content list. */
async function runP6bTabletSweep(rows, tag, cdp) {
  for (const width of [767, 800, 900, 1000, 1023, 1024]) {
    await cdp.setViewport(width, 820);
    await cdp.reload();
    await waitReady(cdp);
    const s = await cdp.evaluate(`(() => {
      const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width) } : null; };
      const rail = rect(document.querySelector('#shell-sidebar-desktop-rail')) || rect(document.querySelector('#shell-sidebar-tablet-rail'));
      const t = document.querySelector('#shell-sidebar-tablet-rail .ui-sidebar-toggle-icon');
      const tr = t ? t.getBoundingClientRect() : null;
      const tVisible = !!tr && tr.width > 2 && tr.height > 2;
      return { rail, main: rect(document.querySelector('#main')), vw: document.documentElement.clientWidth, tabletToggle: tVisible ? { w: Math.round(tr.width), h: Math.round(tr.height) } : null };
    })()`);
    if (!s.rail) {
      check(rows, `${tag}.p6b.sweep.${width}.noStackedRail`, true, "no aside rail visible (mobile composition)");
    } else {
      check(rows, `${tag}.p6b.sweep.${width}.railBesideContent`, s.main != null && s.rail.right <= s.main.left + 2 && s.rail.width < s.vw * 0.6, `railRight=${s.rail.right} mainLeft=${s.main && s.main.left} railW=${s.rail.width}`);
    }
    if (s.tabletToggle) check(rows, `${tag}.p6b.sweep.${width}.tabletToggleIcon32`, s.tabletToggle.w >= 32 && s.tabletToggle.h >= 32, `w=${s.tabletToggle.w} h=${s.tabletToggle.h}`);
  }
}

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
    // P5-6 — duplicate-destination acceptance (own servers, config restored below).
    if (!onlyPreset) {
      const dupRows = await runDuplicateNavScenario(chrome);
      allRows = allRows.concat(dupRows.map((r) => ({ preset: "dup-nav", ...r })));
      const dupFails = dupRows.filter((r) => !r.ok).length;
      console.log(`[matrix] dup-nav: ${dupRows.length - dupFails}/${dupRows.length} checks passed${dupFails ? ` FAIL=${dupFails}` : ""}`);
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



