/**
 * Phase K — Regional operating context.
 *
 * A Region is physical/operational business context: timezone, address,
 * coordinates, contact, weekly hours, and holidays. It is conceptually
 * independent from both Locale (language/content) and Page (what the customer
 * is shown). A page resolves an optional region; a region may be shared by
 * many pages/locales; a locale has no single inherent region or timezone.
 *
 * This module is framework-free (no React/Next) and pure: resolution never
 * throws, config validation throws loudly at build time (see
 * `assertRegionsValid`) so a bad edit fails before anything renders.
 */

import type {
  Address,
  AddressPresentationMode,
  BusinessLocation,
  GeoCoordinates,
} from "./business";

/** The seven explicit days of the week, each independently schedulable. */
export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** Ordered weekday keys (monday..sunday) for evaluation and display. */
export const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** A single open/close interval in 24-hour `HH:mm` wall-clock (region-local). */
export interface TimeInterval {
  readonly open: string;
  readonly close: string;
}

/** A date-keyed exception to the normal weekly schedule. */
export interface RegionHoliday {
  /** ISO date `YYYY-MM-DD` (wall-clock in the region's timezone). */
  readonly date: string;
  /** Human label, e.g. "Christmas Day". */
  readonly name: string;
  /** `true` closes the region for the whole date. */
  readonly closed?: boolean;
  /** Special hours for the date; a listed holiday with no intervals is closed. */
  readonly intervals?: readonly TimeInterval[];
}

/** The seven-day schedule plus structured holidays for one region. */
export interface RegionSchedule {
  readonly monday: readonly TimeInterval[];
  readonly tuesday: readonly TimeInterval[];
  readonly wednesday: readonly TimeInterval[];
  readonly thursday: readonly TimeInterval[];
  readonly friday: readonly TimeInterval[];
  readonly saturday: readonly TimeInterval[];
  readonly sunday: readonly TimeInterval[];
  readonly holidays: readonly RegionHoliday[];
}

/**
 * A single operating region — the sole authority for a regional page's
 * operational identity. `timezone` is REQUIRED and must be a valid IANA
 * identifier: it is never inferred/merged from locale, address, or any global
 * default.
 */
export interface OperationalRegion {
  readonly id: string;
  /** Valid IANA timezone identifier (authoritative for this region). */
  readonly timezone: string;
  readonly name?: string;
  /** Fictional or real physical address shown as the region's NAP. */
  readonly address: Address;
  readonly addressInternational?: Address;
  readonly addressMode?: AddressPresentationMode;
  readonly geo?: GeoCoordinates;
  readonly phone?: string;
  readonly email?: string;
  readonly hours: RegionSchedule;
}

/** Maps a page (locale + content slug) to a region id. */
export interface PageRegionBinding {
  readonly locale: string;
  readonly slug: string;
  /** Must reference an existing region (validated at build time). */
  readonly region: string;
}

/** Resolves a region id to its configured region, or null. */
export function resolveRegion(
  regions: Readonly<Record<string, OperationalRegion>>,
  regionId: string,
): OperationalRegion | null {
  return regions[regionId] ?? null;
}

/** Resolves a region id bound to a page, or null when not mapped. */
export function resolvePageRegionBinding(
  pages: readonly PageRegionBinding[],
  locale: string,
  slug: string,
): string | null {
  return pages.find((binding) => binding.locale === locale && binding.slug === slug)?.region ?? null;
}

/** True when `iso` is a real calendar date (leap years handled). */
export function isCalendarDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validates region + page configuration (call from the config loader at build
 * time so invalid edits fail fast and descriptively):
 *
 *  - every region id is non-empty (record key semantics guarantee uniqueness);
 *  - every region has a valid IANA timezone, an address, and valid holiday
 *    dates/names (structural `HH:mm`/shape checks live in the Zod schema);
 *  - `local-international` regions require an international address (same
 *    invariant as legacy locations);
 *  - every page binding references an existing region;
 *  - no duplicate (locale, slug) page binding;
 *  - bound locales are among the configured locales.
 */
export function assertRegionsValid(
  regions: Readonly<Record<string, OperationalRegion>>,
  pages: readonly PageRegionBinding[],
  configuredLocales: readonly string[],
): void {
  for (const region of Object.values(regions)) {
    if (region.timezone.trim().length === 0) {
      throw new Error(`Region "${region.id}" has an empty timezone.`);
    }

    if (region.addressMode === "local-international" && !region.addressInternational) {
      throw new Error(
        `Region "${region.id}" uses addressMode "local-international" but has no ` +
          `"addressInternational". Add one, or set addressMode to "local".`,
      );
    }

    for (const holiday of region.hours.holidays) {
      if (!isCalendarDate(holiday.date)) {
        throw new Error(
          `Region "${region.id}" holiday "${holiday.name}" has invalid date "${holiday.date}" ` +
            `(expected a real YYYY-MM-DD date).`,
        );
      }
      if (holiday.name.trim().length === 0) {
        throw new Error(`Region "${region.id}" has a holiday with an empty name.`);
      }
    }
  }

  const seen = new Set<string>();
  for (const binding of pages) {
    const key = `${binding.locale}:${binding.slug}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate page→region binding for locale "${binding.locale}" / slug "${binding.slug}". ` +
          `Each page maps to at most one region.`,
      );
    }
    seen.add(key);

    if (!configuredLocales.includes(binding.locale)) {
      throw new Error(
        `Page binding for slug "${binding.slug}" uses locale "${binding.locale}", but that ` +
          `locale is not configured.`,
      );
    }

    if (!regions[binding.region]) {
      throw new Error(
        `Page binding for locale "${binding.locale}" / slug "${binding.slug}" references ` +
          `unknown region "${binding.region}". Add it to "business.regions".`,
      );
    }
  }
}

/**
 * Adapts a region to the `BusinessLocation` shape consumed by the existing
 * provider-neutral direction-link seam. Only the fields the maps adapters read
 * (geo / international / native address) are populated — the adapter never
 * gains region or timezone awareness.
 */
export function regionToLocation(region: OperationalRegion): BusinessLocation {
  return {
    id: region.id,
    name: region.name,
    address: region.address,
    addressInternational: region.addressInternational,
    addressMode: region.addressMode,
    geo: region.geo,
    phone: region.phone,
  };
}