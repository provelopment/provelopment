import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let mockPath = "/en";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { ContextNavLinks, type ContextNavLink } from "@/components/site/context-nav-links";
import { connectivityIcon, socialConnectivityLinks } from "@/components/site/connectivity-links";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NavItem } from "@/components/ui/nav-item";
import type { ConnectMethod, SocialLink } from "@/config";
import { siteConfig } from "@/config";
import { assertConfiguredIconAssetsExist, availableIconName } from "@/config/assets";
import { parseSiteConfig } from "@/config/loader";

/**
 * CONNECTIVITY ICON SEAM — the owner product decision that connectivity (social
 * + communication destinations) is a CORE Foundation capability, expressed as a
 * generic optional icon/mark reference on connectivity items.
 *
 * These tests encode the CONTRACT, not just the implementation:
 *  - the pre-seam `socialLinks` / `connect.methods` shapes stay valid;
 *  - `icon` is optional on BOTH families and is ONE generic leaf (no
 *    platform-specific schema leaf, no closed platform enum);
 *  - a connectivity item renders as a complete, usable TEXT link with or without
 *    artwork (missing/unavailable icon → no `<img>`, never a broken image, never
 *    a lost method);
 *  - the icon is decorative (`alt=""` + `aria-hidden`), never focusable, and the
 *    visible label remains the accessible name;
 *  - no platform-specific engine logic exists, and no platform artwork is
 *    installed (this task creates none).
 */

const baseConfig = {
  site: {
    url: "https://example.com",
    name: "Example",
    tagline: "An example site",
    description: "A site used for testing.",
  },
  i18n: {
    defaultLocale: "en",
    locales: [{ code: "en", label: "English" }],
  },
  contact: { email: "hello@example.com" },
  navigation: [{ label: "Home", href: "/" }],
};

/** A generic EXISTING shipped asset (screened available) — not platform artwork. */
const AVAILABLE_ICON = "sidebar-open.svg";
/** A configured-but-absent asset (deliberate missing-file fallback). */
const MISSING_ICON = "definitely-missing-connectivity-icon.svg";

function renderLinks(links: readonly ContextNavLink[]): string {
  mockPath = "/en";
  return renderToStaticMarkup(ContextNavLinks({ locale: "en", links }));
}

/** The footer's method projection, mirrored exactly (same screening helper). */
function methodLinks(methods: readonly ConnectMethod[]): readonly ContextNavLink[] {
  return methods.map((method) => ({
    href: method.href,
    label: method.label,
    key: method.id,
    demoOnly: method.demoOnly,
    icon: connectivityIcon(method.icon),
  }));
}

