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
  // P6-3C — ONE authoritative Book Now: the single instance lives in the shell's
  // TOP region (below the header, above <main>) and stays reachable at EVERY
  // width, including below `md`. There is no per-viewport placement any more, so
  // there is nothing to hide and nothing to duplicate.
  await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  const mob = await cdp.evaluate(`(() => {
    const cta = document.querySelector('.ui-shell-header-row .ui-shell-cta');
    const cr = cta ? cta.getBoundingClientRect() : null;
    const header = document.querySelector('.ui-site-header');
    const hr = header ? header.getBoundingClientRect() : null;
    const mr = document.querySelector('#main') ? document.querySelector('#main').getBoundingClientRect() : null;
    const reachable = [...document.querySelectorAll('.nav-item-cta')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return {
      ctaVisible: !!cr && cr.width > 0 && cr.height > 0,
      belowHeader: !!cr && !!hr && cr.top >= hr.bottom - 2,
      aboveMain: !!cr && !!mr && cr.bottom <= mr.top + 2,
      reachableCount: reachable.length,
      inAside: reachable.some((el) => !!el.closest('.ui-shell-sidebar')),
      inBottomBar: reachable.some((el) => !!el.closest('.ui-shell-bottom-bar')),
      inDisclosure: reachable.some((el) => !!el.closest('[role="dialog"]')),
    };
  })()`);
  check(rows, "mobile.cta.reachable", !!mob.ctaVisible);
  check(rows, "mobile.cta.single", mob.reachableCount === 1, `count=${mob.reachableCount}`);
  check(rows, "mobile.cta.belowHeader", !!mob.belowHeader);
  check(rows, "mobile.cta.aboveMain", !!mob.aboveMain);
  check(rows, "mobile.cta.notInAside", !mob.inAside);
  check(rows, "mobile.cta.notInBottomBar", !mob.inBottomBar);
  check(rows, "mobile.cta.notInDisclosure", !mob.inDisclosure);
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
      // P6-3C — the primary CTA is NOT inside the rail in either state; the ONE
      // instance lives in the shell's top region (below the header).
      ctaInAside: (() => { for (const sel of ['#shell-sidebar-desktop-rail', '#shell-sidebar-tablet-rail']) { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().width > 0) { const c = el.querySelector('.ui-shell-cta'); if (c && c.getBoundingClientRect().width > 0) return true; } } return false; })(),
      ctaInTopRegion: ${visible('.ui-shell-header-row .ui-shell-cta')},
      ctaReachableCount: [...document.querySelectorAll('.nav-item-cta')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length,
      currentInAside: (() => { for (const sel of ['#shell-sidebar-desktop-rail', '#shell-sidebar-tablet-rail']) { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().width > 0 && el.querySelector('a[aria-current="page"]')) return true; } return false; })(),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      bottomBar: ${visible('.ui-shell-bottom-bar')},
      // P5-4 — the sidebar band presents navigation as ONE vertical list, one
      // item per row (no two <li> share a horizontal line).
      itemsOnePerRow: (() => { const lis = [...document.querySelectorAll('.ui-shell-sidebar ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (lis.length === 0) return false; const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top)); return new Set(tops).size === tops.length; })(),
    }))()`);
    check(rows, `${vpName}.aside.present`, !!s.sidebar);
    check(rows, `${vpName}.aside.bandExclusive`, (s.desktopRail && !s.tabletRail) || (!s.desktopRail && s.tabletRail));
    check(rows, `${vpName}.aside.cta.outsideSidebar`, !!s.sidebar && !s.ctaInAside, `inAside=${s.ctaInAside}`);
    check(rows, `${vpName}.aside.cta.reachableInTop`, !!s.ctaInTopRegion);
    check(rows, `${vpName}.aside.cta.single`, s.ctaReachableCount === 1, `count=${s.ctaReachableCount}`);
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
        const link = panel ? panel.querySelector('a[aria-current="page"], a[href*="/en"]') : null;
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
          // P6-3A — nav stays reachable when collapsed; P6-3C — the CTA is NOT
          // part of the rail (it lives in the top region), so its presence here
          // must be false and its reachability is asserted separately.
          ctaReachable: !!cta && cta.getBoundingClientRect().width > 0,
          navReachable: !!link && link.getBoundingClientRect().width > 0,
        };
      })()`);
      check(rows, `${vpName}.aside.collapse.persistent`, !collapsed.panelHiddenClass && collapsed.panelVisible);
      check(rows, `${vpName}.aside.collapse.dataState`, collapsed.dataCollapsed === "true");
      check(rows, `${vpName}.aside.collapse.narrower`, collapsed.railWidth != null && init.railWidth != null && collapsed.railWidth < init.railWidth, `collapsed=${collapsed.railWidth} expanded=${init.railWidth}`);
      check(rows, `${vpName}.aside.collapse.toggleRemains`, collapsed.togglePresent);
      check(rows, `${vpName}.aside.collapse.expandedFalse`, collapsed.toggleExpanded === "false");
      check(rows, `${vpName}.aside.collapse.navReachable`, collapsed.navReachable);
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
        const topCta = document.querySelector('.ui-shell-header-row .ui-shell-cta');
        const tr2 = topCta ? topCta.getBoundingClientRect() : null;
        return { railWidth: rr ? Math.round(rr.width) : null, dataCollapsed: rail ? rail.getAttribute('data-collapsed') : null, panelVisible: !!pr && pr.width > 0, toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null, toggleText: toggle ? toggle.textContent.trim() : null, linkReachable: !!link && link.getBoundingClientRect().width > 0, ctaReachable: !!cta && cta.getBoundingClientRect().width > 0, ctaInTop: !!tr2 && tr2.width > 0 };
      })()`);
      check(rows, `${vpName}.aside.expand.restores`, restored.panelVisible && restored.railWidth != null && init.railWidth != null && restored.railWidth >= init.railWidth - 2, `restored=${restored.railWidth} expanded=${init.railWidth}`);
      check(rows, `${vpName}.aside.expand.expandedTrue`, restored.toggleExpanded === "true" && restored.dataCollapsed === "false");
      check(rows, `${vpName}.aside.expand.navReachable`, restored.linkReachable);
      // P6-1 — re-expanded rail returns to "Hide Sidebar".
      check(rows, `${vpName}.aside.expand.labelHide`, restored.toggleText === "Hide Sidebar");
      // P6-3C — the CTA is reachable in the TOP region (never in the rail).
      check(rows, `${vpName}.aside.expand.ctaReachableInTop`, restored.ctaInTop);
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
      ctaReachableInPanel: !!cta && cta.getBoundingClientRect().width > 0,
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
  // P6-3C — the disclosure carries NAVIGATION only: the ONE Book Now lives in the
  // shell's top region (still visible while the disclosure is open), so it must
  // never appear inside the dialog. `open.cta.single` still proves there is
  // exactly one reachable action in total.
  check(rows, "open.cta.notInPanel", !!o && !o.ctaInPanel);
  check(rows, "open.cta.notReachableInPanel", !!o && !o.ctaReachableInPanel);
  check(rows, "open.cta.notProminentInPanel", !!o && !o.prominentInPanel);
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
    // P6-3C — the ONE CTA lives in the top region, above the bar.
    topCta: ${visible('.ui-shell-header-row .ui-shell-cta')},
    reachableCtas: [...document.querySelectorAll('.nav-item-cta')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length,
    moreTrigger: !!document.querySelector('#shell-bottom-more'),
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  }))()`);
  check(rows, "bar.visible", !!s.barVisible);
  check(rows, "bar.ariaCurrent", !!s.barNavCurrent);
  check(rows, "bar.nav.liSharedMarker", !!s.barLiShared);
  check(rows, "bar.footer.badgeShared", !!s.footerBadgeShared);
  check(rows, "bar.cta.notInBar", !s.barCta);
  check(rows, "bar.cta.reachableInTop", !!s.topCta);
  check(rows, "bar.cta.single", s.reachableCtas === 1, `count=${s.reachableCtas}`);
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
    // P6-3C — banner scaling (three cases) + Book Now placement at every width.
    await runP6cChecks(rows, preset.name, cdp);
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
    const ics = bimg ? getComputedStyle(bimg) : null;
    // P6-3C — the cap the framework derived from the graphic's own size.
    const capPx = bimg && ics && ics.maxWidth.endsWith('px') ? parseFloat(ics.maxWidth) : null;
    const bimgTop = ir ? ir.top : null;
    const header = document.querySelector('.ui-site-header');
    const main = document.querySelector('#main');
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
      imgLeft: ir ? Math.round(ir.left) : null,
      imgRight: ir ? Math.round(ir.right) : null,
      capPx: capPx,
      bannerAboveHeader: !!ir && !!header && ir.bottom <= header.getBoundingClientRect().top + 2,
      bannerAboveMain: !!ir && !!main && ir.bottom <= main.getBoundingClientRect().top + 2,
      viewportWidth: document.documentElement.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      backgroundLayers: document.querySelectorAll(".ui-page-background").length,
      footerGraphicLayers: document.querySelectorAll(".ui-footer-graphic").length,
      footerBox: (() => { const f = document.querySelector("footer"); if (!f) return null; const r = f.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; })(),
      footerLinkCount: document.querySelectorAll("footer a").length,
      footerPosition: (() => { const f = document.querySelector("footer"); return f ? getComputedStyle(f).position : null; })(),
      footerGraphicRule: (() => {
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of rules) {
            if (rule.selectorText === ".ui-footer-graphic" && rule.style) {
              return { position: rule.style.position, zIndex: rule.style.zIndex, pointerEvents: rule.style.pointerEvents };
            }
          }
        }
        return null;
      })(),
      // P12-HG — the decorative header band is the header's OWN background, so
      // it contributes NO element: presence is observed through the marker
      // attribute + the computed background, and the band's contract through
      // the shipped .ui-site-header[data-ui-header-graphic] rule.
      // (No backticks in this comment: it lives inside a template literal.)
      headerBox: header ? (() => { const r = header.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; })() : null,
      headerGraphicLayers: document.querySelectorAll("[data-ui-header-graphic]").length,
      headerGraphicAttribute: header ? header.getAttribute("data-ui-header-graphic") : null,
      headerBackgroundImage: header ? getComputedStyle(header).backgroundImage : null,
      headerRule: (() => {
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of rules) {
            if (rule.selectorText === ".ui-site-header[data-ui-header-graphic]" && rule.style) {
              return {
                backgroundImage: rule.style.backgroundImage,
                backgroundRepeat: rule.style.backgroundRepeat,
                backgroundPosition: rule.style.backgroundPosition,
                backgroundSize: rule.style.backgroundSize,
              };
            }
          }
        }
        return null;
      })(),
      headerPosition: header ? getComputedStyle(header).position : null,
      headerIsolation: header ? getComputedStyle(header).isolation : null,
      headerZIndex: header ? getComputedStyle(header).zIndex : null,
      // The header's own interactive controls stay present and visible in every
      // composition. NOTE: the single nav landmark lives in the shell SIDEBAR
      // for aside compositions (adaptive/workspace/immersive) and only in the
      // header for top-bar compositions, so this must NOT assert a header nav.
      headerControlsVisible: !!header && [...header.querySelectorAll("a, button")].some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
      headerTriggerPresent: !!document.querySelector(".ui-shell-mobile-nav-trigger"),
      noBroken: [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    };
  })()`);
  check(rows, `${tag}.favicon.single`, s.iconCount === 1, `count=${s.iconCount}`);
  check(rows, `${tag}.favicon.href`, typeof s.iconHref === "string" && s.iconHref.endsWith("/assets/favicon.svg"), `href=${s.iconHref}`);
  check(rows, `${tag}.header.logo`, !!s.logoPresent && !!s.logoLoaded && typeof s.logoSrc === "string" && s.logoSrc.endsWith("/assets/logo-header.svg"), `src=${s.logoSrc}`);
  check(rows, `${tag}.header.logo.alt`, typeof s.logoAlt === "string" && s.logoAlt.length > 0, `alt=${s.logoAlt}`);
  check(rows, `${tag}.header.logo.aspect`, !!s.logoBoxOk);
  check(rows, `${tag}.banner.home.present`, !!s.bannerPresent && !!s.bannerImgLoaded && typeof s.bannerImgSrc === "string" && s.bannerImgSrc.endsWith("/assets/banner-home.png"), `src=${s.bannerImgSrc}`);
  check(rows, `${tag}.banner.noPadding`, s.bannerPad === "0px/0px/0px/0px", `pad=${s.bannerPad}`);
  check(rows, `${tag}.banner.noMargin`, s.bannerMargin === "0px/0px/0px/0px", `margin=${s.bannerMargin}`);
  check(rows, `${tag}.banner.noBorder`, s.bannerBorder === "0px" && s.bannerRadius === "0px", `border=${s.bannerBorder} radius=${s.bannerRadius}`);
  // P6-3C — the banner scales to `min(available page width, 1.5 × natural
  // width)`, is ALWAYS horizontally centered, and can never overflow.
  const cap = Math.round(s.imgNatW * 1.5);
  check(
    rows,
    `${tag}.banner.widthIsAvailableOrCap`,
    s.imgWidth != null && Math.abs(s.imgWidth - Math.min(s.viewportWidth, cap)) <= 2,
    `w=${s.imgWidth} vw=${s.viewportWidth} cap=${cap}`,
  );
  check(
    rows,
    `${tag}.banner.centered`,
    s.imgLeft != null && s.imgWidth != null && Math.abs(s.imgLeft - (s.viewportWidth - s.imgWidth) / 2) <= 2,
    `left=${s.imgLeft} right=${s.imgRight} vw=${s.viewportWidth} w=${s.imgWidth}`,
  );
  check(rows, `${tag}.banner.noHorizontalOverflow`, s.imgLeft >= -1 && s.imgRight <= s.viewportWidth + 1 && s.docScrollWidth <= s.viewportWidth + 1, `left=${s.imgLeft} right=${s.imgRight} scrollW=${s.docScrollWidth} vw=${s.viewportWidth}`);
  // P12-BG — the decorative background-graphic layer is CONFIGURED-ONLY: the
  // shipped canonical deployment configures NO `site.assets.backgrounds` entry,
  // so no layer is emitted at all (no placeholder art, no mandatory global
  // graphic) and the page gains no extra DOM. Content therefore stays exactly
  // where it was, and the layer can never introduce horizontal overflow.
  check(rows, `${tag}.background.absentWhenUnconfigured`, s.backgroundLayers === 0, `layers=${s.backgroundLayers}`);
  check(rows, `${tag}.background.noHorizontalOverflow`, s.docScrollWidth <= s.viewportWidth + 1, `scrollW=${s.docScrollWidth} vw=${s.viewportWidth}`);
  // P12-FG — the decorative FOOTER graphic role is CONFIGURED-ONLY too: the
  // shipped canonical deployment configures no `site.assets.footerGraphic`, so
  // no layer is emitted (no placeholder art, no mandatory graphic) and the
  // footer gains no DOM. The footer's own layout, links and geometry are
  // therefore unchanged, and no horizontal overflow can be introduced.
  check(rows, `${tag}.footerGraphic.absentWhenUnconfigured`, s.footerGraphicLayers === 0, `layers=${s.footerGraphicLayers}`);
  check(rows, `${tag}.footerGraphic.noHorizontalOverflow`, s.docScrollWidth <= s.viewportWidth + 1, `scrollW=${s.docScrollWidth} vw=${s.viewportWidth}`);
  check(rows, `${tag}.footer.linksPresent`, s.footerLinkCount > 0, `links=${s.footerLinkCount}`);
  check(rows, `${tag}.footer.geometryIntact`, !!s.footerBox && s.footerBox.h > 0, s.footerBox ? `h=${s.footerBox.h}` : "no footer");
  // The layer's CONTRACT is declared in the shipped stylesheet even though no
  // artwork is configured: absolutely positioned inside a `relative` footer,
  // painted behind content (`z-index: -1`), and inert (`pointer-events: none`).
  check(
    rows,
    `${tag}.footerGraphic.contractDeclared`,
    !!s.footerGraphicRule &&
      s.footerGraphicRule.position === "absolute" &&
      s.footerGraphicRule.zIndex === "-1" &&
      s.footerGraphicRule.pointerEvents === "none",
    s.footerGraphicRule ? `pos=${s.footerGraphicRule.position} z=${s.footerGraphicRule.zIndex} pe=${s.footerGraphicRule.pointerEvents}` : "rule missing",
  );
  check(
    rows,
    `${tag}.footerGraphic.footerIsAnchor`,
    s.footerPosition === "relative",
    `footerPos=${s.footerPosition}`,
  );
  // P12-HG — the decorative HEADER band role is CONFIGURED-ONLY too: the
  // shipped canonical deployment configures no `site.assets.headerGraphic`, so
  // the header paints no band and gains no attribute, no inline style and no
  // extra DOM — its computed background stays `none`. The header's own
  // geometry, logo, navigation and mobile trigger are therefore unchanged.
  check(rows, `${tag}.headerGraphic.absentWhenUnconfigured`, s.headerGraphicLayers === 0 && s.headerGraphicAttribute === null, `layers=${s.headerGraphicLayers} attr=${s.headerGraphicAttribute}`);
  check(rows, `${tag}.headerGraphic.backgroundNoneWhenUnconfigured`, s.headerBackgroundImage === "none", `bg=${s.headerBackgroundImage}`);
  check(rows, `${tag}.headerGraphic.noHorizontalOverflow`, s.docScrollWidth <= s.viewportWidth + 1, `scrollW=${s.docScrollWidth} vw=${s.viewportWidth}`);
  // The band's CONTRACT is declared in the shipped stylesheet even though no
  // artwork is configured: ONE asset, edge-to-edge, centred, no tiling.
  check(
    rows,
    `${tag}.headerGraphic.contractDeclared`,
    !!s.headerRule &&
      s.headerRule.backgroundImage.includes("--ui-header-graphic") &&
      s.headerRule.backgroundRepeat === "no-repeat" &&
      s.headerRule.backgroundPosition === "center center" &&
      s.headerRule.backgroundSize === "cover",
    s.headerRule ? `img=${s.headerRule.backgroundImage} rep=${s.headerRule.backgroundRepeat} pos=${s.headerRule.backgroundPosition} size=${s.headerRule.backgroundSize}` : "rule missing",
  );
  // The band adds NO stacking context and NO positioning to the header — which
  // is exactly what keeps the shell's `position: fixed` drawer/overlay panels
  // (z-index 40/50), which live inside the header, where they were.
  check(
    rows,
    `${tag}.headerGraphic.headerNotStackingContext`,
    s.headerIsolation === "auto" && s.headerZIndex === "auto" && s.headerPosition === "static",
    `isolation=${s.headerIsolation} z=${s.headerZIndex} pos=${s.headerPosition}`,
  );
  // The header itself (its own base/background, geometry, identity, navigation
  // and mobile trigger) is unchanged by the capability.
  check(rows, `${tag}.header.geometryIntact`, !!s.headerBox && s.headerBox.h > 0, s.headerBox ? `h=${s.headerBox.h}` : "no header");
  check(rows, `${tag}.header.logoVisible`, !!s.logoPresent && !!s.logoLoaded && !!s.logoBoxOk);
  check(rows, `${tag}.header.controlsVisible`, !!s.headerControlsVisible);
  check(rows, `${tag}.header.triggerPresent`, !!s.headerTriggerPresent);
  check(rows, `${tag}.banner.capApplied`, s.capPx != null && Math.abs(s.capPx - cap) <= 1, `cap=${s.capPx} expected=${cap}`);
  check(rows, `${tag}.banner.aboveHeader`, !!s.bannerAboveHeader);
  check(rows, `${tag}.banner.aboveMain`, !!s.bannerAboveMain);
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
  //
  // The no-banner route must be chosen so its RESOLVED KEY matches no configured
  // banner role. `about` is deliberately NOT used any more: the approved
  // Foundation banner pack wires all ten canonical roles, so `/en/about` now
  // legitimately renders the approved `about` banner (header top moves off 0).
  //
  // `/en/zzz-deep` resolves to key `zzz-deep`, which is configured nowhere, and
  // renders through the `[locale]` not-found boundary — still inside the shell,
  // so the header is present and must sit at the top of the page. This is
  // exactly the "no artwork for this route ⇒ nothing at all" contract: no
  // container, no reserved gap, and never another page's banner.
  await cdp.navigate(`${BASE_URL}/en/zzz-deep`);
  await waitReady(cdp);
  const nb = await cdp.evaluate(`(() => {
    const banner = document.querySelector('.ui-page-banner');
    const header = document.querySelector('.ui-site-header');
    const hr = header ? header.getBoundingClientRect() : null;
    // P12-SG — the decorative STATUS graphic role is CONFIGURED-ONLY, and the
    // canonical deployment configures no site.assets.statusGraphic, so this
    // not-found surface must render NO decorative box while its status copy and
    // return-home control stay complete and operable.
    // (No backticks in this comment: it lives inside a template literal.)
    const section = document.querySelector('#main section') || document.querySelector('#main article');
    const heading = document.querySelector('#main h1');
    const graphic = document.querySelector('.ui-status-graphic');
    const graphicImg = document.querySelector('.ui-status-graphic-image');
    const homeLink = section
      ? [...section.querySelectorAll('a')].find((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      : undefined;
    const graphicRule = (() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const rule of rules) {
          if (rule.selectorText === '.ui-status-graphic' && rule.style) {
            return {
              display: rule.style.display,
              justifyContent: rule.style.justifyContent,
              pointerEvents: rule.style.pointerEvents,
              position: rule.style.position,
            };
          }
        }
      }
      return null;
    })();
    const sr = section ? section.getBoundingClientRect() : null;
    return {
      banner: !!banner,
      headerTop: hr ? Math.round(hr.top) : null,
      statusGraphicLayers: document.querySelectorAll('.ui-status-graphic').length,
      statusGraphicImages: document.querySelectorAll('.ui-status-graphic-image').length,
      statusGraphicRule: graphicRule,
      statusGraphicAboveHeading: graphic && heading
        ? graphic.getBoundingClientRect().bottom <= heading.getBoundingClientRect().top + 1
        : null,
      statusGraphicImgComplete: graphicImg ? !!graphicImg.complete : null,
      statusSectionPresent: !!section,
      statusSectionHeight: sr ? Math.round(sr.height) : null,
      statusHeadingText: heading ? heading.textContent.trim() : null,
      statusHomeLinkText: homeLink ? homeLink.textContent.trim() : null,
      statusHomeLinkHref: homeLink ? homeLink.getAttribute('href') : null,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  })()`);
  check(rows, `${tag}.banner.absentOnNoBannerPage`, nb.banner === false);
  check(rows, `${tag}.banner.noReservedGap`, nb.headerTop != null && nb.headerTop <= 40, `headerTop=${nb.headerTop}`);
  // P12-SG — the shared decorative STATUS graphic on the canonical UNCONFIGURED
  // not-found surface: no layer, no image, no reserved box, and the status copy
  // plus its return-home control stay complete and operable. (The `[locale]`
  // error boundary cannot be reached in a canonical static browser run without
  // deliberately fabricating a render failure, which this matrix must never do;
  // the error surface's identical frame, semantics and controls are asserted by
  // `tests/unit/p12-sg-status-graphic.test.ts`, and both surfaces share the ONE
  // provider resolved in the `[locale]` layout that this route exercises.)
  check(rows, `${tag}.statusGraphic.absentWhenUnconfigured`, nb.statusGraphicLayers === 0 && nb.statusGraphicImages === 0, `layers=${nb.statusGraphicLayers} imgs=${nb.statusGraphicImages}`);
  check(
    rows,
    `${tag}.statusGraphic.contractDeclared`,
    !!nb.statusGraphicRule &&
      nb.statusGraphicRule.display === "flex" &&
      nb.statusGraphicRule.justifyContent === "center" &&
      nb.statusGraphicRule.pointerEvents === "none" &&
      nb.statusGraphicRule.position === "",
    nb.statusGraphicRule
      ? `display=${nb.statusGraphicRule.display} justify=${nb.statusGraphicRule.justifyContent} pe=${nb.statusGraphicRule.pointerEvents} pos=${nb.statusGraphicRule.position || "(none)"}`
      : "rule missing",
  );
  check(rows, `${tag}.statusGraphic.noHorizontalOverflow`, nb.docScrollWidth <= nb.viewportWidth + 1, `scrollW=${nb.docScrollWidth} vw=${nb.viewportWidth}`);
  // The status meaning stays entirely in HTML/text: the section renders, the
  // heading is present, and the return-home control is visible and linked.
  check(
    rows,
    `${tag}.statusGraphic.statusSemanticsIntact`,
    nb.statusSectionPresent &&
      nb.statusSectionHeight > 0 &&
      typeof nb.statusHeadingText === "string" &&
      nb.statusHeadingText.length > 0 &&
      typeof nb.statusHomeLinkText === "string" &&
      nb.statusHomeLinkText.length > 0 &&
      typeof nb.statusHomeLinkHref === "string" &&
      nb.statusHomeLinkHref.startsWith("/"),
    `h=${nb.statusSectionHeight} heading=${nb.statusHeadingText} link=${nb.statusHomeLinkHref}`,
  );
  // No decorative box exists at all when unconfigured — so nothing can sit above
  // the status heading and the frame's geometry is exactly the pre-P12-SG one.
  check(rows, `${tag}.statusGraphic.noGraphicAboveHeading`, nb.statusGraphicAboveHeading === null, `above=${nb.statusGraphicAboveHeading}`);
  check(rows, `${tag}.statusGraphic.noBrokenStatusImage`, nb.statusGraphicImgComplete === null, `complete=${nb.statusGraphicImgComplete}`);
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
  // P6-3C — sidebar NAVIGATION icons are 32×32 at the desktop breakpoint.
  check(rows, `${tag}.p6b.desktop.navIcon32`, !!exp && exp.navIconW === 32, `navIconW=${exp && exp.navIconW}`);
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
    // P6-3C — the collapsed WIDTH derives from the CONTROL (toggle) icon; the
    // navigation-item icons inside it are sized independently (32/16px).
    const toggleIcon = rail.querySelector('.ui-sidebar-toggle-icon');
    const tir = toggleIcon && getComputedStyle(toggleIcon).display !== 'none' ? toggleIcon.getBoundingClientRect() : null;
    return {
      dataCollapsed: rail.getAttribute('data-collapsed'),
      railWidth: Math.round(rail.getBoundingClientRect().width),
      iconW: ir ? Math.round(ir.width) : null,
      toggleIconW: tir ? Math.round(tir.width) : null,
      strayLabels: items.filter((li) => { const l = li.querySelector('.ui-nav-item-label'); if (!l) return false; const r = l.getBoundingClientRect(); return r.width > 2 && r.height > 2; }).length,
      labelsVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-label'))).length,
      closedVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-icon-closed'))).length,
      openVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-icon-open'))).length,
    };
  })()`);
  check(rows, `${tag}.p6b.collapsed.state`, !!col && col.dataCollapsed === "true");
  check(rows, `${tag}.p6b.collapsed.widthDerived`, !!col && col.toggleIconW != null && col.railWidth >= Math.round(col.toggleIconW * 1.15) && col.railWidth <= Math.round(col.toggleIconW * 1.3), `rail=${col && col.railWidth} toggleIcon=${col && col.toggleIconW}`);
  // P6-3C — the collapsed rail's navigation icons are the 32px desktop size and
  // remain fully inside the rail (never clipped by the derived width).
  check(rows, `${tag}.p6c.collapsed.navIcon32`, !!col && col.iconW === 32, `navIcon=${col && col.iconW}`);
  check(rows, `${tag}.p6c.collapsed.navIconFits`, !!col && col.iconW != null && col.railWidth > col.iconW, `rail=${col && col.railWidth} icon=${col && col.iconW}`);
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
      // P6-3C — measure the rail band that is actually VISIBLE at this width:
      // both bands exist in the DOM, but the non-matching one is display:none
      // (so a naive first-match query would measure a hidden 0×0 element).
      const railEl = [document.querySelector('#shell-sidebar-desktop-rail'), document.querySelector('#shell-sidebar-tablet-rail')]
        .find((el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || null;
      const t = railEl ? railEl.querySelector('.ui-sidebar-toggle-icon') : null;
      const tr = t ? t.getBoundingClientRect() : null;
      const tVisible = !!tr && tr.width > 2 && tr.height > 2;
      // The sidebar is COLLAPSED by default in the tablet band, so the visible
      // navigation icon is the CLOSED (plus) one — pick whichever icon element
      // is actually rendered rather than assuming the open-state sibling.
      const navIcons = railEl ? [...railEl.querySelectorAll('.ui-nav-item-icon-closed, .ui-nav-item-icon-open, .ui-nav-item-icon')] : [];
      const navIcon = navIcons.find((el) => {
        if (getComputedStyle(el).display === 'none') return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      }) || null;
      const nr = navIcon ? navIcon.getBoundingClientRect() : null;
      return {
        rail,
        main: rect(document.querySelector('#main')),
        vw: document.documentElement.clientWidth,
        tabletToggle: tVisible ? { w: Math.round(tr.width), h: Math.round(tr.height) } : null,
        toggleIcon: tVisible ? { w: Math.round(tr.width), h: Math.round(tr.height) } : null,
        navIcon: nr && nr.width > 2 ? { w: Math.round(nr.width), h: Math.round(nr.height) } : null,
      };
    })()`);
    if (!s.rail) {
      check(rows, `${tag}.p6b.sweep.${width}.noStackedRail`, true, "no aside rail visible (mobile composition)");
    } else {
      check(rows, `${tag}.p6b.sweep.${width}.railBesideContent`, s.main != null && s.rail.right <= s.main.left + 2 && s.rail.width < s.vw * 0.6, `railRight=${s.rail.right} mainLeft=${s.main && s.main.left} railW=${s.rail.width}`);
    }
    // The CONTROL (toggle) icon keeps its approved sizes — 32px below `lg`
    // (tablet band) and 64px at `lg` — independently of the smaller
    // navigation-item icons (P6-3C token split).
    if (s.toggleIcon) {
      const expectedToggle = width < 1024 ? 32 : 64;
      check(rows, `${tag}.p6b.sweep.${width}.controlIcon${expectedToggle}`, s.toggleIcon.w === expectedToggle && s.toggleIcon.h === expectedToggle, `w=${s.toggleIcon.w} h=${s.toggleIcon.h}`);
    }
    // P6-3C — below `lg` the sidebar NAVIGATION icons are 16×16 (the sweep
    // covers just-below / at / just-above the tablet range).
    if (s.navIcon && width < 1024) {
      check(rows, `${tag}.p6c.sweep.${width}.navIcon16`, s.navIcon.w === 16 && s.navIcon.h === 16, `w=${s.navIcon.w} h=${s.navIcon.h}`);
    }
  }
}
/**
 * P6-3C — banner scaling across the three contract cases + the Book Now
 * placement contract. Uses the REAL shipped banner graphic: its natural width
 * defines the cases (narrower than natural → downscale; between natural and
 * 1.5× → fill; wider than 1.5× → stop at 1.5×).
 */
