"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { createInitialDisclosure, disclosureReducer, type DisclosureState } from "./state";

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
 * Shared semantics, preset-agnostic: `collapsible === true` means the same
 * thing in every preset/custom composition (the preset only supplies the
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
  /** Label for the collapse/expand toggle button (localized by composer). */
  readonly toggleLabel?: string;
  readonly className?: string;
}

export function Sidebar({
  children,
  label,
  id = "sidebar",
  collapsible = false,
  collapsed = false,
  toggleLabel = "Toggle sidebar",
  className,
}: SidebarProps) {
  const [state, setState] = useState<DisclosureState>(() => createInitialDisclosure(!collapsed));
  const isCollapsed = collapsible ? state === "closed" : collapsed;

  return (
    <nav aria-label={label} id={`${id}-rail`} className={className}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setState((current) => disclosureReducer(current, { type: "toggle" }))}
          aria-expanded={!isCollapsed}
          aria-controls={`${id}-panel`}
          className="ui-sidebar-toggle inline-flex w-full items-center gap-1.5 px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {toggleLabel}
        </button>
      ) : null}
      {/* P0-1 structural collapse: a collapsed panel contributes nothing to
          layout or the tab order; the toggle above remains to restore it. */}
      <div id={`${id}-panel`} className={isCollapsed ? "hidden" : undefined}>
        {children}
      </div>
    </nav>
  );
}