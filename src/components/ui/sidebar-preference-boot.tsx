import { sidebarPreferenceBootScript } from "./sidebar-contract";

/**
 * THE PRE-PAINT SIDEBAR PREFERENCE BRIDGE (UI1-A2) — a server-rendered inline script, and nothing else.
 *
 * WHY IT EXISTS. The sidebar's open/closed preference is browser-local, so a statically generated document
 * necessarily arrives as the canonical CLOSED rail. Adopting the visitor's OPEN preference in React is too
 * late to be invisible: the canonical rail has already been painted, so the visitor sees the sidebar appear
 * CLOSED and then expand (the owner-reported refresh flicker). This component closes that gap with the
 * smallest thing that can: one synchronous script, rendered as the FIRST element of `<body>`, i.e. before
 * any shell markup exists, so the marker it sets is already in place when the rail is first painted.
 *
 * WHAT IT IS NOT. It is not a second state system and not a second authority:
 *
 *   · it reads the SAME key, the SAME vocabulary and the SAME contract as the runtime
 *     (`./sidebar-contract` — one authority, no duplicated literals);
 *   · it only APPLIES the visitor's OPEN preference, synchronously, once, before React exists — the
 *     stylesheet turns the canonical CLOSED rail into the OPEN presentation for that boot interval, so the
 *     first meaningful paint is the visitor's own state and no CLOSED→OPEN geometry change ever happens;
 *   · it is relinquished the moment a rail represents the resolved runtime preference
 *     (`relinquishSidebarPreferenceBoot`, called from `./sidebar`), after which the rail's own
 *     `data-collapsed` state drives everything — toggling, navigation and every later document lifetime
 *     behave exactly as before;
 *   · a missing, invalid or unreadable preference does nothing at all, which is the canonical CLOSED
 *     presentation, so blocked storage cannot break rendering or page execution.
 *
 * It is rendered only where the composition actually produces a navigation rail (see the `[[...segments]]`
 * layout), so a deployment whose shell has no rail ships no bridge, no marker and — deliberately — no
 * hydration-suppression surface either.
 */
export function SidebarPreferenceBoot() {
  return <script dangerouslySetInnerHTML={{ __html: sidebarPreferenceBootScript() }} />;
}
