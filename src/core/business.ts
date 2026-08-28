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
 * A single physical presence. The canonical source of NAP and hours.
 * Timezone resolves as `location.timezone → business.timezone → global default`.
 */
export interface BusinessLocation {
  readonly id: string;
  readonly name?: string;
  readonly address: Address;
  readonly geo?: GeoCoordinates;
  readonly phone?: string;
  readonly timezone?: string;
  readonly hours?: BusinessHours;
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