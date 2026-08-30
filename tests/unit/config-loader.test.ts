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

  it("maps optional per-locale location overrides through the loader", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta", country: "Indonesia" },
            phone: "+62 21 0000 0000",
            geo: { lat: -6.2, lng: 106.816 },
            locales: {
              de: {
                address: { city: "Berlin" },
                phone: "+49 30 0000 0000",
                geo: { lat: 52.52, lng: 13.405 },
              },
            },
          },
        ],
      },
    });

    const location = config.business.locations[0];
    expect(location.locales).toEqual({
      de: {
        address: { city: "Berlin" },
        phone: "+49 30 0000 0000",
        geo: { lat: 52.52, lng: 13.405 },
      },
    });
  });

  it("accepts a location without locales (back-compat: field stays undefined)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        locations: [
          { id: "main", address: { street: "1 Main St", city: "Jakarta" } },
        ],
      },
    });

    expect(config.business.locations[0].locales).toBeUndefined();
  });

  it("rejects a non-locale-code key in business.locations[].locales", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            locales: { "not a locale": { address: { city: "Berlin" } } },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/locale|must be a BCP 47-style locale code/);
  });

  it("rejects an invalid override shape (bad geo latitude)", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            locales: { de: { geo: { lat: 999, lng: 13 } } },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow();
  });

  it("rejects an empty override address field value", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            locales: { de: { address: { city: "" } } },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow();
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

  it("rejects an invalid IANA timezone with an actionable error", () => {
    const invalid = {
      ...validConfig,
      business: { timezone: "Asia/Jakartp" },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/IANA timezone/);
  });

  it("rejects an invalid IANA timezone on a location", () => {
    const invalid = {
      ...validConfig,
      business: {
        locations: [
          {
            id: "x",
            address: { street: "1 Main St", city: "Jakarta" },
            timezone: "Nowhere/Zone",
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/IANA timezone/);
  });

  it("accepts a valid IANA timezone", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: { timezone: "America/New_York" },
    });

    expect(config.business.timezone).toBe("America/New_York");
  });

  it("accepts overnight exceptional hours (close < open)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        timezone: "Asia/Jakarta",
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [{ date: "2026-12-31", open: "22:00", close: "02:00" }],
            },
          },
        ],
      },
    });

    expect(config.business.locations[0].hours?.exceptional[0]).toMatchObject({
      date: "2026-12-31",
      open: "22:00",
      close: "02:00",
    });
  });

  it("rejects an exceptional-hours entry that has only `open`", () => {
    const invalid = {
      ...validConfig,
      business: {
        timezone: "Asia/Jakarta",
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [{ date: "2026-12-31", open: "09:00" }],
            },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/closed: true or provide both open and close/);
  });

  it("rejects an exceptional-hours entry that has only `close`", () => {
    const invalid = {
      ...validConfig,
      business: {
        timezone: "Asia/Jakarta",
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [{ date: "2026-12-31", close: "17:00" }],
            },
          },
        ],
      },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/closed: true or provide both open and close/);
  });

  it("accepts an exceptional-hours closure (`closed: true`)", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        timezone: "Asia/Jakarta",
        locations: [
          {
            id: "main",
            address: { street: "1 Main St", city: "Jakarta" },
            hours: {
              intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
              exceptional: [{ date: "2026-12-25", closed: true }],
            },
          },
        ],
      },
    });

    expect(config.business.locations[0].hours?.exceptional[0]).toMatchObject({
      date: "2026-12-25",
      closed: true,
    });
  });

  it("accepts a non-default locale as the configured default (config-driven change)", () => {
    // Changing the default locale is a configuration change taken straight
    // from `site.config.json`; no platform code or test assumes locale "en".
    const config = parseSiteConfig({
      ...validConfig,
      i18n: {
        defaultLocale: "fr",
        locales: [
          { code: "fr", label: "Français" },
          { code: "en", label: "English" },
        ],
      },
    });

    expect(config.defaultLocale).toBe("fr");
    expect(config.locales.map((l) => l.code)).toEqual(["fr", "en"]);
  });

  it("maps features.contact stub through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { contact: { provider: "stub" } },
    });

    expect(config.contactFeature).toEqual({ provider: "stub" });
  });

  it("maps features.contact webhook with fields through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { contact: { provider: "webhook", fields: { subject: false } } },
    });

    expect(config.contactFeature).toEqual({
      provider: "webhook",
      fields: { subject: false },
    });
  });

  it("leaves contactFeature undefined when features.contact is absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.contactFeature).toBeUndefined();
  });

  it("rejects an unknown contact provider", () => {
    const invalid = {
      ...validConfig,
      features: { contact: { provider: "mailto" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/provider/);
  });

  it("maps features.offerings true/false through to the site config", () => {
    const enabled = parseSiteConfig({
      ...validConfig,
      features: { offerings: true },
    });
    expect(enabled.offeringsFeature).toBe(true);

    const disabled = parseSiteConfig({
      ...validConfig,
      features: { offerings: false },
    });
    expect(disabled.offeringsFeature).toBe(false);
  });

  it("leaves offeringsFeature undefined when absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.offeringsFeature).toBeUndefined();
  });

  it("rejects a non-boolean offerings value", () => {
    const invalid = {
      ...validConfig,
      features: { offerings: "yes" },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/offerings/);
  });

  it("maps the legal block through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      legal: [
        { slug: "privacy", label: "Privacy Policy" },
        { slug: "terms", label: "Terms of Service" },
      ],
    });

    expect(config.legal).toEqual([
      { slug: "privacy", label: "Privacy Policy" },
      { slug: "terms", label: "Terms of Service" },
    ]);
  });

  it("leaves legal undefined when absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.legal).toBeUndefined();
  });

  it("accepts an empty legal array", () => {
    const config = parseSiteConfig({ ...validConfig, legal: [] });
    expect(config.legal).toEqual([]);
  });

  it("rejects a legal entry with an unsafe slug", () => {
    const invalid = {
      ...validConfig,
      legal: [{ slug: "../privacy", label: "Privacy" }],
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/slug/);
  });

  it("rejects a legal entry with an empty label", () => {
    const invalid = {
      ...validConfig,
      legal: [{ slug: "privacy", label: "" }],
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/label/);
  });

  it("maps features.maps through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { maps: { provider: "google" } },
    });

    expect(config.mapsFeature).toEqual({ provider: "google" });
  });

  it("leaves mapsFeature undefined when features.maps is absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.mapsFeature).toBeUndefined();
  });

  it("rejects an unknown maps provider", () => {
    const invalid = {
      ...validConfig,
      features: { maps: { provider: "apple" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/maps\.provider/);
  });

  it("maps features.booking through to the site config", () => {
    const config = parseSiteConfig({
      ...validConfig,
      features: { booking: { provider: "external-url", url: "https://example.com/book" } },
    });

    expect(config.bookingFeature).toEqual({
      provider: "external-url",
      url: "https://example.com/book",
    });
  });

  it("leaves bookingFeature undefined when features.booking is absent (back-compat)", () => {
    const config = parseSiteConfig(validConfig);
    expect(config.bookingFeature).toBeUndefined();
  });

  it("rejects features.booking with provider external-url and no url", () => {
    const invalid = {
      ...validConfig,
      features: { booking: { provider: "external-url" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/booking\.url/);
  });

  it("rejects features.booking with a non-URL destination", () => {
    const invalid = {
      ...validConfig,
      features: { booking: { provider: "external-url", url: "not-a-url" } },
    };

    expect(() => parseSiteConfig(invalid)).toThrow(/booking\.url/);
  });
});

describe("business contact + address identity (Phase I)", () => {
  it("maps per-locale business contact overrides through to the normalized contact", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        contact: {
          email: "global@example.com",
          locales: {
            de: { phone: "+49 30 0000 0000" },
            fr: { email: "bonjour@example.fr" },
          },
        },
        locations: [{ id: "main", address: { street: "1 St", city: "Berlin" } }],
      },
    });

    expect(config.business.contact.email).toBe("global@example.com");
    expect(config.business.contact.locales?.de?.phone).toBe("+49 30 0000 0000");
    expect(config.business.contact.locales?.fr?.email).toBe("bonjour@example.fr");
  });

  it("maps addressInternational and addressMode through the location", () => {
    const config = parseSiteConfig({
      ...validConfig,
      business: {
        locations: [
          {
            id: "main",
            address: { street: "東京都港区芝公園4丁目2-8", city: "港区", country: "日本" },
            addressInternational: { street: "4-2-8 Shibakoen", city: "Tokyo", country: "Japan" },
            addressMode: "local-international",
          },
        ],
      },
    });

    expect(config.business.locations[0].addressMode).toBe("local-international");
    expect(config.business.locations[0].addressInternational?.street).toBe("4-2-8 Shibakoen");
  });

  it("rejects a local-international mode without an international address", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        business: {
          locations: [
            {
              id: "main",
              address: { street: "1 St", city: "City" },
              addressMode: "local-international",
            },
          ],
        },
      }),
    ).toThrow(/local-international/);
  });

  it("rejects a locale override requesting local-international with no international address", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        i18n: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English" },
            { code: "ja", label: "日本語" },
          ],
        },
        business: {
          locations: [
            {
              id: "main",
              address: { street: "1 St", city: "City" },
              locales: { ja: { addressMode: "local-international" } },
            },
          ],
        },
      }),
    ).toThrow(/locale "ja"/);
  });

  it("accepts a local-international locale override that inherits a base international address", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        i18n: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English" },
            { code: "ja", label: "日本語" },
          ],
        },
        business: {
          locations: [
            {
              id: "main",
              address: { street: "1 St", city: "City" },
              addressInternational: { street: "Latin St", city: "City" },
              locales: { ja: { addressMode: "local-international" } },
            },
          ],
        },
      }),
    ).not.toThrow();
  });
});

