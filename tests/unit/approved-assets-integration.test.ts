import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let mockPath = "/en";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { connectivityIcon } from "@/components/site/connectivity-links";
import { ContextNavLinks, type ContextNavLink } from "@/components/site/context-nav-links";
import { siteConfig } from "@/config";
import {
  availableBackgroundMap,
  availableFooterGraphicPath,
  availableHeaderGraphicPath,
  availableIconName,
  availableStatusGraphicPath,
  readImageDimensions,
} from "@/config/assets";
import { siteConfigFileSchema } from "@/config/schema";
import { resolveOgImageUrl } from "@/core/seo-metadata";

/**
 * APPROVED-ASSET INTEGRATION — the distributable Foundation brand asset set.
 *
 * Locks in what a FRESH Foundation pull now contains, and that it is AVAILABLE
 * without being CONFIGURED:
 *
 *  1. all five approved Foundation-owned graphics are shipped under
 *     `public/assets/`; FOUR are ACTIVE through the existing `site.assets.*`
 *     roles (background / footer / status / Open Graph) while the header band's
 *     canonical ACTIVATION is deliberately BLOCKED by the readability gate
 *     (shipped for adopters, role left unpopulated — see the dedicated case);
 *  2. the seven approved third-party platform marks ship as an ADOPTION-READY
 *     library while ZERO canonical account, handle, number or profile exists —
 *     their presence must never create a rendered link;
 *  3. the seven generic (non-trademark) connectivity icons ship for the CORE
 *     connectivity capability, byte-unchanged and colour-neutral;
 *  4. every role stays OPTIONAL and replaceable: removing or overriding it is
 *     still valid configuration and the documented fallbacks still apply;
 *  5. no engine source was changed to achieve any of it — the roles are read
 *     from configuration only.
 */

const ROOT = process.cwd();
const runtimeAsset = (file: string) => path.join(ROOT, "public", "assets", file);
const read = (...segments: string[]) => readFileSync(path.join(ROOT, ...segments), "utf8");
const configuredPathname = (url: string | undefined) => (url ? new URL(url).pathname : "");
const sameOrigin = (file: string) => `/assets/${file}`;

/** The approved Foundation-owned graphics now ACTIVE on the canonical site. */
const INTEGRATED_GRAPHICS = [
  {
    key: "backgrounds.all",
    file: "background-all.svg",
    url: siteConfig.assets?.backgrounds?.all,
    resolved: availableBackgroundMap(siteConfig.assets?.backgrounds).all,
  },
  {
    key: "footerGraphic",
    file: "footer-graphic.svg",
    url: siteConfig.assets?.footerGraphic,
    resolved: availableFooterGraphicPath(siteConfig.assets?.footerGraphic),
  },
  {
    key: "statusGraphic",
    file: "status-graphic.svg",
    url: siteConfig.assets?.statusGraphic,
    resolved: availableStatusGraphicPath(siteConfig.assets?.statusGraphic),
  },
] as const;

/** The seven ADMITTED official platform marks that now ship in the distribution. */
const ADMITTED_MARKS = [
  "whatsapp.svg",
  "telegram.svg",
  "facebook.png",
  "messenger.svg",
  "instagram.svg",
  "linkedin.png",
  "github.svg",
] as const;

/** The five WITHHELD platforms — no official mark may exist for these. */
const WITHHELD_MARKS = ["x.svg", "slack.svg", "mastodon.svg", "viber.svg", "youtube.svg"] as const;

/** The seven generic (non-trademark) connectivity icons for the CORE feature. */
const GENERIC_CONNECTIVITY_ICONS = [
  "icon-phone.svg",
  "icon-email.svg",
  "icon-message.svg",
  "icon-link.svg",
  "icon-external-link.svg",
  "icon-share.svg",
  "icon-globe.svg",
] as const;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isPng = (file: string) => readFileSync(runtimeAsset(file)).subarray(0, 8).equals(PNG_SIGNATURE);

