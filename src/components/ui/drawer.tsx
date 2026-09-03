"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Drawer (UI-03 — Shared UI Primitives).
 *
 * The generic client overlay/menu primitive — the single implementation behind
 * the roadmap's "MobileDrawer" / narrow-viewport drawer and overlay menus
 * (roadmap §4; naming note: `Drawer` is the generic primitive; the roadmap's
 * "MobileDrawer" and "OverlayNavigation" are responsive/compositional uses of
 * this same dialog behavior, not separate implementations).
 *
 * Contract:
 *  - Deterministic SSR-safe initial state: CLOSED. When `open === false`,
 *    NOTHING is rendered — no hidden focusable content, no flash on load.
 *  - When open, renders `role="dialog"` + `aria-modal="true"` +
 *    `aria-labelledby` using the composer-supplied `labelledBy` id.
 *  - Keyboard: `Escape` closes (bound while open). Essential behavior is
 *    implemented here; the full focus-trap / focus-return / scroll-lock matrix
 *    is a UI-10 browser-validation gate (mandatory).
 *  - Motion: no animation logic inside; the global `prefers-reduced-motion`
 *    rule already strips any CSS transitions.
 *
 * Props-driven and preset-agnostic. The composer owns the trigger's
 * `aria-haspopup`/`aria-expanded`/`aria-controls` — the Drawer only manages
 * open/close state and dialog semantics. The `id` is composer-provided
 * (deterministic; avoids `useId`, which is unavailable under
 * `renderToStaticMarkup` and would break SSR-safe markup testing).
 */
export interface DrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** id of the element that names this dialog (the composer's trigger/label). */
  readonly labelledBy: string;
  /** Deterministic id for the dialog panel (composer-provided). */
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Drawer({ open, onClose, labelledBy, id, children, className }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} id={id} className={className}>
      {children}
    </div>
  );
}