/**
 * UI system architecture contract (UI-01).
 *
 * Barrel for the framework-neutral UI vocabulary and preset profiles. Import
 * from `@/core/ui`; never import the inner modules directly from consumers.
 */
export {
  CONTENT_WIDTHS,
  CTA_ACTIONS,
  CTA_STYLES,
  DESKTOP_NAVIGATION_PATTERNS,
  MOBILE_NAVIGATION_PATTERNS,
  SHELL_VARIANTS,
  TABLET_NAVIGATION_PATTERNS,
  THEME_MODES,
  THEME_RADII,
  UI_DENSITIES,
  UI_PRESETS,
} from "./vocabulary";
export type {
  ContentWidth,
  CtaAction,
  CtaStyle,
  DesktopNavigationPattern,
  MobileNavigationPattern,
  ShellVariant,
  TabletNavigationPattern,
  ThemeMode,
  ThemeRadius,
  UiDensity,
  UiPreset,
} from "./vocabulary";

export { uiPresetProfiles } from "./presets";
export type { UiCapabilityLevel, UiPresetCapabilities, UiPresetProfile } from "./presets";