/**
 * THE PER-SITE LOCATION-SELECTION POLICY (FOUNDATION-LOC1, refined by FOUNDATION-LOC2)
 * ===================================================================================
 *
 * A **Location** is physical/business context INSIDE one **Site** (`@/core/region`), and until this
 * policy existed every Site had exactly two visitor states: a Location, or the explicit *unspecified*
 * one. Some Sites are not like that. Every page they publish belongs to a place, and an unspecified
 * visitor state is not something their adopter wants to offer at all — so the adopter must be able to
 * say so, once, about that one Site:
 *
 *     "sites": [
 *       { "code": "ww", "locationSelection": { "mode": "required", "default": "<location id>" } }
 *     ]
 *
 * Some of those Sites serve several languages whose Locations are not one place, so completing every
 * language into the SAME Location is wrong for them. LOC2 therefore lets the adopter name the Location
 * that completes an otherwise Location-less request FOR ONE LOCALE — still authored, still explicit:
 *
 *     "sites": [
 *       {
 *         "code": "ww",
 *         "locationSelection": {
 *           "mode": "required",
 *           "default": "<location id>",
 *           "localeDefaults": { "<locale path key>": "<location id>" }
 *         }
 *       }
 *     ]
 *
 * WHAT THE POLICY IS — AND WHAT IT IS NOT
 * ---------------------------------------
 *   · it is a decision about ONE Site's own Location dimension: never another Site's, never a Spoke's,
 *     never a page's and never the deployment's;
 *   · it is EXPLICIT. Neither the default nor a locale refinement is EVER inferred — not from
 *     alphabetical order, binding order, locale, timezone, country, a browser, "the first region" or
 *     "the first binding". `localeDefaults` is authored data, so this module knows NO association
 *     between a language and a place: there is no "German means Berlin" here, and there never can be;
 *   · it is OPTIONAL, and its absence is a first-class state: a Site that declares no policy keeps the
 *     established optional behaviour EXACTLY (the Location selector keeps its explicit unspecified
 *     option, and non-regional routes stay valid). A policy WITHOUT `localeDefaults` keeps the LOC1
 *     behaviour exactly too, so no existing configuration needs migrating;
 *   · `localeDefaults` is a COMPLETION refinement and nothing else: it is consulted only while a public
 *     request of a required Site names no Location yet. Once a Location is in the URL the URL wins — the
 *     visitor's chosen place is never replaced, in any locale, and Language and Location stay
 *     independent dimensions;
 *   · it stores NOTHING: the Location stays URL-authoritative, so a required Site reaches its effective
 *     default Location through a PUBLIC REDIRECT, and every later request already names its Location.
 *     There is no cookie, no session, no client state and no environment variable in this model;
 *   · it is per Site and scoped by Site. A Location belongs to one Site's page tree, so a Location of
 *     another Site can never satisfy a Site's requirement, enter its routing or enter its selector.
 *
 * ONE MODEL, NO SECOND ONE
 * ------------------------
 * Every rule below is COMPOSED from the accepted Location domain (`@/core/regional-pages`:
 * `bindingsForSite`, `regionsForSite`, `isRegionBoundToLocale`, `regionDefaultLocale`,
 * `resolveLocationDestination`, `regionalPath`). This module adds no Location-routing model, no second
 * default-locale rule and no second ordering rule — it states WHICH Location a required Site must use
 * (`effectiveDefaultLocation`: the ONE answer, read by the route boundary AND the selector), and the
 * accepted rules answer WHERE that Location's page is.
 *
 * WHAT IT REFUSES, AND WHY IT REFUSES IT EARLY
 * -------------------------------------------
 * A policy that cannot be honoured is a CONFIGURATION DEFECT, never a runtime 404: `required` mode is
 * validated at build time. A default that names no configured Location, one that belongs to another
 * Site's inventory, a Site that binds no Location at all, and a default whose landing destination does
 * not exist are refused — and so is every authored refinement that could not be honoured: a locale the
 * Site does not serve, a Location that is not this Site's, and a refinement whose Location has no
 * landing in THAT EXACT locale (a locale refinement that silently fell back to another locale would not
 * be the refinement the adopter authored). Each refusal names the Site, the locale, the configured
 * Location and the violated rule (`locationSelectionIssues`). Nothing is guessed on the visitor's
 * behalf, and nothing is repaired silently.
 *
 * Framework-free and pure: no React, no Next.js, no filesystem, no configuration read, no request
 * object.
 */

