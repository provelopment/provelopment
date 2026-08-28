import { describe, expect, it } from "vitest";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { buildSitemapRoutes } from "@/application/route-discovery";
import {
  isCanonicalLegalSlug,
  legalLabel,
  resolveLegalDocs,
  type LegalConfigEntry,
} from "@/core/legal";

const configEntries: readonly LegalConfigEntry[] = [
  { slug: "privacy", label: "Privacy Policy" },
  { slug: "terms", label: "Terms of Service" },
  { slug: "cookies", label: "Cookie Policy" },
];

describe("resolveLegalDocs (config ∧ canonical-content intersection)", () => {
  it("keeps configured entries whose content is canonical, in config order", () => {
    const resolved = resolveLegalDocs(configEntries, ["cookies", "privacy", "terms"]);
    expect(resolved.map((doc) => doc.slug)).toEqual(["privacy", "terms", "cookies"]);
  });

  it("drops configured entries that have no canonical content", () => {
    const resolved = resolveLegalDocs(configEntries, ["privacy"]);
    expect(resolved.map((doc) => doc.slug)).toEqual(["privacy"]);
  });

  it("returns [] when config is undefined, empty, or has no matching content", () => {
    expect(resolveLegalDocs(undefined, ["privacy"])).toEqual([]);
    expect(resolveLegalDocs([], ["privacy"])).toEqual([]);
    expect(resolveLegalDocs(configEntries, [])).toEqual([]);
  });
});

describe("isCanonicalLegalSlug", () => {
  const canonical = ["privacy", "terms", "cookies"];

  it("accepts a canonical slug", () => {
    expect(isCanonicalLegalSlug("privacy", canonical)).toBe(true);
  });

  it("rejects an unknown / locale-only slug", () => {
    expect(isCanonicalLegalSlug("ghost", canonical)).toBe(false);
  });
});

describe("legalLabel (localized label with config fallback)", () => {
  it("prefers the dictionary label", () => {
    const label = legalLabel({ privacy: "Politique de confidentialité" }, {
      slug: "privacy",
      label: "Privacy Policy",
    });
    expect(label).toBe("Politique de confidentialité");
  });

  it("falls back to the config label when no dictionary label exists", () => {
    const label = legalLabel({}, { slug: "privacy", label: "Privacy Policy" });
    expect(label).toBe("Privacy Policy");
  });
});

describe("legal repository (reuses PageContentRepository + fs adapter)", () => {
  const repository = createFileSystemPageContentRepository({
    defaultLocale: "en",
    collection: "legal",
  });

  it("lists the canonical (default-locale) legal slugs", async () => {
    const slugs = await repository.listSlugs("en");
    expect(slugs).toEqual(["cookies", "privacy", "terms"]);
  });

  it("finds a default-locale legal document (title + body)", async () => {
    const content = await repository.findBySlug("privacy", "en");
    expect(content?.title).toBe("Privacy Policy");
    expect(content?.body).toMatch(/template placeholder/i);
  });

  it("falls back to the default locale when a translation is missing", async () => {
    // A locale with no localization (e.g. an adopter locale not yet
    // translated) still resolves via the repository's locale → default
    // fallback; the canonical (English) content is served.
    const content = await repository.findBySlug("privacy", "pt");
    expect(content?.locale).toBe("en");
    expect(content?.title).toBe("Privacy Policy");
    expect(content?.body).toMatch(/template placeholder/i);
  });

  it("serves the localized legal body when the locale file exists", async () => {
    for (const locale of ["es", "fr", "de", "ja", "zh", "ko", "id"]) {
      for (const slug of ["privacy", "terms", "cookies"]) {
        const content = await repository.findBySlug(slug, locale);
        expect(content).not.toBeNull();
        // The locale-specific file wins over the English fallback.
        expect(content?.locale).toBe(locale);
        // Localized title (not the English one) is served.
        expect(content?.title).not.toBe(
          { privacy: "Privacy Policy", terms: "Terms of Service", cookies: "Cookie Policy" }[slug],
        );
        // Every localized body preserves the template's generic, replaceable
        // nature and the "not legal advice" notice.
        expect(content?.body).toMatch(/not legal advice|no es asesoramiento|conseil juridique|Rechtsberatung|法的助言|法律建议|법적 조언|nasihat hukum/i);
      }
    }
  });

  it("returns null for unknown slugs", async () => {
    expect(await repository.findBySlug("does-not-exist", "en")).toBeNull();
  });
});

describe("buildSitemapRoutes with legalSlugs", () => {
  const pages = ["about"];
  const base = { offeringsEnabled: false, pages, canonicalOfferings: [] };

  it("appends a /legal/<slug> route per configured canonical slug", () => {
    expect(buildSitemapRoutes({ ...base, legalSlugs: ["privacy", "terms"] })).toEqual([
      "",
      "/about",
      "/legal/privacy",
      "/legal/terms",
    ]);
  });

  it("omits legal routes when legalSlugs is undefined/empty", () => {
    expect(buildSitemapRoutes(base)).toEqual(["", "/about"]);
    expect(buildSitemapRoutes({ ...base, legalSlugs: [] })).toEqual(["", "/about"]);
  });
});