async function runP6cChecks(rows, tag, cdp) {
  await cdp.navigate(`${BASE_URL}/en`);
  await waitReady(cdp);
  const natW = await cdp.evaluate(`(() => { const i = document.querySelector('.ui-page-banner-image'); return i ? i.naturalWidth : 0; })()`);
  for (const width of [220, 300, 390, 700, 800, 1024, 1280]) {
    await cdp.setViewport(width, 844);
    await cdp.reload();
    await waitReady(cdp);
    const s = await cdp.evaluate(`(() => {
      const img = document.querySelector('.ui-page-banner-image');
      if (!img) return null;
      const ir = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      const cta = document.querySelector('.ui-shell-header-row .ui-shell-cta');
      const cr = cta ? cta.getBoundingClientRect() : null;
      const header = document.querySelector('.ui-site-header');
      const hr = header ? header.getBoundingClientRect() : null;
      const mr = document.querySelector('#main') ? document.querySelector('#main').getBoundingClientRect() : null;
      const reachable = [...document.querySelectorAll('.nav-item-cta')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      return {
        vw: document.documentElement.clientWidth,
        scrollW: document.documentElement.scrollWidth,
        w: Math.round(ir.width), h: Math.round(ir.height),
        left: Math.round(ir.left), right: Math.round(ir.right),
        natW: img.naturalWidth, natH: img.naturalHeight,
        cap: cs.maxWidth.endsWith('px') ? parseFloat(cs.maxWidth) : null,
        ctaCount: reachable.length,
        ctaVisible: !!cr && cr.width > 0 && cr.height > 0,
        ctaBelowHeader: !!cr && !!hr && cr.top >= hr.bottom - 2,
        ctaAboveMain: !!cr && !!mr && cr.bottom <= mr.top + 2,
        ctaInAside: reachable.some((el) => !!el.closest('.ui-shell-sidebar')),
        ctaInBar: reachable.some((el) => !!el.closest('.ui-shell-bottom-bar')),
        ctaInDialog: reachable.some((el) => !!el.closest('[role="dialog"]')),
      };
    })()`);
    if (!s) {
      check(rows, `${tag}.p6c.w${width}.banner.present`, false, "no banner image rendered");
      continue;
    }
    const cap = Math.round(s.natW * 1.5);
    const expected = Math.min(s.vw, cap);
    check(rows, `${tag}.p6c.w${width}.banner.present`, s.natW === natW && natW > 0, `natW=${s.natW}`);
    check(rows, `${tag}.p6c.w${width}.banner.width`, Math.abs(s.w - expected) <= 2, `w=${s.w} expected=${expected} vw=${s.vw} natW=${s.natW}`);
    check(rows, `${tag}.p6c.w${width}.banner.centered`, Math.abs(s.left - (s.vw - s.w) / 2) <= 2, `left=${s.left} right=${s.right} vw=${s.vw} w=${s.w}`);
    check(rows, `${tag}.p6c.w${width}.banner.noOverflow`, s.left >= -1 && s.right <= s.vw + 1, `left=${s.left} right=${s.right} vw=${s.vw}`);
    // The banner must not push the PAGE into horizontal overflow either (only
    // asserted at supported widths — 220px is deliberately below the mobile
    // minimum, used purely to exercise the downscale case).
    if (width >= 390) {
      check(rows, `${tag}.p6c.w${width}.banner.noPageOverflow`, s.scrollW <= s.vw + 1, `scrollW=${s.scrollW} vw=${s.vw}`);
    }
    // The rendered graphic must hold its natural aspect ratio (never stretched
    // or cropped). Asserted in PIXEL space against the height implied by the
    // rendered width, with a scale-aware tolerance: a 1px floor for the two
    // integer-rounded rect measurements, tightening to 1% relative once the
    // graphic is tall enough for that to exceed 1px.
    //
    // Why not a bare ratio comparison: the shipped approved banner is ~8:1, so
    // at the two deliberately-sub-minimum widths (220/300) its rendered height
    // is only ~26-36px, where 0.5px of rounding moves a ratio comparison by far
    // more than the old 0.03 tolerance. This formulation is STRICTER than that
    // tolerance at every real viewport (1% vs 3%) and equivalent at the narrow
    // probe widths.
    const expectedH = (s.w * s.natH) / s.natW;
    const ratioTolerance = Math.max(1, 0.01 * expectedH);
    check(
      rows,
      `${tag}.p6c.w${width}.banner.ratio`,
      s.natH > 0 && s.natW > 0 && s.w > 0 && s.h > 0 && Math.abs(s.h - expectedH) <= ratioTolerance,
      `rendered=${s.w}x${s.h} expectedH=${expectedH.toFixed(2)} tol=${ratioTolerance.toFixed(2)} natural=${s.natW}x${s.natH}`,
    );
    check(rows, `${tag}.p6c.w${width}.banner.cap`, s.cap != null && Math.abs(s.cap - cap) <= 1, `cap=${s.cap} expected=${cap}`);
    // Book Now — ONE action, in the top region, outside every navigation layer.
    check(rows, `${tag}.p6c.w${width}.cta.single`, s.ctaCount === 1, `count=${s.ctaCount}`);
    check(rows, `${tag}.p6c.w${width}.cta.visible`, !!s.ctaVisible);
    check(rows, `${tag}.p6c.w${width}.cta.topRegion`, !!s.ctaBelowHeader && !!s.ctaAboveMain, `belowHeader=${s.ctaBelowHeader} aboveMain=${s.ctaAboveMain}`);
    check(rows, `${tag}.p6c.w${width}.cta.outsideNavigation`, !s.ctaInAside && !s.ctaInBar && !s.ctaInDialog, `aside=${s.ctaInAside} bar=${s.ctaInBar} dialog=${s.ctaInDialog}`);
  }
}



