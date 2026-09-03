import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import {
  displayNameWithEnglish,
  regionDisplayName,
  timezoneDisplayLabel,
  timezoneNameForLocale,
  TZ_REFERENCE_DATE,
} from "@/core/display-labels";
import type { OperationalRegion } from "@/core/region";

function makeRegion(
  partial: Partial<OperationalRegion> & { readonly id: string },
): OperationalRegion {
  return {
    timezone: "America/Toronto",
    address: { street: "1 Demo St", city: "Demo", country: "Canada" },
    hours: {
      monday: [], tuesday: [], wednesday: [], thursday: [], friday: [],
      saturday: [], sunday: [], holidays: [],
    },
    ...partial,
  };
}

describe("Phase M refinement — language display names", () => {
  it("shows native (English) when they differ", () => {
    expect(displayNameWithEnglish("Français", "French")).toBe("Français (French)");
    expect(displayNameWithEnglish("Deutsch", "German")).toBe("Deutsch (German)");
    expect(displayNameWithEnglish("日本語", "Japanese")).toBe("日本語 (Japanese)");
    expect(displayNameWithEnglish("한국어", "Korean")).toBe("한국어 (Korean)");
    expect(displayNameWithEnglish("Bahasa Indonesia", "Indonesian")).toBe(
      "Bahasa Indonesia (Indonesian)",
    );
  });

  it("never duplicates identical names", () => {
    expect(displayNameWithEnglish("English", "English")).toBe("English");
    expect(displayNameWithEnglish("Toronto", "Toronto")).toBe("Toronto");
  });

  it("returns the native label alone when no English label is configured", () => {
    expect(displayNameWithEnglish("Español", undefined)).toBe("Español");
  });
});

