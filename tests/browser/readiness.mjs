/**
 * THE BROWSER HARNESS'S READINESS LAYERS (FOUNDATION-BR1)
 * ======================================================
 *
 * A browser scenario waits for the application to reach a state, and the states it needs are NOT the
 * same thing:
 *
 *   document loaded / shell present   `document.readyState === 'complete'` plus the shell's own chrome
 *                                     being in the DOM. This is a DOCUMENT-level fact, and a FULL page
 *                                     load is how a scenario reaches a new page (cdp.navigate).
 *   client navigation committed       a VISITOR action — a Site, Language or Location choice — navigates
 *                                     WITHOUT a document load. `readyState` and the shell are unchanged
 *                                     by it, so the condition above is ALREADY TRUE when the transition
 *                                     STARTS and says nothing about it. The only observable a transition
 *                                     produces is the state the next assertion reads: the resulting route,
 *                                     and the body that route renders.
 *
 * Collapsing the second into the first is a real defect, not a coarse wait: a scenario that dispatches a
 * visitor action and then probes with the document-level condition asserts against whatever page happened
 * to be current — the previous one, whenever the transition has not committed yet. That is exactly the
 * historical transient this module exists to end (`/ca/fr/about` reported by two language-switch checks
 * while the third, marker-free check passed against the same stale page).
 *
 * Measured, so the rule rests on evidence rather than assumption (FOUNDATION-BR1):
 *
 *   · an unperturbed client transition commits within the harness's own settle window, which is why the
 *     defect is probabilistic and every later full run passed;
 *   · under a controlled, TEST-ONLY CDP network latency (600 ms) the transition commits ~225 ms AFTER the
 *     settle-only probe, and the unmodified harness then reproduced the historical signature exactly;
 *   · the URL and the rendered body become observable in the SAME sample in every iteration (including
 *     under that latency), so awaiting the resulting route is a sound way to await the transition — the
 *     body moves with it.
 *
 * The budgets below are the harness's ESTABLISHED ones, moved here unchanged so they are stated once and
 * provable without starting a browser: no timeout was raised and no settle lengthened to obtain this
 * repair.
 *
 * Deliberately PLAIN ESM with JSDoc types, like the ownership module it sits beside (`scope.mjs`): a
 * scenario imports it directly, and Vitest can import the SAME module to prove the semantics — the
 * expressions are evaluated against a stubbed document, so the contract is testable without a browser.
 */

/** How long any readiness wait may take before it fails, in ms. */
export const READINESS_TIMEOUT_MS = 20000;

/** How long a readiness wait sleeps between two observations, in ms. */
export const READINESS_POLL_MS = 200;

/** The settle a satisfied readiness wait keeps before the caller probes the page, in ms. */
export const HYDRATION_SETTLE_MS = 400;

/**
 * The DOCUMENT-level readiness condition: the document finished loading AND the shell's chrome is
 * present. A localized 404 or a dev-server error document never satisfies it (they carry no shell), which
 * is why a timeout here must be reported with what was actually observed — see
 * {@link readinessFailureMessage}.
 *
 * @returns {string} a self-contained JS expression
 */
export function shellReadyExpression() {
  return `(() => { const rd = document.readyState; const t = !!document.querySelector('#shell-mobile-nav'); const b = !!document.querySelector('.ui-shell-bottom-bar'); return rd === 'complete' && (t || b); })()`;
}

/**
 * The state a CLIENT-SIDE transition must produce: the route it navigates to, and — when the caller knows
 * it — a marker of the body that route renders.
 *
 * @param {{ path: string, body?: string|null }} expected
 * @returns {string} a self-contained JS expression
 */
export function clientRouteExpression({ path, body = null }) {
  const conditions = [`location.pathname === ${JSON.stringify(path)}`];
  if (body !== null) {
    conditions.push(
      `(document.body ? document.body.textContent || '' : '').includes(${JSON.stringify(body)})`,
    );
  }
  return `(${conditions.join(" && ")})`;
}

/**
 * The ONE expression the harness evaluates while it waits. It always reports the shell layer, and, when an
 * expectation is given, whether that expectation holds — so a failure can say WHICH layer was missing
 * instead of claiming one cause for every timeout.
 *
 * @param {{ path: string, body?: string|null }|null} [expected] required only after a visitor action
 * @returns {string} a self-contained JS expression returning an observation object
 */
export function readinessProbeExpression(expected = null) {
  const expectedExpression = expected === null ? "true" : clientRouteExpression(expected);
  return `(() => {
    const shell = ${shellReadyExpression()};
    const expected = ${expectedExpression};
    return { url: location.href, readyState: document.readyState, shell, expected, satisfied: shell && expected };
  })()`;
}

/**
 * Why a readiness wait gave up, naming the state that was awaited and the document that was observed.
 *
 * The historical message claimed a cause ("page did not hydrate in time") that this harness cannot
 * distinguish from a document that never had the shell at all — a localized 404, a dev-server error
 * document, or a load that never completed. Reporting the observation keeps a future occurrence
 * attributable.
 *
 * @param {{ url: string, readyState: string, shell: boolean, expected: boolean }|null|undefined} observed
 *   the last observation a wait took, if any
 * @param {{ path: string, body?: string|null }|null} [expected]
 * @param {number} [timeoutMs]
 * @returns {string}
 */
export function readinessFailureMessage(observed, expected = null, timeoutMs = READINESS_TIMEOUT_MS) {
  const awaited =
    expected === null
      ? "the document's shell to finish loading"
      : `the client-side transition to ${expected.path}${expected.body ? ` rendering "${expected.body}"` : ""} (the route the next assertion reads)`;
  const seen =
    observed === null || observed === undefined
      ? "no observation was taken"
      : `the document at ${observed.url} reports readyState="${observed.readyState}", shell=${observed.shell}, expected=${observed.expected}`;
  return `the browser did not reach the state this scenario awaited within ${timeoutMs}ms: awaited ${awaited}; observed ${seen}`;
}
