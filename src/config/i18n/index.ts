import path from "node:path";

import type { BookingFeatureConfig } from "@/core/booking";
import type { Locale } from "@/core/locale";

import { siteConfig } from "../loader";
import type { Dictionary } from "./dictionary";
import { loadDictionaryRegistry } from "./registry";

const dictionaryDirectory = path.join(process.cwd(), "config", "i18n");

// S1E2 — the OPTIONAL site+locale overrides live in a `sites/` folder BESIDE the shared
// dictionaries, one `config/i18n/sites/<site>/<locale>.json` per (site, locale) that speaks
// differently. Absent → every site is exactly the shared dictionary (the ordinary deployment).
const dictionaryOverrideDirectory = path.join(dictionaryDirectory, "sites");

// Built once at module load (build time). Discovery is data-driven: the set of
// available dictionaries comes from the `config/i18n/` directory (validated
// against the Zod dictionary schema and against the locales enabled in
// `site.config.json`). Adding a locale is a config/data edit — never a change
// to `src/` registration code.
const registry = loadDictionaryRegistry({
  directory: dictionaryDirectory,
  overrideDirectory: dictionaryOverrideDirectory,
  declaredLocales: siteConfig.locales.map((locale) => locale.code),
  defaultLocale: siteConfig.defaultLocale,
  sites: siteConfig.sites.map((site) => ({
    code: site.code,
    locales: site.locales.map((locale) => locale.path),
  })),
});

// F1 invariant: an enabled booking CTA must never silently disappear because a
// locale — or a SITE's override of it — is missing its localized label. Runs at
// module load (build time) over every EFFECTIVE (site, locale) dictionary, so a
// site override cannot un-satisfy the lock either.
const effectiveDictionaries = new Map<string, Dictionary>();
for (const site of siteConfig.sites) {
  for (const locale of site.locales) {
    effectiveDictionaries.set(`${site.code}/${locale.path}`, registry.get(locale.path, site.code));
  }
}

assertBookingLabelPresent(
  effectiveDictionaries,
  siteConfig.bookingFeature,
  [...effectiveDictionaries.keys()],
);

/**
 * Returns the EFFECTIVE dictionary for a locale and, when given, the ACTIVE SITE: the shared
 * dictionary for that locale with that site's override applied (`@/config/i18n/registry`).
 *
 * S1E2 — the site is the second argument because only the caller knows which site's page tree it
 * is speaking for. A caller that passes no site gets the SHARED dictionary, which is the correct
 * answer for a site-less surface — and never another site's wording.
 *
 * Falls back to the default locale's dictionary only when the requested locale is not configured.
 * Every configured locale is guaranteed (at registry load) to have a validated dictionary.
 */
export function getDictionary(locale: Locale, siteCode?: string): Dictionary {
  return registry.get(locale, siteCode);
}

/**
 * Phase T — typed access to an OPTIONAL chrome section. The F1-style lock
 * (`assertDictionarySectionPresent`) guarantees the section exists at build
 * time whenever its feature is enabled; this helper converts that invariant
 * into a typed non-optional value and makes a missing section a loud internal
 * error instead of a silent `undefined`.
 */
export function requireDictionarySection<T extends keyof Dictionary>(
  dictionary: Dictionary,
  section: T,
): NonNullable<Dictionary[T]> {
  const value = dictionary[section];
  if (!value) {
    throw new Error(
      `Dictionary section "${section}" is missing; the feature lock should have caught this at build time.`,
    );
  }
  return value as NonNullable<Dictionary[T]>;
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