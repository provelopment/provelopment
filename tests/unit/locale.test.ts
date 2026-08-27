import { describe, expect, it } from "vitest";

import {
  buildLanguageAlternates,
  negotiateLocale,
  parseAcceptLanguage,
  replaceLocaleSegment,
} from "@/core/locale";

describe("replaceLocaleSegment", () => {
  it("swaps the leading locale segment", () => {
    expect(replaceLocaleSegment("/en/about", "fr")).toBe("/fr/about");
  });

  it("handles the locale root", () => {
    expect(replaceLocaleSegment("/en", "de")).toBe("/de");
  });

  it("preserves deeper paths and trailing slashes", () => {
    expect(replaceLocaleSegment("/en/resources/", "zh")).toBe("/zh/resources/");
  });
});

describe("parseAcceptLanguage", () => {
  it("orders entries by quality", () => {
    const entries = parseAcceptLanguage("en;q=0.5, nl-NL;q=0.9, de");

    expect(entries.map((entry) => entry.locale)).toEqual([
      "de",
      "nl-NL",
      "en",
    ]);
  });

  it("drops malformed entries and deprioritizes invalid quality values", () => {
    const entries = parseAcceptLanguage("notalanguage, en;q=abc, fr");

    expect(entries.map((entry) => entry.locale)).toEqual(["fr", "en"]);
  });
});

describe("negotiateLocale", () => {
  const supported = ["en", "nl"];

  it("prefers the cookie when it is supported", () => {
    const locale = negotiateLocale({
      supported,
      defaultLocale: "en",
      cookieLocale: "nl",
      acceptLanguage: "en",
    });

    expect(locale).toBe("nl");
  });

  it("ignores unsupported cookies", () => {
    const locale = negotiateLocale({
      supported,
      defaultLocale: "en",
      cookieLocale: "fr",
      acceptLanguage: "en",
    });

    expect(locale).toBe("en");
  });

  it("matches region sub-tags against base locales", () => {
    const locale = negotiateLocale({
      supported,
      defaultLocale: "en",
      acceptLanguage: "nl-NL,nl;q=0.9,en;q=0.8",
    });

    expect(locale).toBe("nl");
  });

  it("respects quality ordering across languages", () => {
    const locale = negotiateLocale({
      supported,
      defaultLocale: "nl",
      acceptLanguage: "de;q=1.0, en;q=0.8, nl;q=0.5",
    });

    expect(locale).toBe("en");
  });

  it("falls back to the default locale", () => {
    const locale = negotiateLocale({
      supported,
      defaultLocale: "en",
      acceptLanguage: "ja-JP,ja;q=0.9",
    });

    expect(locale).toBe("en");
  });
});

describe("buildLanguageAlternates", () => {
  it("builds an hreflang map with x-default", () => {
    const alternates = buildLanguageAlternates({
      baseUrl: "https://example.com",
      locales: ["en", "nl"],
      defaultLocale: "en",
      path: "/about",
    });

    expect(alternates).toEqual({
      en: "https://example.com/en/about",
      nl: "https://example.com/nl/about",
      "x-default": "https://example.com/en/about",
    });
  });

  it("normalizes the root path", () => {
    const alternates = buildLanguageAlternates({
      baseUrl: "https://example.com",
      locales: ["en"],
      path: "/",
    });

    expect(alternates).toEqual({ en: "https://example.com/en" });
  });
});