describe("Phase K — region configuration validation", () => {
  const regionBase = {
    timezone: "America/Toronto",
    address: { street: "1 Demo St", city: "Toronto", country: "Canada" },
    hours: { monday: [{ open: "09:00", close: "17:00" }] },
  };

  const regionConfig = {
    ...validConfig,
    business: {
      regions: {
        toronto: regionBase,
        vancouver: {
          timezone: "America/Vancouver",
          address: { street: "2 Demo Ave", city: "Vancouver", country: "Canada" },
          hours: {},
        },
      },
      pages: [
        { locale: "en", slug: "toronto", region: "toronto" },
        { locale: "en", slug: "vancouver", region: "vancouver" },
      ],
    },
  };

  it("parses a valid regions + pages configuration", () => {
    const config = parseSiteConfig(regionConfig);
    expect(Object.keys(config.regions)).toEqual(["toronto", "vancouver"]);
    expect(config.regions.toronto.timezone).toBe("America/Toronto");
    expect(config.regions.toronto.hours.monday[0].open).toBe("09:00");
    expect(config.pageBindings).toHaveLength(2);
    expect(config.business.locations).toEqual([]); // legacy path untouched
  });

  it("rejects an invalid IANA timezone in a region", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: {
          regions: { toronto: { ...regionBase, timezone: "Not/AZone" } },
        },
      }),
    ).toThrow(/timezone/i);
  });

  it("rejects an unknown day key in a region schedule", () => {
    const bad = {
      ...regionBase,
      hours: { funday: [{ open: "09:00", close: "17:00" }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow();
  });

  it("rejects an invalid interval time format", () => {
    const bad = {
      ...regionBase,
      hours: { monday: [{ open: "9am", close: "17:00" }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow(/HH:mm/);
  });

  it("rejects an open === close interval (24h ambiguity)", () => {
    const bad = {
      ...regionBase,
      hours: { monday: [{ open: "09:00", close: "09:00" }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow(/open and close must differ/);
  });

  it("rejects a holiday with a missing name", () => {
    const bad = {
      ...regionBase,
      hours: { monday: [], holidays: [{ date: "2026-12-25", closed: true }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow(/name/);
  });

  it("rejects a holiday with an invalid date", () => {
    const bad = {
      ...regionBase,
      hours: { monday: [], holidays: [{ date: "2026-02-30", name: "X", closed: true }] },
    };
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: { toronto: bad } },
      }),
    ).toThrow(/real calendar date/);
  });

  it("rejects a page binding referencing a missing region", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: regionConfig.business.regions, pages: [{ locale: "en", slug: "toronto", region: "nope" }] },
      }),
    ).toThrow(/unknown region/);
  });

  it("rejects duplicate page bindings for the same (locale, slug)", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: {
          regions: regionConfig.business.regions,
          pages: [
            { locale: "en", slug: "toronto", region: "toronto" },
            { locale: "en", slug: "toronto", region: "vancouver" },
          ],
        },
      }),
    ).toThrow(/Duplicate page/);
  });

  it("rejects page bindings without a regions block", () => {
    expect(() =>
      parseSiteConfig({
        ...validConfig,
        business: { pages: [{ locale: "en", slug: "toronto", region: "toronto" }] },
      }),
    ).toThrow(/regions/);
  });

  it("accepts a region without pages (regional mode with no regional pages yet)", () => {
    expect(() =>
      parseSiteConfig({
        ...regionConfig,
        business: { regions: regionConfig.business.regions },
      }),
    ).not.toThrow();
  });
});