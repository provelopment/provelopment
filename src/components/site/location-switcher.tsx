"use client";

import { usePathname, useRouter } from "next/navigation";

import { siteConfig } from "@/config";
import {
  configuredRegionIds,
  parseRegionalPath,
  regionDefaultLocale,
  regionalPath,
  resolveLocationDestination,
  unspecifiedDestination,
} from "@/core/regional-pages";

interface LocationSwitcherProps {
  readonly locale: string;
  /** Accessible label, localized via the active locale's dictionary. */
  readonly label: string;
  /**
   * Distinct label for the unspecified/default location option (Phase M): a
   * bare "Location" option would read like a real configured location.
   */
  readonly unspecifiedLabel: string;
  /** Computed display names (localized + English) for every configured region. */
  readonly regionLabels: Readonly<Record<string, string>>;
}

/**
 * Location (region) selector shown beside the language selector.
 *
 * Phase M semantics:
 *  - the inventory is every CONFIGURED operating location (`business.regions`
 *    is authoritative; page bindings only decide which combinations exist), so
 *    the list never shrinks to "locations compatible with my language" and is
 *    never lost after selecting a region;
 *  - an explicit **Unspecified** (default) option is ALWAYS present, returning
 *    to the equivalent non-regional page (`/en/toronto/about` → `/en/about`);
 *  - switching to a region preserves the current locale + page when that
 *    combination exists; when the current locale is not bound to the region,
 *    the region's configured `defaultLocale` + landing is chosen
 *    deterministically (never inferred from country/browser/timezone).
 *
 * The active location is read from the current URL (server-resolved page
 * context), never client-side state.
 */
export function LocationSwitcher({
  locale,
  label,
  unspecifiedLabel,
  regionLabels,
}: LocationSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  const parsed = parseRegionalPath(siteConfig.pageBindings, pathname ?? `/${locale}`);
  const availableRegions = [...configuredRegionIds(siteConfig.regions)].sort((a, b) => {
    const labelA = siteConfig.regions[a]?.label ?? siteConfig.regions[a]?.name ?? a;
    const labelB = siteConfig.regions[b]?.label ?? siteConfig.regions[b]?.name ?? b;
    return labelA.localeCompare(labelB, "en", { sensitivity: "base" });
  });
  const activeRegion = parsed.region ?? "";

  function handleChange(nextRegion: string) {
    if (nextRegion === activeRegion) {
      return;
    }

    if (nextRegion === "") {
      router.push(unspecifiedDestination(locale, parsed.slug));
      return;
    }

    const destination = resolveLocationDestination({
      entries: siteConfig.pageBindings,
      locale,
      targetRegion: nextRegion,
      currentSlug: parsed.slug,
      defaultLocale: regionDefaultLocale(siteConfig.regions, siteConfig.pageBindings, nextRegion),
    });
    if (destination) {
      router.push(regionalPath(destination.locale, destination.region, destination.slug));
    }
  }

  return (
    <select
      aria-label={label}
      data-selector="location"
      value={activeRegion}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      <option key="" value="">
        {unspecifiedLabel}
      </option>
      {availableRegions.map((regionId) => (
        <option key={regionId} value={regionId}>
          {regionLabels[regionId]}
        </option>
      ))}
    </select>
  );
}