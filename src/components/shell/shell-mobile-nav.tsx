"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { DisclosureIcon } from "@/components/ui/disclosure-icon";
import {
  DEFAULT_SIDEBAR_CLOSE_ICON,
  DEFAULT_SIDEBAR_OPEN_ICON,
  resolveControlPresentation,
  SHELL_LAYOUT_ATTRIBUTE,
} from "@/core/ui";
import { Drawer } from "@/components/ui/drawer";
import { OverlayNavigation } from "@/components/ui/overlay-navigation";
import { createInitialDisclosure, disclosureReducer } from "@/components/ui/state";

/**
 * ShellMobileNav (UI-04 — Shell Engine).
 *
 * The interactive mobile navigation layer: a trigger button (visible below
 * the engine's breakpoint) plus the client dialog primitive (Drawer or
 * OverlayNavigation per the resolved mobile pattern). Composes the shared
 * primitives from UI-03; owns NO presentation policy and NO business rules — the
 * trigger label, ids, children (items) and pattern come from the composer.
 *
 * Deterministic SSR-safe behavior: the dialog is CLOSED by default and renders
 * nothing server-side; the trigger conveys state via aria-expanded/aria-controls.
 * Full focus-trap/focus-return/Escape/scroll-lock behavioral matrix is the
 * mandatory UI-10 browser gate.
 */
/**
 * P5-5/P6-1 — one configurable icon+text disclosure control (open or close).
 *
 * `resolveControlPresentation` applies the documented empty-string semantics:
 * missing icon → shipped default asset; `icon: ""` → no icon; missing text →
 * the localized fallback label; `text: ""` → icon-only (the accessible name
 * stays the fallback label via `aria-label`); both `""` → not rendered. The
 * `ui-mobile-nav-icon` marker is preserved on the icon asset so the P5-1
 * browser contract (recognizable open/close icons) is unchanged. The icon is
 * rendered through the SHARED `DisclosureIcon` (the same element as the
 * desktop/tablet rail toggle in `Sidebar`), whose framework caller already
 * screened the filename against public/assets — never a broken image.
 */

export interface ShellMobileNavProps {
  /** "drawer" or "overlay" — which client dialog primitive to compose. */
  readonly pattern: "drawer" | "overlay";
  /** Accessible label for the trigger button (fallback name for icon-only). */
  readonly triggerLabel: string;
  /** Deterministic id for the trigger (aria-controls targets the panel). */
  readonly id: string;
  /** Nav content rendered inside the open dialog. */
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * N2/NAV1A — inert layout-scope markers (`data-ui-shell-part` /
   * `data-ui-shell-layouts`) describing the layouts THIS disclosure is the mobile
   * navigation for. The stylesheet exposes exactly one mobile surface per active
   * layout, so a disclosure that belongs to another layout is `display: none` and
   * therefore outside the accessibility tree and the tab order. Absent → no
   * attributes at all (a one-composition site is byte-identical).
   */
  readonly scope?: Readonly<Record<string, string>>;
  /**
   * NAV1A — the layouts this disclosure presents. While it is OPEN, the active
   * layout is watched on `<html>` (`SHELL_LAYOUT_ATTRIBUTE`, the inert attribute
   * the visitor's control rewrites): when the active layout stops naming one of
   * these, the disclosure is WITHDRAWN, so it must also become CLOSED — an
   * invisible-but-open dialog would otherwise keep the body scroll lock and the
   * background `inert` applied to a page the visitor is looking at. Absent (or
   * empty) → the disclosure never withdraws itself (unchanged behaviour).
   */
  readonly activeLayouts?: readonly string[];
  /**
   * P5-5 — configurable OPEN control (`navigation.sidebar.open`): icon asset
   * filename and/or visible text. Missing leaves fall back to the shipped
   * asset + `triggerLabel`; `text: ""` → icon-only; `icon: ""` + `text: ""` →
   * the trigger is not rendered at all.
   */
  readonly open?: { readonly icon?: string; readonly text?: string };
  /**
   * P0-1/P5-5/P6-1 — the "Hide navigation" control, with the SAME configurable
   * presentation as the open control. Wired to the Drawer close mechanism.
   */
  readonly close?: { readonly icon?: string; readonly text?: string };
  /** P5-5 — localized fallback label for the close control. */
  readonly closeLabel?: string;
}