import type { OperationalRegion, PageRegionBinding } from "./region";
import {
  bindingsForSite,
  hasPageEntry,
  isRegionBoundToLocale,
  regionDefaultLocale,
  regionsForSite,
  regionalPath,
  resolveLocationDestination,
} from "./regional-pages";

/** The ONE supported mode. A Site either REQUIRES a Location, or declares no policy at all. */
export const REQUIRED_LOCATION_SELECTION_MODE = "required";

/**
 * A Site's authored `locationSelection` block, exactly as a configuration file may spell it.
 *
 * Deliberately permissive in TYPE: the ONE shape rule is `locationSelectionIssue` below, which the
 * configuration schema and the site resolver BOTH apply, so an author sees one message and the two
 * cannot drift apart.
 */
export interface AuthoredLocationSelection {
  readonly mode?: string;
  readonly default?: string;
  /** LOC2 — optional explicit refinements, keyed by this Site's locale PATH KEY. */
  readonly localeDefaults?: Readonly<Record<string, string>>;
}

/** The ONE supported policy: a Site whose visitors are always inside one of its Locations. */
export interface LocationSelectionPolicy {
  readonly mode: typeof REQUIRED_LOCATION_SELECTION_MODE;
  /** The Location this Site requires — a configured Location of THIS Site's own inventory. */
  readonly default: string;
  /**
   * LOC2 — the adopter's OPTIONAL refinements of the completion, keyed by locale PATH KEY:
   * `{ "<locale>": "<location id>" }`.
   *
   * A refinement is read ONLY while completing a request that names no Location yet (see
   * `effectiveDefaultLocation`), and each one must be honourable IN THAT EXACT LOCALE — a refinement
   * that fell back to another locale's landing would not be the refinement the adopter authored, so it
   * is refused at build time instead. ABSENT means the LOC1 behaviour, exactly.
   */
  readonly localeDefaults?: Readonly<Record<string, string>>;
}

/**
 * THE ONE SHAPE RULE for an authored `locationSelection` block — or `null` when it is exactly the one
 * supported policy.
 *
 * Applied by the configuration schema (`./schema`) AND by the Site resolver (`./site`), which is how
 * "validation and resolution cannot disagree" is kept: one predicate, one message. The rule is SHAPE
 * only — the cross-reference rules (does that Location exist, belong to THIS Site, and have a landing
 * in the exact locale?) belong to `locationSelectionIssues`, which the same two callers apply.
 */
export function locationSelectionIssue(value: AuthoredLocationSelection): string | null {
  if (value.mode !== REQUIRED_LOCATION_SELECTION_MODE) {
    return (
      `"locationSelection.mode" must be "${REQUIRED_LOCATION_SELECTION_MODE}" (got ` +
      `${typeof value.mode === "string" ? `"${value.mode}"` : "nothing"}) — a Site either requires a ` +
      'Location, or omits the whole "locationSelection" block for the established optional behaviour ' +
      "(there is no second mode and no default)."
    );
  }

  if (typeof value.default !== "string" || value.default.trim() === "") {
    return (
      '"locationSelection.default" must name the Location this Site requires — a non-empty id of an ' +
      'operating Location configured in "business.regions" for THIS Site. The default Location is ' +
      "never inferred from order, locale, timezone or country."
    );
  }

  if (value.localeDefaults !== undefined) {
    const refinements = value.localeDefaults;
    if (typeof refinements !== "object" || refinements === null || Array.isArray(refinements)) {
      return (
        '"locationSelection.localeDefaults" must be an object of { "<locale path key>": ' +
        '"<location id>" } pairs — one entry per locale whose completion the adopter refines. Omit the ' +
        "property entirely for the site-wide default to apply in every locale."
      );
    }
    for (const [localePath, locationId] of Object.entries(refinements)) {
      if (localePath.trim() === "") {
        return (
          '"locationSelection.localeDefaults" has an entry with an EMPTY locale key: every refinement ' +
          "names the locale path key whose completion it refines."
        );
      }
      if (typeof locationId !== "string" || locationId.trim() === "") {
        return (
          `"locationSelection.localeDefaults.${localePath}" must name a Location — a non-empty id of an ` +
          "operating Location of THIS Site's own inventory with a landing in that exact locale. A " +
          "refinement Location is never inferred."
        );
      }
    }
  }

  return null;
}

