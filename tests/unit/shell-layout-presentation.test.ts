import { siteConfig } from "@/config";
import { siteSetOf } from "@/core/site";

// S1E3A - the shell engine receives config-derived context via props (it imports no config):
const SITE_SET = siteSetOf(siteConfig.sites, siteConfig.defaultSite);

import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * The established static-render idiom for the shell: the engine and the header render
 * without hooks, but the client controls beside them call hooks with no context under
 * `renderToStaticMarkup`, so this suite stubs them (no browser/testing dependency).
 * Behavioural evidence (computed visibility, focus reachability, persistence) is the
 * browser matrix's job; this suite pins the MARKUP CONTRACT and the stylesheet rules it
 * depends on.
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/en",
}));

import { ShellEngine } from "@/components/shell";
import { SiteHeader } from "@/components/site/site-header";
import { resolveUiConfig } from "@/core/ui";

const globals = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** The switcher enabled with the documented default; the canonical single composition. */
const enabled = resolveUiConfig({ layoutSwitcher: { enabled: true } });
const canonical = resolveUiConfig({});
const menuBarDefault = resolveUiConfig({ layoutSwitcher: { enabled: true, default: "menu-bar" } });

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const headerPlain = el("header", null, "Brand");
const main = el("main", null, "Content");
const footer = el("footer", null, "Footer");
const rail = el("ul", null, el("li", null, el("a", { href: "/en/about" }, "About")));
const bottomNav = {
  label: "Primary",
  moreLabel: "More",
  links: [{ label: "Home", href: "/en" }],
};

function engineHtml(resolved: typeof enabled): string {
  return renderToStaticMarkup(
    ShellEngine({
      resolved,
      header: headerPlain,
      main,
      footer,
      mainId: "main",
      navigationLabel: "Primary",
      asideContent: rail,
      bottomNav,
      locale: "en",
      pageBindings: [],
      siteSet: SITE_SET,
    }),
  );
}

function headerHtml(resolved: typeof enabled): string {
  return renderToStaticMarkup(SiteHeader({ locale: "en", resolved }));
}

/**
 * N2 — THE SHELL LAYOUT PRESENTATION, AS MARKUP.
 *
 * The shell composes the structures of BOTH layouts and marks each one with the
 * layouts it serves; the stylesheet exposes exactly one for the active
 * `data-ui-shell-layout` value. These assertions pin that contract, the control, and the
 * byte-identity guarantee for a site that enables nothing.
 */
describe("shell layout presentation — composed markup", () => {
  it("composes BOTH structures when a visitor may choose, each scoped to its layout", () => {
    const engine = engineHtml(enabled);
    // The rail is composed in its two deterministic bands, each declaring that it serves the
    // SIDEBAR layout; the sidebar's own constrained-width disclosure carries the same marker.
    expect(engine.match(/data-ui-shell-part="rail"/g) ?? []).toHaveLength(2);
    expect(engine.match(/data-ui-shell-layouts="sidebar"/g) ?? []).toHaveLength(3);
    expect(engine).toContain("hidden lg:block");
    expect(engine).toContain("hidden md:block lg:hidden");
    expect(engine).toContain("ui-sidebar-rail");
    // NAV1A/NAV1B — the sidebar layout's MOBILE surface is its own off-canvas disclosure, composed
    // at the SIDEBAR BOUNDARY (never in the page header) and `<md`-only, because the rail covers
    // ≥md for this composition.
    expect(engine).toContain('data-ui-shell-part="mobile-drawer"');
    expect(engine).toContain("ui-shell-sidebar-disclosure md:hidden");
    expect(engine).toContain("shell-mobile-nav");
    // NAV1B — the MENU-BAR layout's navigation is the sticky bottom bar at EVERY width (its ≥md top
    // menu is closed): marked with the layout it serves, and carrying NO width gate at all.
    expect(engine.match(/data-ui-shell-part="bottom-bar"/g) ?? []).toHaveLength(1);
    expect(engine).toContain('data-ui-shell-layouts="menu-bar"');
    const barTag = engine.slice(
      engine.indexOf("ui-shell-bottom-bar"),
      engine.indexOf(">", engine.indexOf("ui-shell-bottom-bar")),
    );
    expect(barTag).not.toContain("md:hidden");

    // The HEADER composes no navigation at all for either layout: the ≥md top navigation is closed
    // by the menu-bar layout, and the mobile disclosure is the shell's.
    const header = headerHtml(enabled);
    expect(header).not.toContain('data-ui-shell-part="top-nav"');
    expect(header).not.toContain('data-ui-shell-part="mobile-drawer"');
    expect(header).not.toContain("shell-mobile-nav");
    // What the header DOES own: its two semantic rows and the navigation-MODE control.
    expect(header).toContain("ui-site-header-top");
    expect(header).toContain("ui-site-header-mode");
    expect(header).toContain("data-ui-layout-switcher");
  });

  it("serves each structure to the layout that needs it, whatever the default", () => {
    // With the menu-bar as the configured default the markup is the MIRROR of the sidebar
    // default: the rail (and the sidebar's own disclosure) still serve only the sidebar layout.
    const engine = engineHtml(menuBarDefault);
    expect(engine.match(/data-ui-shell-layouts="sidebar"/g) ?? []).toHaveLength(3);
    expect(engine.match(/data-ui-shell-part="bottom-bar"/g) ?? []).toHaveLength(1);
    expect(engine).toContain('data-ui-shell-layouts="menu-bar"');
    // No ≥md top navigation anywhere — the menu-bar layout's navigation is the bottom bar.
    expect(engine).not.toContain('data-ui-shell-part="top-nav"');
    const header = headerHtml(menuBarDefault);
    expect(header).not.toContain('data-ui-shell-part="top-nav"');
    expect(header).not.toContain('data-ui-shell-part="mobile-drawer"');
    // …and the control starts on the configured default.
    expect(header).toContain('<option value="menu-bar" selected=""');
  });

  it("renders the control only when the switcher is enabled", () => {
    const header = headerHtml(enabled);
    expect(header).toContain("data-ui-layout-switcher");
    expect(header).toContain('aria-label="Layout"');
    expect(header).toContain('data-selector="layout"');
    expect(header).toContain('<option value="sidebar"');
    expect(header).toContain(">Sidebar</option>");
    expect(header).toContain(">Menu bar</option>");
    // NAV1A — the control is available at EVERY width: the width-scoped wrapper that used
    // to hide it below `md` is gone, and the control element itself carries no
    // width-scoping utility.
    expect(header).not.toContain('<div class="hidden md:block"><select');
    const select = header.slice(header.indexOf("<select"), header.indexOf("</select>") + 9);
    expect(select).not.toContain("hidden");
    expect(select).not.toContain("md:");

    // Disabled → no control, and no layout markup anywhere.
    const offHeader = headerHtml(canonical);
    expect(offHeader).not.toContain("data-ui-layout-switcher");
    expect(offHeader).not.toContain("data-ui-shell-part");
    expect(engineHtml(canonical)).not.toContain("data-ui-shell-part");
  });

  it("keeps a site WITHOUT the switcher byte-identical to the single composition", () => {
    const engine = engineHtml(canonical);
    // The band wrappers are exactly the shipped markup: no scope attributes at all.
    expect(engine).toContain('<div class="hidden lg:block">');
    expect(engine).toContain('<div class="hidden md:block lg:hidden">');
    expect(engine).not.toContain("data-ui-shell-layouts");
    expect(engine).not.toContain("data-ui-shell-layout");
    // The canonical sidebar composition composes NO header navigation: one landmark.
    expect(headerHtml(canonical)).not.toContain("<nav");
  });
});

