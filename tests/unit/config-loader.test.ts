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

  it("normalizes legacy top-level contact into the business contact (back-compat bridge)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      contact: { email: "old@example.com", phone: "555" },
    });

    expect(config.business.name).toBe("Example"); // derived from site.name
    expect(config.business.contact).toEqual({ email: "old@example.com", phone: "555" });
    expect(config.business.locations).toEqual([]);
  });

  it("uses the business block as the canonical source when present", () => {
    const config = parseSiteConfig({
      ...validConfig,
      contact: { email: "legacy@example.com" },
      business: {
        timezone: "Asia/Jakarta",
        type: "LocalBusiness",
        locations: [
          {
            id: "main",
            name: "HQ",
            address: { street: "1 Main St", city: "Jakarta" },
            timezone: "Asia/Makassar",
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [],
            },
          },
        ],
      },
    });

    expect(config.business.type).toBe("LocalBusiness");
    expect(config.business.timezone).toBe("Asia/Jakarta");
    // business.contact wins over legacy contact
    expect(config.business.contact).toEqual({ email: "legacy@example.com" });
    // locations are canonical
    expect(config.business.locations).toHaveLength(1);
    expect(config.business.locations[0].name).toBe("HQ");
    expect(config.business.locations[0].timezone).toBe("Asia/Makassar");
    expect(config.business.locations[0].hours?.intervals[0].open).toBe("09:00");
    // identity falls back to site.* when not overridden
    expect(config.business.name).toBe("Example");
  });

  it("rejects invalid business hours (open === close)", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: { intervals: [{ days: ["mon"], open: "09:00", close: "09:00" }], exceptional: [] },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/open and close must differ/);
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