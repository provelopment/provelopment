"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

import { DisclosureIcon } from "./disclosure-icon";
import {
  resolveSidebarPreference,
  resolvedSidebarPreference,
  storeSidebarPreference,
  subscribeSidebarPreference,
  type SidebarPreference,
} from "./sidebar-preference";
import {
  DISCLOSURE_CLOSED,
  DISCLOSURE_OPEN,
  createInitialDisclosure,
  disclosureReducer,
  type DisclosureState,
} from "./state";

/**
 * A LAYOUT effect on the client and an INERT one on the server.
 *
 * The stored preference must be adopted BEFORE THE FIRST PAINT (see the state contract below), which
 * is what a layout effect is for — but the server has no browser to read it from, and React warns when
 * `useLayoutEffect` runs during a server render. This is the standard reconciliation: server rendering
 * keeps the declared initial state (the value the markup already carries), the client corrects it in
 * the same commit, before anything is painted.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The stored vocabulary of a disclosure state, and back — two words, mapped explicitly. */
function preferenceOf(state: DisclosureState): SidebarPreference {
  return state === DISCLOSURE_CLOSED ? "closed" : "open";
}

function stateOf(preference: SidebarPreference): DisclosureState {
  return preference === "closed" ? DISCLOSURE_CLOSED : DISCLOSURE_OPEN;
}

/**
 * THE STATE THE FIRST RENDER USES (UI1-A1).
 *
 * A rail that this DOCUMENT has already resolved a preference for renders that resolved state immediately —
 * a rail created by a client-side navigation is therefore never created in the canonical state and then
 * corrected. That correction is what the visitor saw: committing `data-collapsed="true"` and adopting the
 * stored `open` in the same commit starts the rail's `width 200ms` CSS transition, so an open rail
 * collapsed and expanded again on every navigation.
 *
 * `resolvedSidebarPreference()` never reads storage (see `./sidebar-preference`), so this is render-safe in
 * both senses that matter:
 *   · a FRESH document has resolved nothing, so the declared initial state is rendered — exactly the state
 *     the server's markup carries, so hydration still agrees with it, and the stored preference is adopted
 *     by the effect below as before;
 *   · a rail created later in the SAME document (a navigation) renders the resolved state, so no correction
 *     — and therefore no transition and no visible transient — exists at all.
 */
function initialDisclosureState(collapsible: boolean, collapsed: boolean): DisclosureState {
  if (!collapsible) return createInitialDisclosure(!collapsed);
  const resolved = resolvedSidebarPreference();
  return resolved === null ? createInitialDisclosure(!collapsed) : stateOf(resolved);
}


/**
 * Sidebar (UI-03 — Shared UI Primitives; P0-1 — global Sidebar capability).
 *
 * The persistent aside navigation rail container, and the single capability
 * behind every sidebar composition (desktop `sidebar`, tablet
 * `collapsed-sidebar`, immersive `floating` aside). It exposes a real
 * disclosure toggle (button with `aria-expanded`/`aria-controls`) so the
 * collapsed state is conveyed semantically.
 *
 * P0-1 contract (owner-approved; see plan/ui-ux-*.md):
 *  - `collapsible: true` means STRUCTURAL collapse — the panel is removed from
 *    layout and the tab order (`display:none` via the `hidden` Tailwind class)
 *    while the rail stays rendered as a reduced region. This is not an
 *    aria-only flip: a collapsed rail contains no focusable panel content.
 *  - The toggle is ALWAYS present when `collapsible` (a collapsed rail is never
 *    a dead-end): one discoverable, keyboard-accessible button conveys the
 *    current state (`aria-expanded`) and controls the panel (`aria-controls`).
 *  - `collapsed` is the INITIAL state only (true for `collapsed-sidebar`
 *    compositions, which by definition render collapsed and are expandable).
 *  - This primitive has NO rail/icon/branding/breakpoint policy. The rail
 *    content stays in the DOM regardless of collapse state — a rail is
 *    document/semantic content, not a modal (unlike `Drawer`).
 *  - Responsive interplay (expanded → collapsed → mobile overlay) is the
 *    shell-engine's composition responsibility; this primitive owns rail
 *    disclosure semantics.
 *
 * P6-1 — ONE sidebar vocabulary + ONE control contract on every breakpoint:
 *  - The toggle label FLIPS with state: `showLabel` when the rail is collapsed
 *    ("Show navigation" — the action that opens it), `hideLabel` when open
 *    ("Hide navigation"). The same two concepts drive the mobile drawer/overlay
 *    trigger + close control (ShellMobileNav), so desktop/tablet/mobile always
 *    say the same thing.
 *  - `open`/`close` are the ALREADY-RESOLVED control presentations
 *    (`{ icon, text }`, empty-string semantics identical to the mobile
 *    contract): missing leaves fell back in the composer to the shipped asset +
 *    the localized label; `text: ""` → icon-only (decorative icon, accessible
 *    name via `aria-label`); `icon: ""` → text-only (no `<img>`); BOTH `""` →
 *    P0-1 still wins: the toggle stays reachable with the localized label.
 *  - The toggle is a REAL interactive control (shared `.ui-sidebar-toggle`
 *    renderer styling: border, surface, hover/focus-visible/active affordance,
 *    pointer cursor) so it never reads as ordinary static heading text.
 *
 * UI1 — PERSISTENT PRESENTATION STATE. The rail's open/closed state is a VISITOR PREFERENCE — not
 * route, page, site, locale or content state. It is remembered in browser-local storage
 * (`./sidebar-preference`: key `foundation.sidebar`, values `open`/`closed`) and adopted once per
 * mount BEFORE the first paint, so a document reload and a client-side navigation both arrive in the
 * state the visitor left behind. ONLY the toggle changes it: a navigation click navigates, and never
 * opens, closes or resets the rail. The canonical no-preference state is CLOSED, declared by the
 * composer (the shell engine) rather than inferred here.
 *
 * PERSISTENT NAVIGATION — the rail's CONTENT COLUMN (this component's
 * `.ui-sidebar-rail-sticky`) is the persistent element: it stays in view while
 * the page scrolls and scrolls on its own when the navigation is taller than the
 * viewport (globals.css — persistent navigation). It changes no disclosure
 * semantics, no id and no geometry — it is a plain block that wraps the toggle
 * and the panel, so every inset measures exactly as before, and the rail's own
 * full-height box (and its divider) is untouched. Where a rail is composed, it —
 * not the shell's top region — carries the persistent navigation.
 *
 * Shared semantics, presentation-agnostic: `collapsible === true` means the same
 * thing in every Presentation/custom composition (the Presentation only supplies the
 * value). The UI-10 behavioral matrix covers focus/keyboard/scroll for the
 * MOBILE disclosure (a Drawer); this rail is not a modal.
 */
