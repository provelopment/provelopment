/**
 * THE SIDEBAR PREFERENCE CONTRACT (FOUNDATION-UI1 / UI1-A2) — the ONE authority for how the rail's
 * visitor-owned open/closed preference is spelled.
 *
 * WHY IT LIVES HERE, beside the primitive. The shared UI primitives are deliberately configuration-, core-,
 * adapter- and app-free (asserted by `tests/architecture/boundaries.test.ts`), and the sidebar's runtime
 * preference module is one of them. The preference therefore has exactly ONE spelling, declared in this
 * sibling module and consumed by BOTH readers inside this directory — the runtime that resolves and
 * remembers it while the application is alive (`./sidebar-preference`) and the synchronous pre-paint bridge
 * that applies it before the rail is first painted (`./sidebar-preference-boot`) — so no second copy of the
 * key can ever drift from the first.
 *
 * WHAT IT IS. The persistent navigation rail's open/closed state is a PRESENTATION PREFERENCE the visitor
 * owns: not route, page, site, locale or location state. It is remembered browser-locally, so the same
 * visitor keeps the same sidebar across a destination, a site change and a reload — and no route becomes
 * dynamic, because nothing about it reaches the server.
 *
 * The contract is three facts:
 *
 *   KEY         `foundation.sidebar` — stable and Foundation-owned, with no route, site, locale or location
 *               in it, so every path of an origin shares one preference.
 *   VOCABULARY  exactly `"open"` and `"closed"` — the whole language. Anything else (a missing key, a
 *               retired value, storage that cannot be read) means NO USABLE PREFERENCE, and the rail stays
 *               in the platform's canonical CLOSED state.
 *   BOOT MARKER `data-ui-sidebar-preference` on `<html>` — the inert attribute the synchronous pre-paint
 *               bridge writes (see `sidebarPreferenceBootScript`). It is a CSS hook for the boot interval
 *               only; the rail's own `data-collapsed` remains the state authority once React is running.
 *
 * Framework-free by design: pure constants, a pure type guard and the boot script source as a string. It
 * imports nothing at all — no React, Next.js, Tailwind, configuration, core or adapters.
 */

/** Browser-local storage key for the sidebar presentation preference. */
export const SIDEBAR_PREFERENCE_STORAGE_KEY = "foundation.sidebar";

/** The whole vocabulary. This list IS the language: open, or closed. */
export const SIDEBAR_PREFERENCES = ["open", "closed"] as const;

export type SidebarPreference = (typeof SIDEBAR_PREFERENCES)[number];

/** Whether a value is a preference this platform implements (never a free-form name). */
export function isSidebarPreference(value: unknown): value is SidebarPreference {
  return typeof value === "string" && (SIDEBAR_PREFERENCES as readonly string[]).includes(value);
}

/**
 * The inert attribute the pre-paint bridge sets on `<html>` while a document's boot presentation is the
 * visitor's OPEN preference. It carries the same vocabulary as storage and is removed as soon as the React
 * runtime represents the resolved preference, so it can never compete with the rail's own `data-collapsed`.
 */
export const SIDEBAR_PREFERENCE_ATTRIBUTE = "data-ui-sidebar-preference";

/** The one value the bridge applies: the canonical CLOSED rail needs no bridge at all. */
const SIDEBAR_PREFERENCE_BOOT_VALUE: SidebarPreference = "open";

/**
 * The SYNCHRONOUS PRE-PAINT BRIDGE, as the source of one inline script.
 *
 * Why a script at all: the visitor's preference lives in the browser, so a STATICALLY GENERATED document
 * cannot know it — the server renders the canonical CLOSED rail (that is what keeps every page prerendered,
 * with no cookie, session, request-time branch or middleware). The preference therefore has to be applied in
 * the browser, and it has to be applied EARLIER than React can: by the time hydration reaches the rail, the
 * canonical geometry has already been painted.
 *
 * The script is deliberately the smallest thing that can do that:
 *
 *   · it runs while the document is being parsed, before the rail's markup exists, so the marker is already
 *     set when the rail is first laid out and painted;
 *   · it reads the SAME key and the SAME vocabulary as the runtime (never a copy, never a second contract);
 *   · it only ever APPLIES `open`. A missing, invalid or unreadable preference does nothing at all, which is
 *     exactly the canonical CLOSED presentation — so blocked storage degrades to the platform's own answer
 *     instead of breaking rendering;
 *   · it never throws and never writes: a storage failure is caught, and nothing is mutated except the one
 *     inert attribute.
 */
export function sidebarPreferenceBootScript(): string {
  return [
    "try{",
    `var v=window.localStorage.getItem(${JSON.stringify(SIDEBAR_PREFERENCE_STORAGE_KEY)});`,
    `if(v===${JSON.stringify(SIDEBAR_PREFERENCE_BOOT_VALUE)})`,
    `{document.documentElement.setAttribute(${JSON.stringify(SIDEBAR_PREFERENCE_ATTRIBUTE)},v)}`,
    "}catch(e){}",
  ].join("");
}