describe("approved-asset integration — the five Foundation-owned graphics are ACTIVE", () => {
  for (const graphic of INTEGRATED_GRAPHICS) {
    it(`${graphic.key} points at the shipped public/assets/${graphic.file}`, () => {
      // Configured — the canonical deployment demonstrates its own approved system…
      expect(graphic.url, `${graphic.key} must be configured`).toBeTruthy();
      expect(graphic.url?.startsWith("https://"), `${graphic.key} must be absolute`).toBe(true);
      expect(configuredPathname(graphic.url), `${graphic.key} must name the role file`).toBe(
        sameOrigin(graphic.file),
      );
      // …shipped — a fresh pull has the bytes without the canonical archive…
      expect(existsSync(runtimeAsset(graphic.file)), `${graphic.file} must be on disk`).toBe(true);
      // …and resolvable, so no rendered asset URL is broken.
      expect(graphic.resolved, `${graphic.key} must resolve to its same-origin path`).toBe(
        sameOrigin(graphic.file),
      );
    });
  }

  it("ogImage points at the shipped, correctly-sized public/assets/og-image.png", () => {
    const url = siteConfig.assets?.ogImage;
    expect(url, "ogImage must be configured").toBeTruthy();
    expect(configuredPathname(url)).toBe(sameOrigin("og-image.png"));
    expect(existsSync(runtimeAsset("og-image.png"))).toBe(true);
    // PNG magic bytes + the social-preview dimensions read from the header (no OCR).
    expect(isPng("og-image.png")).toBe(true);
    expect(readImageDimensions(sameOrigin("og-image.png"))).toEqual({ width: 1200, height: 630 });
  });

  it("the status graphic declares a readable intrinsic size so its box is reserved", () => {
    // The in-flow status box emits real width/height attributes from this value.
    expect(readImageDimensions(sameOrigin("status-graphic.svg"))).toEqual({
      width: 640,
      height: 320,
    });
  });

  it("open-graph metadata uses the approved image while the generated route stays the fallback", () => {
    const url = siteConfig.assets?.ogImage ?? "";
    expect(resolveOgImageUrl(url, siteConfig.url, "en")).toBe(url);
    expect(resolveOgImageUrl(url, siteConfig.url, "ja")).toBe(url);
    // The fallback for adopters who REMOVE the static role is untouched.
    expect(resolveOgImageUrl(undefined, "https://example.com", "fr")).toBe(
      "https://example.com/fr/opengraph-image",
    );
  });

  it("the header graphic SHIPS but its canonical activation stays BLOCKED", () => {
    // The approved header graphic is distributed (a fresh pull has the bytes)…
    expect(existsSync(runtimeAsset("header-graphic.svg"))).toBe(true);
    // …while the ROLE stays unpopulated: the readability gate blocked activation
    // because `cover` renders the 8:1 artwork inside a 19.46:1 (desktop) /
    // 2.59:1 (mobile) header box — magnifying it ~2.4x and cropping through the
    // focal centred wordmark so it collides with the logo and the selectors.
    // The artwork was NOT altered and no engine CSS was added to compensate.
    expect(siteConfig.assets?.headerGraphic).toBeUndefined();
    expect(availableHeaderGraphicPath(undefined)).toBeUndefined();
    expect(availableHeaderGraphicPath(siteConfig.assets?.headerGraphic)).toBeUndefined();
    // An adopter may still configure it deliberately (the seam is intact).
    expect(availableHeaderGraphicPath("https://www.example.com/assets/header-graphic.svg")).toBe(
      "/assets/header-graphic.svg",
    );
  });
});

