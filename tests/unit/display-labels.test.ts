import { describe, expect, it } from "vitest";

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