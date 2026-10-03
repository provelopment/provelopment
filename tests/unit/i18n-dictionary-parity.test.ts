import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { deploymentPaths } from "@/config/deployment-root";
import { getDictionary } from "@/config/i18n";
import { assertBookingLabelPresent as invariantFromPublicSurface } from "@/config/i18n";
import type { Dictionary } from "@/config/i18n/dictionary";
import { assertBookingLabelPresent as invariantFromModule } from "@/config/i18n/invariants";
import { loadDictionaryRegistry } from "@/config/i18n/registry";
import { currentBuildRuntimeContext } from "@/config/installation-runtime";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";

/**
 * S3F2A2-D2 — THE PRODUCTION BINDING ANSWERS EXACTLY WHAT IT ANSWERED BEFORE
 * ==========================================================================
 *
 * `getDictionary(...)` no longer composes a registry itself: it delegates to ONE immutable
 * `RuntimeDictionaryAccess` built from `currentBuildRuntimeContext()`. That is only a safe cutover if
 * every answer is UNCHANGED, so this suite asks that question directly — against the construction the
 * cutover REMOVED, rebuilt here in test code from the same two inputs it consumed (the deployment-owned
 * dictionary directory and the module-global configuration). A changed locale, site override, fallback
 * or effective dictionary fails one of these comparisons.
 *
 * Everything is compared against whatever deployment this run selects, never against a fixture's
 * expectations, so the suite stays meaningful in the generic project and beside the production capsule
 * alike. Only `getDictionary(...)`'s ANSWERS are asserted: the public API is what callers hold.
 */

/** The production binding BEFORE the cutover, reconstructed from the inputs it consumed. */
const removedLegacyBinding = loadDictionaryRegistry({
  directory: deploymentPaths().dictionaryDirectory,
  overrideDirectory: deploymentPaths().dictionaryOverrideDirectory,
  declaredLocales: siteConfig.locales.map((locale) => locale.code),
  defaultLocale: siteConfig.defaultLocale,
  sites: siteConfig.sites.map((site) => ({
    code: site.code,
    locales: site.locales.map((locale) => locale.path),
  })),
});

/** The capability the cutover installed — asked of the SAME explicit context the module uses. */
const runtimeAccess = dictionaryAccessForRuntimeContext(currentBuildRuntimeContext());

const configuredLocales = siteConfig.locales.map((locale) => locale.code);

describe("D2 — getDictionary parity with the removed legacy binding and the runtime access", () => {
  it("answers the SAME effective dictionary for every configured locale, with and without a site", () => {
    for (const locale of configuredLocales) {
      expect(getDictionary(locale)).toEqual(removedLegacyBinding.get(locale));
      expect(getDictionary(locale)).toEqual(runtimeAccess.get(locale));

      for (const site of siteConfig.sites) {
        expect(getDictionary(locale, site.code)).toEqual(removedLegacyBinding.get(locale, site.code));
        expect(getDictionary(locale, site.code)).toEqual(runtimeAccess.get(locale, site.code));
      }
    }
  });

  it("keeps the default-locale fallback for a locale nobody configured", () => {
    const unknown = "zz";
    expect(configuredLocales).not.toContain(unknown);

    expect(getDictionary(unknown)).toEqual(getDictionary(siteConfig.defaultLocale));
    expect(getDictionary(unknown)).toEqual(removedLegacyBinding.get(unknown));
    expect(getDictionary(unknown)).toEqual(runtimeAccess.get(unknown));
  });

  it("keeps a Site's own override, and the shared dictionary where no override exists", () => {
    // The registry SAYS which (site, locale) keys it holds an override for; this proof applies that
    // answer instead of restating the override rule.
    const overrides = removedLegacyBinding.overrides();

    for (const site of siteConfig.sites) {
      for (const locale of site.locales) {
        const key = `${site.code}/${locale.path}`;
        const effective = getDictionary(locale.path, site.code);

        expect(effective).toEqual(runtimeAccess.get(locale.path, site.code));
        if (overrides.has(key)) expect(effective).toEqual(overrides.get(key));
        else expect(effective).toEqual(getDictionary(locale.path));
      }
    }
  });

  it("keeps SITE ISOLATION: one Site's wording is never another Site's dictionary", () => {
    const locale = siteConfig.defaultLocale;

    for (const site of siteConfig.sites) {
      const scoped = JSON.stringify(getDictionary(locale, site.code));
      for (const other of siteConfig.sites) {
        if (other.code === site.code) continue;
        const otherScoped = JSON.stringify(getDictionary(locale, other.code));
        if (otherScoped === scoped) {
          // Identical answers are legal only when BOTH are the shared dictionary (no override at all).
          expect(otherScoped).toEqual(JSON.stringify(getDictionary(locale)));
          expect(scoped).toEqual(JSON.stringify(getDictionary(locale)));
        }
      }
    }
  });

  it("is stable across repeated reads (A/B/A): the binding is ONE immutable access", () => {
    const first = configuredLocales.map((locale) => getDictionary(locale));
    const second = configuredLocales.map((locale) => getDictionary(locale));
    const third = configuredLocales.map((locale) => getDictionary(locale));

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    // …and the same values the capability answers, so nothing is recomposed per call.
    expect(first).toEqual(configuredLocales.map((locale) => runtimeAccess.get(locale)));
  });
});

describe("D2 — the booking-label lock stays ONE rule on the production path", () => {
  it("exposes the SAME invariant implementation through the cutover (identity, not a copy)", () => {
    // The public/testing surface is preserved by RE-EXPORT: an import from `@/config/i18n` is the very
    // function object the runtime capability applies when it creates an access.
    expect(invariantFromPublicSurface).toBe(invariantFromModule);
  });

  it("still fails with the EXISTING diagnostic when an enabled booking label is absent", () => {
    // The shape a misconfigured deployment would build: booking ENABLED, and an effective dictionary
    // whose OPTIONAL booking section is gone. The capability creates its access by applying exactly this
    // rule, and `i18n/index.ts` creates its access at module load (pinned by the architecture guard), so
    // a production build still fails loudly — ONE wording, and the offending keys named.
    const withoutLabel = { ...getDictionary(siteConfig.defaultLocale) } as Dictionary;
    delete (withoutLabel as { booking?: unknown }).booking;

    const feature = { provider: "external-url", url: "https://example.com/book" } as const;
    const effective = new Map<string, Dictionary>([["ww/en", withoutLabel]]);

    expect(() => invariantFromModule(effective, feature, ["ww/en"])).toThrow(/booking\.book/);
    expect(() => invariantFromModule(effective, feature, ["ww/en"])).toThrow(/ww\/en/);
    expect(() => invariantFromModule(effective, feature, ["ww/en"])).toThrow(
      /Booking is enabled \(features\.booking\.provider = "external-url"\)/,
    );
  });

  it("is satisfied by the ACTIVE deployment's own effective dictionaries", () => {
    // Importing `@/config/i18n` at the top of this file already CONSTRUCTED the production access — and
    // therefore already ran the lock — without throwing. Re-running it here proves the lock is satisfied
    // by the ACTIVE deployment's (site, locale) set: the same set the binding's access is built from.
    const effective = new Map<string, Dictionary>();
    for (const site of siteConfig.sites) {
      for (const locale of site.locales) {
        effective.set(`${site.code}/${locale.path}`, getDictionary(locale.path, site.code));
      }
    }

    expect(() =>
      invariantFromPublicSurface(effective, siteConfig.bookingFeature, [...effective.keys()]),
    ).not.toThrow();
  });
});