/** True when an authored value is EXACTLY the one supported policy (never for an absent block). */
export function isLocationSelectionPolicy(value: unknown): value is LocationSelectionPolicy {
  if (typeof value !== "object" || value === null) return false;
  return locationSelectionIssue(value as AuthoredLocationSelection) === null;
}

/**
 * THE ONE PROJECTION of an authored block onto the policy the runtime reads, or `null` when the block
 * is absent or unusable.
 *
 * It exists so the resolver does not restate which leaves a policy has: `localeDefaults` travels
 * through by the same rule as `default`, and a LOC2 refinement can never be dropped by a caller that
 * forgot it. `null` is a RESULT for an absent block and a REPORTED defect for an unusable one (the
 * resolver raises it) — this function never guesses.
 */
export function locationSelectionPolicyFrom(
  value: AuthoredLocationSelection | undefined,
): LocationSelectionPolicy | null {
  if (!isLocationSelectionPolicy(value)) return null;
  return {
    mode: REQUIRED_LOCATION_SELECTION_MODE,
    default: value.default,
    ...(value.localeDefaults === undefined ? {} : { localeDefaults: value.localeDefaults }),
  };
}

/**
 * THE ONE EFFECTIVE-DEFAULT AUTHORITY: which Location completes a Location-less request of a required
 * Site, for the locale that request is in.
 *
 *     effectiveDefault = localeDefaults[locale path key] ?? default
 *
 * ONE function, so the route boundary, the Location selector and their tests cannot answer this
 * differently: the refinement is authored data — never locale→Location inference — and an absent or
 * unmapped locale keeps the site-wide default exactly (LOC1's behaviour, unchanged). `null` is returned
 * ONLY for a Site that declares no policy at all.
 */
export function effectiveDefaultLocation(
  policy: LocationSelectionPolicy | null | undefined,
  localePath: string,
): string | null {
  if (policy === null || policy === undefined) return null;
  const refined = policy.localeDefaults?.[localePath];
  return typeof refined === "string" && refined.trim() !== "" ? refined : policy.default;
}

/**
 * The OPERATING LOCATIONS a required-Location decision reads: the accepted `regionDefaultLocale` rule
 * reads nothing but `defaultLocale`, so this is the narrow structural view both callers already have —
 * the runtime's normalized regions and the configuration schema's raw ones.
 */
export type LocationSelectionRegions = Readonly<
  Record<string, Pick<OperationalRegion, "defaultLocale">>
>;

export interface RequiredLocationDestinationOptions {
  /** The Site's policy, or `null`/absent for the established optional behaviour. */
  readonly policy: LocationSelectionPolicy | null | undefined;
  /** The Site the request resolved to — its code scopes every lookup below. */
  readonly siteCode: string;
  /** The Site's PUBLIC prefix (`""` for the deployment's default Site) — from `@/core/site`. */
  readonly sitePrefix: string;
  /** The locale path key the request resolved to. */
  readonly localePath: string;
  /** The route path INSIDE the Site+locale — `""` for `/<site>/<locale>`. */
  readonly routePath: string;
  readonly regions: LocationSelectionRegions;
  /** Every configured page binding; the Site's own are selected here, once. */
  readonly bindings: readonly PageRegionBinding[];
}

