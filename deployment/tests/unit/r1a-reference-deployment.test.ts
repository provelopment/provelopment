import { describe, expect, it, vi } from "vitest";

// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so
// it lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in
// the `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2). Its subject is the real capsule, never a fixture.
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { deploymentPaths } from "@/config/deployment-root";

import PageRoute from "@/app/[[...segments]]/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { createPageSources } from "@/adapters/content/page-sources";
import { buildSitemapRoutes } from "@/application/route-discovery";
// M18 — the deployment declares TWO Spokes, so this suite binds the FOUNDATION Spoke explicitly (the
// accepted runtime authorities refuse an installation-wide answer for a multi-Spoke Installation, and
// "the" configuration would be the default-Spoke rule the runtime refuses). The reference `ww` Site,
// its dictionaries, its pages and its origin live on this Spoke.
import { foundationConfig as siteConfig, foundationSpoke } from "../support/spoke-contexts";

// M18 — the public route resolves its Spoke from the REQUEST BOUNDARY's private selection header
// (`x-foundation-spoke-segment`), so a node test that drives the REAL route must present one, exactly as
// the boundary would. Without it a multi-Spoke Installation answers NOTHING (no host claimed → no Spoke),
// which is the honest behaviour the routing contract asserts.
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "foundation-template.provelopment.com",
      "x-foundation-spoke-segment": "foundation",
    }),
}));

import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { resolveUiConfig } from "@/core/ui";

import { runtimeAssetFile, runtimeAssetUrl } from "../../../tests/support/runtime-assets";

/**
 * R1A — THE REFERENCE DEPLOYMENT'S CONFIGURATION AND ITS FIRST TWO PAGES.
 *
 * The public repository is also the template's own live reference site, so the
 * things R1A changed are asserted here at the CONFIGURATION and CONTENT level:
 * the real origin (never a placeholder), the favicon an adopter-supplied asset
 * is resolved through, the visitor Layout choice, the Home/About pair authored
 * in the two first-class modes, and the origin those pages' canonical,
 * sitemap and robots output derive from.
 *
 * The rendering-level consequences (the disclosure's two visual states, the
 * live Layout switching, the resolved navigation hrefs) are proved in the
 * committed browser matrix (`reference-content` scenario), which drives a real
 * browser against the shipped configuration.
 */
const REFERENCE_ORIGIN = "https://foundation-template.provelopment.com";
const REFERENCE_HOME_TITLE = "Build a website you own.";
const REFERENCE_ABOUT_TITLE = "About this Foundation website";
/**
 * R1A1 — the reference site's content is OWNER-AUTHORED and FINAL, so the assertions
 * below quote the owner's current files. If the owner edits the copy again, these
 * needles move with it: the content is never adjusted to satisfy a test.
 */
const REFERENCE_REPOSITORY_URL = "https://github.com/provelopment/provelopment-foundation";

/**
 * WHERE THIS TEST'S FILES COME FROM (FOUNDATION-DEPLOYMENT-ISO-B2A)
 * ----------------------------------------------------------------
 * The deployment's own configuration and asset locations are asked of the ONE deployment-root
 * authority (`@/config/deployment-root`, ISO-B1) — never spelled as a repository-root path here — so
 * this suite follows the deployment wherever it is kept. A PLATFORM file (application source,
 * generated static output) is a property of the repository, which is what `platformRoot` names.
 */
const deployment = foundationSpoke;
const platformRoot = process.cwd();
const platformFile = (...segments: string[]) => path.join(platformRoot, ...segments);

/** The shipped JSON, as an adopter edits it (the loader's own input shape). */
interface RawReferenceConfig {
  readonly site: { readonly url: string; readonly assets?: { readonly favicon?: string } };
  readonly ui: {
    readonly layoutSwitcher?: { readonly enabled?: boolean; readonly default?: "sidebar" | "menu-bar" };
    readonly navigation?: { readonly desktop?: "sidebar"; readonly tablet?: "collapsed-sidebar" };
  };
  readonly navigation: readonly {
    readonly label: string;
    readonly href: string;
    readonly iconOpen?: string;
    readonly iconClosed?: string;
  }[];
}
const rawConfig = (): RawReferenceConfig =>
  JSON.parse(readFileSync(deployment.siteConfigFile, "utf8")) as RawReferenceConfig;

