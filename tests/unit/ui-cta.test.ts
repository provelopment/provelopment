import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Cta, isCtaRenderable } from "@/components/ui/cta";

/**
 * P0-2 — CTA Composition Convergence.
 *
 * The `Cta` capability is the ONE semantic path for the primary CTA:
 *  - presence = `enabled` ∧ adopter label ∧ adopter href (never invented);
 *  - presentation = the shared NavCta primitive + the `prominent` treatment;
 *  - it owns NO placement (the shell/content decision core chooses location).
 *
 * These tests verify the capability in isolation; the composition sites
 * (ShellEngine header/aside/bottom, SiteHeader drawer/overlay) are covered by
 * the shell + browser suites.
 */
describe("P0-2 — isCtaRenderable (the single presence predicate)", () => {
  it("renders only when enabled AND label AND href are all provided", () => {
    expect(isCtaRenderable(true, "Book Now", "/book")).toBe(true);
    expect(isCtaRenderable(false, "Book Now", "/book")).toBe(false);
    expect(isCtaRenderable(true, undefined, "/book")).toBe(false);
    expect(isCtaRenderable(true, "Book Now", undefined)).toBe(false);
    expect(isCtaRenderable(true, "", "/book")).toBe(false);
    expect(isCtaRenderable(true, "Book Now", "")).toBe(false);
    expect(isCtaRenderable(false, undefined, undefined)).toBe(false);
  });
});

describe("P0-2 — Cta renders the shared NavCta semantics", () => {
  it("renders a nav-item-cta link with the adopter label + destination", () => {
    const html = renderToStaticMarkup(
      Cta({ enabled: true, style: "standard", label: "Book Now", href: "/en/book", className: "ui-shell-cta" }),
    );
    expect(html).toContain("ui-shell-cta");
    expect(html).toContain("nav-item-cta");
    expect(html).toContain('href="/en/book"');
    expect(html).toContain(">Book Now</a>");
    expect(html).not.toContain("ui-cta-prominent"); // standard → no prominent treatment
  });

  it("applies the `prominent` visual treatment when the resolved style requests it", () => {
    const html = renderToStaticMarkup(
      Cta({ enabled: true, style: "prominent", label: "Book Now", href: "/en/book", className: "ui-shell-cta" }),
    );
    expect(html).toContain("ui-shell-cta ui-cta-prominent");
  });

  it("returns nothing when disabled or when the label/href are absent (never invented)", () => {
    expect(renderToStaticMarkup(Cta({ enabled: false, style: "standard", label: "Book", href: "/book", className: "ui-shell-cta" }))).toBe("");
    expect(renderToStaticMarkup(Cta({ enabled: true, style: "standard", label: "Book", className: "ui-shell-cta" }))).toBe("");
    expect(renderToStaticMarkup(Cta({ enabled: true, style: "standard", href: "/book", className: "ui-shell-cta" }))).toBe("");
  });
});