/**
 * THE PUBLIC DESTINATION of a NON-REGIONAL request in a required-Location Site, or `null` when the
 * request must be answered exactly as it is.
 *
 * `null` means one of two things, and both are "leave it alone":
 *
 *   · the Site declares no policy — the established optional behaviour, untouched; or
 *   · the request ALREADY names one of THIS Site's Locations for its locale — including a Location
 *     other than the default, because a visitor who deliberately chose a place stays in it.
 *
 * Otherwise the destination is the accepted deterministic Location rule
 * (`resolveLocationDestination`), asked for the Location `effectiveDefaultLocation` answers for THIS
 * locale — the adopter's LOC2 refinement when it authored one for that locale, otherwise the site-wide
 * default — and the current route:
 *
 *   /<site>/<locale>            → /<site>/<locale>/<effective default>          (the Location's landing)
 *   /<site>/<locale>/<page>     → /<site>/<locale>/<effective default>/<page>   (when that page exists)
 *   /<site>/<locale>/<page>     → the effective default Location's landing      (the accepted fallback)
 *   /<site>/<locale not bound>  → /<site>/<region defaultLocale>/<default>
 *
 * A second locale rule is deliberately NOT introduced: the requested locale is kept whenever the
 * effective default Location is bound to it, and otherwise the accepted `regionDefaultLocale` decides —
 * exactly as the Location selector and the language switcher already do. (An authored LOC2 refinement is
 * validated to be honourable in ITS OWN locale, so this fallback belongs to the site-wide default only.)
 */
export function requiredLocationDestination(
  options: RequiredLocationDestinationOptions,
): string | null {
  const { policy, siteCode, sitePrefix, localePath, routePath, regions, bindings } = options;
  if (policy === null || policy === undefined) return null;

  // ONE scoping step, the accepted one: a binding of another Site can never answer here.
  const entries = bindingsForSite(bindings, siteCode);

  // A request that already names a Location of THIS Site+locale is not completed at all. THE URL WINS:
  // no default — site-wide or locale-refined — is ever applied to a request that already names a place.
  const first = routePath.split("/")[0];
  if (routePath !== "" && isRegionBoundToLocale(entries, localePath, first)) return null;

  // LOC2 — THE ONE EFFECTIVE-DEFAULT RULE answers WHICH Location completes this request.
  const targetRegion = effectiveDefaultLocation(policy, localePath);
  if (targetRegion === null) return null;

  const destination = resolveLocationDestination({
    entries,
    locale: localePath,
    targetRegion,
    currentSlug: routePath === "" ? null : routePath,
    defaultLocale: regionDefaultLocale(regions, entries, targetRegion),
  });
  if (destination === null) return null;

  return regionalPath(destination.locale, destination.region, destination.slug, sitePrefix);
}

/**
 * THE SELECTOR'S ORDER for one Site's own Location inventory, for the locale being read.
 *
 * Optional behaviour is returned UNCHANGED — a Site with no policy keeps the accepted ordering
 * exactly. A required Site leads with the EFFECTIVE default Location for THIS locale (the adopter's LOC2
 * refinement when it authored one, else the site-wide default), and the remaining Locations follow in
 * the order the caller already computed (the accepted deterministic label sort the selector has always
 * applied). Nothing else is reordered, and the active Location itself is still read from the URL.
 */
export function orderedLocationIdsForSelector(
  regionIds: readonly string[],
  policy: LocationSelectionPolicy | null | undefined,
  localePath: string,
): readonly string[] {
  if (policy === null || policy === undefined) return regionIds;
  const leading = effectiveDefaultLocation(policy, localePath);
  // A default that is NOT in the inventory cannot reorder anything (validation refuses it first).
  if (leading === null || !regionIds.includes(leading)) return regionIds;
  return [leading, ...regionIds.filter((regionId) => regionId !== leading)];
}

/** ONE refused policy: the Site, the configured default Location and the violated rule. */
export interface LocationSelectionIssue {
  /** The Site the policy belongs to, so a caller can point at the authored entry. */
  readonly siteCode: string;
  readonly message: string;
}

