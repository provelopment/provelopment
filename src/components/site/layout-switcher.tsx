"use client";

import { useEffect, useRef } from "react";

import {
  SHELL_LAYOUT_ATTRIBUTE,
  SHELL_LAYOUT_STORAGE_KEY,
  SHELL_LAYOUTS,
  isShellLayout,
  type ShellLayout,
} from "@/core/ui";

/**
 * THE SHELL LAYOUT PRESENTATION CONTROL (N2).
 *
 * A visitor choosing between the site's two shell layouts — Sidebar and Menu bar —
 * through one conventional labelled `<select>`. It is a PRESENTATION control and
 * nothing else:
 *
 *  - it changes no content, no route, no locale and no page source: it sets the
 *    inert `data-ui-shell-layout` attribute on `<html>`, which the stylesheet uses to
 *    expose exactly one of the composed navigation structures;
 *  - it never re-renders the page tree, so React hydration is unaffected: the
 *    attribute is DOM state the server already emits for the configured default, and
 *    the only React state here is the control's own selected option;
 *  - the preference is remembered in browser-local storage (layout preference only —
 *    no identity, no session, no server state, so no route becomes dynamic). Storage
 *    that is unavailable, blocked or holds a value the vocabulary does not declare
 *    falls back cleanly to the configured default;
 *  - the value is validated with `isShellLayout`, so an arbitrary value can never be
 *    applied — not from the control and not from storage.
 *
 * Keyboard operation, focus and the visible focus ring come from the native control
 * and the ONE global focus contract (`select[data-selector]`), exactly as the
 * language and location selectors beside it.
 */
export interface LayoutSwitcherProps {
  /** Accessible name for the control (localized group label, e.g. "Layout"). */
  readonly label: string;
  /** The layout the server rendered — the value before any stored preference. */
  readonly defaultLayout: ShellLayout;
  /** Localized option labels, keyed by layout. */
  readonly labels: Readonly<Record<ShellLayout, string>>;
}

/** Name the active layout on `<html>`. Idempotent, and the ONLY DOM change made. */
function applyLayout(layout: ShellLayout): void {
  const root = document.documentElement;
  if (root.getAttribute(SHELL_LAYOUT_ATTRIBUTE) === layout) return;
  root.setAttribute(SHELL_LAYOUT_ATTRIBUTE, layout);
}

/** The remembered layout, or `null` when unavailable, unreadable or not a layout. */
function readStoredLayout(): ShellLayout | null {
  try {
    const stored = window.localStorage.getItem(SHELL_LAYOUT_STORAGE_KEY);
    return isShellLayout(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Remember the choice. A storage failure is never an error: the site still switches. */
function storeLayout(layout: ShellLayout): void {
  try {
    window.localStorage.setItem(SHELL_LAYOUT_STORAGE_KEY, layout);
  } catch {
    /* preference only — the current page keeps the visitor's choice regardless */
  }
}

export function LayoutSwitcher({ label, defaultLayout, labels }: LayoutSwitcherProps) {
  const selectRef = useRef<HTMLSelectElement>(null);

  // Apply a remembered choice AFTER hydration (never during render, so the server's
  // markup and the first client render agree). Focus cannot be stranded: at this point
  // the document is loading and focus is on the document body.
  useEffect(() => {
    const stored = readStoredLayout();
    if (stored === null || stored === defaultLayout) return;
    applyLayout(stored);
    // Reflect the remembered choice in the control. The select is deliberately
    // UNCONTROLLED: its truth is browser-local (the configured default until the
    // visitor chooses otherwise), so no React state is needed, nothing re-renders, and
    // hydration can never disagree with the server.
    if (selectRef.current) selectRef.current.value = stored;
  }, [defaultLayout]);

  function handleChange(next: string): void {
    if (!isShellLayout(next)) return;
    applyLayout(next);
    storeLayout(next);
  }

  return (
    <select
      ref={selectRef}
      aria-label={label}
      data-selector="layout"
      data-ui-layout-switcher=""
      defaultValue={defaultLayout}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      {SHELL_LAYOUTS.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  );
}
