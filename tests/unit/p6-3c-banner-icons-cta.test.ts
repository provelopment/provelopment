import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * P6-3C — the three owner-approved corrections:
 *  A. banner scaling + centering (`min(available, 1.5 × natural)`, never
 *     overflowing, aspect ratio preserved, no artificial height);
 *  B. sidebar NAVIGATION-ITEM icon dimensions (32×32 desktop / 16×16 tablet)
 *     with the approved rail geometry untouched;
 *  C. Book Now placement (the rendered placement contract is asserted by the
 *     browser matrix; here the decision core + composition are proven).
 *
 * `PageBanner` is a client component (it reads the current pathname), so
 * `next/navigation` is stubbed — the banner MAP is a plain server-computed prop.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));

import { readImageDimensions } from "@/config/assets";
import { PageBanner, bannerMaxWidth } from "@/components/site/page-banner";
import { resolveShellPattern, resolveUiConfig } from "@/core/ui";

const globals = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** Every `.ui-page-banner*` rule block (structure + sizing contract). */
const bannerBlocks = [...globals.matchAll(/\.ui-page-banner[^{}]*\{[^}]*\}/g)].map((m) => m[0]);
const bannerDeclaration = (property: string): string[] =>
  bannerBlocks.flatMap((block) =>
    [...block.matchAll(new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim()),
  );

describe("P6-3C/A — banner sizing may never exceed 1.5× the graphic's natural width", () => {
  it("computes the permitted maximum as exactly 1.5× natural (sub-pixel precision)", () => {
    expect(bannerMaxWidth(240)).toBe(360);
    expect(bannerMaxWidth(1920)).toBe(2880);
    expect(bannerMaxWidth(321)).toBe(481.5);
    expect(bannerMaxWidth(1)).toBe(1.5);
  });

  it("centers the graphic in the available width (never left-aligned)", () => {
    const banner = /\.ui-page-banner\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(banner).toMatch(/display:\s*flex/);
    expect(banner).toMatch(/justify-content:\s*center/);
  });

  it("fills the available width but stops at the cap (downscale below, bounded upscale above)", () => {
    const sized = /\.ui-page-banner-image\[data-banner-sized="true"\]\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    // `width: 100%` handles both "downscale to fit" and "fill up to the cap";
    // `max-width` is the framework-supplied `1.5 × natural`, so the graphic can
    // never be enlarged merely to fill the page — and can never overflow either.
    expect(sized).toMatch(/width:\s*100%/);
    expect(sized).toMatch(/max-width:\s*var\(--ui-banner-max-width,\s*100%\)/);
    // Without a readable intrinsic size the banner is DOWNSCALE-ONLY: natural
    // size at most (`width: auto` + `max-width: 100%`) — never enlarged.
    const base = /\.ui-page-banner-image\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(base).toMatch(/width:\s*auto/);
    expect(base).toMatch(/max-width:\s*100%/);
  });

  it("preserves the aspect ratio and adds NO artificial height", () => {
    // The ONLY height declaration in any banner rule is `auto` — the rendered
    // height always derives from the scaled graphic's own ratio.
    const heights = bannerDeclaration("height");
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((value) => value === "auto")).toBe(true);
  });

  it("adds no structural padding/margin/border/radius/shadow around the graphic", () => {
    for (const property of ["padding", "margin", "border", "border-radius", "box-shadow"]) {
      const values = bannerDeclaration(property);
      expect(values.every((value) => /^0(px)?$/.test(value))).toBe(true);
    }
  });
});

describe("P6-3C/A — the intrinsic banner size is read from the asset (server-side)", () => {
  it("reads the shipped banner graphic (JPEG)", () => {
    expect(readImageDimensions("/assets/banner-home.jpg")).toEqual({ width: 240, height: 135 });
  });

  it("reads SVG assets (explicit width/height AND the viewBox fallback)", () => {
    expect(readImageDimensions("/assets/favicon.svg")).toEqual({ width: 64, height: 64 });
    // `logo-header.svg` declares inch units + a viewBox → the viewBox governs.
    expect(readImageDimensions("/assets/logo-header.svg")).toEqual({ width: 240, height: 60 });
  });

  it("returns undefined for a missing/unreadable/absent asset (never guesses a size)", () => {
    expect(readImageDimensions("/assets/not-a-real-asset.jpg")).toBeUndefined();
    expect(readImageDimensions(undefined)).toBeUndefined();
    expect(readImageDimensions("")).toBeUndefined();
  });
});