describe("approved-asset integration — the distributable asset inventory", () => {
  it("ships all seven ADMITTED official platform marks", () => {
    for (const mark of ADMITTED_MARKS) {
      expect(existsSync(runtimeAsset(mark)), `${mark} must ship in public/assets`).toBe(true);
      // Official source formats preserved: SVG where the owner supplies SVG, the
      // owner's own raster otherwise (never re-traced, never re-encoded).
      if (mark.endsWith(".png")) {
        expect(isPng(mark), `${mark} must be a PNG`).toBe(true);
      } else {
        // An official SVG may carry an XML declaration/BOM before <svg>.
        expect(readFileSync(runtimeAsset(mark), "utf8"), `${mark} must be an SVG`).toContain("<svg");
      }
    }
  });

  it("ships NO mark for any WITHHELD platform (no substitute, no lookalike)", () => {
    for (const withheld of WITHHELD_MARKS) {
      expect(existsSync(runtimeAsset(withheld)), `${withheld} must NOT exist`).toBe(false);
    }
  });

  it("ships the seven generic connectivity icons, byte-unchanged and colour-neutral", () => {
    for (const icon of GENERIC_CONNECTIVITY_ICONS) {
      expect(existsSync(runtimeAsset(icon)), `${icon} must ship in public/assets`).toBe(true);
      // Screened available by the SAME engine rule every icon role uses.
      expect(availableIconName(icon), `${icon} must be available`).toBe(icon);
      const source = readFileSync(runtimeAsset(icon), "utf8");
      // Universal-inventory geometry/attributes are untouched: the icons inherit
      // their rendered colour from context and bake in no Foundation colour.
      expect(source).toContain('stroke="currentColor"');
      expect(source).toContain('viewBox="0 0 24 24"');
      expect(source).not.toMatch(/#4F7CAC/i);
    }
  });

  it("keeps the generic functional inventory separate from the trademark-gated marks", () => {
    // Generic connectivity icons are NOT platform marks and never enter the
    // platform-mark namespace (and vice versa).
    for (const icon of GENERIC_CONNECTIVITY_ICONS) {
      expect(ADMITTED_MARKS.includes(icon as (typeof ADMITTED_MARKS)[number])).toBe(false);
    }
  });
});

describe("approved-asset integration — availability never creates a link", () => {
  /** The canonical connectivity items projected exactly as the runtime renders them. */
  const canonicalLinks: readonly ContextNavLink[] = [
    ...(siteConfig.socialLinks ?? []).map((link, index) => ({
      href: link.href,
      label: link.label,
      key: `social:${index}`,
      icon: connectivityIcon(link.icon),
    })),
    ...(siteConfig.connect?.methods ?? []).map((method) => ({
      href: method.href,
      label: method.label,
      key: method.id,
      demoOnly: method.demoOnly,
      icon: connectivityIcon(method.icon),
    })),
  ];

  const renderCanonical = () => {
    mockPath = "/en";
    return renderToStaticMarkup(ContextNavLinks({ locale: "en", links: canonicalLinks }));
  };

  it("invents no account: no social profile, handle, number or method icon was added", () => {
    expect(siteConfig.socialLinks).toEqual([]);
    for (const method of siteConfig.connect?.methods ?? []) {
      expect(method.icon, method.id).toBeUndefined();
    }
  });

  it("renders ZERO platform artwork although seven marks and seven icons now ship", () => {
    const html = renderCanonical();
    expect(canonicalLinks.length).toBeGreaterThan(0);
    expect(html).not.toContain("<img");
    // …while every configured destination is still a complete, working text link.
    for (const method of siteConfig.connect?.methods ?? []) {
      expect(html, method.id).toContain(method.href);
    }
  });

  it("an ADOPTED available mark renders through the existing generic seam (fixture only)", () => {
    mockPath = "/en";
    const html = renderToStaticMarkup(
      ContextNavLinks({
        locale: "en",
        links: [
          {
            href: "https://example.com/adopted",
            label: "Adopted Destination",
            key: "fixture",
            icon: connectivityIcon("whatsapp.svg"),
          },
        ],
      }),
    );
    expect(html).toContain('src="/assets/whatsapp.svg"');
    expect(html).toContain("Adopted Destination");
  });

  it("a WITHHELD or missing mark degrades to a complete text link (never a broken image)", () => {
    mockPath = "/en";
    for (const unavailable of ["viber.svg", "youtube.svg", "definitely-missing-mark.svg"]) {
      expect(connectivityIcon(unavailable), unavailable).toBe("");
      const html = renderToStaticMarkup(
        ContextNavLinks({
          locale: "en",
          links: [
            {
              href: "https://example.com/fallback",
              label: "Fallback Label",
              key: "fixture",
              icon: connectivityIcon(unavailable),
            },
          ],
        }),
      );
      expect(html, unavailable).not.toContain("<img");
      expect(html, unavailable).toContain("Fallback Label");
      expect(html, unavailable).toContain("https://example.com/fallback");
    }
  });
});

describe("approved-asset integration — every role stays optional and replaceable", () => {
  const rawConfig = JSON.parse(read("site.config.json")) as Record<string, unknown>;
  const withAssets = (assets: unknown) => {
    const config = structuredClone(rawConfig);
    const site = config.site as Record<string, unknown>;
    if (assets === undefined) delete site.assets;
    else site.assets = assets;
    return config;
  };

  it("an adopter may REMOVE the whole `assets` block and the config stays valid", () => {
    expect(siteConfigFileSchema.safeParse(withAssets(undefined)).success).toBe(true);
    // …and every resolver then renders NOTHING at all — no placeholder (P12-BG/FG/HG/SG).
    expect(availableBackgroundMap(undefined)).toEqual({});
    expect(availableHeaderGraphicPath(undefined)).toBeUndefined();
    expect(availableFooterGraphicPath(undefined)).toBeUndefined();
    expect(availableStatusGraphicPath(undefined)).toBeUndefined();
  });

  it("an adopter may REMOVE only the five integrated roles, keeping the identity roles", () => {
    const assets = structuredClone(siteConfig.assets as Record<string, unknown>);
    for (const key of ["ogImage", "headerGraphic", "footerGraphic", "statusGraphic"]) {
      delete assets[key];
    }
    delete assets.backgrounds;
    // `logo` / `favicon` / `logoFooter` / `banners` remain untouched.
    expect(Object.keys(assets).sort()).toEqual(["banners", "favicon", "logo", "logoFooter"]);
    expect(siteConfigFileSchema.safeParse(withAssets(assets)).success).toBe(true);
  });

  it("an adopter may CONFIGURE or override every graphic role with their own absolute URL", () => {
    const overrides = {
      ogImage: "https://cdn.example.com/my-share.png",
      headerGraphic: "https://cdn.example.com/header.svg",
      footerGraphic: "https://cdn.example.com/footer.svg",
      statusGraphic: "https://cdn.example.com/status.svg",
      backgrounds: { all: "https://cdn.example.com/background.svg" },
    };
    expect(siteConfigFileSchema.safeParse(withAssets(overrides)).success).toBe(true);
    // A non-local basename behaves exactly like an ABSENT role — never a broken image.
    expect(availableHeaderGraphicPath(overrides.headerGraphic)).toBeUndefined();
    expect(availableBackgroundMap(overrides.backgrounds)).toEqual({});
    // ogImage is the one role emitted verbatim (a CDN-hosted social image is legitimate).
    expect(resolveOgImageUrl(overrides.ogImage, siteConfig.url, "en")).toBe(overrides.ogImage);
  });

  it("a RELATIVE URL is still rejected for every integrated role", () => {
    for (const key of ["ogImage", "headerGraphic", "footerGraphic", "statusGraphic"]) {
      const config = withAssets({ [key]: "/assets/x.svg" });
      expect(siteConfigFileSchema.safeParse(config).success, key).toBe(false);
    }
    const backgrounds = withAssets({ backgrounds: { all: "/assets/x.svg" } });
    expect(siteConfigFileSchema.safeParse(backgrounds).success).toBe(false);
  });
});


describe("approved-asset integration — no engine hard-coding was introduced", () => {
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /**
   * The files that RESOLVE or RENDER the branding roles. `schema.ts` is
   * deliberately excluded: its only occurrences of these strings are the
   * PRE-EXISTING `.url()` validation-message examples ("e.g.
   * https://example.com/assets/og-image.png"), which are error text, not asset
   * references — and integration added no code to it.
   */
  const ENGINE_FILES = [
    "src/config/assets.ts",
    "src/config/site-config.ts",
    "src/app/[locale]/layout.tsx",
    "src/components/site/page-background.tsx",
    "src/components/site/header-graphic.ts",
    "src/components/site/footer-graphic.tsx",
    "src/components/site/status-graphic.tsx",
    "src/components/site/site-header.tsx",
    "src/components/site/site-footer.tsx",
  ];

  const engineSource = (file: string) => read(...file.split("/"));

  it("no resolving/rendering engine file hard-codes an integrated asset path", () => {
    for (const file of ENGINE_FILES) {
      const code = stripComments(engineSource(file));
      for (const graphic of INTEGRATED_GRAPHICS) {
        expect(code, `${file} must not hard-code ${graphic.file}`).not.toContain(
          `/assets/${graphic.file}`,
        );
      }
      expect(code, `${file} must not hard-code og-image.png`).not.toContain(
        "/assets/og-image.png",
      );
    }
  });

  it("every integrated role is read from configuration at its own seam", () => {
    const layout = engineSource("src/app/[locale]/layout.tsx");
    const header = engineSource("src/components/site/site-header.tsx");
    const footer = engineSource("src/components/site/site-footer.tsx");
    expect(layout).toContain("availableBackgroundMap(siteConfig.assets?.backgrounds)");
    expect(layout).toContain("availableStatusGraphicPath(siteConfig.assets?.statusGraphic)");
    expect(layout).toContain("siteConfig.assets?.ogImage");
    expect(header).toContain("siteConfig.assets?.headerGraphic");
    expect(footer).toContain("siteConfig.assets?.footerGraphic");
  });

  it("added no new asset role, platform enum or platform branch", () => {
    const schema = engineSource("src/config/schema.ts");
    const assets = engineSource("src/config/assets.ts");
    // Exactly the pre-existing role count — integration added none.
    expect(schema.match(/backgrounds: z/g)?.length).toBe(1);
    expect(schema.match(/footerGraphic: z/g)?.length).toBe(1);
    expect(schema.match(/headerGraphic: z/g)?.length).toBe(1);
    expect(schema.match(/statusGraphic: z/g)?.length).toBe(1);
    expect(schema.match(/ogImage: z/g)?.length).toBe(1);
    expect(
      assets.match(
        /export function available(BackgroundMap|FooterGraphicPath|HeaderGraphicPath|StatusGraphicPath)/g,
      )?.length,
    ).toBe(4);
    // The connectivity seam stays ONE generic leaf: no platform vocabulary anywhere.
    const enums = [...schema.matchAll(/z\.enum\(\s*\[([^\]]*)\]/g)].map((m) => m[1]).join(" ");
    expect(enums).not.toMatch(
      /whatsapp|telegram|messenger|facebook|linkedin|instagram|github|viber|mastodon|slack|youtube/i,
    );
  });
});