describe("shell layout presentation — the stylesheet contract", () => {
  /** The N2 layer, on its own: the rules that render the choice. */
  const block = globals
    .replace(/\r\n/g, "\n")
    .slice(
      globals.replace(/\r\n/g, "\n").indexOf("N2 — SHELL LAYOUT PRESENTATION"),
      globals.replace(/\r\n/g, "\n").indexOf("P6-3B header logo + page banner"),
    );

  it("removes the INACTIVE structure semantically — one rule per part", () => {
    // `display: none` is the semantic gate: the inactive navigation leaves the
    // accessibility tree AND the focus order, so two navigation systems can never be
    // focusable or announced at once.
    expect(block).toContain('[data-ui-shell-part="rail"] {\n  display: none;');
    expect(block).toContain('[data-ui-shell-part="top-nav"] {\n  display: none;');
    // The active layout selects which of the two rules applies.
    expect(block).toContain('html[data-ui-shell-layout="menu-bar"] [data-ui-shell-part="rail"]');
    expect(block).toContain('html[data-ui-shell-layout="sidebar"] [data-ui-shell-part="top-nav"]');
    // NAV1A — the MOBILE surfaces obey the same rule: a sidebar site is never presented
    // through the menu-bar's bottom bar, and a menu-bar site never through the sidebar's
    // drawer. Exactly one mobile navigation is exposed at <md.
    expect(block).toContain('html[data-ui-shell-layout="sidebar"] [data-ui-shell-part="bottom-bar"]');
    expect(block).toContain('html[data-ui-shell-layout="menu-bar"] [data-ui-shell-part="mobile-drawer"]');
    expect(block).toContain('[data-ui-shell-part="bottom-bar"] {\n  display: none;');
    expect(block).toContain('[data-ui-shell-part="mobile-drawer"] {\n  display: none;');
  });

  it("keeps persistence and fragment clearance correct in the menu-bar layout", () => {
    // Where the ACTIVE layout carries navigation in the header, the top region is the
    // persistent navigation — at the widths where a (now hidden) rail is also composed.
    expect(block).toContain('html[data-ui-shell-layout="menu-bar"] .ui-shell-top--rail-md');
    expect(block).toContain('html[data-ui-shell-layout="menu-bar"] .ui-shell-top--rail-lg');
    expect(block).toContain('html[data-ui-shell-layout="menu-bar"]:has(.ui-shell-top--rail-md)');
    expect(block).toContain('html[data-ui-shell-layout="menu-bar"]:has(.ui-shell-top--rail-lg)');
    expect(block).toContain("scroll-padding-top: var(--ui-shell-top-clearance)");
    expect(block).toContain("position: sticky");
  });

  it("adds no motion of its own, no colour literal and no browser state", () => {
    expect(block).not.toMatch(/transition|animation/);
    expect(block).not.toContain("localStorage");
    // Tokens only, exactly like the persistent-navigation rules beside it.
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The ONE global reduced-motion rule still governs every transition on the site.
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
