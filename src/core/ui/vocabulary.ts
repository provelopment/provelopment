/**
 * UI system vocabulary (UI-01 — Architecture & Contract).
 *
 * The closed value sets for the Foundation `ui` configuration namespace.
 * These constants are the SINGLE source of allowed values: the configuration
 * schema (`src/config/schema.ts`) and the preset profiles
 * (`src/core/ui/presets.ts`) both derive from them, so the documented
 * vocabulary and the schema can never drift.
 *
 * Framework-neutral by design (see ARCHITECTURE.md — UI System Architecture):
 * pure data + types only; never import React, Next.js, Tailwind, adapters, or
 * configuration from here.
 *
 * IMPORTANT (UI-01 contract, realized at UI-05): none of these values establish
 * a default. `ui.preset` is optional and the schema/loader never inject one.
 * The RESOLVED default personality is fixed at the UI-05 resolver selection
 * point (`FOUNDATION_UI_DEFAULTS.defaultPreset = "adaptive"`) — a resolution
 * policy, never a contract-surface default.
 */

/** The five initial Foundation UI presets (roadmap §5–§9, §24). */
export const UI_PRESETS = [
  "classic",
  "adaptive",
  "focus",
  "workspace",
  "immersive",
] as const;
/** A Foundation UI preset identifier. */
export type UiPreset = (typeof UI_PRESETS)[number];

/** Desktop navigation patterns (roadmap §11, §15). */
export const DESKTOP_NAVIGATION_PATTERNS = [
  "top",
  "sidebar",
  "minimal",
  "floating",
] as const;
export type DesktopNavigationPattern = (typeof DESKTOP_NAVIGATION_PATTERNS)[number];

/** Tablet navigation patterns (roadmap §15 transformations). */
export const TABLET_NAVIGATION_PATTERNS = [
  "top-compact",
  "collapsed-sidebar",
  "minimal",
  "floating",
] as const;
export type TabletNavigationPattern = (typeof TABLET_NAVIGATION_PATTERNS)[number];

/** Mobile navigation patterns (roadmap §15). */
export const MOBILE_NAVIGATION_PATTERNS = [
  "drawer",
  "bottom-bar",
  "top",
  "overlay",
] as const;
export type MobileNavigationPattern = (typeof MOBILE_NAVIGATION_PATTERNS)[number];

/** Semantic UI density values (roadmap §16). */
export const UI_DENSITIES = ["compact", "comfortable", "spacious"] as const;
export type UiDensity = (typeof UI_DENSITIES)[number];

/** Semantic content-width values (roadmap §17). */
export const CONTENT_WIDTHS = ["narrow", "standard", "wide", "full"] as const;
export type ContentWidth = (typeof CONTENT_WIDTHS)[number];

/** Shell variants (roadmap §5.1 "standard" header, §7 "minimal" header). */
export const SHELL_VARIANTS = ["standard", "minimal"] as const;
export type ShellVariant = (typeof SHELL_VARIANTS)[number];

/** CTA visual prominence values (roadmap §11 `cta.style`). */
export const CTA_STYLES = ["standard", "prominent"] as const;
export type CtaStyle = (typeof CTA_STYLES)[number];

/** Semantic CTA actions (roadmap §19). */
export const CTA_ACTIONS = [
  "book",
  "reserve",
  "order",
  "contact",
  "call",
  "quote",
  "enquire",
  "buy",
  "subscribe",
] as const;
export type CtaAction = (typeof CTA_ACTIONS)[number];

/** Theme modes (roadmap §18). `system` follows the OS color-scheme preference. */
export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/**
 * Semantic theme radii (roadmap §18, §22). Values align with the existing
 * `--radius-*` design tokens in `src/app/globals.css`.
 */
export const THEME_RADII = ["none", "small", "medium", "large"] as const;
export type ThemeRadius = (typeof THEME_RADII)[number];