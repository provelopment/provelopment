import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * FOUNDATION SIDEBAR ASSET CORRECTION — THE CONTROL/DEFAULT ICON NAMESPACE CONTRACT
 * ================================================================================
 *
 * THE DEFECT this suite exists to keep closed: in an EXPLICIT multi-Spoke Installation the shell could
 * render `/assets/sidebar-open.svg`, which belongs to no Spoke's namespace and answered 404. The cause was
 * never the resolver — it was a LOWER RENDERER inventing `/assets/<filename>` from a *shipped default
 * filename* after namespace resolution had already happened (the bottom bar's "More" drawer composed its
 * mobile disclosure without an `open` control, so the shell fell back to the bare filename).
 *
 * The contract these tests pin, exactly as the accepted asset ownership states it:
 *
 *   · the FRAMEWORK LAYER resolves a control/default icon through the runtime namespace that OWNS it
 *     (`resolveIconControlUrl`, the seam named in `src/config/runtime-asset-resolver.ts`);
 *   · a RENDERING PRIMITIVE renders the already-resolved URL VERBATIM and never invents a namespace;
 *   · a control composed WITHOUT a resolved icon renders NO icon at all — never a guessed platform path;
 *   · the historical single-namespace layout keeps `/assets/<name>`, because there the platform namespace
 *     really does own the file.
 *
 * The browser half of this correction (fetching every rendered shell icon in a real two-Spoke Installation)
 * lives in `tests/browser/multihost.scenario.mjs`.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const value = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [value, () => undefined];
    },
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
  };
});

import { ShellMobileNav } from "@/components/shell";
import { ShellEngine } from "@/components/shell";
import { assetIconSrc } from "@/components/ui/asset-icon";
import { siteConfig } from "@/config";
import type { RuntimeAssetNamespace } from "@/config/deployment-root";
import { createRuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import { siteSetOf } from "@/core/site";
import { resolveUiConfig } from "@/core/ui";

vi.mock("next/navigation", () => ({ usePathname: () => "/ww/en" }));

/** The platform namespace: the shared library, first in authoritative order (`/assets`). */
const PLATFORM_NAMESPACE: RuntimeAssetNamespace = {
  directory: "/nonexistent/platform",
  urlBase: "/assets",
  inventory: { "icon-home.svg": null, "favicon.svg": null },
};

/** ONE Spoke's own replaceable namespace: it owns the sidebar role artwork, not the shared library. */
const SPOKE_NAMESPACE: RuntimeAssetNamespace = {
  directory: "/nonexistent/spoke",
  urlBase: "/spokes/web1/assets",
  inventory: {
    "sidebar-open.svg": null,
    "sidebar-close.svg": null,
    "sidebar-default-icon-open.svg": null,
    "sidebar-default-icon-closed.svg": null,
  },
};

/** An EXPLICIT multi-Spoke Installation: the platform namespace, then this context's own Spoke namespace. */
const explicitInstallation = createRuntimeAssetOwnershipResolver([PLATFORM_NAMESPACE, SPOKE_NAMESPACE]);

/** The HISTORICAL single-namespace layout: one namespace owns everything and really is served at `/assets`. */
const legacyInstallation = createRuntimeAssetOwnershipResolver([
  { ...SPOKE_NAMESPACE, urlBase: "/assets" },
]);

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

/** The shared control, rendered with whatever control object the caller composes. */
const mobileNavHtml = (control: { open?: { icon?: string; text?: string } }): string =>
  renderToStaticMarkup(
    ShellMobileNav({
      pattern: "drawer",
      triggerLabel: "Show navigation",
      id: "shell-mobile-nav",
      className: "md:hidden",
      closeLabel: "Hide navigation",
      open: control.open,
      children: el("nav", null, "Nav content"),
    }),
  );

describe("the shipped sidebar control roles resolve through the namespace that owns them", () => {
  it("answers the shipped defaults from the Spoke's own namespace in an explicit Installation", () => {
    expect(explicitInstallation.resolveIconControlUrl(undefined, "sidebar-open.svg")).toBe(
      "/spokes/web1/assets/sidebar-open.svg",
    );
    expect(explicitInstallation.resolveIconControlUrl(undefined, "sidebar-close.svg")).toBe(
      "/spokes/web1/assets/sidebar-close.svg",
    );
  });

  it("answers a PLATFORM-owned icon from the platform namespace, keeping the configured pathname", () => {
    expect(explicitInstallation.resolveIconControlUrl(undefined, "icon-home.svg")).toBe("/assets/icon-home.svg");
    expect(explicitInstallation.availableIconUrl("icon-home.svg")).toBe("/assets/icon-home.svg");
  });

  it("keeps the historical single-namespace layout working at /assets", () => {
    expect(legacyInstallation.resolveIconControlUrl(undefined, "sidebar-open.svg")).toBe(
      "/assets/sidebar-open.svg",
    );
  });

  it("honours a deliberate omission and a configured filename", () => {
    expect(explicitInstallation.resolveIconControlUrl("", "sidebar-open.svg")).toBe("");
    expect(explicitInstallation.resolveIconControlUrl("sidebar-close.svg", "sidebar-open.svg")).toBe(
      "/spokes/web1/assets/sidebar-close.svg",
    );
  });
});

describe("the shell renders a RESOLVED control and never invents a namespace", () => {
  it("renders the resolved default a framework layer hands it, verbatim", () => {
    const html = mobileNavHtml({
      open: { icon: explicitInstallation.resolveIconControlUrl(undefined, "sidebar-open.svg") },
    });
    expect(html).toContain("Show navigation");
    expect(html).toMatch(/<img[^>]*class="[^"]*ui-mobile-nav-icon/);
    expect(html).toContain('src="/spokes/web1/assets/sidebar-open.svg"');
    expect(html).not.toContain('src="/assets/sidebar-open.svg"');
  });

  it("renders NO icon when no resolved icon is supplied — never a guessed platform path", () => {
    // The bottom bar's "More" drawer composed its disclosure without an `open` control; the shell then
    // guessed `/assets/sidebar-open.svg`, a 404 in an explicit Installation. The contract: a primitive
    // renders what the framework resolved, or nothing at all.
    const html = mobileNavHtml({});
    expect(html).toContain("Show navigation");
    expect(html).not.toMatch(/<img[^>]*ui-mobile-nav-icon/);
    expect(html).not.toContain("/assets/sidebar-open.svg");
  });

  it("still renders the right presentation for an omission or an icon-only control", () => {
    const omitted = mobileNavHtml({ open: { icon: "" } });
    expect(omitted).toContain("Show navigation");
    expect(omitted).not.toMatch(/<img[^>]*ui-mobile-nav-icon/);
    const iconOnly = mobileNavHtml({ open: { icon: "/spokes/web1/assets/sidebar-open.svg", text: "" } });
    expect(iconOnly).toContain('src="/spokes/web1/assets/sidebar-open.svg"');
    expect(iconOnly).toContain('aria-label="Show navigation"');
  });
});