export function ShellMobileNav({
  pattern,
  triggerLabel,
  id,
  children,
  className,
  scope,
  activeLayouts,
  open,
  close,
  closeLabel,
}: ShellMobileNavProps) {
  const [openState, setOpen] = useState(createInitialDisclosure(false));
  const toggle = () => setOpen((current) => disclosureReducer(current, { type: "toggle" }));
  const closeDisclosure = () => setOpen("closed");

  // NAV1A — withdraw a disclosure whose layout is no longer active. The active layout is the ONE
  // inert attribute the visitor's control rewrites (`SHELL_LAYOUT_ATTRIBUTE`), so the gate needs no
  // second source of truth and no cross-component wiring. A disclosure only ever OPENS while its own
  // layout is active (that layout's trigger is the thing the visitor just pressed), so the contract
  // is about the change that follows: an attribute rewrite that stops naming one of THIS disclosure's
  // layouts closes it, releasing the body scroll lock and the background `inert` the dialog applied.
  // A single-composition site emits no attribute at all, so nothing here ever runs for it; the
  // layouts are compared by VALUE (a joined key), so a parent re-render with an equal list never
  // re-installs the observer.
  const activeLayoutKey = activeLayouts && activeLayouts.length > 0 ? activeLayouts.join(",") : null;
  useEffect(() => {
    if (openState !== "open" || activeLayoutKey === null) return;
    const layouts = activeLayoutKey.split(",");
    const observer = new MutationObserver(() => {
      const active = document.documentElement.getAttribute(SHELL_LAYOUT_ATTRIBUTE);
      if (active !== null && !layouts.includes(active)) setOpen("closed");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [SHELL_LAYOUT_ATTRIBUTE],
    });
    return () => observer.disconnect();
  }, [openState, activeLayoutKey]);

  // P5-5 — both controls resolve through the SAME presentation helper. The
  // shipped default assets (`/assets/sidebar-open.svg` / close) are
  // replaceable in place, or via the configured filename.
  const openControl = resolveControlPresentation(open ?? {}, {
    defaultIcon: DEFAULT_SIDEBAR_OPEN_ICON,
    fallbackText: triggerLabel,
  });
  const closeControl = resolveControlPresentation(close ?? {}, {
    defaultIcon: DEFAULT_SIDEBAR_CLOSE_ICON,
    fallbackText: closeLabel ?? "Hide navigation",
  });

  const dialogContent = (
    <>
      {children}
      {closeControl.visible ? (
        <button
          type="button"
          onClick={closeDisclosure}
          aria-label={closeControl.text === "" ? (closeLabel ?? "Close navigation") : undefined}
          className="ui-drawer-close mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <DisclosureIcon asset={closeControl.icon} className="ui-mobile-nav-icon h-8 w-8 shrink-0" />
          {closeControl.text === "" ? null : <span>{closeControl.text}</span>}
        </button>
      ) : null}
    </>
  );

  return (
    <div className={className} {...scope}>
      {openControl.visible ? (
        <button
          type="button"
          id={id}
          aria-expanded={openState === "open"}
          aria-controls={`${id}-panel`}
          onClick={toggle}
          aria-label={openControl.text === "" ? triggerLabel : undefined}
          // VIS1C — a >= 44x44 CSS-pixel HIT AREA on the mobile trigger. The control
          // is the drawer's only entry point on a phone, so a 32px target (the
          // icon's own height) is too small to hit reliably. `min-h-11 min-w-11`
          // grows the INTERACTIVE box, not the artwork: the icon keeps its `h-8 w-8`
          // visual scale and is centred inside the larger target.
          // NAV1B — the disclosure's HOST owns its width gate (the composition's band), so the
          // trigger itself carries none: it is a normal navigation control at the scale of the
          // rail's own toggle (`text-sm` label, 24px icon via `--ui-sidebar-control-icon-size`,
          // ≥44px hit area), and it never grows with the typography around it.
          className="ui-shell-mobile-nav-trigger inline-flex min-h-11 min-w-11 items-center gap-1.5"
        >
          <DisclosureIcon asset={openControl.icon} className="ui-mobile-nav-icon h-8 w-8 shrink-0" />
          {openControl.text === "" ? null : <span>{openControl.text}</span>}
        </button>
      ) : null}
      {pattern === "overlay" ? (
        <OverlayNavigation
          open={openState === "open"}
          onClose={closeDisclosure}
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
        <Drawer open={openState === "open"} onClose={closeDisclosure} labelledBy={id} id={`${id}-panel`}>
          {dialogContent}
        </Drawer>
      )}
    </div>
  );
}