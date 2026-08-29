/**
 * Canonical business domain model (Phase A, Tier 1).
 *
 * This is the normalized, framework-free shape produced by the config loader
 * and consumed by application/UI layers and by structured data. The loader
 * accepts either the new `business` block or legacy top-level `contact` and
 * normalizes both to this shape, so consumers never depend on how the adopter
 * authored their config.
 *
 * Rule: `locations[]` owns physical/NAP data; `business.contact` owns general
 * communication channels (email/phone/social); identity derives from `site.*`.
 */

/** Two-letter/full IANA identifier is left as a plain string (validated in zod). */
export interface Address {
  readonly street: string;
  readonly city: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly country?: string;
}

export interface GeoCoordinates {
  readonly lat: number;
  readonly lng: number;
}

/** Which structured-data type the business identifies as (config-driven, not inferred). */
export type BusinessType = "Organization" | "LocalBusiness" | "ProfessionalService" | "Restaurant" | "Store";

export interface BusinessContact {
  readonly email?: string;
  readonly phone?: string;
}

/**
 * A per-locale, partial override of a location's visitor-facing NAP identity.
 *
 * A locale is a presentation/visitor context, NOT inherently a geographic
 * market — no assumption that `de`⇄Germany, `ja`⇄Japan, etc. is encoded
 * anywhere in platform code. Adopters decide, purely in `site.config.json`,
 * whether a given locale should present a different address/phone/geo.
 *
 * Locale resolution deliberately keeps `timezone` and `hours` at the location
 * level (not localized) so operating schedules remain a single global truth.
 */
export interface BusinessLocationLocaleOverride {
  /** Per-field partial address; unspecified global fields are inherited. */
  readonly address?: Partial<Address>;
  readonly phone?: string;
  readonly geo?: GeoCoordinates;
}

/**
 * A single physical presence. The canonical source of NAP and hours.
 * Timezone resolves as `location.timezone → business.timezone → global default`.
 * Optional `locales` (keyed by BCP-47 locale code) carries per-locale NAP
 * overrides resolved by `resolveLocationForLocale`.
 */
export interface BusinessLocation {
  readonly id: string;
  readonly name?: string;
  readonly address: Address;
  readonly geo?: GeoCoordinates;
  readonly phone?: string;
  readonly timezone?: string;
  readonly hours?: BusinessHours;
  readonly locales?: Readonly<Record<string, BusinessLocationLocaleOverride>>;
}

export type Weekday =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

/** A range of 24h "HH:mm" wall-clock times in the location's timezone. */
export interface OpenInterval {
  readonly days: readonly Weekday[];
  /** Local wall-clock `HH:mm`. */
  readonly open: string;
  /** Local wall-clock `HH:mm`; when earlier than `open` this is an overnight interval. */
  readonly close: string;
}

export interface ExceptionalHours {
  /** ISO date `YYYY-MM-DD` (location-local). */
  readonly date: string;
  /** When true the place is closed that day. */
  readonly closed?: boolean;
  readonly open?: string;
  readonly close?: string;
}

export interface BusinessHours {
  readonly intervals: readonly OpenInterval[];
  readonly exceptional: readonly ExceptionalHours[];
}

export interface Business {
  readonly timezone?: string;
  readonly type?: BusinessType;
  readonly name?: string;
  readonly tagline?: string;
  readonly description?: string;
  readonly contact: BusinessContact;
  readonly locations: readonly BusinessLocation[];
}

/**
 * Per-field merge of a partial locale override onto the global location
 * address. Only defined override fields replace the global values; all other
 * fields are inherited unchanged.
 */
function mergeAddress(base: Address, override: Partial<Address>): Address {
  return {
    street: override.street ?? base.street,
    city: override.city ?? base.city,
    region: override.region ?? base.region,
    postalCode: override.postalCode ?? base.postalCode,
    country: override.country ?? base.country,
  };
}

/**
 * Resolves a location's visitor-facing NAP data for a locale.
 *
 * Deterministic fallback chain:
 *   1. the locale override, where configured (partial address merged per field);
 *   2. the location's existing (global) data;
 *   3. existing behavior when no override exists.
 *
 * The locale override NEVER affects `name`, `timezone`, or `hours` — operating
 * schedules are a single global truth and are not localized in this phase.
 *
 * This is a pure, framework-independent function. It contains no locale list
 * and no locale→geography mapping: overrides are looked up by a config-supplied
 * key only, so adding a locale is purely a configuration/data change.
 */
export function resolveLocationForLocale(
  location: BusinessLocation,
  locale: string,
): BusinessLocation {
  const override = location.locales?.[locale];
  if (!override) return location;

  return {
    ...location,
    address: override.address ? mergeAddress(location.address, override.address) : location.address,
    phone: override.phone ?? location.phone,
    geo: override.geo ?? location.geo,
  };
}

/**
 * Resolves every location of a business for a locale via
 * `resolveLocationForLocale`, leaving all other business identity unchanged.
 */
export function resolveBusinessForLocale(
  business: Business,
  locale: string,
): Business {
  return {
    ...business,
    locations: business.locations.map((location) => resolveLocationForLocale(location, locale)),
  };
}