describe("the rendering projection's documented contract", () => {
  it("passes an already-resolved same-origin path through, and keeps the historical bare-filename form", () => {
    // The bare-filename branch is the LEGACY compatibility path (a single-namespace layout served at
    // `/assets`), used by config-driven icons; the product's own shell compositions never rely on it.
    expect(assetIconSrc("/spokes/web1/assets/sidebar-open.svg")).toBe("/spokes/web1/assets/sidebar-open.svg");
    expect(assetIconSrc("/assets/icon-home.svg")).toBe("/assets/icon-home.svg");
    expect(assetIconSrc("icon-home.svg")).toBe("/assets/icon-home.svg");
    expect(assetIconSrc("")).toBeUndefined();
    expect(assetIconSrc(undefined)).toBeUndefined();
  });
});

/** The Site set the engine receives as a prop (it imports no configuration of its own). */
const SITE_SET = siteSetOf(siteConfig.sites, siteConfig.defaultSite);

const SEVEN_LINKS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ href: `/${n}`, label: `Item ${n}` }));

/** The engine rendered with the BOTTOM-BAR mobile composition and the composition's resolved controls. */
const bottomBarHtml = (): string =>
  renderToStaticMarkup(
    ShellEngine({
      // `mobile: "bottom-bar"` is the one configuration whose "More" drawer composes a mobile disclosure.
      resolved: resolveUiConfig({ navigation: { mobile: "bottom-bar" } }),
      header: el("header", null, "Brand"),
      main: el("p", null, "Body"),
      footer: el("footer", null, "Foot"),
      mainId: "main",
      navigationLabel: "Primary navigation",
      locale: "en",
      pageBindings: [],
      siteSet: SITE_SET,
      // The framework layer resolved BOTH controls through the namespace that owns them, exactly as the
      // server composition does — the engine receives them as already-resolved values.
      sidebarOpen: { icon: explicitInstallation.resolveIconControlUrl(undefined, "sidebar-open.svg") },
      sidebarClose: { icon: explicitInstallation.resolveIconControlUrl(undefined, "sidebar-close.svg") },
      bottomNav: {
        label: "Primary navigation",
        moreLabel: "More",
        links: SEVEN_LINKS,
        closeLabel: "Hide navigation",
        mode: "compact",
        sidebarClose: { icon: explicitInstallation.resolveIconControlUrl(undefined, "sidebar-close.svg") },
      },
    }),
  );

describe("the bottom bar's mobile disclosure resolves through namespace ownership too", () => {
  it("composes its More drawer trigger from the RESOLVED open control, never the platform path", () => {
    // The "More" drawer's trigger is a mobile sidebar disclosure like any other. It composed without an
    // `open` control, so the shell invented `/assets/sidebar-open.svg` — a 404 in an explicit Installation.
    const html = bottomBarHtml();
    expect(html).toContain('id="shell-bottom-more"');
    expect(html).toContain('src="/spokes/web1/assets/sidebar-open.svg"');
    expect(html).not.toContain('src="/assets/sidebar-open.svg"');
  });

  it("keeps the More trigger's own label while the drawer's close control keeps its own resolved icon", () => {
    // The trigger carries the drawer's own wording ("More"), NOT the sidebar control's label, and the
    // close control the composition supplies is resolved through the same ownership rule.
    const html = bottomBarHtml();
    expect(html).toContain("<span>More</span>");
    expect(html).not.toContain("Show navigation</span>");
    expect(explicitInstallation.resolveIconControlUrl(undefined, "sidebar-close.svg")).toBe(
      "/spokes/web1/assets/sidebar-close.svg",
    );
  });
});

