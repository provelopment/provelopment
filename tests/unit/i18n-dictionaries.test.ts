import { describe, expect, it } from "vitest";

import de from "../../config/i18n/de.json";
import en from "../../config/i18n/en.json";
import es from "../../config/i18n/es.json";
import fr from "../../config/i18n/fr.json";
import id from "../../config/i18n/id.json";
import ja from "../../config/i18n/ja.json";
import ko from "../../config/i18n/ko.json";
import zh from "../../config/i18n/zh.json";

import { dictionarySchema } from "@/config/i18n/dictionary";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import type { Locale } from "@/core/locale";

const allDictionaries = { de, en, es, fr, id, ja, ko, zh } as const;

describe("i18n dictionaries (JSON)", () => {
  it("every locale dict satisfies the Zod schema (shape + required keys)", () => {
    for (const [code, dict] of Object.entries(allDictionaries)) {
      const result = dictionarySchema.safeParse(dict);
      expect(result.success, `${code} failed: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it("covers every locale enabled in site.config.json", () => {
    const configured = siteConfig.locales.map((locale) => locale.code);
    for (const code of configured) {
      expect(Object.hasOwn(allDictionaries, code)).toBe(true);
    }
  });

  it("getDictionary returns the locale's own dictionary", () => {
    expect(getDictionary("fr")).toEqual(allDictionaries.fr);
    expect(getDictionary("en")).toEqual(allDictionaries.en);
  });

  it("getDictionary falls back to the default locale for unknown locales", () => {
    const defaultLocale = siteConfig.defaultLocale;
    // Pick a locale guaranteed NOT to be configured/translated to exercise fallback.
    expect(getDictionary("sv" as Locale)).toEqual(
      allDictionaries[defaultLocale as keyof typeof allDictionaries],
    );
  });

  it("dictionary navigation matches the configured navigation contract", () => {
    const configuredKeys = siteConfig.navigation.map((item) => item.href).sort();

    for (const [code, dict] of Object.entries(allDictionaries)) {
      const items = dict.navigation.items;
      // site.config.json is the single source of truth: every configured nav
      // href must be translated (a missing key would render the fallback
      // label), and no orphaned keys may linger. This does not hard-code the
      // current navigation set.
      expect(Object.keys(items).sort(), `locale ${code}`).toEqual(configuredKeys);
    }
  });
});