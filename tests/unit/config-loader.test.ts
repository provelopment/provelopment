import { describe, expect, it } from "vitest";

import { parseSiteConfig } from "@/config/loader";

const validConfig = {
  site: {
    url: "https://example.com",
    name: "Example",
    tagline: "An example site",
    description: "A site used for testing.",
  },
  i18n: {
    defaultLocale: "en",
    locales: [{ code: "en", label: "English" }],
  },
  contact: {
    email: "hello@example.com",
  },
  socialLinks: [{ platform: "github", label: "GitHub", href: "https://github.com/example" }],
  navigation: [{ label: "Home", href: "/" }],
};

describe("parseSiteConfig", () => {
  it("parses a valid configuration into the flattened site config", () => {
    const config = parseSiteConfig(validConfig);

    expect(config.url).toBe("https://example.com");
    expect(config.defaultLocale).toBe("en");
    expect(config.analytics).toBeUndefined();
  });

  it("maps optional features through", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { analytics: { provider: "vercel" } },
    });

    expect(config.analytics).toEqual({ provider: "vercel" });
  });

  it("accepts empty contact details", () => {
    const config = parseSiteConfig({ ...validConfig, contact: {} });

    expect(config.contact).toEqual({});
  });

  it("rejects a defaultLocale that is not among the locales", () => {
    const invalid = {
      ...validConfig,
      i18n: {
        defaultLocale: "fr",
        locales: [{ code: "en", label: "English" }],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/defaultLocale/);
  });

  it("rejects malformed urls with actionable messages", () => {
    const invalid = {
      ...validConfig,
      site: { ...validConfig.site, url: "not-a-url" },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/site\.url/);
  });

  it("rejects trailing slashes on the site url", () => {
    const invalid = {
      ...validConfig,
      site: { ...validConfig.site, url: "https://example.com/" },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/trailing slash/);
  });

  it("rejects unknown analytics providers", () => {
    const invalid = {
      ...validConfig,
      features: { analytics: { provider: "unknown" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(
      /features\.analytics\.provider/,
    );
  });
});