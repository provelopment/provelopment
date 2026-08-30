"use client";

import { usePathname, useRouter } from "next/navigation";

import { siteConfig } from "@/config";
import {
  parseRegionalPath,
  regionalPath,
  regionsForLocale,
  resolveLocationDestination,
} from "@/core/regional-pages";

interface LocationSwitcherProps {
  readonly locale: string;
  /** Accessible label, localized via the active locale's dictionary. */
  readonly label: string;
}

/**
 * Location (region) selector shown beside the language selector.
 *
 * Configuration-driven: the offered locations are exactly the regions with a
 * configured landing for the current locale — never a hard-coded list and
 * never a conventional navigation menu. The active location is read from the
 * current URL (server-resolved page context), not client-side guessing.
 *
 * Switching location preserves the current language; when the target region
 * lacks the current page the deterministic fallback is used (landing → first
 * configured page), so a destination is always a real URL — never a 404 and
 * never a silent language change.
 */
export function LocationSwitcher({ locale, label }: LocationSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  const parsed = parseRegionalPath(siteConfig.pageBindings, pathname ?? `/${locale}`);
  const availableRegions = regionsForLocale(siteConfig.pageBindings, locale);
  const activeRegion = parsed.region ?? "";

  function handleChange(nextRegion: string) {
    if (nextRegion === activeRegion) {
      return;
    }

    const destination = resolveLocationDestination(
      siteConfig.pageBindings,
      locale,
      nextRegion,
      parsed.slug,
    );
    if (destination) {
      router.push(regionalPath(locale, destination.region, destination.slug));
    }
  }

  return (
    <select
      aria-label={label}
      data-selector="location"
      value={activeRegion}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
    >
      {activeRegion === "" ? <option value="">{label}</option> : null}
      {availableRegions.map((regionId) => {
        const region = siteConfig.regions[regionId];
        return (
          <option key={regionId} value={regionId}>
            {region?.label ?? region?.name ?? regionId}
          </option>
        );
      })}
    </select>
  );
}