// tests/browser/production-continuity.mjs
// FOUNDATION-UI1-A1 — THE PRODUCTION-MODE CONTINUITY PROOF.
//
// WHY THIS FILE EXISTS, separate from `matrix.mjs`:
//
// The owner-visible defect (`OPEN → CLOSED → OPEN` while navigating an OPEN sidebar) was reported on the
// LIVE production site and was NOT reproducible by the dev-mode matrix, which asserted the destination
// state ("open stays open") and passed throughout. The visible part was the GEOMETRY: the rail's canonical
// CLOSED state was committed and corrected inside one commit, so no wrong frame was painted, but the
// browser still started the rail's `width 200ms` CSS transition — the rail visibly collapsed and expanded
// again on every navigation.
//
// The matrix now judges that interval too (`continuity.*` rows, dev server). This script is the smallest
// additional proof that runs against PRODUCTION-MODE OUTPUT — the mode the owner actually uses — instead of
// duplicating the 500+ check suite: build, serve, and assert the same continuity invariant through the same
// real controls.
//
// OWNERSHIP: this file is owned by the browser test directory (`tests/browser/`), is NOT wired into any CI
// job (a production build is minutes, not seconds), and is run explicitly:
//
//   node tests/browser/production-continuity.mjs
//
// It serves the repository's own deployment (the reference deployment — `synthetic: false` semantics), so
// the composition it exercises is the shipped one. It writes nothing itself: the build's own output is
// Next's, and the operator reads the run's report from the console.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Cdp, findChrome } from "./cdp.mjs";
import { HYDRATION_SETTLE_MS, READINESS_POLL_MS, READINESS_TIMEOUT_MS, readinessProbeExpression } from "./readiness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const PORT = 4300 + (Math.floor(Math.random() * 400) % 400);
const BASE = `http://localhost:${PORT}`;
const HOME = "/ww/en";
const ABOUT = "/ww/en/about";

const rows = [];
function check(name, ok, detail = "") {
  rows.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

/**
 * The preference contract, READ FROM THE APP'S OWN SOURCE (the ONE authority, `src/components/ui/sidebar-contract.ts`), so
 * this proof observes exactly what the app writes and cannot agree with a stale copy of a key or a marker.
 */
const PREFERENCE_SOURCE = readFileSync(join(ROOT, "src", "components", "ui", "sidebar-contract.ts"), "utf8");
const KEY = (() => {
  const match = /SIDEBAR_PREFERENCE_STORAGE_KEY\s*=\s*"([^"]+)"/.exec(PREFERENCE_SOURCE);
  if (!match) throw new Error("the sidebar preference key must be declared in @/components/ui/sidebar-contract.ts");
  return match[1];
})();
const BOOT_MARKER = (() => {
  const match = /SIDEBAR_PREFERENCE_ATTRIBUTE\s*=\s*"([^"]+)"/.exec(PREFERENCE_SOURCE);
  if (!match) throw new Error("the sidebar boot marker must be declared in @/components/ui/sidebar-contract.ts");
  return match[1];
})();
/** The collapsed rail's own width: anything at or below it is the icon column the visitor sees as CLOSED. */
const NARROW_MAX = 64;

/**
 * The recorder: `data-collapsed` writes on a rail (with their value) and `width` transitions on a rail — the
 * same two channels the matrix uses — PLUS, since UI1-A2, the rail's PAINTED geometry per animation frame
 * and the document's boot marker, because the defect this file exists for now includes a FIRST-PAINT defect
 * that no attribute channel can see.
 */
