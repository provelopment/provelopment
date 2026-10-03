/**
 * UI1-A3-A1 — THE DISCLOSURE CONTROL'S SEMANTICS, as ONE source shared by every browser gate.
 *
 * A3 repaired what the control PRESENTS (artwork and label, selected by the stylesheet). What it CLAIMS is a
 * second channel: `aria-expanded` and the control's accessible name are read by assistive technology, so a
 * document whose rail is presented OPEN while its control still announces the CLOSED action contradicts
 * itself. Both gates therefore record the same facts on every sampled frame — and they must judge them by the
 * same rule, so the reader and the rule live here, once, rather than as two copies that can drift.
 *
 * The facts are read from the DETERMINISTIC SOURCES the browser computes the accessibility tree from:
 *
 *   visual      the state the presentation shows, marker-aware — the canonical markup is CLOSED and the
 *               pre-paint marker (A2) presents it as the visitor's OPEN rail until the runtime commits;
 *   expanded    `aria-expanded`, verbatim;
 *   name        the control's accessible name plus WHICH source supplied it (an author-supplied `aria-label`,
 *               else the text of the presented label variant);
 *   openName /  the name each state's presentation must carry: the control's own declared OPEN name when the
 *   closedName  markup declares one, else the text of that state's label variant — so every content mode is
 *               judged by the markup it actually ships, never by a copy of the expected copy.
 *
 * `readSemanticsHooks` reads the hook name out of the app's OWN contract module, so no gate can agree with a
 * stale copy of an attribute name; a candidate that has not declared the OPEN-name hook yet is reported by a
 * failing row, never by a crash — that is what lets the gates run against a candidate that still has the
 * defect.
 */

/** The control's OPEN-name declaration, as the app declares it (may be absent on an older candidate). */
export function readSemanticsHooks(contractSource) {
  const name = /SIDEBAR_TOGGLE_OPEN_NAME_ATTRIBUTE\s*=\s*"([^"]+)"/.exec(contractSource);
  return { openNameAttribute: name ? name[1] : null };
}

/**
 * The reader itself, as the source of one in-page function set. `marker` is the boot marker the bridge writes
 * on `<html>` (A2) and `openNameAttribute` is the control's declaration of its OPEN-state name.
 */
export function sidebarSemanticsReader({ marker, openNameAttribute }) {
  return `const semanticFacts = (rail) => {
  if (!rail) return null;
  const toggle = rail.querySelector('.ui-sidebar-toggle');
  if (!toggle) return null;
  const displayed = (el) => Boolean(el) && getComputedStyle(el).display !== 'none';
  const text = (el) => (el ? (el.textContent || '').trim() : '');
  const icons = {
    open: rail.querySelector('.ui-sidebar-toggle-icon-open'),
    closed: rail.querySelector('.ui-sidebar-toggle-icon-closed'),
  };
  const labels = {
    open: rail.querySelector('.ui-sidebar-toggle-label-open'),
    closed: rail.querySelector('.ui-sidebar-toggle-label-closed'),
  };
  const variantOf = (el, variant) => Boolean(el) && displayed(el) &&
    (el.classList.contains('ui-sidebar-toggle-icon-' + variant) || el.classList.contains('ui-sidebar-toggle-label-' + variant));
  const shownIcon = icons.open && displayed(icons.open) ? icons.open : icons.closed && displayed(icons.closed) ? icons.closed : null;
  const shownLabel = labels.open && displayed(labels.open) ? labels.open : labels.closed && displayed(labels.closed) ? labels.closed : null;
  const ariaLabel = toggle.getAttribute('aria-label');
  const nameSource = ariaLabel !== null ? 'aria-label' : shownLabel ? 'presented-label' : 'none';
  const collapsed = rail.getAttribute('data-collapsed');
  const openNameHook = ${openNameAttribute === null ? "null" : `'${openNameAttribute}'`};
  const declaredOpen = openNameHook ? toggle.getAttribute(openNameHook) : null;
  // S3E1C/S3F1B — the variant a control PRESENTS is its artwork OR its label: an installation that does
  // not ship the replaceable control artwork (the generic synthetic LEGACY installation) still presents a
  // state through the label variant, and this reader must judge such a document by what it actually ships.
  // An installation that ships the artwork behaves exactly as it always did (its icon variant decides).
  const shownVariant = (icon, label) =>
    icon ? (variantOf(icon, 'open') ? 'open' : variantOf(icon, 'closed') ? 'closed' : 'unpaired')
         : label ? (variantOf(label, 'open') ? 'open' : variantOf(label, 'closed') ? 'closed' : 'unpaired')
         : 'none';
  return {
    visual: document.documentElement.getAttribute(${JSON.stringify(marker)}) !== null ? 'open' : collapsed === 'true' ? 'closed' : 'open',
    collapsed,
    expanded: toggle.getAttribute('aria-expanded'),
    controls: toggle.getAttribute('aria-controls') !== null,
    ariaLabel,
    name: nameSource === 'aria-label' ? ariaLabel : text(shownLabel),
    nameSource,
    presented: shownVariant(shownIcon, shownLabel),
    presentedLabel: shownLabel ? text(shownLabel) : null,
    openName: declaredOpen !== null ? declaredOpen : text(labels.open),
    closedName: text(labels.closed) !== '' ? text(labels.closed) : ariaLabel !== null ? ariaLabel : '',
    icons: { open: displayed(icons.open), closed: displayed(icons.closed) },
    labels: { open: displayed(labels.open), closed: displayed(labels.closed) },
  };
};
/** The full reading of one frame (every fact above, for the audit). */
const semantics = (rail) => JSON.stringify(semanticFacts(rail));
/**
 * The PRESENTATION projection of the same facts: what must be identical between the boot presentation and the
 * hydrated runtime. It deliberately excludes the canonical attributes the boot interval is allowed to carry
 * (data-collapsed, and the A2 marker's own absence) — the marker IS the boot presentation — while keeping
 * every claim an assistive technology reads.
 */
const semanticProjection = (rail) => {
  const facts = semanticFacts(rail);
  if (!facts) return null;
  return JSON.stringify({
    visual: facts.visual,
    presented: facts.presented,
    expanded: facts.expanded,
    controls: facts.controls,
    ariaLabel: facts.ariaLabel,
    name: facts.name,
    nameSource: facts.nameSource,
    openName: facts.openName,
    closedName: facts.closedName,
    icons: facts.icons,
    labels: facts.labels,
  });
};`;
}