export interface LocationSelectionValidationOptions {
  /** The deployment's sites, in configuration order, with the policy each resolved. */
  readonly sites: readonly LocationSelectionSite[];
  /** `business.regions` — every configured operating Location, deployment-wide. */
  readonly regions: LocationSelectionRegions;
  /** Every configured page binding, in NORMALIZED form (see `normalizePageRegionBindings`). */
  readonly bindings: readonly PageRegionBinding[];
}

/**
 * ONE Site as the rules below read it: the narrow structural view the RESOLVER and the configuration
 * SCHEMA both already hold (a `ResolvedSite`) — its code, the policy it declares, and the locale PATH
 * KEYS it serves.
 *
 * The Site's own locales are the ONLY locale authority consulted, so the vocabulary of a
 * `localeDefaults` key cannot drift from the locales the Site actually serves and no second locale list
 * is maintained here.
 */
export interface LocationSelectionSite {
  readonly code: string;
  readonly locationSelection?: LocationSelectionPolicy | null;
  readonly locales: readonly { readonly path: string }[];
}

/**
 * EVERY required-Location policy that cannot be honoured, as actionable issues.
 *
 * The rules are the ways a Site can promise a Location it does not have. They are checked in the order
 * an author would fix them, so ONE policy reports ONE issue rather than a cascade:
 *
 *   1. the configured default must be an operating Location of `business.regions`;
 *   2. the Site must actually HAVE Locations (bindings of its own that name a region);
 *   3. the default must belong to THIS Site's Location inventory — a Location of another Site never
 *      satisfies it;
 *   4. the default must have a usable landing destination in THIS Site, so the visitor a required Site
 *      redirects can actually land somewhere (the accepted `regionDefaultLocale` rule decides the
 *      locale, and the accepted landing rule decides the page);
 *
 * and, for EACH authored LOC2 refinement, in the same one-issue-per-entry spirit:
 *
 *   5. its key must be a locale THIS Site serves (a refinement completes that locale's requests);
 *   6. its Location must be an operating Location of `business.regions`;
 *   7. its Location must belong to THIS Site's own inventory (naming the Site that owns it otherwise);
 *   8. its Location must have a landing IN THAT EXACT locale — a refinement is never allowed to fall
 *      back to another locale, because that is precisely what it was authored to prevent. The site-wide
 *      default keeps rule 4's accepted fallback; only these explicit entries are stricter.
 */
