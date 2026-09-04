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
}

export function ShellMobileNav({ pattern, triggerLabel, id, children, className }: ShellMobileNavProps) {
  const [open, setOpen] = useState(createInitialDisclosure(false));
  const toggle = () => setOpen((current) => disclosureReducer(current, { type: "toggle" }));

  // B1 (UI-10): the trigger owns the deterministic `id`; the dialog/panel uses
  // the corresponding `${id}-panel` id and is NAMED BY the trigger
  // (`aria-labelledby={id}`). `aria-controls` then resolves to a real panel id,
  // and the drawer/overlay primitive can locate the invoking trigger via that
  // relationship for focus-return.
  return (
    <div className={className}>
      <button
        type="button"
        id={id}
        aria-expanded={open === "open"}
        aria-controls={`${id}-panel`}
        onClick={toggle}
        className="md:hidden"
      >
        {triggerLabel}
      </button>
      {pattern === "overlay" ? (
        <OverlayNavigation open={open === "open"} onClose={() => setOpen("closed")} labelledBy={id} id={`${id}-panel`}>
          {children}
        </OverlayNavigation>
      ) : (
        <Drawer open={open === "open"} onClose={() => setOpen("closed")} labelledBy={id} id={`${id}-panel`}>
          {children}
        </Drawer>
      )}
    </div>
  );
}