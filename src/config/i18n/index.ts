import path from "node:path";

import type { BookingFeatureConfig } from "@/core/booking";
import type { Locale } from "@/core/locale";

import { siteConfig } from "../loader";
import type { Dictionary } from "./dictionary";
import { loadDictionaryRegistry } from "./registry";

const dictionaryDirectory = path.join(process.cwd(), "config", "i18n");

// Built once at module load (build time). Discovery is data-driven: the set of
// available dictionaries comes from the `config/i18n/` directory (validated
// against the Zod dictionary schema and against the locales enabled in
// `site.config.json`). Adding a locale is a config/data edit — never a change
// to `src/` registration code.
const registry = loadDictionaryRegistry({
  directory: dictionaryDirectory,
  declaredLocales: siteConfig.locales.map((locale) => locale.code),
  defaultLocale: siteConfig.defaultLocale,
});

// F1 invariant: an enabled booking CTA must never silently disappear because a
// locale is missing its localized label. Runs at module load (build time).
assertBookingLabelPresent(
  registry.all(),
  siteConfig.bookingFeature,
  siteConfig.locales.map((locale) => locale.code),
);

/**
 * Returns the dictionary for a locale, falling back to the default locale's
 * dictionary only when the requested locale is not configured. Every configured
 * locale is guaranteed (at registry load) to have a validated dictionary.
 */
export function getDictionary(locale: Locale): Dictionary {
  return registry.get(locale);
}

/**
 * F1 invariant: when booking is enabled via `features.booking.provider =
 * "external-url"`, every configured locale that can render the booking
 * experience must have a non-empty localized `booking.book` label. A missing
 * label must not silently look like disabled booking.
 *
 * Booking absent (or disabled) is a valid state and skips the check entirely.
 * Uses the ACTUAL per-locale dictionaries (no default-locale fallback) so a
 * single locale with a missing label is caught and named.
 */
export function assertBookingLabelPresent(
  dictionaries: ReadonlyMap<string, Dictionary>,
  bookingFeature: BookingFeatureConfig | undefined,
  locales: readonly string[],
): void {
  if (bookingFeature?.provider !== "external-url") return;

  const missing = locales.filter((code) => {
    const label = dictionaries.get(code)?.booking?.book?.trim();
    return !label;
  });

  if (missing.length > 0) {
    throw new Error(
      `Booking is enabled (features.booking.provider = "external-url") but the following ` +
        `configured locale(s) are missing a non-empty localized "booking.book" label: ${missing.join(", ")}. ` +
        `Add "booking.book" to each config/i18n/<locale>.json, or disable booking, so an enabled ` +
        `booking CTA is never silently hidden.`,
    );
  }
}