describe("connectivity icon seam — configuration contract", () => {
  it("keeps the pre-seam socialLinks shape valid and icon-less", () => {
    const config = parseSiteConfig({
      ...baseConfig,
      socialLinks: [{ platform: "github", label: "GitHub", href: "https://github.com/example" }],
    });
    expect(config.socialLinks).toHaveLength(1);
    expect(config.socialLinks[0].label).toBe("GitHub");
    expect(config.socialLinks[0].icon).toBeUndefined();
  });

  it("keeps the pre-seam connect.methods shape valid and icon-less", () => {
    const config = parseSiteConfig({
      ...baseConfig,
      socialLinks: [],
      connect: { methods: [{ id: "message", label: "Message Us", href: "/contact" }] },
    });
    expect(config.connect?.methods).toHaveLength(1);
    expect(config.connect?.methods[0].icon).toBeUndefined();
  });

  it("carries the optional generic icon on socialLinks and connect.methods (round-trips)", () => {
    const config = parseSiteConfig({
      ...baseConfig,
      socialLinks: [
        {
          platform: "github",
          label: "GitHub",
          href: "https://github.com/example",
          icon: "icon-platform-example.svg",
        },
      ],
      connect: {
        methods: [
          { id: "telegram", label: "Telegram", href: "https://t.me/example", icon: AVAILABLE_ICON },
        ],
      },
    });
    expect(config.socialLinks[0].icon).toBe("icon-platform-example.svg");
    expect(config.connect?.methods[0].icon).toBe(AVAILABLE_ICON);
  });

  it("accepts an ARBITRARY future platform / method id with no schema change", () => {
    const futurePlatforms = [
      "signal",
      "discord",
      "line",
      "wechat",
      "teams",
      "matrix",
      "bluesky",
      "threads",
      "future-platform-2049",
    ];
    const config = parseSiteConfig({
      ...baseConfig,
      socialLinks: futurePlatforms.map((platform) => ({
        platform,
        label: platform,
        href: `https://example.com/${platform}`,
        icon: AVAILABLE_ICON,
      })),
      connect: {
        methods: futurePlatforms.map((id) => ({
          id,
          label: id,
          href: `https://example.com/${id}`,
          icon: AVAILABLE_ICON,
        })),
      },
    });
    expect(config.socialLinks.map((link) => link.platform)).toEqual(futurePlatforms);
    expect(config.connect?.methods.map((method) => method.id)).toEqual(futurePlatforms);
  });

  it("rejects a non-filename icon value (URLs/paths are not expressible through the seam)", () => {
    for (const icon of [
      "https://cdn.example.com/mark.svg",
      "brand/social/mark.svg",
      "mark.svg?v=2",
      ".svg",
    ]) {
      expect(() =>
        parseSiteConfig({
          ...baseConfig,
          socialLinks: [
            { platform: "github", label: "GitHub", href: "https://github.com/example", icon },
          ],
        }),
      ).toThrow(/public\/assets/);
    }
  });

  it("screens BOTH families at RENDER time only (a missing file never fails a build, errors or hides a method)", () => {
    // Owner requirement: connectivity artwork is strictly supplementary, so a
    // configured name with no backing file degrades to a text-only link. It is
    // deliberately NOT part of the loud build-failure icon set (the control/nav
    // leaves in `src/config/assets.ts`): it may never fail a deployment, error a
    // page, or drop a communication method.
    expect(() => assertConfiguredIconAssetsExist(siteConfig)).not.toThrow();
    const loudSet = readFileSync(
      path.join(process.cwd(), "src", "config", "assets.ts"),
      "utf8",
    );
    expect(loudSet).not.toContain("socialLinks");
    expect(loudSet).not.toContain("connect.methods");

    // The icon VALUE SHAPE stays loud: a URL/path/query icon is a real
    // configuration error, on both connectivity families.
    for (const malformed of ["https://cdn.example.com/mark.svg", "social/mark.svg", "mark.svg?v=2"]) {
      expect(() =>
        parseSiteConfig({
          ...baseConfig,
          socialLinks: [
            { platform: "github", label: "GitHub", href: "https://github.com/example", icon: malformed },
          ],
        }),
      ).toThrow(/public\/assets/);
      expect(() =>
        parseSiteConfig({
          ...baseConfig,
          socialLinks: [],
          connect: {
            methods: [{ id: "email", label: "Email", href: "mailto:a@b.co", icon: malformed }],
          },
        }),
      ).toThrow(/public\/assets/);
    }
  });
});


