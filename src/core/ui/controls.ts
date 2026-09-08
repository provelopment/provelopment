import type { MenuMode, NavRegion } from "./vocabulary";

/**
 * P5-5 — Configurable control & menu presentation helpers (framework-neutral).
 *
 * Pure helpers that turn the RESOLVED control/menu intent into the small set
 * of semantic strings the shared renderer consumes: an icon asset URL (a plain
 * filename → `/assets/<name>`), a control's visible/accessible presentation
 * (explicit `""` = deliberately hidden element; undefined = foundation
 * fallback), and the compact-mode marker class.
 *
 * These helpers never emit CSS or presentational pixels — they only project
 * the resolved intent into the vocabulary-backed class/URL surface.
 */

/** Shipped default sidebar open/close icon assets (replaceable in place). */
export const DEFAULT_SIDEBAR_OPEN_ICON = "sidebar-open.svg";
export const DEFAULT_SIDEBAR_CLOSE_ICON = "sidebar-close.svg";

/** Public URL for a configured icon asset (plain filename → `/assets/<name>`). */
export function iconAssetUrl(name: string | undefined): string | undefined {
  if (!name || name === "") return undefined;
  return `/assets/${name}`;
}

/**
 * The RESOLVED presentation of one icon+text control (e.g. the sidebar
 * open/close disclosure).
 *
 * Empty-string semantics (P5-5, explicit and test-covered):
 *  - `icon` omitted → `defaultIcon` (the shipped asset) is used;
 *    `icon: ""` → no icon is rendered (text-only control);
 *  - `text` omitted → `fallbackText` (the localized label) is used;
 *    `text: ""` → no visible text (icon-only control);
 *  - `icon: ""` AND `text: ""` → `visible === false` (the control is not
 *    rendered at all) — no invented boolean `enabled` leaf is needed.
 */
export interface ControlPresentation {
  /** Effective icon asset filename ("" = none). */
  readonly icon: string;
  /** Effective visible text ("" = none). */
  readonly text: string;
  /** Whether the control should be composed at all. */
  readonly visible: boolean;
}

export function resolveControlPresentation(
  control: { readonly icon?: string; readonly text?: string },
  fallback: { readonly defaultIcon?: string; readonly fallbackText: string },
): ControlPresentation {
  const icon = control.icon === undefined ? fallback.defaultIcon ?? "" : control.icon;
  const text = control.text === undefined ? fallback.fallbackText : control.text;
  return { icon, text, visible: text !== "" || icon !== "" };
}

/**
 * The shared compact-mode marker class. Any navigation surface (sidebar rail,
 * top navigation, bottom bar) carrying this semantic class renders nav-item
 * labels visually hidden (icon-only) via the single shared token rule — one
 * mechanism for every surface, no per-surface forks.
 */
export function menuModeClass(mode: MenuMode): string | undefined {
  return mode === "compact" ? "ui-nav-mode-compact" : undefined;
}

/**
 * Stable region sort index (top → middle → bottom). Region grouping must be
 * deterministic and keyboard/AT natural: items render strictly in this order
 * within the single shared list, never via absolute positioning.
 */
export function regionOrder(position: NavRegion | undefined): 0 | 1 | 2 {
  switch (position) {
    case "top":
      return 0;
    case "bottom":
      return 2;
    default:
      return 1; // "middle" (the default region)
  }
}