/**
 * WHAT ONE FRAME (or one stored reading) CLAIMS, as facts. The recorders store the reading as JSON, so the
 * judgement below is about values (never about the spelling of a string), and it is written once so every
 * gate judges identically.
 */
export function semanticsOf(frameOrReading) {
  const reading = typeof frameOrReading === "string" ? frameOrReading : frameOrReading?.sem;
  try {
    return typeof reading === "string" ? JSON.parse(reading) : null;
  } catch {
    return null;
  }
}

/** The accessible name this state's presentation must carry, from the markup's own declarations. */
export function expectedName(facts, state) {
  return state === "open" ? facts.openName : facts.closedName;
}

/**
 * THE RULE, stated as what one frame must NOT do: contradict itself.
 *
 * `visual` is the state the frame presents (marker-aware) and `presented` is the variant of the control's
 * artwork and label on screen; `expanded` is `aria-expanded` and `name` is the accessible name. A frame may be
 * OPEN or CLOSED — an explicit toggle legitimately changes that — but its claim must always describe ITS OWN
 * presented state. This is the interval-agnostic half of the contract (a document-wide recorder can be judged
 * by it whatever its frames contain); `semanticsAgree` adds the interval's expected state on top.
 */
export function semanticsSelfContradiction(facts) {
  if (!facts) return "no reading";
  if (facts.presented !== facts.visual) return `presented=${facts.presented} visual=${facts.visual}`;
  if (facts.expanded !== (facts.visual === "open" ? "true" : "false")) {
    return `aria-expanded=${facts.expanded} while visual=${facts.visual}`;
  }
  if (facts.controls !== true) return "aria-controls missing";
  if (facts.nameSource === "none") return "no accessible name source";
  const wanted = expectedName(facts, facts.visual);
  if (facts.name !== wanted) return `name="${facts.name}" expected="${wanted}" (visual=${facts.visual})`;
  return null;
}

/**
 * THE RULE, for a frame whose presented state is KNOWN: every claim the control makes must describe the state
 * it is presenting (`state` is what the presentation shows — the boot marker or the committed rail state).
 *
 * An icon-only control whose OPEN name is not declared anywhere cannot satisfy this, which is exactly the case
 * the repair closes.
 */
export function semanticsAgree(facts, state) {
  return Boolean(facts) && facts.visual === state && semanticsSelfContradiction(facts) === null;
}

/** The first thing in one frame that disagrees with its presented state, or null when nothing does. */
export function semanticsDisagreement(facts, state) {
  if (!facts) return "no reading";
  if (facts.visual !== state) return `visual=${facts.visual} expected=${state}`;
  if (facts.presented !== state) return `presented=${facts.presented} expected=${state}`;
  if (facts.expanded !== (state === "open" ? "true" : "false")) return `aria-expanded=${facts.expanded}`;
  if (facts.controls !== true) return "aria-controls missing";
  if (facts.nameSource === "none") return "no accessible name source";
  if (facts.name !== expectedName(facts, state)) return `name="${facts.name}" expected="${expectedName(facts, state)}"`;
  return null;
}

/** A compact description of every state one interval's readings covered (for a row's detail). */
export function observedSemantics(frames) {
  return JSON.stringify([
    ...new Set(
      frames.map((facts) => (facts ? `visual=${facts.visual}/expanded=${facts.expanded}/name=${facts.name}` : "none")),
    ),
  ]);
}