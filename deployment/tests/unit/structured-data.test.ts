import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so
// it lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in
// the `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2). Its subject is the real capsule, never a fixture.

import { RegionStructuredData } from "@/components/site/region-structured-data";
import { StructuredData } from "@/components/site/structured-data";
import { siteConfig } from "@/config";
import { resolveRegion } from "@/core/region";

/** Extracts the first JSON-LD payload from a rendered `<script>` block. */
function jsonLd(html: string): Record<string, unknown> {
  const match = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error("no JSON-LD script found");
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("StructuredData — global organization/local-business JSON-LD (Phase S)", () => {
  it("emits the canonical identity, url and contactPoint", () => {
    const html = renderToStaticMarkup(StructuredData({ locale: "en" }));
    const node = jsonLd(html);

    expect(node["@type"]).toBe(siteConfig.business.type ?? "Organization");
    expect(node.name).toBe(siteConfig.name);
    expect(node.url).toBe(siteConfig.url);
    expect(node.contactPoint).toMatchObject({ "@type": "ContactPoint" });
  });

  it("location @ids and sameAs track the configured inventory (both branches)", () => {
    const node = jsonLd(renderToStaticMarkup(StructuredData({ locale: "en" })));

    // Present branch: every configured location gets a stable fragment @id.
    if (siteConfig.business.locations.length > 0) {
      const locations = node.location as { "@id"?: string }[];
      expect(Array.isArray(locations)).toBe(true);
      for (const location of locations) {
        expect(location["@id"]).toMatch(/^https:\/\/example\.com\/#location-/);
      }
    } else {
      // Absent branch: no locations → no `location` node invented.
      expect(node.location).toBeUndefined();
    }

    // Present branch: sameAs maps the configured social links (never invented).
    if (siteConfig.socialLinks.length > 0) {
      expect(node.sameAs).toEqual(siteConfig.socialLinks.map((link) => link.href));
    } else {
      expect(node.sameAs).toBeUndefined();
    }
  });

  it("emits the canonical asset logo (FS-4: configured via site.assets.logo)", () => {
    const node = jsonLd(renderToStaticMarkup(StructuredData({ locale: "en" })));
    // The canonical reference config defines `site.assets.logo`, so the
    // structured-data JSON-LD logo is present and points at the canonical asset.
    if (siteConfig.assets?.logo || siteConfig.logo) {
      const logo = node.logo as { "@type"?: string; url?: string };
      expect(logo).toMatchObject({ "@type": "ImageObject" });
      expect(logo.url).toBe(siteConfig.assets?.logo ?? siteConfig.logo);
    } else {
      // Absent branch: no logo configured → JSON-LD omits it (never invented).
      expect(node.logo).toBeUndefined();
    }
  });

  it("wires logo (assets-aware), sameAs and contactPoint to configured values (source contract)", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "components", "site", "structured-data.tsx"),
      "utf8",
    );
    expect(source).toContain("siteConfig.assets?.logo ?? siteConfig.logo");
    expect(source).toContain("siteConfig.socialLinks.map");
    expect(source).toContain("b.contact.email || b.contact.phone");
  });
});

describe("RegionStructuredData — regional JSON-LD (Phase S enrichment)", () => {
  // R1C — the reference deployment configures exactly the two DEMONSTRATION locations of its
  // Germany site. (A deployment that configures none is the ordinary adopter case; the resolution
  // contract below keeps its coverage whenever a region IS configured.)
  const region = resolveRegion(siteConfig.regions, "berlin");

  it("configures the reference deployment's two demonstration locations", () => {
    expect(Object.keys(siteConfig.regions)).toEqual(["berlin", "frankfurt"]);
  });

  describe.runIf(Boolean(region))("with a configured region", () => {
    const configured = region!;

    it("emits @id/url from the regional canonical URL plus sameAs (both branches)", () => {
      const html = renderToStaticMarkup(
        RegionStructuredData({ region: configured, canonicalUrl: `${siteConfig.url}/de/de/berlin` }),
      );
      const node = jsonLd(html);

      expect(node["@type"]).toBe("LocalBusiness");
      expect(node["@id"]).toBe(`${siteConfig.url}/de/de/berlin`);
      expect(node.url).toBe(`${siteConfig.url}/de/de/berlin`);
      if (siteConfig.socialLinks.length > 0) {
        expect(node.sameAs).toEqual(siteConfig.socialLinks.map((link) => link.href));
      } else {
        expect(node.sameAs).toBeUndefined();
      }
    });

    it("keeps the pre-existing operational fields intact", () => {
      const html = renderToStaticMarkup(
        RegionStructuredData({ region: configured, canonicalUrl: `${siteConfig.url}/de/de/berlin` }),
      );
      expect(html).toContain(configured.address.street);
      expect(html).toContain('"@type":"LocalBusiness"');
      // The demonstration locations state NO opening hours in configuration, so the schedule is
      // empty rather than invented — the same honesty the rendered region block shows.
      expect(configured.hours.monday).toHaveLength(0);
    });
  });
});