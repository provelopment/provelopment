import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Cta, isCtaRenderable } from "@/components/ui/cta";

/**
 * P0-2/P5-5 — CTA Composition Convergence + configurable controls.
 *
 * The `Cta` capability is the ONE semantic path for the primary CTA:
 *  - presence = `enabled` ∧ `href` ∧ visible content (label ∨ icon) ∧ a real
 *    accessible name (label, or the semantic `action` for icon-only);
 *  - presentation = the shared NavCta primitive + the `prominent` treatment
 *    + the P5-5 icon (asset + placement) + the semantic `state`;
 *  - it owns NO placement (the shell/content decision core chooses location).
 */
describe("P5-5 — isCtaRenderable (the single presence predicate)", () => {
  it("renders when enabled + label + href are all provided (no icon needed)", () => {
    expect(isCtaRenderable(true, "Book Now", "/book", undefined, undefined)).toBe(true);
  });

  it("still requires enabled and href (never invents a destination)", () => {
    expect(isCtaRenderable(false, "Book Now", "/book", undefined, undefined)).toBe(false);
    expect(isCtaRenderable(true, "Book Now", undefined, undefined, undefined)).toBe(false);
    expect(isCtaRenderable(true, "Book Now", "", undefined, undefined)).toBe(false);
    expect(isCtaRenderable(false, undefined, undefined, undefined, undefined)).toBe(false);
  });

  it("renders an ICON-ONLY CTA when an icon is present AND an accessible name exists (action)", () => {
    expect(isCtaRenderable(true, "", "/book", "book.svg", "book")).toBe(true);
    expect(isCtaRenderable(true, "", "/book", "book.svg", undefined)).toBe(false); // no accessible name
    expect(isCtaRenderable(true, undefined, "/book", "book.svg", "book")).toBe(true); // missing label with icon = icon-only
  });

  it("does NOT render an icon-less CTA whose label is empty (no visible content)", () => {
    expect(isCtaRenderable(true, "", "/book", undefined, "book")).toBe(false);
  });

  it("treats a missing label as icon-only when an icon is configured", () => {
    expect(isCtaRenderable(true, undefined, "/book", "book.svg", "book")).toBe(true);
  });
});

describe("P0-2/P5-5 — Cta renders the shared NavCta semantics", () => {
  it("renders a nav-item-cta link with the adopter label + destination", () => {
    const html = renderToStaticMarkup(
      Cta({ enabled: true, style: "standard", label: "Book Now", href: "/en/book", className: "ui-shell-cta" }),
    );
    expect(html).toContain("ui-shell-cta");
    expect(html).toContain("nav-item-cta");
    expect(html).toContain('href="/en/book"');
    expect(html).toContain(">Book Now</span>");
    expect(html).not.toContain("ui-cta-prominent"); // standard → no prominent treatment
  });

  it("applies the `prominent` visual treatment when the resolved style requests it", () => {
    const html = renderToStaticMarkup(
      Cta({ enabled: true, style: "prominent", label: "Book Now", href: "/en/book", className: "ui-shell-cta" }),
    );
    expect(html).toContain("ui-shell-cta ui-cta-prominent");
  });

  it("returns nothing when disabled or when no visible content/destination exists (never invented)", () => {
    expect(renderToStaticMarkup(Cta({ enabled: false, style: "standard", label: "Book", href: "/book", className: "ui-shell-cta" }))).toBe("");
    expect(renderToStaticMarkup(Cta({ enabled: true, style: "standard", label: "Book", className: "ui-shell-cta" }))).toBe("");
    expect(renderToStaticMarkup(Cta({ enabled: true, style: "standard", href: "/book", className: "ui-shell-cta" }))).toBe("");
    // icon-only without an accessible-name source must NOT render (never an empty accessible label)
    expect(renderToStaticMarkup(Cta({ enabled: true, style: "standard", href: "/book", icon: "book.svg", className: "ui-shell-cta" }))).toBe("");
  });

  it("P5-5 — renders an icon-only CTA with the accessible name from `action`", () => {
    const html = renderToStaticMarkup(
      Cta({ enabled: true, style: "standard", label: "", href: "/book", action: "book", icon: "book.svg", className: "ui-shell-cta" }),
    );
    expect(html).toContain('aria-label="book"');
    expect(html).toContain("ui-nav-item-icon");
    expect(html).toContain('/assets/book.svg');
    // The visible label span is EMPTY (icon-only) — the accessible name comes
    // from aria-label, never from a silently-empty or bare-image label.
    expect(html).toContain('ui-nav-item-label"></span>');
  });

  it("P5-5 — renders icon + label when both are configured (icon + text)", () => {
    const html = renderToStaticMarkup(
      Cta({ enabled: true, style: "standard", label: "Book Now", href: "/book", action: "book", icon: "book.svg", iconPosition: "start", className: "ui-shell-cta" }),
    );
    expect(html).toContain("/assets/book.svg");
    expect(html).toContain("ui-nav-item-label");
    expect(html).toContain("Book Now");
  });

  it("P5-5 — renders a trailing icon when iconPosition is `end`", () => {
    const html = renderToStaticMarkup(
      Cta({ enabled: true, style: "standard", label: "Book Now", href: "/book", icon: "book.svg", iconPosition: "end", className: "ui-shell-cta" }),
    );
    // Structural check: the visible label span precedes the icon element
    // (the html also contains a Next image-preload <link> for the asset, so
    // we compare element markers, not raw "/assets/..." occurrences).
    expect(html.indexOf("ui-nav-item-label")).toBeLessThan(html.indexOf("ui-nav-item-icon"));
  });

  it("P5-5 — the `disabled` state renders aria-disabled and is not navigable", () => {
    const html = renderToStaticMarkup(
      Cta({ enabled: true, style: "standard", label: "Book", href: "/book", state: "disabled", className: "ui-shell-cta" }),
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain("<a");
    expect(html).not.toContain('href="/book"');
  });
});