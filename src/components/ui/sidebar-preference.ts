/**
 * THE SIDEBAR'S PRESENTATION PREFERENCE (FOUNDATION-UI1).
 *
 * The rail's open/closed state is a PRESENTATION PREFERENCE the visitor owns. It is not route, page,
 * site, locale, location or content state: the same visitor keeps the same sidebar while they move
 * from `/ww/en` to `/ww/en/about`, on to another site or locale the deployment serves, and after a
 * reload. This module is the ONE place that knows how that preference is spelled, written and read.
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

/** The stable, Foundation-owned browser-local key. See the storage contract above. */
export const SIDEBAR_PREFERENCE_STORAGE_KEY = "foundation.sidebar";

/** The COMPLETE value vocabulary. Two explicit states, nothing inferred. */
export const SIDEBAR_PREFERENCES = ["open", "closed"] as const;

/** One recorded sidebar presentation preference. */
export type SidebarPreference = (typeof SIDEBAR_PREFERENCES)[number];

/** Whether a value is a preference this contract recognizes (never a free-form string). */
export function isSidebarPreference(value: unknown): value is SidebarPreference {
  return typeof value === "string" && (SIDEBAR_PREFERENCES as readonly string[]).includes(value);
}

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
  try {
    window.localStorage.setItem(SIDEBAR_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    /* preference only — the rail the visitor toggled keeps the choice regardless */
  }
  for (const listener of listeners) listener(preference);
}