/**
 * CONNECTIVITY ICON SEAM — browser-real acceptance (footer Connect column +
 * Connect page) on ONE dedicated dev server with a fixture config.
 *
 * The canonical deployment configures NO social accounts and NO connectivity
 * icons, so canonical text-only behavior is asserted by the five preset passes
 * (footer links/geometry/`noBrokenImages`); THIS pass proves the OPTIONAL icon
 * contract itself, using an EXISTING generic shipped asset (`sidebar-open.svg`).
 * No platform mark artwork is created, downloaded or installed anywhere here.
 *
 * Proven: a configured + AVAILABLE icon renders as supplementary artwork
 * (1em/16px, `object-fit: contain`, decorative, not focusable, before the label);
 * an item with NO icon AND an item whose configured icon FILE IS MISSING both
 * render as complete text links — no `<img>`, no broken image, no lost method,
 * no build/error (a missing connectivity asset is deliberately tolerated, unlike
 * the loud control/nav icon leaves); the visible label stays the accessible name;
 * no horizontal overflow at desktop or mobile; every configured method survives.
 */
async function runConnectivityIconScenario(chrome) {
  const ICON = "sidebar-open.svg"; // an existing generic asset — never platform artwork
  const MISSING = "missing-connectivity-icon-fixture.svg"; // deliberately absent
  const original = await readFile(CONFIG_PATH, "utf8");
  const rows = [];
  const port = BASE_PORT + 150;
  const url = `http://localhost:${port}/en`;
  BASE_URL = `http://localhost:${port}`;
  const config = JSON.parse(original);
  config.ui = { preset: "classic" };
  config.socialLinks = [
    { platform: "fixture-with-icon", label: "Icon Platform", href: "https://example.com/icon", icon: ICON },
    { platform: "fixture-missing-icon", label: "Missing Artwork Platform", href: "https://example.com/missing", icon: MISSING },
    { platform: "fixture-text-only", label: "Text Only Platform", href: "https://example.com/text" },
  ];
  // Method [0] gets a real asset, [1] a configured-but-missing one; the rest stay
  // exactly as configured (text-only) — every method must keep working.
  config.connect.methods = config.connect.methods.map((method, index) =>
    index === 0 ? { ...method, icon: ICON } : index === 1 ? { ...method, icon: MISSING } : method,
  );
  const expectedMethods = config.connect.methods.length;
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  const server = startDevServer(port);
  let cdp = null;
  try {
    // A configured-but-missing connectivity icon must NOT stop the server: the
    // dev server becoming ready at all is part of the assertion below.
    await waitForServer(url);
    cdp = await Cdp.connect(chrome);
    check(rows, "fixture.missingIcon.doesNotBreakDeployment", true, "dev server ready with a configured-but-absent connectivity icon");


    for (const [vpName, vp] of [["desktop", VIEWPORTS.desktop], ["mobile", VIEWPORTS.mobile]]) {
      await cdp.setViewport(vp.width, vp.height);
      await cdp.navigate(url);
      await waitReady(cdp);
      const f = await cdp.evaluate(`(() => {
        const footer = document.querySelector('footer');
        if (!footer) return null;
        const items = [...footer.querySelectorAll('li')].map((li) => {
          const a = li.querySelector('a');
          const img = li.querySelector('img');
          const r = img ? img.getBoundingClientRect() : null;
          const cs = img ? getComputedStyle(img) : null;
          const label = li.querySelector('.ui-nav-item-label');
          const lr = label ? label.getBoundingClientRect() : null;
          return {
            text: a ? a.textContent.trim() : '',
            href: a ? a.getAttribute('href') : null,
            ariaLabel: a ? a.getAttribute('aria-label') : null,
            hasImg: !!img,
            imgSrc: img ? img.getAttribute('src') : null,
            loaded: img ? (img.complete && img.naturalWidth > 0) : null,
            alt: img ? img.getAttribute('alt') : null,
            hidden: img ? img.getAttribute('aria-hidden') : null,
            tabindex: img ? img.getAttribute('tabindex') : null,
            iconW: r ? Math.round(r.width) : null,
            iconH: r ? Math.round(r.height) : null,
            objectFit: cs ? cs.objectFit : null,
            iconBeforeLabel: !!(r && lr) && r.left <= lr.left + 1,
          };
        });
        return {
          items,
          vw: document.documentElement.clientWidth,
          scrollW: document.documentElement.scrollWidth,
          footerHeight: Math.round(footer.getBoundingClientRect().height),
          brokenImages: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
        };
      })()`);
      if (!f) {
        check(rows, `connectivity.footer.${vpName}.renders`, false, "no footer");
        continue;
      }
      const pick = (text) => f.items.find((item) => item.text === text);
      const iconItem = pick("Icon Platform");
      const missingItem = pick("Missing Artwork Platform");
      const textOnlyItem = pick("Text Only Platform");
      const methodIcon = pick("Message Us");
      // The `email` method is a `demoOnly` entry, so its link text carries the
      // demo badge ("Email" + "Demo") — match it by its authoritative href.
      const methodMissing = f.items.find((item) => item.href === "mailto:hello@example.com");

      check(rows, `connectivity.footer.${vpName}.social.allPresent`, !!iconItem && !!missingItem && !!textOnlyItem, `items=${f.items.length}`);
      check(
        rows,
        `connectivity.footer.${vpName}.social.iconRendered`,
        !!iconItem && iconItem.hasImg && iconItem.imgSrc === "/assets/sidebar-open.svg" && iconItem.loaded === true,
        iconItem ? `src=${iconItem.imgSrc} loaded=${iconItem.loaded}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.iconSize16`,
        !!iconItem && iconItem.iconW === 16 && iconItem.iconH === 16 && iconItem.objectFit === "contain",
        iconItem ? `w=${iconItem.iconW} h=${iconItem.iconH} fit=${iconItem.objectFit}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.iconDecorative`,
        !!iconItem && iconItem.alt === "" && iconItem.hidden === "true" && iconItem.tabindex === null,
        iconItem ? `alt=${iconItem.alt} aria-hidden=${iconItem.hidden} tabindex=${iconItem.tabindex}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.iconPrecedesLabel`,
        !!iconItem && iconItem.iconBeforeLabel === true,
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.labelIsAccessibleName`,
        !!iconItem && iconItem.text === "Icon Platform" && iconItem.ariaLabel === null,
        iconItem ? `text=${iconItem.text} aria-label=${iconItem.ariaLabel}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.missingIconFallsBackToText`,
        !!missingItem &&
          missingItem.hasImg === false &&
          missingItem.text === "Missing Artwork Platform" &&
          missingItem.href === "https://example.com/missing",
        missingItem ? `img=${missingItem.hasImg} href=${missingItem.href}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.textOnlyStaysTextOnly`,
        !!textOnlyItem && textOnlyItem.hasImg === false && textOnlyItem.href === "https://example.com/text",
        textOnlyItem ? `img=${textOnlyItem.hasImg} href=${textOnlyItem.href}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.method.iconRendered`,
        !!methodIcon && methodIcon.hasImg && methodIcon.imgSrc === "/assets/sidebar-open.svg",
        methodIcon ? `img=${methodIcon.hasImg} src=${methodIcon.imgSrc}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.method.missingIconFallsBackToText`,
        !!methodMissing &&
          methodMissing.hasImg === false &&
          methodMissing.text.startsWith("Email") &&
          methodMissing.href === "mailto:hello@example.com",
        methodMissing ? `img=${methodMissing.hasImg} text=${methodMissing.text} href=${methodMissing.href}` : "missing",
      );
      check(rows, `connectivity.footer.${vpName}.noBrokenImages`, f.brokenImages === 0, `broken=${f.brokenImages}`);
      check(rows, `connectivity.footer.${vpName}.noHorizontalOverflow`, f.scrollW <= f.vw + 1, `scrollW=${f.scrollW} vw=${f.vw}`);
      check(rows, `connectivity.footer.${vpName}.geometryIntact`, f.footerHeight > 0, `h=${f.footerHeight}`);

      // Connect page — the same seam on the communication hub itself.
      await cdp.navigate(`${BASE_URL}/en/connect`);
      await waitReady(cdp);
      const page = await cdp.evaluate(`(() => {
        const cards = [...document.querySelectorAll('.grid > li')];
        return {
          cards: cards.map((li) => {
            const a = li.querySelector('a');
            const img = li.querySelector('img');
            const r = img ? img.getBoundingClientRect() : null;
            const cs = img ? getComputedStyle(img) : null;
            const label = [...li.querySelectorAll('span')].find((s) => s.textContent.trim().length > 0 && !s.querySelector('span'));
            const lr = label ? label.getBoundingClientRect() : null;
            return {
              text: (label ? label.textContent : li.textContent).trim(),
              hasLink: !!a,
              href: a ? a.getAttribute('href') : null,
              hasImg: !!img,
              imgSrc: img ? img.getAttribute('src') : null,
              loaded: img ? (img.complete && img.naturalWidth > 0) : null,
              alt: img ? img.getAttribute('alt') : null,
              hidden: img ? img.getAttribute('aria-hidden') : null,
              iconW: r ? Math.round(r.width) : null,
              iconH: r ? Math.round(r.height) : null,
              objectFit: cs ? cs.objectFit : null,
              iconBeforeLabel: !!(r && lr) && r.left <= lr.left + 1,
            };
          }),
          vw: document.documentElement.clientWidth,
          scrollW: document.documentElement.scrollWidth,
          brokenImages: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
        };
      })()`);
      const cards = page ? page.cards : [];
      const iconCard = cards.find((card) => card.hasImg);
      check(rows, `connectivity.page.${vpName}.allMethodsPresent`, cards.length === expectedMethods, `cards=${cards.length} expected=${expectedMethods}`);
      check(rows, `connectivity.page.${vpName}.everyMethodActionable`, cards.length > 0 && cards.every((card) => card.hasLink && !!card.href), cards.map((c) => c.href).join(","));
      check(
        rows,
        `connectivity.page.${vpName}.onlyConfiguredAvailableIconRendered`,
        cards.filter((card) => card.hasImg).length === 1,
        `icons=${cards.filter((card) => card.hasImg).length}`,
      );
      check(
        rows,
        `connectivity.page.${vpName}.iconSupplementary16`,
        !!iconCard &&
          iconCard.imgSrc === "/assets/sidebar-open.svg" &&
          iconCard.loaded === true &&
          iconCard.iconW === 16 &&
          iconCard.iconH === 16 &&
          iconCard.objectFit === "contain" &&
          iconCard.iconBeforeLabel === true,
        iconCard ? `src=${iconCard.imgSrc} w=${iconCard.iconW} h=${iconCard.iconH} fit=${iconCard.objectFit} before=${iconCard.iconBeforeLabel}` : "no icon card",
      );
      check(
        rows,
        `connectivity.page.${vpName}.iconDecorative`,
        !!iconCard && iconCard.alt === "" && iconCard.hidden === "true",
        iconCard ? `alt=${iconCard.alt} aria-hidden=${iconCard.hidden}` : "no icon card",
      );
      check(rows, `connectivity.page.${vpName}.noBrokenImages`, !!page && page.brokenImages === 0, page ? `broken=${page.brokenImages}` : "null");
      check(rows, `connectivity.page.${vpName}.noHorizontalOverflow`, !!page && page.scrollW <= page.vw + 1, page ? `scrollW=${page.scrollW} vw=${page.vw}` : "null");
    }
  } catch (error) {
    check(rows, "connectivity.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    stopServer(server);
    await writeFile(CONFIG_PATH, original, "utf8");
  }
  return rows;
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
    // CONNECTIVITY ICON SEAM — browser-real acceptance of the optional
    // connectivity icon contract (own server, config restored by the scenario).
    if (!onlyPreset) {
      const connectivityRows = await runConnectivityIconScenario(chrome);
      allRows = allRows.concat(connectivityRows.map((r) => ({ preset: "connectivity-icons", ...r })));
      const connectivityFails = connectivityRows.filter((r) => !r.ok).length;
      console.log(`[matrix] connectivity-icons: ${connectivityRows.length - connectivityFails}/${connectivityRows.length} checks passed${connectivityFails ? ` FAIL=${connectivityFails}` : ""}`);
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