describe("Phase M refinement — location display names", () => {
  it("canonical English name when the localized form is identical", () => {
    expect(regionDisplayName("en", makeRegion({ id: "toronto", label: "Toronto" }))).toBe("Toronto");
    expect(regionDisplayName("fr", makeRegion({ id: "toronto", label: "Toronto" }))).toBe("Toronto");
  });

  it("Montréal (Montreal) in French, Montreal in English", () => {
    const montreal = makeRegion({ id: "montreal", label: "Montreal", labels: { fr: "Montréal" } });
    expect(regionDisplayName("fr", montreal)).toBe("Montréal (Montreal)");
    expect(regionDisplayName("en", montreal)).toBe("Montreal");
  });

  it("appends local non-English name in brackets in English when defaultLocale differs", () => {
    const montrealFr = makeRegion({
      id: "montreal",
      label: "Montreal",
      defaultLocale: "fr",
      labels: { fr: "Montréal" },
    });
    expect(regionDisplayName("en", montrealFr)).toBe("Montreal (Montréal)");
  });

  it("CJK localized names with English suffix", () => {
    expect(
      regionDisplayName("ja", makeRegion({ id: "tokyo", label: "Tokyo", labels: { ja: "東京" } })),
    ).toBe("東京 (Tokyo)");
    expect(
      regionDisplayName("ko", makeRegion({ id: "seoul", label: "Seoul", labels: { ko: "서울" } })),
    ).toBe("서울 (Seoul)");
    expect(
      regionDisplayName("zh", makeRegion({ id: "shanghai", label: "Shanghai", labels: { zh: "上海" } })),
    ).toBe("上海 (Shanghai)");
  });

  it("falls back through label/name/id when no localized label exists", () => {
    expect(regionDisplayName("ja", makeRegion({ id: "berlin", label: "Berlin" }))).toBe("Berlin");
    expect(regionDisplayName("ja", makeRegion({ id: "paris" }))).toBe("paris");
  });

  it("live demo siteConfig: English view shows clean names for English cities and native in brackets for non-English cities", () => {
    // English-primary locations have no brackets
    expect(regionDisplayName("en", siteConfig.regions["london"])).toBe("London");
    expect(regionDisplayName("en", siteConfig.regions["los-angeles"])).toBe("Los Angeles");
    expect(regionDisplayName("en", siteConfig.regions["new-york"])).toBe("New York");
    expect(regionDisplayName("en", siteConfig.regions["sydney"])).toBe("Sydney");
    expect(regionDisplayName("en", siteConfig.regions["toronto"])).toBe("Toronto");

    // Non-English locations with distinct native names have native names in brackets
    expect(regionDisplayName("en", siteConfig.regions["tokyo"])).toBe("Tokyo (東京)");
    expect(regionDisplayName("en", siteConfig.regions["seoul"])).toBe("Seoul (서울)");
    expect(regionDisplayName("en", siteConfig.regions["shanghai"])).toBe("Shanghai (上海)");
    expect(regionDisplayName("en", siteConfig.regions["moscow"])).toBe("Moscow (Москва)");

    // Non-English locations with identical native names have no brackets
    expect(regionDisplayName("en", siteConfig.regions["berlin"])).toBe("Berlin");
    expect(regionDisplayName("en", siteConfig.regions["paris"])).toBe("Paris");
    expect(regionDisplayName("en", siteConfig.regions["madrid"])).toBe("Madrid");
    expect(regionDisplayName("en", siteConfig.regions["jakarta"])).toBe("Jakarta");
  });

  it("live demo siteConfig: Korean view displays all cities in Korean with English in brackets", () => {
    expect(regionDisplayName("ko", siteConfig.regions["seoul"])).toBe("서울 (Seoul)");
    expect(regionDisplayName("ko", siteConfig.regions["sydney"])).toBe("시드니 (Sydney)");
    expect(regionDisplayName("ko", siteConfig.regions["berlin"])).toBe("베를린 (Berlin)");
    expect(regionDisplayName("ko", siteConfig.regions["london"])).toBe("런던 (London)");
    expect(regionDisplayName("ko", siteConfig.regions["tokyo"])).toBe("도쿄 (Tokyo)");
    expect(regionDisplayName("ko", siteConfig.regions["new-york"])).toBe("뉴욕 (New York)");
    expect(regionDisplayName("ko", siteConfig.regions["paris"])).toBe("파리 (Paris)");
  });

  it("live demo siteConfig: Japanese view displays all cities in Japanese with English in brackets", () => {
    expect(regionDisplayName("ja", siteConfig.regions["tokyo"])).toBe("東京 (Tokyo)");
    expect(regionDisplayName("ja", siteConfig.regions["sydney"])).toBe("シドニー (Sydney)");
    expect(regionDisplayName("ja", siteConfig.regions["london"])).toBe("ロンドン (London)");
    expect(regionDisplayName("ja", siteConfig.regions["new-york"])).toBe("ニューヨーク (New York)");
  });

  it("live demo siteConfig: Russian view displays all cities in Russian with English in brackets", () => {
    expect(regionDisplayName("ru", siteConfig.regions["moscow"])).toBe("Москва (Moscow)");
    expect(regionDisplayName("ru", siteConfig.regions["london"])).toBe("Лондон (London)");
    expect(regionDisplayName("ru", siteConfig.regions["berlin"])).toBe("Берлин (Berlin)");
  });
});

describe("Phase M refinement — timezone display", () => {
  const at = TZ_REFERENCE_DATE;

  it("keeps the IANA identifier always visible", () => {
    expect(timezoneDisplayLabel("en", "America/Toronto", at)).toContain("America/Toronto");
    expect(timezoneDisplayLabel("fr", "America/Toronto", at)).toContain("America/Toronto");
    expect(timezoneDisplayLabel("ja", "Asia/Tokyo", at)).toContain("Asia/Tokyo");
  });

  it("omits the English parenthetical when the platform names are identical", () => {
    const en = timezoneDisplayLabel("en", "America/Toronto", at);
    expect(en).toBe(`${timezoneNameForLocale("en", "America/Toronto", at)} — America/Toronto`);
    expect(en).not.toContain("(");
  });

  it("appends the English name when the localized name differs", () => {
    const fr = timezoneDisplayLabel("fr", "America/Toronto", at);
    const localized = timezoneNameForLocale("fr", "America/Toronto", at);
    const english = timezoneNameForLocale("en", "America/Toronto", at);
    expect(fr).toBe(`${localized} (${english}) — America/Toronto`);
  });

  it("resolves deterministically for the same reference instant", () => {
    expect(timezoneDisplayLabel("fr", "America/Vancouver", at)).toBe(
      timezoneDisplayLabel("fr", "America/Vancouver", at),
    );
  });

  it("falls back to the IANA id itself when the platform cannot name the zone", () => {
    expect(timezoneDisplayLabel("en", "Etc/Unknown_Zone", at)).toContain(
      "Etc/Unknown_Zone",
    );
  });
});