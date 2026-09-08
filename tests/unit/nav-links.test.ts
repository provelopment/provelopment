import { describe, expect, it } from "vitest";

import { getSiteNavLinks, navItemKey } from "@/components/site/nav-links";

/**
 * P5-6 — navigation identity is position-derived. `getSiteNavLinks` stamps a
 * deterministic, per-config-position `key` so duplicate destinations never
 * become duplicate React keys. The identity must be unique across the
 * configured list and stable by original configuration order.
 */
describe("P5-6 — navigation identity is position-derived", () => {
  it("assigns a distinct stable key to every configured item", () => {
    const links = getSiteNavLinks("en");
    const keys = links.map((l) => l.key);
    // Every item gets a key, and keys are unique across the configured list.
    expect(keys.every((k) => k !== undefined)).toBe(true);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("keys are distinct between adjacent positions and deterministic", () => {
    expect(navItemKey(0)).not.toBe(navItemKey(1));
    expect(navItemKey(0)).toBe(`nav:0`);
    expect(navItemKey(5)).toBe(`nav:5`);
    // Same index → same key (stable across calls and renders).
    expect(navItemKey(3)).toBe(navItemKey(3));
  });
});