describe("connectivity icon seam — text remains authoritative", () => {
  it("renders a social link without an icon as exactly a usable text link", () => {
    const links = socialLinks([
      { platform: "github", label: "GitHub", href: "https://github.com/example" },
    ]);
    expect(links[0].icon).toBeUndefined();

    const html = renderLinks(links);
    expect(html).toContain('href="https://github.com/example"');
    expect(html).toContain("GitHub");
    expect(html).not.toContain("<img");
  });

  it("keeps distinct React identity when one platform is configured twice (P5-6 rule)", () => {
    const links = socialLinks([
      { platform: "github", label: "Personal", href: "https://github.com/personal" },
      { platform: "github", label: "Team", href: "https://github.com/team" },
    ]);
    expect(links.map((link) => link.key)).toEqual(["social:0", "social:1"]);

    const html = renderLinks(links);
    expect(html).toContain("https://github.com/personal");
    expect(html).toContain("https://github.com/team");
    expect((html.match(/<li/g) ?? []).length).toBe(2);
  });

  it("renders a connectivity method without an icon as a usable text link", () => {
    const html = renderLinks([{ href: "/contact", label: "Message Us", key: "message" }]);
    expect(html).toContain("Message Us");
    expect(html).toContain('href="/en/contact"');
    expect(html).not.toContain("<img");
  });

  it("falls back to text-only when a configured icon has no backing file (never a broken image)", () => {
    expect(availableIconName(MISSING_ICON)).toBe("");
    expect(connectivityIcon(MISSING_ICON)).toBe("");

    const socialHtml = renderLinks(
      socialLinks([
        { platform: "github", label: "GitHub", href: "https://github.com/example", icon: MISSING_ICON },
      ]),
    );
    expect(socialHtml).toContain("GitHub");
    expect(socialHtml).toContain('href="https://github.com/example"');
    expect(socialHtml).not.toContain("<img");
    expect(socialHtml).not.toContain(MISSING_ICON);

    const methodsHtml = renderLinks(
      methodLinks([{ id: "whatsapp", label: "WhatsApp", href: "https://wa.me/1", icon: MISSING_ICON }]),
    );
    expect(methodsHtml).toContain("WhatsApp");
    expect(methodsHtml).not.toContain("<img");
  });

  it("preserves the deliberate-absence values verbatim", () => {
    expect(connectivityIcon(undefined)).toBeUndefined();
    expect(connectivityIcon("")).toBe("");
  });

  it("renders a valid AVAILABLE icon as supplementary artwork beside the label", () => {
    const html = renderLinks(
      socialLinks([
        { platform: "github", label: "GitHub", href: "https://github.com/example", icon: AVAILABLE_ICON },
      ]),
    );
    expect(html).toContain(`<img src="/assets/${AVAILABLE_ICON}"`);
    expect(html).toContain("GitHub");
    expect(html).toContain('href="https://github.com/example"');
    // Deterministic placement: the icon precedes the label (`[icon] Label`).
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("GitHub"));
  });
});

describe("connectivity icon seam — accessibility", () => {
  it("renders the icon decoratively (empty alt + aria-hidden) and never focusable", () => {
    const html = renderToStaticMarkup(
      NavItem({
        item: {
          label: "GitHub",
          href: "https://github.com/example",
          external: true,
          icon: AVAILABLE_ICON,
        },
      }),
    );
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/tabindex/i);
    expect(html).not.toMatch(/<img[^>]*aria-label/);
  });

  it("keeps the visible label as the accessible name (no redundant GitHub GitHub / aria-label)", () => {
    const html = renderLinks(
      socialLinks([
        { platform: "github", label: "GitHub", href: "https://github.com/example", icon: AVAILABLE_ICON },
      ]),
    );
    expect(html).toContain("ui-nav-item-label");
    expect((html.match(/GitHub/g) ?? []).length).toBe(1);
    expect(html).not.toMatch(/<a[^>]*aria-label/);
  });

  it("keeps pointer/focus ownership on the link, not the artwork", () => {
    const html = renderLinks(
      methodLinks([
        { id: "telegram", label: "Telegram", href: "https://t.me/example", icon: AVAILABLE_ICON },
      ]),
    );
    expect(html).toMatch(/<a [^>]*href="https:\/\/t\.me\/example"/);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toMatch(/<img[^>]*(role|tabindex|aria-label|title)=/);
  });

  it("renders the decorative icon through the one shared asset node for both families", () => {
    const markup = renderToStaticMarkup(
      AssetIcon({ asset: AVAILABLE_ICON, className: "ui-nav-item-icon" }),
    );
    // The node itself is exactly the shared decorative contract (React may also
    // emit an image preload hint alongside it).
    expect(markup).toContain(
      `<img src="/assets/${AVAILABLE_ICON}" alt="" aria-hidden="true" class="ui-nav-item-icon"/>`,
    );
    // Absent/unavailable → no element at all.
    expect(renderToStaticMarkup(AssetIcon({ asset: "" }))).toBe("");
    expect(renderToStaticMarkup(AssetIcon({ asset: undefined }))).toBe("");
  });
});

function socialLinks(links: readonly SocialLink[]): readonly ContextNavLink[] {
  return socialConnectivityLinks(links);
}

