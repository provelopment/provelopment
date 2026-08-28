import { describe, expect, it } from "vitest";

import {
  getErrorMessages,
  supportedErrorLocales,
} from "@/components/site/error-messages";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";

describe("error-messages (client-safe error boundary copy)", () => {
  it("covers every locale enabled in site.config.json", () => {
    const configured = siteConfig.locales.map((locale) => locale.code);
    for (const code of configured) {
      expect(supportedErrorLocales).toContain(code);
    }
  });

  it("has non-empty, non-whitespace copy for every key in every configured locale", () => {
    for (const code of siteConfig.locales.map((l) => l.code)) {
      const messages = getErrorMessages(code);
      for (const key of ["title", "message", "tryAgain", "returnHome"] as const) {
        expect(messages[key].trim().length, `${code}.${key} should be non-empty`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("is a single source of truth: matches the canonical dictionary.error for every locale", () => {
    // The client seam statically imports the same canonical JSON the server
    // registry validates, so this is a wiring guarantee: the seam and the
    // server-side dictionary can never disagree per locale.
    for (const code of siteConfig.locales.map((l) => l.code)) {
      expect(getErrorMessages(code)).toEqual(getDictionary(code).error);
    }
  });

  it("falls back to the default locale for unknown or missing locales", () => {
    const defaultLocale = siteConfig.defaultLocale;
    const expected = getDictionary(defaultLocale).error;

    expect(getErrorMessages(undefined)).toEqual(expected);
    expect(getErrorMessages(null)).toEqual(expected);
    expect(getErrorMessages("sv")).toEqual(expected);
    expect(getErrorMessages("")).toEqual(expected);
  });
});
