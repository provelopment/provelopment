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

/** Per-locale override of the business-wide customer-facing contact channels. */
export interface BusinessContactLocaleOverride {
  readonly email?: string;
  readonly phone?: string;
}

export interface BusinessContact {
  readonly email?: string;
  readonly phone?: string;
  /**
   * Optional per-market contact overrides (Phase I), keyed by BCP-47 locale
   * code. A locale is a customer context, NOT a country mapping: locale→country
   * is never inferred — the adopter configures whatever per-locale contact
   * they want (or none, falling back to the global values above).
   */
  readonly locales?: Readonly<Record<string, BusinessContactLocaleOverride>>;
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
/**
 * How an address is presented on human-facing pages.
 * - `local`               → the native/local representation only.
 * - `local-international` → the native/local representation PLUS a
 *   Latin/international representation (requires `addressInternational`).
 */
export type AddressPresentationMode = "local" | "local-international";

export interface BusinessLocationLocaleOverride {
  /** Per-field partial native/local address; unspecified global fields are inherited. */
  readonly address?: Partial<Address>;
  /** Per-field partial Latin/international address (inherits a base if supplied). */
  readonly addressInternational?: Partial<Address>;
  /** Display mode for this locale (falls back to the location's base mode). */
  readonly addressMode?: AddressPresentationMode;
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
  /** Native/local address (what a local customer reads). */
  readonly address: Address;
  /**
   * Optional Latin/international representation of the SAME place, for
   * cross-border/global consumers. Owner-supplied business data — the platform
   * never transliterates. Optional: a local-only business omits it.
   */
  readonly addressInternational?: Address;
  /** How the address is presented on pages; defaults to "local". */
  readonly addressMode?: AddressPresentationMode;
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

/** Merges an optional base international address with a partial locale override. */
function mergeOptionalAddress(
  base: Address | undefined,
  override: Partial<Address>,
): Address {
  const emptyBase: Address = { street: "", city: "" };
  return mergeAddress(base ?? emptyBase, override);
}

/**
 * Joins a structured address into a single presentation-ready line. Kept here
 * so visible consumers (footer, any future UI) format addresses identically,
 * while JSON-LD and provider adapters keep their own consumers. Pure and
 * framework-free.
 */
export function formatAddress(address: Address): string {
  return [address.street, address.city, address.region, address.postalCode, address.country]
    .filter(Boolean)
    .join(", ");
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
    addressInternational: override.addressInternational
      ? mergeOptionalAddress(location.addressInternational, override.addressInternational)
      : location.addressInternational,
    addressMode: override.addressMode ?? location.addressMode ?? "local",
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
    contact: resolveBusinessContactForLocale(business.contact, locale),
    locations: business.locations.map((location) => resolveLocationForLocale(location, locale)),
  };
}

/**
 * Resolves a business's customer-facing contact channels for a locale.
 *
 * Deterministic fallback (a locale is a customer context, never a country):
 *   1. the locale override's field, when configured;
 *   2. the global business contact field, otherwise.
 *
 * A contact object with no `locales` map (or no entry for the locale) is
 * returned unchanged, preserving existing behaviour. Locale-specific values
 * win over the global/default values; globally-fixed adoption is a valid state
 * (no per-locale contact at all).
 */
export function resolveBusinessContactForLocale(
  contact: BusinessContact,
  locale: string,
): BusinessContact {
  const override = contact.locales?.[locale];
  if (!override) return contact;

  return {
    ...contact,
    email: override.email ?? contact.email,
    phone: override.phone ?? contact.phone,
  };
}

/**
 * Validates the address presentation model for every location and locale.
 *
 * Invariant: a presentation mode of `local-international` REQUIRES a
 * Latin/international address. Silently showing only the local form when the
 * owner explicitly asked for both would hide a configuration mistake, so a
 * missing international address is a loud, descriptive configuration error
 * naming the exact location/locale. Local-only owners simply omit
 * `addressInternational` and use the default "local" mode.
 *
 * Pure and framework-free; called by the config loader (build time) so a bad
 * edit fails fast. The resolvers themselves never throw — this is a config
 * validation concern, not a resolution concern.
 */
export function assertValidAddressPresentation(
  business: Business,
  locales: readonly string[],
): void {
  const requireInternational = (
    subject: string,
    mode: AddressPresentationMode | undefined,
    international: Address | undefined,
  ): void => {
    if ((mode ?? "local") === "local-international" && !international) {
      throw new Error(
        `Address presentation mode "local-international" requires a Latin/international address. ` +
          `Add "addressInternational" for ${subject}, or set "addressMode" to "local".`,
      );
    }
  };

  for (const location of business.locations) {
    requireInternational(
      `business.locations["${location.id}"]`,
      location.addressMode,
      location.addressInternational,
    );

    for (const locale of locales) {
      const resolved = resolveLocationForLocale(location, locale);
      requireInternational(
        `business.locations["${location.id}"] for locale "${locale}"`,
        resolved.addressMode,
        resolved.addressInternational,
      );
    }
  }
}