export function locationSelectionIssues(
  options: LocationSelectionValidationOptions,
): readonly LocationSelectionIssue[] {
  const { sites, regions, bindings } = options;
  const issues: LocationSelectionIssue[] = [];

  for (const site of sites) {
    const policy = site.locationSelection ?? null;
    if (policy === null) continue;

    const entries = bindingsForSite(bindings, site.code);
    const locationIds = regionsForSite(bindings, site.code);
    const where = `Site "${site.code}" (locationSelection.default "${policy.default}")`;

    if (!Object.hasOwn(regions, policy.default)) {
      issues.push({
        siteCode: site.code,
        message:
          `${where}: the default Location is not an operating Location — no such entry exists in ` +
          '"business.regions", so this Site would require a Location that does not exist. ' +
          `Configured Locations: ${Object.keys(regions).join(", ") || "(none)"}.`,
      });
      continue;
    }

    if (locationIds.length === 0) {
      issues.push({
        siteCode: site.code,
        message:
          `${where}: this Site binds NO Location at all (no "business.pages" binding of this Site ` +
          "names a region), so there is no Location a visitor could be required to reach. Add a " +
          `landing binding for this Site (e.g. { "site": "${site.code}", "locale": "…", "region": ` +
          `"${policy.default}" }), or remove the policy.`,
      });
      continue;
    }

    if (!locationIds.includes(policy.default)) {
      issues.push({
        siteCode: site.code,
        message:
          `${where}: the default Location is not part of THIS Site's Location inventory ` +
          `(${locationIds.join(", ")}) — a Location belongs to one Site's page tree, so another ` +
          "Site's Location can never satisfy this Site's requirement.",
      });
      continue;
    }

    const defaultLocale = regionDefaultLocale(regions, entries, policy.default);
    if (defaultLocale === null || !hasPageEntry(entries, defaultLocale, policy.default, null)) {
      issues.push({
        siteCode: site.code,
        message:
          `${where}: the default Location has no usable landing destination in this Site — the ` +
          "accepted default-locale rule resolves to " +
          `${defaultLocale === null ? "no locale at all" : `"${defaultLocale}"`}` +
          ", and this Site has no landing entry for it, so a visitor redirected into the default " +
          `Location would land on nothing. Add a landing binding (e.g. { "site": "${site.code}", ` +
          `"locale": "${defaultLocale ?? "…"}", "region": "${policy.default}" }), or point ` +
          '"locationSelection.default" at a Location that is reachable in this Site.',
      });
      continue;
    }

    // LOC2 — EVERY AUTHORED REFINEMENT MUST BE HONOURABLE IN ITS OWN EXACT LOCALE. A refinement is a
    // promise about ONE locale's completion, so it is refused unless that exact locale is one the Site
    // serves, the refined Location is THIS Site's own, and that Location has a landing IN that locale.
    // A refinement that could only fall back to another locale would send the visitor somewhere the
    // adopter did not author, which is exactly what the refinement exists to prevent — so the site-wide
    // default keeps the accepted fallback rule, and these entries are stricter.
    for (const [localePath, locationId] of Object.entries(policy.localeDefaults ?? {})) {
      const refinedWhere =
        `Site "${site.code}" (locationSelection.localeDefaults["${localePath}"] "${locationId}")`;
      const siteLocales = site.locales.map((locale) => locale.path);

      if (!siteLocales.includes(localePath)) {
        issues.push({
          siteCode: site.code,
          message:
            `${refinedWhere}: "${localePath}" is not a locale THIS Site serves ` +
            `(${siteLocales.join(", ") || "none"}) — a refinement may only name one of the Site's own ` +
            "locale path keys, because it completes requests made in that locale.",
        });
        continue;
      }

      if (!Object.hasOwn(regions, locationId)) {
        issues.push({
          siteCode: site.code,
          message:
            `${refinedWhere}: the refined Location is not an operating Location — no such entry exists ` +
            `in "business.regions", so this locale's completion would name a Location that does not ` +
            `exist. Configured Locations: ${Object.keys(regions).join(", ") || "(none)"}.`,
        });
        continue;
      }

      if (!locationIds.includes(locationId)) {
        const owner = sites
          .filter((other) => other.code !== site.code)
          .find((other) => regionsForSite(bindings, other.code).includes(locationId));
        issues.push({
          siteCode: site.code,
          message:
            `${refinedWhere}: the refined Location is not part of THIS Site's Location inventory ` +
            `(${locationIds.join(", ") || "none"})` +
            (owner === undefined
              ? "."
              : ` — it belongs to Site "${owner.code}", and a Location of another Site can never ` +
                "satisfy this Site's refinement."),
        });
        continue;
      }

      if (!hasPageEntry(entries, localePath, locationId, null)) {
        issues.push({
          siteCode: site.code,
          message:
            `${refinedWhere}: the refined Location has no landing in THIS EXACT locale — "${localePath}" ` +
            "names no landing of it in this Site, so the refinement could only fall back to another " +
            "locale, which an authored refinement must never do. Add a landing binding (e.g. " +
            `{ "site": "${site.code}", "locale": "${localePath}", "region": "${locationId}" }), or point ` +
            `the refinement at a Location that serves "${localePath}".`,
        });
      }
    }
  }

  return issues;
}

/**
 * THE ONE REFUSAL: a required-Location policy that cannot be honoured is a configuration defect, and it
 * fails at build time — loudly, with every violated rule and the Site it belongs to named. It is never
 * allowed to become a runtime 404.
 */
export function assertLocationSelectionValid(options: LocationSelectionValidationOptions): void {
  const issues = locationSelectionIssues(options);
  if (issues.length === 0) return;

  throw new Error(
    "FOUNDATION-LOC1: invalid location-selection configuration:\n" +
      issues.map((issue) => `  - ${issue.message}`).join("\n"),
  );
}
