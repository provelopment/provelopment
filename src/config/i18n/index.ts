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

// Phase T F1-style locks: an enabled trust/publishing feature must never render
// with missing chrome in some locale. The optional dictionary sections
// (`testimonials`, `portfolio`, `blog`) are required for EVERY configured
// locale when the matching feature flag is enabled; absent-with-feature-off
// remains a valid state.
const configuredLocaleCodes = siteConfig.locales.map((locale) => locale.code);
const dictionaries = registry.all();
if (siteConfig.testimonialsFeature) {
  assertDictionarySectionPresent(dictionaries, configuredLocaleCodes, "testimonials");
}
if (siteConfig.portfolioFeature) {
  assertDictionarySectionPresent(dictionaries, configuredLocaleCodes, "portfolio");
}
if (siteConfig.blogFeature) {
  assertDictionarySectionPresent(dictionaries, configuredLocaleCodes, "blog");
}

/**
 * Returns the dictionary for a locale, falling back to the default locale's
 * dictionary only when the requested locale is not configured. Every configured
 * locale is guaranteed (at registry load) to have a validated dictionary.
 */
export function getDictionary(locale: Locale): Dictionary {
  return registry.get(locale);
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

/**
 * Phase T F1-style lock: when a feature is enabled, EVERY configured locale
 * must provide its chrome dictionary section (e.g. `testimonials`, `portfolio`,
 * `blog`). A missing section must not silently render untranslated/absent
 * chrome — the build fails naming the offending locales. Sections are OPTIONAL
 * in the schema, so absent-with-feature-off remains a valid state.
 */
export function assertDictionarySectionPresent(
  dictionaries: ReadonlyMap<string, Dictionary>,
  locales: readonly string[],
  section: "testimonials" | "portfolio" | "blog",
): void {
  const missing = locales.filter((code) => !dictionaries.get(code)?.[section]);
  if (missing.length > 0) {
    throw new Error(
      `A feature is enabled that requires the "${section}" dictionary section, but the ` +
        `following configured locale(s) are missing it: ${missing.join(", ")}. ` +
        `Add "${section}" (heading/emptyState/etc.) to each config/i18n/<locale>.json, ` +
        `or disable the feature. Enabled feature chrome must never silently disappear.`,
    );
  }
}