import { describe, expect, it } from "vitest";

import { canonicalTagForPathKey, isLocalePathKey } from "@/core/site-locale";
import { SiteConfigurationError, resolveSites } from "@/core/site";

/**
 * THE LOCALE CONTRACT of a SITE (FOUNDATION-S1/S1E3A)
 * ==================================================
 *
 * A locale is addressed by a LOWERCASE path key (the content directory and the URL segment) and
 * identified by a canonical tag at standards-facing boundaries. A country site derives its country
 * for a simple key; the Worldwide site derives nothing. Two locale keys of one site that resolve to
 * the SAME canonical tag are a hard configuration error — this file is the proof the model claims.
 */
const LOCALES = ["en", "fr", "fr-fr", "de", "pt", "zh-hant", "zh-hant-tw", "sr-latn"];

function resolve(input: readonly { code: string; locales?: readonly string[]; defaultLocale?: string }[]) {
  return resolveSites({ input, defaultLocale: "en", locales: LOCALES }).sites;
}

describe("locale path-key grammar", () => {
  it("accepts the documented shapes", () => {
    for (const key of ["en", "fr", "fr-ca", "zh-hant", "zh-hant-tw", "sr-latn", "es-419"]) {
      expect(isLocalePathKey(key), key).toBe(true);
    }
  });

  it("refuses spellings outside the Foundation contract (extensions, private use, extra subtags)", () => {
    for (const key of [
      "en-x-private",
      "en-US-u-nu-latn",
      "de-de-u-co-phonebk",
      "zh-hant-tw-extra",
      "EN",
      "Fr-Ca",
      "f",
      "english",
      "fr_ca",
    ]) {
      expect(isLocalePathKey(key), key).toBe(false);
    }
  });
});

describe("canonical casing", () => {
  it("upper-cases the region and title-cases the script", () => {
    expect(canonicalTagForPathKey("fr-ca")).toBe("fr-CA");
    expect(canonicalTagForPathKey("zh-hant")).toBe("zh-Hant");
    expect(canonicalTagForPathKey("zh-hant-tw")).toBe("zh-Hant-TW");
    expect(canonicalTagForPathKey("sr-latn")).toBe("sr-Latn");
    expect(canonicalTagForPathKey("en")).toBe("en");
  });

  it("keeps the URL/file key lowercase while the tag is canonical", () => {
    const [ca] = resolve([{ code: "ca", locales: ["en", "fr"], defaultLocale: "en" }]);
    const french = ca?.locales.find((locale) => locale.path === "fr");
    expect(french?.path).toBe("fr");
    expect(french?.canonical).toBe("fr-CA");
  });
});

describe("country derivation for a simple key", () => {
  it("derives the site's country (ca/en → en-CA, ch/de → de-CH, br/pt → pt-BR)", () => {
    const [ca] = resolve([{ code: "ca", locales: ["en", "fr"], defaultLocale: "en" }]);
    expect(ca?.locales.map((locale) => locale.canonical)).toEqual(["en-CA", "fr-CA"]);

    const [ch] = resolve([{ code: "ch", locales: ["de"], defaultLocale: "de" }]);
    expect(ch?.locales[0]?.canonical).toBe("de-CH");

    const [br] = resolve([{ code: "br", locales: ["pt"], defaultLocale: "pt" }]);
    expect(br?.locales[0]?.canonical).toBe("pt-BR");
  });
});

describe("the Worldwide site makes no country assumption", () => {
  it("keeps a simple key simple (ww/fr → fr)", () => {
    const [ww] = resolve([{ code: "ww", locales: ["fr"], defaultLocale: "fr" }]);
    expect(ww?.locales[0]?.canonical).toBe("fr");
  });

  it("honours an explicit canonical mapping (ww/en → en-US)", () => {
    const [ww] = resolveSites({
      input: [{ code: "ww", locales: [{ path: "en", canonical: "en-US" }], defaultLocale: "en" }],
      defaultLocale: "en",
      locales: ["en"],
    }).sites;
    expect(ww?.locales[0]?.canonical).toBe("en-US");
  });
});

describe("duplicate effective locale", () => {
  it("is a HARD error when two keys of one site resolve to the same canonical tag", () => {
    expect(() => resolve([{ code: "ca", locales: ["en", "en-ca"], defaultLocale: "en" }])).toThrowError(
      SiteConfigurationError,
    );
    expect(() => resolve([{ code: "ca", locales: ["en", "en-ca"], defaultLocale: "en" }])).toThrowError(
      /en-CA/,
    );
  });

  it("accepts two EXPLICIT variants whose canonical tags differ (fr-CA and fr-FR)", () => {
    const [ca] = resolve([{ code: "ca", locales: ["fr", "fr-fr"], defaultLocale: "fr" }]);
    expect(ca?.locales.map((locale) => locale.path)).toEqual(["fr", "fr-fr"]);
    expect(ca?.locales.map((locale) => locale.canonical)).toEqual(["fr-CA", "fr-FR"]);
  });

  it("normalises a configuration's uppercase spelling into the lowercase path key", () => {
    const [ca] = resolve([{ code: "ca", locales: ["FR"], defaultLocale: "fr" }]);
    expect(ca?.locales[0]?.path).toBe("fr");
    expect(ca?.locales[0]?.canonical).toBe("fr-CA");
  });
});