/**
 * Strip comments before scanning source for platform-specific leaves/branches:
 * the contract documentation itself names the prohibited leaf family (for
 * example "no `whatsappIcon`") as a counter-example, which is not engine logic.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("connectivity icon seam — data-driven, no platform logic", () => {
  const root = process.cwd();

  function source(relativePath: string): string {
    return readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
  }

  const ENGINE_FILES = [
    "src/config/schema.ts",
    "src/config/site-config.ts",
    "src/config/assets.ts",
    "src/components/site/connectivity-links.ts",
    "src/components/site/site-footer.tsx",
    "src/components/site/context-nav-links.tsx",
    "src/components/ui/asset-icon.tsx",
    "src/components/ui/nav-item.tsx",
    "src/app/[locale]/connect/page.tsx",
  ];

  it("introduces NO platform-specific icon leaf (one generic `icon` only)", () => {
    const platformLeaf =
      /(whatsapp|telegram|messenger|facebook|linkedin|github|instagram|youtube|mastodon|slack|viber|twitter|signal|discord|threads|bluesky|wechat|teams)[A-Za-z]*Icon/;
    for (const file of ENGINE_FILES) {
      expect(codeOnly(source(file)).match(platformLeaf), file).toBeNull();
    }
  });

  it("introduces NO closed platform enum, registry or platform branch", () => {
    const schema = source("src/config/schema.ts");
    const enums = [...schema.matchAll(/z\.enum\(\s*\[([^\]]*)\]/g)].map((match) => match[1]).join(" ");
    expect(enums).not.toMatch(
      /whatsapp|telegram|messenger|facebook|linkedin|instagram|youtube|mastodon|slack|viber|twitter|signal|discord/i,
    );
    for (const file of ENGINE_FILES) {
      expect(codeOnly(source(file)).match(/platform\s*===|switch\s*\(\s*\w*platform/i), file).toBeNull();
    }
  });

  it("renders every configured platform through the one generic path", () => {
    const html = renderLinks(
      socialLinks(
        ["github", "telegram", "future-platform-2049"].map((platform) => ({
          platform,
          label: platform,
          href: `https://example.com/${platform}`,
        })),
      ),
    );
    expect(html).toContain("https://example.com/github");
    expect(html).toContain("https://example.com/telegram");
    expect(html).toContain("https://example.com/future-platform-2049");
    expect((html.match(/<li/g) ?? []).length).toBe(3);
  });
});

describe("connectivity icon seam — scope protection", () => {
  const root = process.cwd();

  it("installs NO platform mark artwork in the runtime asset inventory", () => {
    const assets = readdirSync(path.join(root, "public", "assets"));
    const platformMark =
      /whatsapp|telegram|messenger|facebook|linkedin|instagram|youtube|mastodon|slack|viber|twitter|signal|discord|threads|bluesky|wechat|platform-/i;
    expect(assets.filter((name) => platformMark.test(name))).toEqual([]);
  });

  it("leaves the canonical configuration free of invented accounts or icons", () => {
    expect(siteConfig.socialLinks).toEqual([]);
    for (const method of siteConfig.connect?.methods ?? []) {
      expect(method.icon, method.id).toBeUndefined();
    }
  });

  it("keeps the pre-existing functional icon inventory intact and available", () => {
    for (const icon of [
      "sidebar-open.svg",
      "sidebar-close.svg",
      "sidebar-default-icon-open.svg",
      "sidebar-default-icon-closed.svg",
      "favicon.svg",
      "logo-header.svg",
      "logo-footer.svg",
    ]) {
      expect(availableIconName(icon), icon).toBe(icon);
    }
  });

  it("keeps JSON-LD sameAs built from hrefs only (icon/label never leak into structured data)", () => {
    for (const file of [
      "src/components/site/structured-data.tsx",
      "src/components/site/region-structured-data.tsx",
    ]) {
      const fileSource = readFileSync(path.join(root, ...file.split("/")), "utf8");
      expect(fileSource, file).toContain("siteConfig.socialLinks.map((link) => link.href)");
    }
  });
});

