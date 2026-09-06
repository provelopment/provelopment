"use client";

import { usePathname } from "next/navigation";

import { siteConfig } from "@/config";
import type { UiPresetComparisonConfig } from "@/config/site-config";
import type { UiPreset } from "@/core/ui";

interface PresetSwitcherProps {
  /** Accessible label, localized via the active locale's dictionary. */
  readonly label: string;
  /** Localized suffix for the currently active preset ("current"/"実際"/…). */
  readonly currentSuffix: string;
}

/** UI preset display order for the comparison selector (stable across sites). */
const PRESET_ORDER: readonly UiPreset[] = [
  "adaptive",
  "classic",
  "focus",
  "workspace",
  "immersive",
];

/** Capitalized preset name used as the selector option label. */
function presetLabel(preset: UiPreset): string {
  return preset.charAt(0).toUpperCase() + preset.slice(1);
}

/**
 * FS-3 — preset-comparison selector. A native dropdown matching the language /
 * location switcher pattern. It lists every configured preset deployment
 * (`site.config.json` → `ui.presetComparison`) and navigates to the equivalent
 * Foundation site on another deployment, preserving the current locale and
 * sub-path.
 *
 * The ACTIVE preset is derived from the deployment's own `ui.preset`
 * configuration (never from a hostname comparison), so it stays truthful as
 * domains change. Selecting the active preset is a no-op.
 */
export function PresetSwitcher({ label, currentSuffix }: PresetSwitcherProps) {
  const pathname = usePathname();

  const comparison = siteConfig.presetComparison;
  if (comparison === undefined || Object.keys(comparison).length === 0) return null;

  const activePreset = siteConfig.ui?.preset;
  const offered = PRESET_ORDER.filter(
    (preset) => typeof comparison[preset as keyof UiPresetComparisonConfig] === "string",
  );

  function handleChange(nextPreset: string) {
    const target = (comparison as UiPresetComparisonConfig)[
      nextPreset as keyof UiPresetComparisonConfig
    ];
    if (!target || nextPreset === activePreset || !pathname) return;

    // Preserve the current locale + sub-path when the target deployment can
    // safely serve it: everything from the known locale segment onward. If the
    // pathname has no recognizable locale prefix (e.g. the root before
    // negotiation), fall back to this site's default-locale home.
    const segments = pathname.split("/").filter(Boolean);
    const first = segments[0] ?? "";
    const isKnownLocale = siteConfig.locales.some((entry) => entry.code === first);
    const path = isKnownLocale ? pathname : `/${siteConfig.defaultLocale}`;

    window.location.assign(new URL(path, target).toString());
  }

  return (
    <select
      aria-label={label}
      data-selector="preset"
      value={activePreset}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      {offered.map((preset) => {
        const isActive = preset === activePreset;
        return (
          <option key={preset} value={preset}>
            {isActive ? `${presetLabel(preset)} (${currentSuffix})` : presetLabel(preset)}
          </option>
        );
      })}
    </select>
  );
}