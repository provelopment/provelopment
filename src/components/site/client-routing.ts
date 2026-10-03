import type { PageRegionBinding } from "@/core/region";
import type { SiteSet } from "@/core/site";
import { displayNameWithEnglish } from "@/core/display-labels";
import { regionDefaultLocale } from "@/core/regional-pages";

/**
 * THE CLIENT-SAFE ROUTING PROJECTION OF ONE SPOKE (FOUNDATION-MULTISITE-M14)
 * =========================================================================
 *
 * The four controls that must resolve their own destination — `ContextNavLinks`, `ContextConnectHeading`,
 * `LanguageSwitcher`, `LocationSwitcher` — used to read the module-global Spoke configuration. They now
 * receive this ONE projection instead: a plain, immutable-in-intent, SERIALIZABLE value built by the server
 * from the context it is already rendering.
 *
 * WHAT IT MAY CONTAIN is exactly what the pure core routing rules need, and nothing else:
 *
 *   siteSet                the SPOKE's own resolved sites (plain data: code, label, locales, defaults) —
 *                          the same shape `/core/site` resolves from configuration;
 *   pageBindings           the SPOKE's own regional page bindings;
 *   localeLabels           the display label of every locale PATH KEY the deployment knows, precomputed
 *                          through the ONE display-name rule (`displayNameWithEnglish`);
 *   regionSortLabels       the plain sort label of every configured region (`label ?? name ?? id`);
 *   regionDefaultLocales   the DETERMINISTIC default locale of every configured region, precomputed by the
 *                          ONE core rule (`regionDefaultLocale`) so no client re-derives it.
 *
 * WHAT IT MAY NOT CONTAIN: another Spoke's sites, bindings or regions (it is built from ONE context);
 * `SpokeRuntimeContext` itself; `RuntimeDictionaryAccess`; `RuntimeAssetOwnershipResolver`; `SiteConfig`;
 * `SpokeResourcePaths`; any filesystem path; the server composition object. It is data, so a client can hold
 * it without holding authority — and no client state can ever select a Spoke.
 *
 * SERVER-BUILT, CLIENT-READ. This module defines the shape and the ONE projection builder; the client
 * surface (`./client-routing-context`) imports only the TYPE, so a browser chunk can never reach the builder
 * or anything it imports.
 */
import type { SiteConfig } from "@/config/site-config";

/** The routing facts ONE Spoke's client controls may use — plain, serializable, Spoke-local. */
export interface ClientRoutingContext {
  /** The Spoke's own resolved sites, and the one `/` negotiates to. */
  readonly siteSet: SiteSet;
  /** The Spoke's own configured regional page bindings. */
  readonly pageBindings: readonly PageRegionBinding[];
  /** Display label per locale PATH KEY (`en`, `fr-ca`), resolved once by the display-name rule. */
  readonly localeLabels: Readonly<Record<string, string>>;
  /** Plain sort label per configured region id (`label ?? name ?? id`). */
  readonly regionSortLabels: Readonly<Record<string, string>>;
  /** The deterministic default locale per configured region id (`null` when the region declares none). */
  readonly regionDefaultLocales: Readonly<Record<string, string | null>>;
}

/**
 * Project ONE context's configuration into the client-safe routing projection.
 *
 * Pure and total: every value is copied from the supplied configuration (or precomputed by a core rule), so
 * the projection cannot disagree with the server that renders beside it — and two Spokes projecting the same
 * logical coordinates still produce DIFFERENT projections, because each is built from its own configuration.
 */
export function buildClientRoutingContext(
  siteConfig: SiteConfig,
  siteSet: SiteSet,
): ClientRoutingContext {
  const localeLabels: Record<string, string> = {};
  for (const entry of siteConfig.locales) {
    localeLabels[entry.code] = displayNameWithEnglish(entry.label ?? entry.code, entry.englishLabel);
  }

  const bindings = siteConfig.pageBindings;
  const regionSortLabels: Record<string, string> = {};
  const regionDefaultLocales: Record<string, string | null> = {};
  for (const [regionId, region] of Object.entries(siteConfig.regions)) {
    regionSortLabels[regionId] = region.label ?? region.name ?? regionId;
    // The client never re-derives a region's default locale: the ONE core rule decides it here, from the
    // same configuration and the same bindings the server uses.
    regionDefaultLocales[regionId] = regionDefaultLocale(
      siteConfig.regions,
      bindings,
      regionId,
    );
  }

  return Object.freeze({
    siteSet,
    pageBindings: bindings,
    localeLabels,
    regionSortLabels,
    regionDefaultLocales,
  });
}
