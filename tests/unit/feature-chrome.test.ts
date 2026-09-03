import { describe, expect, it } from "vitest";

import { assertDictionarySectionPresent, getDictionary } from "@/config/i18n";
import type { Dictionary } from "@/config/i18n/dictionary";
import { siteConfig } from "@/config";

type ChromeSection = "testimonials" | "portfolio" | "blog";

function withoutSection(
  dictionary: Dictionary,
  section: ChromeSection,
): Dictionary {
  const copy = JSON.parse(JSON.stringify(dictionary)) as Dictionary &
    Partial<Record<ChromeSection, unknown>>;
  delete copy[section];
  return copy as Dictionary;
}

describe("assertDictionarySectionPresent (Phase T F1-style lock)", () => {
  it("passes when every locale has the chrome section", () => {
    const maps = new Map<string, Dictionary>([
      ["en", getDictionary("en")],
      ["ja", getDictionary("ja")],
    ]);
    expect(() => assertDictionarySectionPresent(maps, ["en", "ja"], "testimonials")).not.toThrow();
  });

  it("throws naming the offending locale when a section is missing", () => {
    const maps = new Map<string, Dictionary>([
      ["en", getDictionary("en")],
      ["ja", withoutSection(getDictionary("ja"), "testimonials")],
    ]);
    expect(() => assertDictionarySectionPresent(maps, ["en", "ja"], "testimonials")).toThrow(/ja/);
    expect(() => assertDictionarySectionPresent(maps, ["en", "ja"], "testimonials")).toThrow(
      /testimonials/,
    );
  });

  it("holds for all three enabled demo features across every configured locale", () => {
    const maps = new Map<string, Dictionary>();
    for (const { code } of siteConfig.locales) {
      maps.set(code, getDictionary(code));
    }
    const locales = siteConfig.locales.map((locale) => locale.code);
    for (const section of ["testimonials", "portfolio", "blog"] as const) {
      expect(() => assertDictionarySectionPresent(maps, locales, section)).not.toThrow(section);
    }
  });
});