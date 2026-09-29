/**
 * THE SIDEBAR'S PRESENTATION PREFERENCE — THE RUNTIME LAYER (FOUNDATION-UI1 / UI1-A1 / UI1-A2).
 *
 * The rail's open/closed state is a PRESENTATION PREFERENCE the visitor owns. It is not route, page,
 * site, locale, location or content state: the same visitor keeps the same sidebar while they move
 * from `/ww/en` to `/ww/en/about`, on to another site or locale the deployment serves, and after a
 * reload. WHAT the preference is spelled as (its key, its vocabulary and the pre-paint marker) is
 * declared once in the sibling contract module `./sidebar-contract` and re-exported here; THIS
 * module is the runtime that resolves, remembers and publishes it while the application is alive.
 *
 * WHY A PREFERENCE NEEDS PERSISTENCE AT ALL
 * -----------------------------------------
 * The state used to live only in the mounted rail's memory, and the mounted rail does not survive
 * what the visitor actually does:
 *
 *   · a RELOAD re-creates the document, so a component-memory state is re-initialized — a rail the
 *     visitor had CLOSED came back OPEN;
 *   · a CLIENT-SIDE NAVIGATION re-creates the rail too, because the shell is composed inside the
 *     `[...segments]` layout, whose params change when the route changes: the rail is remounted, so
 *     navigating away from a closed sidebar arrived at a page whose sidebar was open again.
 *
 * Neither defect involved any code that opened the sidebar: there was simply nowhere for the
 * visitor's choice to live. Browser-local storage is where it lives now — the SAME mechanism and the
 * same shape of contract the visitor's shell-layout choice already uses (`@/core/ui` →
 * `foundation.layout`): a presentation preference only, so no cookie, no session, no server state,
 * no route becomes dynamic and static generation is untouched.
 *
 * THE STORAGE CONTRACT
 * --------------------
 *   key        `foundation.sidebar` — stable and Foundation-owned. It deliberately carries NO route,
 *              site, locale or location: the preference is the visitor's, not the page's, so every
 *              path on the origin shares it and a selector that changes the URL cannot partition it.
 *   value      exactly `"open"` or `"closed"` — the minimum that expresses the choice, and the whole
 *              vocabulary. Nothing else is stored, and nothing else is accepted.
 *   reading    a missing key, an unusable value, or storage that is blocked/unavailable all mean "no
 *              usable preference": the reader answers `null`, and the rail keeps its declared initial
 *              state (the platform's canonical state for a composed rail is CLOSED — see the shell
 *              engine's `collapsedInitial`). A hostile or stale value therefore degrades to the
 *              canonical state instead of being applied.
 *
 * ONE AUTHORITY PER LIFETIME (UI1-A1)
 * ----------------------------------
 * The preference has exactly two layers, and only one of them is the authority at any moment:
 *
 *   · the RESOLVED RUNTIME PREFERENCE (`resolvedPreference` below) is the authority for the life of the
 *     running application: once this document has resolved the visitor's choice, every rail instance —
 *     including one created later — renders that value on its FIRST render;
 *   · the STORED PREFERENCE (`foundation.sidebar`) is durable backing persistence, read exactly once per
 *     document to seed the runtime layer, and written whenever the visitor toggles.
 *
 * WHY THE RUNTIME LAYER EXISTS. A client-side navigation re-creates the shell (the shell is composed by
 * the route's layout, whose segments change), so a replacement rail used to start from the canonical
 * CLOSED state and adopt the stored preference in an effect — a correction that is correct but VISIBLE:
 * committing `data-collapsed="true"` and then correcting it makes the browser start the rail's
 * `width 200ms` CSS transition, so an OPEN rail collapsed and expanded again on every navigation. The
 * runtime layer removes the correction entirely: a replacement rail is created already OPEN (or already
 * CLOSED) and nothing has to change, so no transition is triggered and no opposite state exists even
 * for one frame.
 *
 * `resolvedSidebarPreference()` is safe to call DURING RENDER (it never touches storage), which is what
 * lets a first render be correct while the server's markup stays authoritative for hydration:
 * `resolveSidebarPreference()` — the storage-reading, once-per-document resolver — belongs in an effect.
 * On the server there is nothing to resolve, so the runtime layer stays empty, the declared initial
 * state is rendered, and hydration cannot disagree with it.
 *
 * ONE STATE, EVERY BAND
 * ---------------------
 * The desktop and tablet rails are two instances of the same preference, and only one of them is
 * displayed at a time (mutually exclusive CSS bands). A toggle in the visible band therefore
 * PUBLISHES the choice, so an instance that is merely hidden by CSS cannot keep disagreeing with the
 * visitor's state and reappear stale when the viewport crosses the breakpoint.
 *
 * Deliberately dependency-free (no React, no framework, no configuration): the vocabulary and the
 * validation are pure, so the contract is unit-testable without a browser, exactly like the layout
 * key's `isShellLayout`.
 */

/**
 * The stable, Foundation-owned browser-local key, the vocabulary and the boot-marker contract all live in the
 * sibling contract module (`./sidebar-contract`), because the PRE-PAINT BRIDGE and this runtime are two
 * readers of ONE contract. They are re-exported here so every existing importer keeps its import path —
 * there is still exactly one authority, and no second copy of the key can drift from it.
 */
