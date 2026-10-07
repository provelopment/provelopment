import { siteConfig } from "@/config";
import { siteSetOf } from "@/core/site";

// S1E3A - the shell engine receives config-derived context via props (it imports no config):
const SITE_SET = siteSetOf(siteConfig.sites, siteConfig.defaultSite);

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `Sidebar` /
 * `ShellBottomBar` / `ShellMobileNav` (client) call hooks with no context under
 * `renderToStaticMarkup` — this suite provides minimal STATELESS stubs so the
 * rendered markup captures the deterministic INITIAL state (closed drawers,
 * initial disclosure states, deterministic ids). `next/navigation` is stubbed
 * so `ShellBottomBar`'s pathname-based active/region resolution is
 * deterministic. The behavioral matrix remains the mandatory UI-10 gate.
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
vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));

import { ShellEngine } from "@/components/shell";
import type { PageRegionBinding } from "@/core/region";
import { resolveUiConfig } from "@/core/ui";

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const header = el("header", null, "Brand");
const footer = el("footer", null, "Foot");
const mainText = el("p", null, "Body");

const pageBindings: readonly PageRegionBinding[] = [];
const sevenLinks = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  href: `/${n}`,
  label: `Item ${n}`,
}));

const allIds = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

const adaptive = resolveUiConfig({});
const adaptiveWithCta = resolveUiConfig({
  
  cta: { enabled: true, action: "book", label: "Book", style: "standard" },
});

describe("ShellEngine — Canonical aside composition (UI-05)", () => {
  it("renders TWO deterministic sidebar bands with distinct ids + mutually exclusive responsive classes", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: adaptive,
        header,
        main: mainText,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: el("ul", null, el("li", null, "Rail")),
        locale: "en",
        pageBindings,
        siteSet: SITE_SET,
      }),
    );
    expect(html).toContain('id="shell-sidebar-desktop-rail"');
    expect(html).toContain('id="shell-sidebar-tablet-rail"');
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('class="hidden lg:block"');
    expect(html).toContain('class="hidden md:block lg:hidden"');
    expect(html.match(/aria-label="Primary"/g) ?? []).toHaveLength(2);
    expect(html).toContain("flex flex-col flex-1 md:flex-row md:flex-wrap");
    // P0-1 sidebar capability: BOTH bands are collapsible from the RESOLVED
    // leaf (`shell.sidebar.collapsible`) and expose the structural toggle.
    expect(html).toContain('aria-controls="shell-sidebar-desktop-panel"');
    expect(html).toContain('aria-controls="shell-sidebar-tablet-panel"');
    // UI1 — the CANONICAL no-preference state is CLOSED in every band, so the
    // server markup renders both rails collapsed (a stored preference is adopted
    // on top of it before the first paint, and a navigation can never open one).
    expect(html).not.toContain('aria-expanded="true"');
    // P6-3A — the tablet `collapsed-sidebar` band is a PERSISTENT rail
    // (collapsed by default via `data-collapsed`), never a display:none panel.
    expect(html).toContain('id="shell-sidebar-tablet-panel" class="ui-sidebar-rail-panel"');
    expect(html).toContain('data-collapsed="true"');
  });

  it("inactive bands are display:none wrappers — no focusable content escapes a hidden band", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: adaptive,
        header,
        main: mainText,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: el("ul", null, el("li", null, el("a", { href: "/en/1" }, "One"))),
        locale: "en",
        pageBindings,
        siteSet: SITE_SET,
      }),
    );
    expect(html.indexOf('class="hidden lg:block"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="hidden md:block lg:hidden"')).toBeGreaterThan(-1);
    expect(html.indexOf("/en/1")).toBeGreaterThan(-1);
    expect(html).toContain("hidden lg:block");
    expect(html).toContain("hidden md:block lg:hidden");
  });

  it("P6-3C — renders the CTA in the TOP region: exactly once, below the header and above the rail", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: adaptiveWithCta,
        header,
        main: mainText,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: el("ul", null, el("li", null, "Rail")),
        ctaLabel: "Book",
        ctaHref: "/book",
        locale: "en",
        pageBindings,
        siteSet: SITE_SET,
      }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/book");
    // One action, in the shell's top region: after the header, BEFORE the aside
    // rail — so the sidebar can never contain, clip, or obscure it.
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
    const ctaAt = html.indexOf("nav-item-cta");
    expect(ctaAt).toBeGreaterThan(html.indexOf("<header>"));
    expect(ctaAt).toBeLessThan(html.indexOf("shell-sidebar-desktop-rail"));
  });
});

describe("ShellEngine — Canonical bottom-bar composition (UI-05, R1)", () => {
  it("renders EVERY configured item directly in the bar, in order, and no overflow control", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: adaptive,
        header,
        main: mainText,
        footer,
        mainId: "main",
        bottomNav: { label: "Primary", links: sevenLinks },
        locale: "en",
        pageBindings,
        siteSet: SITE_SET,
      }),
    );
    expect(html).toContain("ui-shell-bottom-bar");
    expect(html).toContain('aria-label="Primary"');
    // R1 — the retired "first four + More" rule: ALL SEVEN destinations render in the bar's own list.
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(html, `item ${n}`).toContain(`/en/${n}"`);
    }
    // No overflow control, no drawer, no dialog, and therefore no More ids at all.
    expect(html).not.toContain("shell-bottom-more");
    expect(html).not.toContain('role="dialog"');
    expect(html.match(/<nav/g) ?? []).toHaveLength(1);
    // The bar's OWN list owns the wrapping (the layout class the component publishes).
    expect(html).toContain("flex flex-wrap");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders no More control for a short navigation either — the bar's content is the list itself", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: adaptive,
        header,
        main: mainText,
        footer,
        mainId: "main",
        bottomNav: { label: "Primary", links: sevenLinks.slice(0, 3) },
        locale: "en",
        pageBindings,
        siteSet: SITE_SET,
      }),
    );
    expect(html).toContain("/en/1");
    expect(html).toContain("/en/3");
    expect(html).not.toContain("shell-bottom-more");
  });

  it("P6-3C — the bottom bar carries NAVIGATION only; the CTA stays in the top region", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: adaptiveWithCta,
        header,
        main: mainText,
        footer,
        mainId: "main",
        bottomNav: { label: "Primary", links: sevenLinks.slice(0, 4) },
        ctaLabel: "Book",
        ctaHref: "/book",
        locale: "en",
        pageBindings,
        siteSet: SITE_SET,
      }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/book");
    expect(html).toContain("ui-shell-bottom-bar");
    // Exactly one action, ABOVE the bar — never duplicated into it.
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
    expect(html.indexOf("nav-item-cta")).toBeLessThan(html.indexOf("ui-shell-bottom-bar"));
  });
});

describe("ShellEngine — content-slot absence keeps the frame stable", () => {
  it("renders no aside/sidebar and no bottom layer when the content layer supplies none", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: adaptive, header, main: mainText, footer, mainId: "main", locale: "en", pageBindings, siteSet: SITE_SET }),
    );
    expect(html).toContain('<main id="main"');
    expect(html).not.toContain("shell-sidebar");
    expect(html).not.toContain("ui-shell-bottom-bar");
  });
});