const RECORDER = `(() => {
  const record = { writes: [], transitions: [], console: [], frames: [], bootFp: null };
  window.__ui1a1 = record;
  const isRail = (el) => !!el && el.nodeType === 1 && typeof el.id === 'string' && el.id.indexOf('shell-sidebar') === 0;
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const fingerprint = (rail) => {
    if (!rail) return null;
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const toggle = rail.querySelector('.ui-sidebar-toggle');
    const label = rail.querySelector('.ui-nav-item-label');
    const iconOpen = rail.querySelector('.ui-nav-item-icon-open');
    const iconClosed = rail.querySelector('.ui-nav-item-icon-closed');
    const railCs = cs(rail);
    const toggleCs = cs(toggle);
    const labelCs = cs(label);
    return [
      'railW=' + Math.round(rail.getBoundingClientRect().width),
      'railPad=' + railCs.paddingInlineStart + '/' + railCs.paddingInlineEnd,
      'toggle=' + (toggleCs ? toggleCs.justifyContent + '|' + toggleCs.marginInlineStart + '|' + toggleCs.paddingInlineStart : 'n/a'),
      'label=' + (labelCs ? labelCs.position + '|' + labelCs.clipPath + '|' + Math.round(label.getBoundingClientRect().width) : 'n/a'),
      'listPad=' + cs(rail.querySelector('ul')).paddingInlineStart,
      'icons=' + (cs(iconOpen) ? cs(iconOpen).display : 'n/a') + '/' + (cs(iconClosed) ? cs(iconClosed).display : 'n/a'),
    ].join('  ');
  };
  const sample = () => {
    if (record.frames.length < 200) {
      const desktop = document.querySelector('#shell-sidebar-desktop-rail');
      const rail = shown(desktop) ? desktop : null;
      if (rail && record.bootFp === null) record.bootFp = fingerprint(rail);
      record.frames.push({
        t: Math.round(performance.now()),
        w: desktop ? Math.round(desktop.getBoundingClientRect().width) : null,
        attr: desktop ? desktop.getAttribute('data-collapsed') : null,
        boot: document.documentElement.getAttribute(${JSON.stringify(BOOT_MARKER)}),
      });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    const result = setAttribute.call(this, name, value);
    try { if (name === 'data-collapsed' && isRail(this)) record.writes.push({ id: this.id, value: String(value), t: Math.round(performance.now()) }); } catch (error) { /* best effort */ }
    return result;
  };
  for (const type of ['transitionrun', 'transitionstart']) {
    document.addEventListener(type, (event) => {
      try { if (event.propertyName === 'width' && isRail(event.target)) record.transitions.push({ id: event.target.id, type, t: Math.round(performance.now()) }); } catch (error) { /* best effort */ }
    }, true);
  }
  for (const level of ['error', 'warn']) {
    const reported = console[level];
    console[level] = function (...args) {
      try { record.console.push(String(args[0])); } catch (error) { /* best effort */ }
      return reported.apply(this, args);
    };
  }
})()`;

const RESET = `(() => { const record = window.__ui1a1; if (!record) return false; record.writes = []; record.transitions = []; record.frames = []; record.bootFp = null; return true; })()`;
const READ = `(() => JSON.stringify(window.__ui1a1 || { writes: [], transitions: [], console: [], frames: [], bootFp: null }))()`;
const STATE = `(() => {
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rail = [document.querySelector('#shell-sidebar-desktop-rail'), document.querySelector('#shell-sidebar-tablet-rail')].find(shown) || null;
  const toggle = rail ? rail.querySelector('.ui-sidebar-toggle') : null;
  return JSON.stringify({
    path: location.pathname,
    collapsed: rail ? rail.getAttribute('data-collapsed') : null,
    expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    stored: window.localStorage.getItem('foundation.sidebar'),
  });
})()`;

const RUNTIME_FINGERPRINT = `(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const rail = document.querySelector('#shell-sidebar-desktop-rail');
  if (!rail) return null;
  const toggle = rail.querySelector('.ui-sidebar-toggle');
  const label = rail.querySelector('.ui-nav-item-label');
  const iconOpen = rail.querySelector('.ui-nav-item-icon-open');
  const iconClosed = rail.querySelector('.ui-nav-item-icon-closed');
  const railCs = cs(rail);
  const toggleCs = cs(toggle);
  const labelCs = cs(label);
  return [
    'railW=' + Math.round(rail.getBoundingClientRect().width),
    'railPad=' + railCs.paddingInlineStart + '/' + railCs.paddingInlineEnd,
    'toggle=' + (toggleCs ? toggleCs.justifyContent + '|' + toggleCs.marginInlineStart + '|' + toggleCs.paddingInlineStart : 'n/a'),
    'label=' + (labelCs ? labelCs.position + '|' + labelCs.clipPath + '|' + Math.round(label.getBoundingClientRect().width) : 'n/a'),
    'listPad=' + cs(rail.querySelector('ul')).paddingInlineStart,
    'icons=' + (cs(iconOpen) ? cs(iconOpen).display : 'n/a') + '/' + (cs(iconClosed) ? cs(iconClosed).display : 'n/a'),
  ].join('  ');
})()`;

async function waitReady(cdp, path = null) {
  const end = Date.now() + READINESS_TIMEOUT_MS;
  let observed = null;
  while (Date.now() < end) {
    observed = await cdp.evaluate(readinessProbeExpression(path === null ? null : { path }));
    if (observed.satisfied) {
      await sleep(HYDRATION_SETTLE_MS);
      return true;
    }
    await sleep(READINESS_POLL_MS);
  }
  return false;
}

const probe = async (cdp) => JSON.parse(await cdp.evaluate(STATE));
const readRecorder = async (cdp) => JSON.parse(await cdp.evaluate(READ));
const resetRecorder = (cdp) => cdp.evaluate(RESET);

