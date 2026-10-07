"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  bindingsForSite,
  regionalPath,
  regionsForSite,
  resolveLocationDestination,
  unspecifiedDestination,
} from "@/core/regional-pages";
// LOC1 — the ONE selector-ordering rule for a Site that REQUIRES a Location.
import { orderedLocationIdsForSelector } from "@/core/location-selection";
import { pathContextOr, sitePrefixPath } from "@/core/site";
import { useClientRouting } from "./client-routing-context";

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
 *  - an explicit **Unspecified** (default) option returns to the equivalent
 *    non-regional page (`/en/toronto/about` → `/en/about`). It is present for
 *    every OPTIONAL Site — and for a Site that REQUIRES a Location (LOC1) it is
 *    deliberately NOT rendered, because such a Site has no unspecified visitor
 *    state: its configured default Location is the natural selection and the
 *    Location its non-regional URLs are completed into;
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
  // M14 — the routing facts arrive from the SERVER's projection for the CURRENT Spoke: this site, this
  // site's bindings, this site's locations and each location's precomputed default locale.
  const routing = useClientRouting();

  const parsed = pathContextOr(
    routing.siteSet,
    routing.pageBindings,
    pathname ?? `/${locale}`,
    locale,
  );
  // S1 — the LOCATION selector stays INSIDE the current site: it picks a physical/business
  // place whose pages are shared with this site's tree, and both its inventory and its
  // destinations come from THIS site's bindings (a binding declared for another site can
  // never answer here, even when the two sites share a locale).
  const sitePrefix = sitePrefixPath(parsed.site);
  const entries = bindingsForSite(routing.pageBindings, parsed.site.code);
  // LOC1 — THE ACTIVE SITE'S OWN LOCATION-SELECTION POLICY (`null` = the established optional
  // behaviour). It travels ON the resolved Site, so it is read for THIS Site only and can never leak
  // from, or into, another; the client re-derives no policy and infers no default Location.
  const policy = parsed.site.locationSelection ?? null;
  // R1C — the inventory is THIS SITE's own locations (never another site's, and never the
  // deployment's full region list), exactly as this component's contract already stated: the
  // selector picks a place whose pages are shared with THIS site's tree, so a Location can never
  // be offered where it has no destination. Displayed order stays alphabetical by label, using the
  // projection's plain sort label (`label ?? name ?? id`) — the same one the server used — and a
  // REQUIRED Site leads with its configured default Location (LOC1); optional ordering is untouched.
  const regionLabelOf = (regionId: string): string => routing.regionSortLabels[regionId] ?? regionId;
  const availableRegions = orderedLocationIdsForSelector(
    [...regionsForSite(routing.pageBindings, parsed.site.code)].sort((a, b) =>
      regionLabelOf(a).localeCompare(regionLabelOf(b), "en", { sensitivity: "base" }),
    ),
    policy,
  );
  // LOC1 — in a REQUIRED Site the visitor's Location is never unspecified: the configured default is the
  // natural selection, and it is the Location this Site's non-regional URLs are completed into.
  const activeRegion = parsed.region ?? policy?.default ?? "";

  function handleChange(nextRegion: string) {
    if (nextRegion === activeRegion) {
      return;
    }

    if (nextRegion === "") {
      router.push(unspecifiedDestination(locale, parsed.routePath === "" ? null : parsed.routePath, sitePrefix));
      return;
    }

    const destination = resolveLocationDestination({
      entries,
      locale,
      targetRegion: nextRegion,
      currentSlug: parsed.routePath === "" ? null : parsed.routePath,
      // The region's deterministic default locale was computed SERVER-side by the ONE core rule
      // (`regionDefaultLocale`), so the client re-derives nothing.
      defaultLocale: routing.regionDefaultLocales[nextRegion] ?? null,
    });
    if (destination) {
      router.push(regionalPath(destination.locale, destination.region, destination.slug, sitePrefix));
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
      {/* LOC1 — an OPTIONAL Site keeps its explicit unspecified option exactly; a Site that REQUIRES a
          Location offers none, because it has no unspecified visitor state to return to. */}
      {policy === null ? (
        <option key="" value="">
          {unspecifiedLabel}
        </option>
      ) : null}
      {availableRegions.map((regionId) => (
        <option key={regionId} value={regionId}>
          {regionLabels[regionId]}
        </option>
      ))}
    </select>
  );
}