import { FOUNDATION_UI_DEFAULTS } from "./defaults";
import { uiPresetProfiles } from "./presets";
import {
  CONTENT_WIDTHS,
  CTA_STYLES,
  DESKTOP_NAVIGATION_PATTERNS,
  MOBILE_NAVIGATION_PATTERNS,
  SHELL_VARIANTS,
  TABLET_NAVIGATION_PATTERNS,
  THEME_MODES,
  THEME_RADII,
  UI_DENSITIES,
  type ContentWidth,
  type CtaAction,
  type CtaStyle,
  type DesktopNavigationPattern,
  type MobileNavigationPattern,
  type ShellVariant,
  type TabletNavigationPattern,
  type ThemeMode,
  type ThemeRadius,
  type UiDensity,
  type UiPreset,
} from "./vocabulary";

/**
 * The validated intent-level UI configuration surface (UI-01 contract shape).
 *
 * Structurally mirrors `src/config/site-config.ts` `UiConfig` (same optional
 * leaf names, same vocabulary-backed types). Defined HERE in framework-free
 * core so the resolver never depends on the configuration layer: the core
 * boundary forbids any `@/config` import. The validated config surface's
 * `UiConfig` is structurally assignable to this shape, so UI-04 can pass the
 * validated UI configuration straight in.
 */
export interface UiConfigInput {
  readonly preset?: UiPreset;
  readonly shell?: { readonly header?: ShellVariant; readonly footer?: ShellVariant };
  readonly navigation?: {
    readonly desktop?: DesktopNavigationPattern;
    readonly tablet?: TabletNavigationPattern;
    readonly mobile?: MobileNavigationPattern;
  };
  readonly density?: UiDensity;
  readonly content?: { readonly width?: ContentWidth };
  readonly cta?: {
    readonly enabled?: boolean;
    readonly action?: CtaAction;
    readonly label?: string;
    readonly style?: CtaStyle;
  };
  readonly theme?: { readonly mode?: ThemeMode; readonly radius?: ThemeRadius };
}

/**
 * UI configuration resolution (UI-02 - Configuration Infrastructure).
 *
 * The single, deterministic resolution machinery for the intent-level
 * configuration surface (`UiConfigInput`, the UI-01 contract shape). It
 * produces a fully-determined `ResolvedUiConfig` through the documented
 * precedence model:
 *
 * ```text
 * explicit override (input leaf)
 *         ↓        (only when an explicit preset is present)
 * preset profile leaf (uiPresetProfiles[preset])
 *         ↓
 * Foundation default (FOUNDATION_UI_DEFAULTS)
 *         ↓
 * completeness invariant (assertResolvedUiConfigComplete)
 * ```
 *
 * CONTRACT DECISIONS (locked, owner-approved; see plan/todo-milestone-ui-02.md):
 *
 * 1. NO default preset. `resolveUiConfig({})` yields `preset === undefined`; no
 *     preset-selection constant of any name exists; the Foundation-defaults
 *     layer contains no preset selection; and NO preset is ever selected as a
 *     fallback. The resolved default preset is a UI-05 policy decision, not a
 *     UI-02 mechanic.
 * 2. Neutral CTA defaults. The Foundation never invents a business action:
 *     `cta.enabled` defaults to `false`; `action`/`label` are adopter-only
 *     strings and resolve to `undefined` when not configured（never invented）。
 * 3. Completeness is structural: every leaf that MUST resolve (all non-preset
 *     leaves except the adopter-only CTA strings) must be defined or resolution
 *     throws `UiConfigResolutionError` listing the missing leaf path — future
 *     vocabulary/profile growth fails loudly rather than silently resolving to
 *     `undefined`.
 * 4. Framework-neutral: pure TS (no React/Next/Zod/adapters/configuration
 *     imports);the only config coupling is the structural `UiConfigInput`
 *     shape defined in this module (no `@/config` import at all)。
 */

/** A single resolution issue, with an actionable path + message. */
export interface UiConfigResolutionIssue {
  readonly path: string;
  readonly message: string;
}

/** Thrown when the completeness invariant is violated. */
export class UiConfigResolutionError extends Error {
  readonly issues: readonly UiConfigResolutionIssue[];
  constructor(issues: readonly UiConfigResolutionIssue[]) {
    super(`Invalid resolved UI configuration:\n${issues
      .map((issue) => `  - ${issue.path}: ${issue.message}`)
      .join("\n")}`);
    this.name = "UiConfigResolutionError";
    this.issues = issues;
  }
}

/**
 * The fully-resolved, deterministic UI configuration consumed by later phases.
 *
 * Same leaf shape as the input surface, but every leaf that must resolve is
 * non-optional and fully determined. `preset` is `undefined` when the adopter
 * omitted it — the resolved default preset is a UI-05 policy decision, never
 * injected here.
 */
export interface ResolvedUiConfig {
  readonly preset?: UiPreset;
  readonly shell: { readonly header: ShellVariant; readonly footer: ShellVariant };
  readonly navigation: {
    readonly desktop: DesktopNavigationPattern;
    readonly tablet: TabletNavigationPattern;
    readonly mobile: MobileNavigationPattern;
  };
  readonly density: UiDensity;
  readonly content: { readonly width: ContentWidth };
  readonly cta: {
    readonly enabled: boolean;
    readonly action?: CtaAction;
    readonly label?: string;
    readonly style: CtaStyle;
  };
  readonly theme: { readonly mode: ThemeMode; readonly radius: ThemeRadius };
}