/**
 * UI1-A2 — THE FIRST-PAINT CONTRACT OF ONE PRODUCTION-MODE DOCUMENT LOAD, as rows.
 *
 * Judged on what is ON SCREEN: the state painted by the first frame that shows a rail, every painted state
 * of the document, whether the boot presentation is the SAME presentation the runtime presents (labels,
 * icons, control inset, list inset and geometry — not just a width), and whether the boot interval started a
 * width transition. A stored OPEN preference must be on screen from the first painted frame; a stored CLOSED
 * or absent preference must be continuously CLOSED.
 */
async function firstPaintRows(cdp, label, expected) {
  const recorded = await readRecorder(cdp);
  const painted = recorded.frames.filter((frame) => typeof frame.w === "number" && frame.w > 0);
  const states = painted.map((frame) => (frame.w <= NARROW_MAX ? "closed" : "open"));
  const runtime = await probe(cdp);
  check(
    `production.firstPaint.${label}.firstPaintedState`,
    states.length > 0 && states[0] === expected,
    `firstPainted=${states[0] ?? "none"} width=${painted.length ? painted[0].w : "n/a"} widths=${JSON.stringify([...new Set(painted.map((frame) => frame.w))])}`,
  );
  check(
    `production.firstPaint.${label}.neverPaintedOpposite`,
    states.length > 0 && states.every((state) => state === expected),
    `states=${JSON.stringify([...new Set(states)])}`,
  );
  check(
    `production.firstPaint.${label}.startsNoWidthTransition`,
    recorded.transitions.length === 0,
    `transitions=${JSON.stringify(recorded.transitions)}`,
  );
  check(
    `production.firstPaint.${label}.bootPresentationMatchesRuntime`,
    Boolean(recorded.bootFp) && recorded.bootFp === (await cdp.evaluate(RUNTIME_FINGERPRINT)),
    `boot=${recorded.bootFp}`,
  );
  check(
    `production.firstPaint.${label}.stateIsTheStoredPreference`,
    runtime.collapsed === (expected === "open" ? "false" : "true"),
    JSON.stringify(runtime),
  );
  return recorded;
}

/** Stop a server process and wait until it is really gone (the matrix's established hand-over). */
async function stopServer(proc) {
  if (!proc) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    /* already gone */
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (proc.exitCode !== null && proc.exitCode !== undefined) return;
    await sleep(250);
  }
}

async function waitForServer(url, timeoutMs = 300000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 400) return true;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  return false;
}

/**
 * One production-mode navigation, judged by the same invariant as the matrix rows: the rail may be
 * replaced, but it may not commit the opposite state and may not start a width transition.
 */
async function continuityLeg(cdp, { label, selector, path, expected, expectedState }) {
  await resetRecorder(cdp);
  const clicked = await cdp.clickCenter(selector);
  const ready = await waitReady(cdp, path);
  const after = await probe(cdp);
  const observed = await readRecorder(cdp);
  const opposite = observed.writes.filter((write) => write.value !== expectedState);
  check(
    `production.${label}.destination`,
    Boolean(clicked) && ready && after.path === path && after.collapsed === expected,
    JSON.stringify(after),
  );
  check(`production.${label}.commitsNoOppositeState`, opposite.length === 0, `writes=${JSON.stringify(observed.writes)}`);
  check(
    `production.${label}.startsNoWidthTransition`,
    observed.transitions.length === 0,
    `transitions=${JSON.stringify(observed.transitions)}`,
  );
  return observed;
}
/**
 * One production-mode build, served by `next start`, judged by the same invariant as the matrix rows: during
 * a real navigation the rail may be replaced, but it may not commit the opposite state and may not start its
 * width transition.
 */
