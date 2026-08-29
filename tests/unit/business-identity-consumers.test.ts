import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createDirectionLinkResolver } from "@/adapters/maps";
import { BusinessInfo } from "@/components/site/business-info";
import { StructuredData } from "@/components/site/structured-data";
import { siteConfig } from "@/config";
import { formatAddress, resolveBusinessForLocale } from "@/core/business";

const localeCodes = siteConfig.locales.map((locale) => locale.code);
const directionLinkResolver = createDirectionLinkResolver(siteConfig.mapsFeature);

describe("business identity consumers (Phase I)", () => {
  it("the visible footer renders locale-resolved contact and per-mode address", () => {
    for (const locale of localeCodes) {
      const resolved = resolveBusinessForLocale(siteConfig.business, locale);
      const html = renderToStaticMarkup(BusinessInfo({ locale, directionLinkResolver }));

      // Locale-resolved customer-facing contact appears.
      expect(resolved.contact.phone, `phone for ${locale}`).toBeTruthy();
      expect(html).toContain(resolved.contact.phone!);
      expect(resolved.contact.email, `email for ${locale}`).toBeTruthy();
      expect(html).toContain(resolved.contact.email!);

      // The native/local address line appears.
      const location = resolved.locations[0];
      expect(html).toContain(formatAddress(location.address));

      // In local-international mode the Latin representation is also shown.
      if (location.addressMode === "local-international" && location.addressInternational) {
        expect(html, `international address for ${locale}`).toContain(
          formatAddress(location.addressInternational),
        );
      }
    }
  });

  it("JSON-LD uses the international address when available, else the native address", () => {
    for (const locale of localeCodes) {
      const resolved = resolveBusinessForLocale(siteConfig.business, locale);
      const html = renderToStaticMarkup(StructuredData({ locale }));
      const location = resolved.locations[0];
      const expectedStreet = location.addressInternational?.street ?? location.address.street;
      expect(html, `JSON-LD street for ${locale}`).toContain(expectedStreet);
    }
  });

  it("directions resolve through the provider-neutral seam (coordinates win)", () => {
    for (const locale of localeCodes) {
      const resolved = resolveBusinessForLocale(siteConfig.business, locale);
      const action = directionLinkResolver.resolve(resolved.locations[0]);
      expect(action.kind, `directions for ${locale}`).toBe("link");
    }
  });

  it("a Latin-script locale shows no artificial international duplicate", () => {
    // EN/DE/FR/ES/ID use default local-only presentation: the footer must not
    // invent a second address line for them.
    const html = renderToStaticMarkup(
      BusinessInfo({ locale: "de", directionLinkResolver }),
    );
    const resolved = resolveBusinessForLocale(siteConfig.business, "de");
    const international = resolved.locations[0].addressInternational;
    expect(international).toBeUndefined();
    // Exactly one <address> block contains the single native line; no second line.
    expect(html.match(/<address/g)).toHaveLength(1);
  });
});
