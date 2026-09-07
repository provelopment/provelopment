"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { Drawer } from "@/components/ui/drawer";
import { OverlayNavigation } from "@/components/ui/overlay-navigation";
import { createInitialDisclosure, disclosureReducer } from "@/components/ui/state";

/**
 * ShellMobileNav (UI-04 — Shell Engine).
 *
 * The interactive mobile navigation layer: a trigger button (visible below
 * the engine's breakpoint) plus the client dialog primitive (Drawer or
 * OverlayNavigation per the resolved mobile pattern). Composes the shared
 * primitives from UI-03; owns NO preset policy and NO business rules — the
 * trigger label, ids, children (items) and pattern come from the composer.
 *
 * Deterministic SSR-safe behavior: the dialog is CLOSED by default and renders
 * nothing server-side; the trigger conveys state via aria-expanded/aria-controls.
 * Full focus-trap/focus-return/Escape/scroll-lock behavioral matrix is the
 * mandatory UI-10 browser gate.
 */
/** P5-1 — recognizable "open sidebar" icon (a sidebar panel + rows). Stroke-based,
 * token-colored (`currentColor`), decorative (`aria-hidden`): the visible label is the
 * accessible name, so the control never needs a separate tooltip/visually-hidden text. */
function SidebarOpenIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="ui-mobile-nav-icon h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M7.5 9.5h9M7.5 13h9M7.5 16.5h4.5" />
    </svg>
  );
}

/** P5-1 — recognizable "close sidebar" icon (an X). Same decorative contract. */
function SidebarCloseIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="ui-mobile-nav-icon h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M6 6L18 18M18 6L6 18" />
    </svg>
  );
}

export interface ShellMobileNavProps {
  /** "drawer" or "overlay" — which client dialog primitive to compose. */
  readonly pattern: "drawer" | "overlay";
  /** Accessible label for the trigger button. */
  readonly triggerLabel: string;
  /** Deterministic id for the trigger (aria-controls targets the panel). */
  readonly id: string;
  /** Nav content rendered inside the open dialog. */
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * P0-1 (owner-approved sidebar contract): optional explicit close control
   * label (e.g. "Close Sidebar"). When set, a clearly identifiable close
   * button is rendered AFTER the children at the bottom of the open
   * disclosure, wired to the SAME Drawer close mechanism (onClose → the UI-10
   * focus-return/inert/scroll contract). Consumers opt in; an absent label
   * renders no control and changes nothing.
   */
  readonly closeLabel?: string;
}

export function ShellMobileNav({ pattern, triggerLabel, id, children, className, closeLabel }: ShellMobileNavProps) {
  const [open, setOpen] = useState(createInitialDisclosure(false));
  const toggle = () => setOpen((current) => disclosureReducer(current, { type: "toggle" }));
  const close = () => setOpen("closed");

  const dialogContent = (
    <>
      {children}
      {closeLabel ? (
        <button
          type="button"
          onClick={close}
          className="ui-drawer-close mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <SidebarCloseIcon />
          {closeLabel}
        </button>
      ) : null}
    </>
  );

  return (
    <div className={className}>
      <button
        type="button"
        id={id}
        aria-expanded={open === "open"}
        aria-controls={`${id}-panel`}
        onClick={toggle}
        className="ui-shell-mobile-nav-trigger inline-flex items-center gap-1.5 md:hidden"
      >
        <SidebarOpenIcon />
        {triggerLabel}
      </button>
      {pattern === "overlay" ? (
        <OverlayNavigation
          open={open === "open"}
          onClose={close}
          labelledBy={id}
          id={`${id}-panel`}
          // P0-1: the overlay pattern is sized content-appropriately (a
          // sidebar that hugs its labels, not a full-width strip) via this
          // scoping class; the shared Drawer primitive and its panel CSS are
          // unchanged.
          className="ui-overlay-panel"
        >
          {dialogContent}
        </OverlayNavigation>
      ) : (
        <Drawer open={open === "open"} onClose={close} labelledBy={id} id={`${id}-panel`}>
          {dialogContent}
        </Drawer>
      )}
    </div>
  );
}