describe("P6-3C/A — PageBanner rendering", () => {
  it("renders the sized banner with intrinsic dimensions + the cap as a custom property", () => {
    const html = renderToStaticMarkup(
      PageBanner({
        banners: { home: { src: "/assets/banner-home.jpg", width: 240, height: 135 } },
        regionIds: [],
      }),
    );
    expect(html).toContain('class="ui-page-banner"');
    expect(html).toContain('class="ui-page-banner-image"');
    expect(html).toContain('src="/assets/banner-home.jpg"');
    // Intrinsic dimensions → the browser reserves the ratio (no layout shift).
    expect(html).toContain('width="240"');
    expect(html).toContain('height="135"');
    expect(html).toContain('data-banner-sized="true"');
    expect(html).toContain("--ui-banner-max-width:360px"); // 1.5 × 240
    // Decorative: the header owns the brand accessible name.
    expect(html).toContain('alt=""');
  });

  it("renders a banner whose intrinsic size is UNKNOWN without any cap (never enlarged)", () => {
    const html = renderToStaticMarkup(
      PageBanner({ banners: { home: { src: "/assets/unknown-format.webp" } }, regionIds: [] }),
    );
    expect(html).toContain('src="/assets/unknown-format.webp"');
    expect(html).not.toContain("data-banner-sized");
    expect(html).not.toContain("--ui-banner-max-width");
  });

  it("renders NOTHING for a page with no configured banner (no container, no reserved gap)", () => {
    expect(renderToStaticMarkup(PageBanner({ banners: {}, regionIds: [] }))).toBe("");
    expect(
      renderToStaticMarkup(PageBanner({ banners: { about: { src: "/assets/about.jpg" } }, regionIds: [] })),
    ).toBe("");
  });
});
describe("P6-3C/B — sidebar NAVIGATION-ITEM icons are 16px (tablet) / 32px (desktop)", () => {
  const navIconRule = /\.ui-shell-sidebar \.ui-nav-item-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

  it("uses its OWN token — 1rem below `lg`, 2rem at `lg` — for width and height", () => {
    expect(globals).toMatch(/--ui-sidebar-nav-icon-size:\s*1rem/);
    expect(globals).toMatch(
      new RegExp("@media \\(min-width: 1024px\\)[^}]*--ui-sidebar-nav-icon-size:\\s*2rem"),
    );
    expect(navIconRule).toMatch(/width:\s*var\(--ui-sidebar-nav-icon-size\)/);
    expect(navIconRule).toMatch(/height:\s*var\(--ui-sidebar-nav-icon-size\)/);
  });

  it("does NOT reuse the control/toggle token (the tokens are genuinely split)", () => {
    expect(navIconRule).toMatch(/var\(--ui-sidebar-nav-icon-size\)/);
    expect(navIconRule).not.toMatch(/var\(--ui-sidebar-icon-size\)/);
  });

  it("keeps the approved rail geometry: the collapsed width still derives from the CONTROL icon", () => {
    const collapsed = /\.ui-sidebar-rail\[data-collapsed="true"\]\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(collapsed).toMatch(/width:\s*calc\(var\(--ui-sidebar-icon-size\) \* 1\.2\)/);
    expect(collapsed).toMatch(/padding-inline:\s*calc\(var\(--ui-sidebar-icon-size\) \* 0\.1\)/);
    expect(globals).toMatch(/--ui-sidebar-icon-size:\s*2rem/);
    expect(globals).toMatch(new RegExp("@media \\(min-width: 1024px\\)[^}]*--ui-sidebar-icon-size:\\s*4rem"));
    // The control icon keeps its own token (and therefore its hit-target size).
    const toggleIcon = /\.ui-sidebar-toggle-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(toggleIcon).toMatch(/width:\s*var\(--ui-sidebar-icon-size\)/);
    expect(toggleIcon).toMatch(/height:\s*var\(--ui-sidebar-icon-size\)/);
  });
});

describe("P6-3C/C — the CTA resolves to ONE authoritative top slot (never inside navigation)", () => {
  it("every viewport (aside / bottom-bar / drawer / overlay) resolves the same top slot", () => {
    const cases: Array<Record<string, unknown>> = [
      { preset: "adaptive" },
      { preset: "classic" },
      { preset: "focus" },
      { preset: "workspace" },
      { preset: "immersive" },
      { navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "bottom-bar" } },
      { navigation: { desktop: "floating", tablet: "floating", mobile: "overlay" } },
    ];
    for (const ui of cases) {
      const decision = resolveShellPattern(
        resolveUiConfig({
          ...ui,
          cta: { enabled: true, action: "book", label: "Book Now", href: "/book" },
        }),
      );
      expect([decision.desktop.ctaSlot, decision.tablet.ctaSlot, decision.mobile.ctaSlot]).toEqual([
        "top",
        "top",
        "top",
      ]);
      expect(decision.cta.present).toBe(true);
    }
  });

  it("resolves `none` (absent CTA) when the configuration does not enable one", () => {
    const decision = resolveShellPattern(resolveUiConfig({ preset: "adaptive" }));
    expect(decision.cta.present).toBe(false);
    expect([decision.desktop.ctaSlot, decision.tablet.ctaSlot, decision.mobile.ctaSlot]).toEqual([
      "none",
      "none",
      "none",
    ]);
  });
});

