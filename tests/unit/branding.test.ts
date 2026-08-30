import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";

/**
 * Phase M — template presentation identity: the visitor-facing foundation is
 * branded "Your Business Site" (not the generic "My Site").
 */
describe("Phase M — template branding", () => {
  it("the site name is the demonstrative template identity", () => {
    expect(siteConfig.name).toBe("Your Business Site");
  });

  it("the English home description no longer uses the old placeholder identity", () => {
    const en = getDictionary("en");
    expect(en.home.description).not.toMatch(/My Site/);
    expect(en.home.description).toMatch(/Your Business Site/);
  });

  it("every dictionary's home description drops the old placeholder identity", () => {
    for (const { code } of siteConfig.locales) {
      expect(getDictionary(code).home.description, `locale ${code}`).not.toMatch(/My Site/);
    }
  });

  it("primary navigation is Connect-centric (no Contact, no location links)", () => {
    const hrefs = siteConfig.navigation.map((item) => item.href);
    expect(hrefs).toContain("/connect");
    expect(hrefs).not.toContain("/contact");
    expect(hrefs).not.toContain("/toronto");
    expect(hrefs).not.toContain("/vancouver");
  });

  it("each dictionary exposes the phase-M location + connect strings", () => {
    for (const { code } of siteConfig.locales) {
      const dict = getDictionary(code);
      expect(dict.location.unspecified.trim().length).toBeGreaterThan(0);
      expect(dict.connect.heading.trim().length).toBeGreaterThan(0);
      expect(dict.connect.demoNotice.trim().length).toBeGreaterThan(0);
      expect(dict.connect.demoBadge.trim().length).toBeGreaterThan(0);
    }
  });
});