async function runProductionContinuity() {
  const chrome = findChrome();
  if (!chrome) throw new Error("no Chrome/Chromium/Edge binary found");

  console.log(`[production-continuity] next build (reference deployment), then next start -p ${PORT}`);
  const build = spawn(process.execPath, [NEXT_BIN, "build"], { cwd: ROOT, stdio: "inherit", windowsHide: true });
  const built = await new Promise((resolve) => build.on("exit", (code) => resolve(code ?? 1)));
  check("production.buildSucceeded", built === 0, `next build exit=${built}`);
  if (built !== 0) return rows;

  const server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: "ignore",
    windowsHide: true,
  });
  const started = await waitForServer(`${BASE}${HOME}`);
  check("production.servingProductionOutput", started, `${BASE}${HOME}`);
  if (!started) {
    await stopServer(server);
    return rows;
  }

  let cdp = null;
  try {
    cdp = await Cdp.connect(chrome);
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: RECORDER });
    await cdp.setViewport(1280, 900);
    await cdp.navigate(`${BASE}${HOME}`);
    await waitReady(cdp);

    // A defined starting point: no preference, then the visitor's own choice through the real control.
    await cdp.evaluate(`window.localStorage.removeItem(${JSON.stringify(KEY)}); true`);
    await cdp.reload();
    await waitReady(cdp);
    const fresh = await probe(cdp);
    check("production.freshDocumentIsCanonicalClosed", fresh.collapsed === "true" && fresh.stored === null, JSON.stringify(fresh));
    // UI1-A2 — and the canonical document is continuously CLOSED on screen: no OPEN frame, no transition.
    await firstPaintRows(cdp, "noPreference", "closed");

    await resetRecorder(cdp);
    await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
    await sleep(250);
    const opened = await probe(cdp);
    const toggleRecorder = await readRecorder(cdp);
    check(
      "production.explicitToggleOpensAndStillAnimates",
      opened.collapsed === "false" && opened.stored === "open" && toggleRecorder.transitions.length > 0,
      `state=${JSON.stringify(opened)} transitions=${JSON.stringify(toggleRecorder.transitions)}`,
    );

    // ── the owner's defect, judged on production-mode output ──────────────────────────────────────
    // UI1-A2 — FIRST, the whole-document case the owner reported: an actual reload with the preference stored
    // OPEN must present the OPEN rail from its first painted frame, with no CLOSED frame and no boot-induced
    // width transition. This is the production-mode counterpart of the matrix's `firstPaint.*` rows.
    await cdp.reload();
    await waitReady(cdp);
    await firstPaintRows(cdp, "openRefresh", "open");

    await continuityLeg(cdp, { label: "open.homeToAbout", selector: '#shell-sidebar-desktop-rail a[href$="/about"]', path: ABOUT, expected: "false", expectedState: "false" });
    await continuityLeg(cdp, { label: "open.aboutToHome", selector: "#shell-sidebar-desktop-rail ul li:first-child a", path: HOME, expected: "false", expectedState: "false" });

    // ── the reciprocal proof for the state that already looked smooth ─────────────────────────────
    await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
    await sleep(250);
    await continuityLeg(cdp, { label: "closed.homeToAbout", selector: '#shell-sidebar-desktop-rail a[href$="/about"]', path: ABOUT, expected: "true", expectedState: "true" });

    // ── the reciprocal whole-document case: a stored CLOSED preference, on an actual reload ───────
    await cdp.reload();
    await waitReady(cdp);
    await firstPaintRows(cdp, "closedRefresh", "closed");

    // ── a route-changing selector while OPEN is the same contract ────────────────────────────────
    await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
    await sleep(250);
    const site = JSON.parse(
      await cdp.evaluate(`(() => {
        const control = document.querySelector('select[data-selector="site"]');
        if (!control) return JSON.stringify({ current: null, next: null });
        const next = [...control.options].map((option) => option.value).find((value) => value !== control.value) ?? null;
        return JSON.stringify({ current: control.value, next: next });
      })()`),
    );
    if (site.next) {
      await resetRecorder(cdp);
      await cdp.evaluate(`(() => {
        const control = document.querySelector('select[data-selector="site"]');
        control.value = ${JSON.stringify(site.next)};
        control.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      const switched = `/${site.next}/en/about`;
      const ready = await waitReady(cdp, switched);
      const after = await probe(cdp);
      const observed = await readRecorder(cdp);
      check("production.selector.siteChangeWhileOpen.keepsState", ready && after.path === switched && after.collapsed === "false", JSON.stringify(after));
      check(
        "production.selector.siteChangeWhileOpen.commitsNoOppositeState",
        observed.writes.filter((write) => write.value !== "false").length === 0,
        `writes=${JSON.stringify(observed.writes)}`,
      );
      check(
        "production.selector.siteChangeWhileOpen.startsNoWidthTransition",
        observed.transitions.length === 0,
        `transitions=${JSON.stringify(observed.transitions)}`,
      );
    } else {
      check("production.selector.siteChangeWhileOpen.keepsState", false, "no second site is configured");
    }

    // ── hydration / console ──────────────────────────────────────────────────────────────────────
    const finalRecorder = await readRecorder(cdp);
    const hydration = finalRecorder.console.filter((message) => /hydrat|did not match|server rendered text|Warning:/i.test(message));
    check("production.console.zeroHydrationWarnings", hydration.length === 0, hydration.join(" | "));
    check("production.console.zeroErrorsAndWarnings", finalRecorder.console.length === 0, finalRecorder.console.join(" | "));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runProductionContinuity();
  const failures = rows.filter((row) => !row.ok);
  console.log(`PRODUCTION-CONTINUITY-TOTAL=${rows.length} PASSED=${rows.length - failures.length} FAILED=${failures.length}`);
  process.exitCode = rows.length > 0 && failures.length === 0 ? 0 : 1;
}