const siteCode = siteConfig.defaultSite.code;
const localePath = siteConfig.defaultSite.defaultLocale;

describe("the reference deployment's own configuration", () => {
  it("declares the live origin as site.url, in the one authority that owns it", () => {
    expect(siteConfig.url).toBe(REFERENCE_ORIGIN);
    // The shipped JSON agrees with the loader: no second, drifting value.
    expect(rawConfig().site.url).toBe(REFERENCE_ORIGIN);
  });

  it("configures the favicon from an asset the repository actually ships", () => {
    expect(siteConfig.assets?.favicon).toBe(`${REFERENCE_ORIGIN}/assets/favicon.svg`);
    // The declared role must resolve to a file the runtime actually serves (S3E1C: the favicon is
    // REPLACEABLE role artwork, so it ships in the sole Spoke's own namespace, not the platform tree), or
    // the browser would 404 the very icon the configuration declares.
    expect(runtimeAssetFile("favicon.svg")).not.toBeUndefined();
    expect(runtimeAssetUrl("favicon.svg")).toBe("/spokes/foundation/assets/favicon.svg");
  });

  it("enables the visitor layout switcher without a competing navigation leaf", () => {
    const ui = rawConfig().ui;
    expect(ui.layoutSwitcher).toEqual({ enabled: true, default: "sidebar" });
    // A layout IS `navigation.desktop`/`tablet`, so the schema refuses both at once;
    // the reference configuration must therefore declare neither.
    expect(ui.navigation?.desktop).toBeUndefined();
    expect(ui.navigation?.tablet).toBeUndefined();
  });

  it("resolves the switcher to the whole layout vocabulary, defaulting to the sidebar", () => {
    const resolved = resolveUiConfig(rawConfig().ui);
    expect(resolved.layoutSwitcher).toEqual({
      enabled: true,
      default: "sidebar",
      available: ["sidebar", "menu-bar"],
    });
    // The sidebar default is the canonical composition: a desktop sidebar + a
    // collapsed tablet rail.
    expect(resolved.navigation.desktop).toBe("sidebar");
    expect(resolved.navigation.tablet).toBe("collapsed-sidebar");
  });

  it("navigates Home and About as the site's two destinations", () => {
    expect(siteConfig.navigation.map((item) => item.href)).toEqual(["/", "/about"]);
    expect(siteConfig.navigation.map((item) => item.label)).toEqual(["Home", "About"]);
    // Icons resolve through the shipped asset family (never a broken <img>).
    for (const item of siteConfig.navigation) {
      for (const icon of [item.iconOpen, item.iconClosed].filter(Boolean)) {
        // The navigation icons are PLATFORM artwork (the icon library), so they ship in the shared
        // platform namespace — asked of the authority rather than assumed.
        expect(runtimeAssetFile(icon as string), icon).not.toBeUndefined();
      }
    }
  });
});

