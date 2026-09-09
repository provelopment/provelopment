import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * P6-1/D1 — single-locale header contract.
 *
 * The LanguageSwitcher must render ONLY when more than one locale is
 * configured (`siteConfig.locales.length > 1`), mirroring the existing
 * location-selector gate (`hasLocations`). This is the reusable behaviour an
 * English-only, single-locale downstream site (e.g. the Demo 1 business site)
 * relies on so a pointless one-option language selector never appears.
 */
describe("D1 — single-locale header contract (LanguageSwitcher gate)", () => {
  const header = readFileSync(
    path.join(process.cwd(), "src", "components", "site", "site-header.tsx"),
    "utf8",
  );

  it("the header still composes the LanguageSwitcher component", () => {
    expect(header).toContain("<LanguageSwitcher");
  });

  it("the LanguageSwitcher render is gated on more than one configured locale", () => {
    expect(header).toContain("{siteConfig.locales.length > 1 ? (");
  });

  it("there is no ungated LanguageSwitcher composition in the header", () => {
    // The ONLY component reference must be the gated one; a bare
    // `<LanguageSwitcher` not guarded by the gate would appear as a second
    // occurrence of the opening tag.
    const occurrences = header.match(/<LanguageSwitcher/g);
    expect(occurrences?.length ?? 0).toBe(1);
    const gatePosition = header.indexOf("siteConfig.locales.length > 1");
    const renderPosition = header.indexOf("<LanguageSwitcher");
    expect(gatePosition).toBeGreaterThanOrEqual(0);
    expect(renderPosition).toBeGreaterThan(gatePosition);
  });
});