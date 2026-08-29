import { describe, expect, it } from "vitest";

import { dictionarySchema } from "@/config/i18n/dictionary";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";

/**
 * These tests exercise the REAL configured dictionaries through the registry
 * (which validates them against the Zod schema and proves every configured
 * locale has a file). They derive every locale and the default locale from
 * `site.config.json` — reconfiguring locale data (e.g. adding a ninth locale
 * or changing the default) must never require editing a platform test.
 */
const configuredCodes = siteConfig.locales.map((locale) => locale.code);
const defaultLocale = siteConfig.defaultLocale;

describe("i18n dictionaries (registry-backed, config-derived)", () => {
  it("every configured locale dictionary satisfies the Zod schema (shape + required keys)", () => {
    for (const code of configuredCodes) {
      const result = dictionarySchema.safeParse(getDictionary(code));
      expect(result.success, `${code} failed: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it("covers every locale enabled in site.config.json", () => {
    for (const code of configuredCodes) {
      expect(getDictionary(code)).toBeDefined();
    }
  });

  it("falls back to the default locale for locales that are not configured", () => {
    // A locale code guaranteed not to be configured (config is derived, so
    // this can never silently collide with a shipped locale).
    const unknown = "zz";
    expect(configuredCodes).not.toContain(unknown);
    expect(getDictionary(unknown)).toEqual(getDictionary(defaultLocale));
  });

  it("dictionary navigation matches the configured navigation contract", () => {
    const configuredKeys = siteConfig.navigation.map((item) => item.href).sort();

    for (const code of configuredCodes) {
      const items = getDictionary(code).navigation.items;
      // site.config.json is the single source of truth: every configured nav
      // href must be translated (a missing key would render the fallback
      // label), and no orphaned keys may linger.
      expect(Object.keys(items).sort(), `locale ${code}`).toEqual(configuredKeys);
    }
  });

  it("has non-empty error-boundary copy in every configured locale", () => {
    for (const code of configuredCodes) {
      const error = getDictionary(code).error;
      for (const key of ["title", "message", "tryAgain", "returnHome"] as const) {
        expect(error[key].trim().length, `${code}.error.${key} should be non-empty`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("accepts a dictionary without the optional booking section (back-compat)", () => {
    // `features.booking` and `dictionary.booking` are optional: a site with no
    // booking configuration must validate without any booking keys. A
    // dictionary missing the booking section is a fully valid legacy/minimal
    // dictionary — never a schema failure.
    const base = getDictionary(defaultLocale);
    const withoutBooking = { ...base };
    delete (withoutBooking as Record<string, unknown>).booking;
    const result = dictionarySchema.safeParse(withoutBooking);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });
});