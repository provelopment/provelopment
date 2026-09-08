/**
 * UI system architecture contract (UI-01).
 *
 * Barrel for the framework-neutral UI vocabulary and preset profiles. Import
 * from `@/core/ui`; never import the inner modules directly from consumers.
 */
export {
  COLOR_HEX_PATTERN,
  CONTENT_WIDTHS,
  CTA_ACTIONS,
  CTA_STYLES,
  DESKTOP_NAVIGATION_PATTERNS,
  MOBILE_NAVIGATION_PATTERNS,
  PRESENTATION_HEADERS,
  PRESENTATION_HEROES,
  PRESENTATION_RHYTHMS,
  PRESENTATION_SURFACES,
  PRESENTATION_TYPOGRAPHIES,
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
  PresentationHeader,
  PresentationHero,
  PresentationRhythm,
  PresentationSurface,
  PresentationTypography,
  ShellVariant,
  TabletNavigationPattern,
  ThemeMode,
  ThemeRadius,
  UiDensity,
  UiPreset,
} from "./vocabulary";

export { uiPresetProfiles } from "./presets";
export type { UiCapabilityLevel, UiPresetCapabilities, UiPresetProfile } from "./presets";

export {
  PRESENTATION_DEFAULTS,
  presentationDataAttributes,
  radiusDataAttribute,
} from "./presentation";
export type { UiPresentation } from "./presentation";

export { FOUNDATION_UI_DEFAULTS } from "./defaults";
export type { UiFoundationDefaults } from "./defaults";

export {
  assertResolvedUiConfigComplete,
  UiConfigResolutionError,
  resolveUiConfig,
} from "./resolve";
export type {
  ResolvedUiConfig,
  UiConfigResolutionIssue,
} from "./resolve";

export { contentWidthClass, densityClass, resolveShellPattern, splitBottomNavItems } from "./shell";
export { BOTTOM_NAV_PRIMARY_LIMIT } from "./shell";
export type {
  BottomNavSplit,
  PerViewportDecision,
  ShellPatternDecision,
  ShellPrimitiveKind,
} from "./shell";