const VOCAB_MEMBERSHIP: Readonly<Record<string, readonly string[]>> = {
  "shell.header": SHELL_VARIANTS,
  "shell.footer": SHELL_VARIANTS,
  "navigation.desktop": DESKTOP_NAVIGATION_PATTERNS,
  "navigation.tablet": TABLET_NAVIGATION_PATTERNS,
  "navigation.mobile": MOBILE_NAVIGATION_PATTERNS,
  "density": UI_DENSITIES,
  "content.width": CONTENT_WIDTHS,
  "cta.style": CTA_STYLES,
  "theme.mode": THEME_MODES,
  "theme.radius": THEME_RADII,
};

function resolveLeaf<T>(
  override: T | undefined,
  presetValue: T | undefined,
  foundationValue: T,
): T {
  return override ?? presetValue ?? foundationValue;
}

/**
 * Asserts that a resolved-shaped object is COMPLETE (every leaf that must
 * resolve is defined; the adopter-only CTA strings `action`/`label` are
 * intentionally optional) and that vocab-backed leaves are members of the
 * shipped vocabulary.
 *
 * Exported for testability: future preset-profile or Foundation-default
 * additions (new fields) fail loudly here rather than silently resolving to
 * `undefined`.
 */
export function assertResolvedUiConfigComplete(
  resolved: Readonly<Partial<ResolvedUiConfig>>,
): asserts resolved is ResolvedUiConfig {
  const issues: UiConfigResolutionIssue[] = [];

  const check = (path: string, value: unknown): void => {
    if (value === undefined) {
      issues.push({ path, message: "missing resolved value (no override, preset profile, or Foundation default provided)" });
    } else {
      const members = VOCAB_MEMBERSHIP[path];
      if (members && !members.includes(value as string)) {
        issues.push({
          path,
          message: `value "${String(value)}" is not a member of the shipped vocabulary (expected one of: ${members.join(", ")})`,
        });
      }
    }
  };

  check("shell.header", resolved.shell?.header);
  check("shell.footer", resolved.shell?.footer);
  check("navigation.desktop", resolved.navigation?.desktop);
  check("navigation.tablet", resolved.navigation?.tablet);
  check("navigation.mobile", resolved.navigation?.mobile);
  check("density", resolved.density);
  check("content.width", resolved.content?.width);
  check("cta.enabled", resolved.cta?.enabled);
  check("cta.style", resolved.cta?.style);
  check("theme.mode", resolved.theme?.mode);
  check("theme.radius", resolved.theme?.radius);

  if (issues.length > 0) {
    throw new UiConfigResolutionError(issues);
  }
}

/**
 * Resolve the validated intent-level UI configuration into a fully-determined,
 * deterministic resolved configuration (see precedence model above)。
 *
 * Pure function: does NOT mutate its input; produces a fresh object each call;
 * free of state and application/business assumptions.
 */
export function resolveUiConfig(raw: UiConfigInput): ResolvedUiConfig {
  const preset = raw.preset;

  // These two lines are the ONLY place a preset may influence resolution. When
  // `preset` is undefined, `profile` stays undefined and every preset-profile
  // leaf below falls through to its Foundation default. NO preset is ever
  // selected as a fallback here — the resolved default preset is a UI-05
  // policy decision, never a UI-02 mechanic.



  const profile = preset ? uiPresetProfiles[preset] : undefined;

  const resolved: ResolvedUiConfig = {
    preset: preset === undefined ? undefined : preset,
    shell: {
      header: resolveLeaf(raw.shell?.header, profile?.shell.header, FOUNDATION_UI_DEFAULTS.shell.header),
      footer: resolveLeaf(raw.shell?.footer, profile?.shell.footer, FOUNDATION_UI_DEFAULTS.shell.footer),
    },
    navigation: {
      desktop: resolveLeaf(raw.navigation?.desktop, profile?.navigation.desktop, FOUNDATION_UI_DEFAULTS.navigation.desktop),
      tablet: resolveLeaf(raw.navigation?.tablet, profile?.navigation.tablet, FOUNDATION_UI_DEFAULTS.navigation.tablet),
      mobile: resolveLeaf(raw.navigation?.mobile, profile?.navigation.mobile, FOUNDATION_UI_DEFAULTS.navigation.mobile),
    },
    density: resolveLeaf(raw.density, undefined, FOUNDATION_UI_DEFAULTS.density),
    content: {
      width: resolveLeaf(raw.content?.width, undefined, FOUNDATION_UI_DEFAULTS.content.width),
    },
    cta: {
      enabled: resolveLeaf(raw.cta?.enabled, undefined, FOUNDATION_UI_DEFAULTS.cta.enabled),
      action: resolveLeaf(raw.cta?.action, undefined, FOUNDATION_UI_DEFAULTS.cta.action),
      label: resolveLeaf(raw.cta?.label, undefined, FOUNDATION_UI_DEFAULTS.cta.label),
      style: resolveLeaf(raw.cta?.style, profile?.cta.style, FOUNDATION_UI_DEFAULTS.cta.style),
    },
    theme: {
      mode: resolveLeaf(raw.theme?.mode, undefined, FOUNDATION_UI_DEFAULTS.theme.mode),
      radius: resolveLeaf(raw.theme?.radius, undefined, FOUNDATION_UI_DEFAULTS.theme.radius),
    },
  };

  assertResolvedUiConfigComplete(resolved);
  return resolved;
}