describe("the reference pages are real pages, in the two authoring modes", () => {
  it("authors Home in the JSON mode at the reserved home slug", async () => {
    const pages = createPageSources({ sites: siteConfig.sites, roots: foundationSpoke.resources });
    const home = await pages.resolve(siteCode, HOME_CONTENT_SLUG, localePath);
    expect(home?.kind).toBe("json");
    expect(home?.title).toBe(REFERENCE_HOME_TITLE);
    // The declarative vocabulary the page uses, in authoring order.
    const document = home?.kind === "json" ? home.document : null;
    expect(document?.sections.map((section) => section.type)).toEqual([
      "hero",
      "columns",
      "callout",
      "cards",
      "prose",
      "prose",
    ]);
  });

  it("authors About in the Markdown mode at /about", async () => {
    const pages = createPageSources({ sites: siteConfig.sites, roots: foundationSpoke.resources });
    const about = await pages.resolve(siteCode, "about", localePath);
    expect(about?.kind).toBe("markdown");
    expect(about?.title).toBe(REFERENCE_ABOUT_TITLE);
    expect(about?.description).toContain("What this live reference site demonstrates");
  });

  it("publishes each page's own URL and never /home", async () => {
    const pages = createPageSources({ sites: siteConfig.sites, roots: foundationSpoke.resources });
    const routePaths = await pages.listRoutes(siteCode, localePath);
    expect(routePaths.some((routePath) => routePath.replace(/^\//, "") === "about")).toBe(true);
    const routes = buildSitemapRoutes({ pages: routePaths });
    expect(routes).toContain("/about");
    expect(routes).not.toContain("/home");
  });
});

describe("the served reference pages", () => {
  it("renders the authored Home document: one h1, its sections, and its real destinations", async () => {
    const html = renderToStaticMarkup(
      await PageRoute({ params: Promise.resolve({ segments: [siteCode, localePath] }) }),
    );

    // The document title is the page's ONLY level-1 heading (both modes share it).
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(html).toContain(REFERENCE_HOME_TITLE);
    // The declarative sections the file declares are the sections that render.
    expect(html).toContain("You own your website");
    expect(html).toContain("Two ways to create a page");
    // The hero action that names the About page, and the owner's external destination
    // (the public repository, per the owner-final copy).
    expect(html).toContain("See how this site works");
    expect(html).toContain("/about");
    expect(html).toContain(REFERENCE_REPOSITORY_URL);
    // An authored home page REPLACES the configuration-driven starter homepage.
    expect(html).not.toContain("home-hero");
  });

  it("renders the authored About page: one h1 and the Markdown body's own sections", async () => {
    const html = renderToStaticMarkup(
      await PageRoute({ params: Promise.resolve({ segments: [siteCode, localePath, "about"] }) }),
    );

    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(html).toContain(REFERENCE_ABOUT_TITLE);
    // The owner-final open-source statement, exactly as authored.
    expect(html).toContain(
      "Foundation is free and open source: download it, deploy it, modify it and make it your own.",
    );
    expect(html).toContain("https://foundation.provelopment.com/");
    expect(html).toContain(REFERENCE_REPOSITORY_URL);
    // The authored `# Heading` renders RELATIVE to the page title — an h2, never an h1.
    expect(html).toContain('id="a-website-you-control"');
    expect(html).toContain("<h2");
  });
});

describe("the reference origin reaches the technical routes", () => {
  it("publishes every sitemap URL on the reference origin, including the authored About page", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.every((url) => url.startsWith(REFERENCE_ORIGIN))).toBe(true);
    expect(urls).toContain(`${REFERENCE_ORIGIN}/${siteCode}/${localePath}`);
    expect(urls).toContain(`${REFERENCE_ORIGIN}/${siteCode}/${localePath}/about`);
    // The reserved home slug is the locale root — never its own URL.
    expect(urls).not.toContain(`${REFERENCE_ORIGIN}/${siteCode}/${localePath}/home`);
  });

  it("references that sitemap from robots.txt", async () => {
    expect((await robots()).sitemap).toBe(`${REFERENCE_ORIGIN}/sitemap.xml`);
  });
});

describe("the shared sidebar disclosure contract (source-level guard)", () => {
  const css = readFileSync(platformFile("src", "app", "globals.css"), "utf8");

  it("insets the disclosed control's content through a token — padding, never a transform", () => {
    expect(css).toContain("--ui-sidebar-control-inset:");
    // NAV1D — the token's owner is the ONE `.ui-sidebar-toggle` rule (the sidebar-scoped override
    // that re-anchored the box was removed together with its negative margin: it was the cause of
    // the rail's asymmetric padding and of the clipped Show/Hide focus ring, and the token usage
    // moved here so the contract is stated exactly once, for every state). The selector is anchored
    // at a line start, so the collapse-state override can never be mistaken for it.
    const controlRule = /\n\.ui-sidebar-toggle \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(controlRule).toContain("padding-inline: var(--ui-sidebar-control-inset);");
    expect(css).not.toMatch(/\n\.ui-shell-sidebar \.ui-sidebar-toggle \{/);
    expect(css).not.toMatch(/\.ui-sidebar-toggle\s*\{[^}]*transform:/);
  });

  it("makes the collapsed control transparent WITHOUT shrinking its hit target", () => {
    const collapsed =
      /\.ui-sidebar-rail\[data-collapsed="true"\] \.ui-sidebar-toggle \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(collapsed).toContain("background-color: transparent;");
    expect(collapsed).toContain("border-color: transparent;");
    // The box — and therefore the target — is deliberately unchanged.
    expect(collapsed).toContain("width: 100%;");
    // The collapsed affordance is kept explicitly, so transparency cannot silence it.
    expect(css).toMatch(
      /\.ui-sidebar-rail\[data-collapsed="true"\] \.ui-sidebar-toggle:hover \{[\s\S]*?background-color: var\(--muted\);/,
    );
  });
});