export interface SidebarProps {
  /** Rail content (navigation items, composer-supplied). */
  readonly children: ReactNode;
  /** Accessible label for the rail landmark. */
  readonly label: string;
  /** Deterministic id for the rail panel (composer-provided). */
  readonly id?: string;
  /** Whether the rail is user-collapsible (structural collapse + expand). */
  readonly collapsible?: boolean;
  /** Initial collapsed state (default: false). */
  readonly collapsed?: boolean;
  /** P6-1 — localized label shown while collapsed ("Show navigation"). */
  readonly showLabel?: string;
  /** P6-1 — localized label shown while open ("Hide navigation"). */
  readonly hideLabel?: string;
  /**
   * P6-1 — the RESOLVED "show" control presentation (icon + optional visible
   * text), the same shape the mobile trigger uses. Missing leaves resolve in
   * the composer; `text: ""` → icon-only; BOTH `""` → the localized label
   * fallback below (P0-1: a collapsible rail is never a dead-end).
   */
  readonly open?: { readonly icon?: string; readonly text?: string };
  /** P6-1 — the RESOLVED "hide" control presentation (see `open`). */
  readonly close?: { readonly icon?: string; readonly text?: string };
  readonly className?: string;
}

const DEFAULT_SHOW_LABEL = "Show navigation";
const DEFAULT_HIDE_LABEL = "Hide navigation";
export function Sidebar({
  children,
  label,
  id = "sidebar",
  collapsible = false,
  collapsed = false,
  showLabel,
  hideLabel,
  open,
  close,
  className,
}: SidebarProps) {
  const [state, setState] = useState<DisclosureState>(() =>
    initialDisclosureState(collapsible, collapsed),
  );
  const isCollapsed = collapsible ? state === "closed" : collapsed;

  // UI1/UI1-A1 — THE STATE CONTRACT. The RESOLVED preference owned by `./sidebar-preference` is the ONE
  // runtime authority; `state` above is this rail's render of it, and browser storage is only its backing
  // persistence. Nothing else — no route, no navigation, no remount — may reset it.
  //
  // Resolution happens ONCE PER DOCUMENT, in a layout effect, so it lands before the first paint:
  //
  //   · a RELOAD creates a new document, which resolves the stored preference here and adopts it — that is
  //     the whole repair of the reload defect;
  //   · a CLIENT-SIDE NAVIGATION does not re-resolve anything: the document already resolved the
  //     preference, so a replacement rail renders it from its FIRST render (see `initialDisclosureState`)
  //     and this effect is a no-op — no canonical-state commit, no correction, no width transition, and so
  //     no visible OPEN → CLOSED → OPEN flicker (UI1-A1);
  //   · the FIRST client render of a fresh document still renders the declared initial state, so the client
  //     cannot disagree with the server's markup and hydration stays clean;
  //   · `null` means "no usable preference" (see `./sidebar-preference`) and leaves the declared initial
  //     state — the platform's canonical CLOSED state for a composed rail — untouched.
  useIsomorphicLayoutEffect(() => {
    if (!collapsible) return;
    const resolved = resolveSidebarPreference();
    if (resolved === null) return;
    setState(stateOf(resolved));
  }, [collapsible]);

  // ONE STATE, EVERY BAND — the desktop and tablet rails are two instances of the same preference and
  // only one of them is displayed at a time, so a toggle publishes the choice to the hidden instance
  // instead of letting it reappear stale when the viewport crosses the breakpoint.
  useEffect(() => {
    if (!collapsible) return;
    return subscribeSidebarPreference((preference) => setState(stateOf(preference)));
  }, [collapsible]);

  /**
   * The disclosure is changed by ITS OWN CONTROL and by nothing else: no route change, no navigation
   * and no remount may open, close or reset the rail (a navigation click is `navigate(target)`).
   * Toggling records the visitor's choice.
   */
  function toggle(): void {
    const next = disclosureReducer(state, { type: "toggle" });
    setState(next);
    if (collapsible) storeSidebarPreference(preferenceOf(next));
  }

  // P6-1 — the active control follows the STATE: closed → the "show" (open)
  // control; open → the "hide" (close) control. Exactly the mobile contract.
  const active = isCollapsed ? (open ?? {}) : (close ?? {});
  // P0-1 — never-dead-end fallback: with BOTH leaves empty the toggle stays
  // reachable using the localized label (never invisible, never an empty box).
  const fallbackLabel =
    isCollapsed ? showLabel ?? DEFAULT_SHOW_LABEL : hideLabel ?? DEFAULT_HIDE_LABEL;
  // P5-5/P6-1 empty-string semantics — the two "no text" states are NOT the
  // same thing, and conflating them is a bug:
  //  - `text: ""` WITH an icon → ICON-ONLY by contract: no visible text is
  //    painted (the accessible name comes from `aria-label`), which is what a
  //    collapsed rail and an adopter who deliberately removed the label rely on;
  //  - `text: ""` with NO icon (both leaves empty) → P0-1 wins and the localized
  //    label is painted, so the toggle can never be an empty, unnamed box;
  //  - `text` ABSENT → the localized `fallbackLabel` is used.
  const icon = active.icon === undefined || active.icon === "" ? undefined : active.icon;
  const iconOnly = active.text === "" && icon !== undefined;
  const visibleText = active.text !== undefined && active.text !== "" ? active.text : "";
  const toggleText = visibleText !== "" ? visibleText : iconOnly ? "" : fallbackLabel;

  return (
    <nav
      aria-label={label}
      id={`${id}-rail`}
      // P6-3A — the rail is PERSISTENT: `data-collapsed` drives a narrow
      // icon-only presentation (CSS width transition) instead of removing the
      // panel. The rail NEVER becomes `display:none`, so navigation stays in
      // the layout and the tab order in both states.
      data-collapsed={isCollapsed ? "true" : "false"}
      className={["ui-sidebar-rail", className].filter(Boolean).join(" ")}
    >
      {/* PERSISTENT NAVIGATION — the rail's CONTENT COLUMN is the persistent
          element. The rail's own box stays a full-height region (its inline-end
          divider still spans the whole shell row — P6-3A/P6-3B, unchanged); this
          inner column is what stays in view while the page scrolls, and it
          scrolls ON ITS OWN when the navigation is taller than the viewport, so
          no destination ever becomes unreachable (globals.css). Geometry is
          deliberately untouched: the column is a plain block of the same content
          width, so every inset (rail padding, control inset, list padding)
          measures exactly as before. */}
      <div className="ui-sidebar-rail-sticky">
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!isCollapsed}
            aria-controls={`${id}-panel`}
            // Icon-only controls (visible text "" with an icon) keep the
            // accessible name from the localized label; decorative icon.
            aria-label={visibleText === "" && icon !== undefined ? fallbackLabel : undefined}
            className="ui-sidebar-toggle"
          >
            <DisclosureIcon asset={icon} className="ui-sidebar-toggle-icon" />
            {toggleText !== "" ? <span>{toggleText}</span> : null}
          </button>
        ) : null}
        {/* P6-3A persistent rail: the panel is ALWAYS rendered. Collapse narrows
            the rail horizontally (CSS) rather than hiding the panel — labels are
            visually hidden (but kept for assistive tech) only for icon-bearing
            items; icon-less items keep their labels so no destination becomes
            invisible/inaccessible while nav icons are unconfigured. */}
        <div id={`${id}-panel`} className="ui-sidebar-rail-panel">
          {children}
        </div>
      </div>
    </nav>
  );
}