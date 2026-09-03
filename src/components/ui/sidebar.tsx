"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { createInitialDisclosure, disclosureReducer, type DisclosureState } from "./state";

/**
 * Sidebar (UI-03 — Shared UI Primitives).
 *
 * The adaptive/workspace side-rail container primitive. It exposes a real
 * disclosure toggle (button with `aria-expanded`/`aria-controls`) so the
 * collapsed state is conveyed semantically — never styling-only.
 *
 * Contract:
 *  - Props-driven: the composer controls `collapsible`, `collapsed` (initial
 *    state), the toggle label, the landmark label, and the panel `id`
 *    (deterministic; avoids `useId` for SSR-safe testing).
 *  - This primitive has NO rail/icon/branding/breakpoint policy. The rail
 *    content stays in the DOM regardless of collapse state — a rail is
 *    document/semantic content, not a modal (unlike `Drawer`).
 *
 * Responsive interplay (expanded → collapsed → mobile drawer) is UI-04's
 * shell-engine responsibility; this primitive owns rail disclosure semantics.
 */
export interface SidebarProps {
  /** Rail content (navigation items, composer-supplied). */
  readonly children: ReactNode;
  /** Accessible label for the rail landmark. */
  readonly label: string;
  /** Deterministic id for the rail panel (composer-provided). */
  readonly id?: string;
  /** Whether the rail is user-collapsible. */
  readonly collapsible?: boolean;
  /** Initial collapsed state (default: false). */
  readonly collapsed?: boolean;
  /** Label for the collapse toggle button (localized by composer). */
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
        >
          {toggleLabel}
        </button>
      ) : null}
      <div id={`${id}-panel`}>{children}</div>
    </nav>
  );
}