import {
  isSidebarPreference,
  SIDEBAR_PREFERENCE_ATTRIBUTE,
  SIDEBAR_PREFERENCE_STORAGE_KEY,
  SIDEBAR_PREFERENCES,
  sidebarPreferenceBootScript,
  type SidebarPreference,
} from "./sidebar-contract";

export {
  isSidebarPreference,
  SIDEBAR_PREFERENCE_ATTRIBUTE,
  SIDEBAR_PREFERENCE_STORAGE_KEY,
  SIDEBAR_PREFERENCES,
  sidebarPreferenceBootScript,
};
export type { SidebarPreference };

/**
 * The visitor's recorded preference, or `null` when there is none to apply: the key is absent, the
 * stored value is not in the vocabulary, or browser storage cannot be read at all.
 */
export function readSidebarPreference(): SidebarPreference | null {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_PREFERENCE_STORAGE_KEY);
    return isSidebarPreference(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * The RESOLVED runtime preference of this document — the authority while the application is alive.
 *
 * `null` means "this document has resolved nothing yet" (a fresh document before its first resolution, or
 * the server, where there is no visitor state to resolve). It is never a third state: the rail reads it as
 * "no resolved preference" and keeps its declared initial state.
 */
let resolvedPreference: SidebarPreference | null = null;

/**
 * The preference this document has ALREADY resolved, or `null` while it has resolved nothing.
 *
 * Safe during render: it never reads storage, so a client render cannot disagree with the server's markup
 * for a document that has not resolved anything yet. This is what a replacement rail uses — a rail created
 * by a navigation renders the visitor's already-resolved state on its first render, so it is never created
 * in the canonical state and then corrected.
 */
export function resolvedSidebarPreference(): SidebarPreference | null {
  return resolvedPreference;
}

/**
 * Resolve the visitor's preference ONCE per document: the running value if this document already has one,
 * otherwise the stored one (which then becomes the running value).
 *
 * Effect-only by contract — it is the one function that reads storage (see `resolvedSidebarPreference`).
 * A blocked, absent or unusable store resolves to `null`, which means "no preference": the rail keeps the
 * platform's canonical CLOSED state and the runtime layer stays empty.
 */
export function resolveSidebarPreference(): SidebarPreference | null {
  if (resolvedPreference === null) resolvedPreference = readSidebarPreference();
  return resolvedPreference;
}

/** The mounted rails that follow the preference (see "ONE STATE, EVERY BAND" above). */
const listeners = new Set<(preference: SidebarPreference) => void>();

/**
 * Follow the preference. Every mounted rail subscribes, so a toggle in one band reaches the others.
 *
 * @param listener called with the new preference after a successful store
 * @returns the unsubscribe function (a component's effect cleanup)
 */
export function subscribeSidebarPreference(
  listener: (preference: SidebarPreference) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Record the visitor's choice and publish it to the other mounted rails.
 *
 * A storage failure is never an error and never blocks the interaction: the rail the visitor is
 * looking at has already changed state, and only its persistence is lost.
 */
export function storeSidebarPreference(preference: SidebarPreference): void {
  // The running application knows the choice from this moment on — before persistence is attempted, and
  // whether or not persistence succeeds (a blocked store costs only durability, never the state).
  resolvedPreference = preference;
  try {
    window.localStorage.setItem(SIDEBAR_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    /* preference only — the rail the visitor toggled keeps the choice regardless */
  }
  for (const listener of listeners) listener(preference);
}

/**
 * RELINQUISH THE PRE-PAINT BRIDGE (UI1-A2).
 *
 * A NEW document cannot know the visitor's preference at render time: the server renders the canonical
 * CLOSED rail (which is what keeps every page statically generated) and the preference only becomes
 * readable in the browser. The synchronous pre-paint bridge
 * (`./sidebar-contract` → `sidebarPreferenceBootScript`, rendered by `./sidebar-preference-boot`) therefore
 * names the visitor's OPEN preference on `<html>` (`SIDEBAR_PREFERENCE_ATTRIBUTE`) BEFORE the rail is painted,
 * and the stylesheet presents a canonical-CLOSED rail as the OPEN one while that marker is present.
 *
 * The bridge spans exactly `static HTML → hydrated runtime`, and this function ends it: once a rail has
 * committed the state that represents the document's resolved preference, the rail's own `data-collapsed` is
 * the authority again and the marker must stop applying — otherwise the visitor's next explicit CLOSED
 * toggle would be overridden by a stale bridge. Removing an absent attribute is a no-op, so a client-side
 * navigation (the UI1-A1 case, where the rail is created already correct) simply calls this for nothing.
 *
 * The removal happens in a layout effect, i.e. in the SAME frame as the attribute change it follows, so
 * nothing is painted in between and the hand-off is invisible.
 */
export function relinquishSidebarPreferenceBoot(): void {
  try {
    document.documentElement.removeAttribute(SIDEBAR_PREFERENCE_ATTRIBUTE);
  } catch {
    /* nothing to relinquish (no document, or a DOM that refuses the write) */
  }
}
