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
 * The recorder: `data-collapsed` writes on a rail (with their value) and `width` transitions on a rail. The
 * same two channels the matrix uses, installed before the document's own scripts.
 */
const RECORDER = `(() => {
  const record = { writes: [], transitions: [], console: [] };
  window.__ui1a1 = record;
  const isRail = (el) => !!el && el.nodeType === 1 && typeof el.id === 'string' && el.id.indexOf('shell-sidebar') === 0;
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

const RESET = `(() => { const record = window.__ui1a1; if (!record) return false; record.writes = []; record.transitions = []; return true; })()`;
const READ = `(() => JSON.stringify(window.__ui1a1 || { writes: [], transitions: [], console: [] }))()`;
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

const KEY = "foundation.sidebar";

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
    await continuityLeg(cdp, { label: "open.homeToAbout", selector: '#shell-sidebar-desktop-rail a[href$="/about"]', path: ABOUT, expected: "false", expectedState: "false" });
    await continuityLeg(cdp, { label: "open.aboutToHome", selector: "#shell-sidebar-desktop-rail ul li:first-child a", path: HOME, expected: "false", expectedState: "false" });

    // ── the reciprocal proof for the state that already looked smooth ─────────────────────────────
    await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
    await sleep(250);
    await continuityLeg(cdp, { label: "closed.homeToAbout", selector: '#shell-sidebar-desktop-rail a[href$="/about"]', path: ABOUT, expected: "true", expectedState: "true" });


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
