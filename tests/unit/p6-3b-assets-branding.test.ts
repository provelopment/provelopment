import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import {
  assetPathFromUrl,
  assertConfiguredIconAssetsExist,
  availableBannerPath,
  iconAssetAvailable,
} from "@/config/assets";
import { NavItem } from "@/components/ui/nav-item";
import {
  DEFAULT_SIDEBAR_ITEM_ICON_CLOSED,
  DEFAULT_SIDEBAR_ITEM_ICON_OPEN,
  withSidebarNavIcons,
} from "@/components/site/nav-links";
import { pageSlugFromPathname } from "@/components/site/page-banner";

const root = process.cwd();
const assetFile = (name: string) => path.join(root, "public", "assets", name);

/**
 * P6-3B — favicon, banner, header-logo, and sidebar navigation-icon contracts.
 * Asset/config resolution is proven here; rendered geometry (icon sizes,
 * collapsed width, full-height border, tablet layout) is proven by the CDP
 * browser matrix.
 */
describe("P6-3B — favicon contract", () => {
  it("resolves the configured favicon to a same-origin /assets path and the file exists", () => {
    expect(assetPathFromUrl(siteConfig.assets?.favicon)).toBe("/assets/favicon.svg");
    expect(existsSync(assetFile("favicon.svg"))).toBe(true);
  });

  it("has NO competing file-based icon route (src/app/icon.svg is removed)", () => {
    expect(existsSync(path.join(root, "src", "app", "icon.svg"))).toBe(false);
    expect(existsSync(path.join(root, "src", "app", "favicon.ico"))).toBe(false);
  });

  it("declares exactly ONE favicon in metadata (icons.icon via assetPathFromUrl, no dupe key)", () => {
    const layout = readFileSync(
      path.join(root, "src", "app", "[locale]", "layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("assetPathFromUrl(siteConfig.assets?.favicon)");
    // No raw-URL favicon metadata remains (would point at the placeholder origin).
    expect(layout).not.toContain("icon: siteConfig.assets?.favicon,");
  });
});

describe("P6-3B — banner contract", () => {
  it("home banner resolves through site.assets.banners to a same-origin path + file exists", () => {
    expect(assetPathFromUrl(siteConfig.assets?.banners?.home)).toBe("/assets/banner-home.jpg");
    expect(existsSync(assetFile("banner-home.jpg"))).toBe(true);
  });

  it("availableBannerPath returns the path only when the file exists (no-banner → undefined)", () => {
    expect(availableBannerPath(siteConfig.assets?.banners?.home)).toBe("/assets/banner-home.jpg");
    expect(availableBannerPath("https://www.example.com/assets/banner-nope.jpg")).toBeUndefined();
    expect(availableBannerPath(undefined)).toBeUndefined();
  });

  it("the old logoTitle runtime concept is fully retired (config + asset gone)", () => {
    expect(existsSync(assetFile("logo-title.jpg"))).toBe(false);
    const raw = readFileSync(path.join(root, "site.config.json"), "utf8");
    expect(raw).not.toContain("logo-title");
    expect(raw).not.toContain("logoTitle");
  });

  it("pageSlugFromPathname maps locale(+region) paths to page keys correctly", () => {
    const regions = ["berlin", "tokyo"];
    expect(pageSlugFromPathname("/en", regions)).toBe("home");
    expect(pageSlugFromPathname("/en/", regions)).toBe("home");
    expect(pageSlugFromPathname("/en/berlin", regions)).toBe("home");
    expect(pageSlugFromPathname("/en/about", regions)).toBe("about");
    expect(pageSlugFromPathname("/en/berlin/about", regions)).toBe("about");
    expect(pageSlugFromPathname("/fr/portfolio/thing", regions)).toBe("portfolio");
  });

  it("the page banner has zero structural padding/margin/border (all zero in CSS)", () => {
    const globals = readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");
    expect(globals).toMatch(new RegExp("\\.ui-page-banner\\s*\\{[^}]*padding:\\s*0"));
    expect(globals).toMatch(new RegExp("\\.ui-page-banner\\s*\\{[^}]*margin:\\s*0"));
    expect(globals).toMatch(new RegExp("\\.ui-page-banner-image\\s*\\{[^}]*width:\\s*100%"));
    expect(globals).toMatch(new RegExp("\\.ui-page-banner-image\\s*\\{[^}]*height:\\s*auto"));
  });
});

describe("P6-3B — header logo contract", () => {
  it("resolves the configured header logo to the same-origin asset and the file exists", () => {
    expect(assetPathFromUrl(siteConfig.assets?.logo)).toBe("/assets/logo-header.svg");
    expect(existsSync(assetFile("logo-header.svg"))).toBe(true);
  });

  it("the header renders the logo <img> in the brand slot (text placeholder removed)", () => {
    const header = readFileSync(
      path.join(root, "src", "components", "site", "site-header.tsx"),
      "utf8",
    );
    expect(header).toContain("headerLogoSrc");
    expect(header).toContain("ui-site-header-logo");
    expect(header).toContain("headerLogoSrc ? (");
  });
});

describe("P6-3B — sidebar navigation-item icon contract", () => {
  it("the default open (dot) and closed (plus) assets exist and differ", () => {
    expect(iconAssetAvailable(DEFAULT_SIDEBAR_ITEM_ICON_OPEN)).toBe(true);
    expect(iconAssetAvailable(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED)).toBe(true);
    expect(DEFAULT_SIDEBAR_ITEM_ICON_OPEN).not.toBe(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED);
  });

  it("items without a configured icon fall back to the DEFAULT dot/plus pair", () => {
    const [link] = withSidebarNavIcons([{ href: "/", label: "Home", key: "nav:0" }]);
    expect(link.openIcon).toBe(DEFAULT_SIDEBAR_ITEM_ICON_OPEN);
    expect(link.closedIcon).toBe(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED);
  });

  it("a legacy single `icon` drives BOTH states (P5-5 behavior preserved)", () => {
    const [link] = withSidebarNavIcons([{ href: "/", label: "Home", key: "nav:0", icon: "sidebar-open.svg" }]);
    expect(link.openIcon).toBe("sidebar-open.svg");
    expect(link.closedIcon).toBe("sidebar-open.svg");
  });

  it("mixed configuration: custom open/closed on one item, defaults on the rest (no component change)", () => {
    const links = withSidebarNavIcons([
      { href: "/a", label: "A", key: "nav:0", openIcon: "menu-open.svg", closedIcon: "menu-closed.svg" },
      { href: "/b", label: "B", key: "nav:1" },
      { href: "/c", label: "C", key: "nav:2" },
    ]);
    expect(links[0].openIcon).toBe("menu-open.svg");
    expect(links[0].closedIcon).toBe("menu-closed.svg");
    expect(links[1].openIcon).toBe(DEFAULT_SIDEBAR_ITEM_ICON_OPEN);
    expect(links[1].closedIcon).toBe(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED);
    expect(links[2].closedIcon).toBe(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED);
  });

  it("expanded NavItem renders the OPEN icon; the CLOSED icon is present but CSS-hidden (not removed)", () => {
    const html = renderToStaticMarkup(
      NavItem({
        item: { label: "Home", href: "/en", openIcon: "o.svg", closedIcon: "c.svg" },
      }),
    );
    expect(html).toContain("/assets/o.svg");
    expect(html).toContain("/assets/c.svg");
    expect(html).toContain("ui-nav-item-icon-open");
    expect(html).toContain("ui-nav-item-icon-closed");
    // Both are decorative (accessible name comes from the visible label).
    expect(html).toContain('alt=""');
    expect(html).toContain("ui-nav-item-label");
  });

  it("single-icon NavItem stays a one-image path (header/bottom-bar unchanged)", () => {
    const html = renderToStaticMarkup(NavItem({ item: { label: "Home", href: "/en", icon: "one.svg" } }));
    expect(html).toContain("/assets/one.svg");
    expect(html).not.toContain("ui-nav-item-icon-open");
    expect(html).not.toContain("ui-nav-item-icon-closed");
  });

  it("assertConfiguredIconAssetsExist fails LOUDLY for a missing configured iconOpen (never a broken <img>)", () => {
    expect(() =>
      assertConfiguredIconAssetsExist({
        navigation: [{ icon: undefined, iconOpen: "definitely-missing-icon.svg" }],
      }),
    ).toThrow(/navigation\[0\]\.iconOpen/);
  });
});

