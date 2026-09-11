import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `ShellMobileNav`
 * (client) uses useState/useEffect, which have no context under
 * `renderToStaticMarkup`; per D1 we add no browser/testing dependency, so this
 * suite provides minimal STATELESS hook stubs (evaluating lazy initializers)
 * so markup captures the deterministic INITIAL state. The behavioral matrix
 * (keyboard/focus/Escape/scroll/reduced-motion) is the mandatory UI-10 gate.
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

import { ShellEngine, ShellMobileNav } from "@/components/shell";
import { resolveUiConfig } from "@/core/ui";

const el = (
  type: "header" | "footer" | "p" | "nav",
  props: Record<string, unknown> | null,
  ...children: ReactNode[]
) => createElement(type, props, ...children);

const header = el("header", null, "Brand");
const footer = el("footer", null, "Foot");
const main = el("p", null, "Body");

/** JSX-free single nav-item node. */
const items = createElement(
  "ul",
  null,
  createElement("li", null, createElement("a", { href: "/en" }, "Home")),
);

describe("ShellEngine (server) — frame & decision-driven composition", () => {
  const base = { locale: "en", pageBindings: [] };
  it("renders the AppShell frame with the deterministic main id and content slots", () => {
    const resolved = resolveUiConfig({});
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved,
        header,
        main,
        footer,
        mainId: "main",
        mainClassName: "flex-1",
        ...base,
      }),
    );
    expect(html).toContain("<header>Brand</header>");
    expect(html).toContain('<main id="main" class="flex-1"><p>Body</p></main>');
    expect(html).toContain("<footer>Foot</footer>");
  });

  it("applies the flex-column wrapper with opt-in density + content-width classes", () => {
    const resolved = resolveUiConfig({ density: "compact", content: { width: "wide" } });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ...base }),
    );
    expect(html).toContain("flex flex-col flex-1 ui-density-compact max-w-screen-2xl");
  });

  it("emits NO density/content class for the defaults (default demo leaves emit nothing)", () => {
    const resolved = resolveUiConfig({ navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" } });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ...base }),
    );
    expect(html).toContain('class="flex flex-col flex-1"');
  });

  it("renders NO CTA by default (cta.enabled=false — Foundation never invents one)", () => {
    const resolved = resolveUiConfig({});
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
  });

  it("renders the CTA in the header slot when resolved.cta.enabled AND label+href are supplied", () => {
    const resolved = resolveUiConfig({
      navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
      cta: { enabled: true, action: "book", label: "Book", style: "standard" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book", ...base }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/book");
  });

  it("keeps the footer/content ordering stable (header, main, footer)", () => {
    const resolved = resolveUiConfig({});
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ...base }),
    );
    expect(html.indexOf("<header>"))
      .toBeLessThan(html.indexOf('<main id="main"'));
    expect(html.indexOf('<main id="main"'))
      .toBeLessThan(html.indexOf("<footer>"));
  });
});

describe("P0-1 — the Sidebar capability is composition-driven (custom configs, no preset branches)", () => {
  it("a non-preset custom composition (Header+Sidebar+Nav+CTA) gets the SAME collapsible sidebar contract", () => {
    const custom = resolveUiConfig({
      navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "drawer" },
      shell: { sidebar: { collapsible: true } },
      cta: { enabled: true, action: "book", label: "Book", style: "standard" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: custom,
        header,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: items,
        ctaLabel: "Book",
        ctaHref: "/book",
        locale: "en",
        pageBindings: [],
      }),
    );
    // Aside composition → the header breaks to its own full-width row (P0-1
    // layout fix), not inline beside the rail.
    expect(html).toContain("md:w-full");
    // Collapsible desktop band exposes the structural toggle.
    expect(html).toContain('aria-controls="shell-sidebar-desktop-panel"');
    expect(html).toContain('aria-expanded="true"');
    // Tablet `collapsed-sidebar` renders collapsed-by-default + expandable
    // (never a dead-end).
    // P6-3A — the tablet `collapsed-sidebar` band is a PERSISTENT rail
    // (collapsed by default via `data-collapsed`), never a display:none panel.
    expect(html).toContain('id="shell-sidebar-tablet-panel" class="ui-sidebar-rail-panel"');
    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('aria-expanded="false"');
    // P6-3C — the CTA is NOT composed inside the sidebar: it renders once in
    // the shell's TOP region, ABOVE the aside rail, so no rail state can
    // contain, clip, or obscure it.
    expect(html).toContain("nav-item-cta");
    expect(html.indexOf("nav-item-cta")).toBeLessThan(html.indexOf("shell-sidebar-desktop-rail"));
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
  });
});

describe("P6-3C — ONE authoritative top-region CTA (never per-viewport placement)", () => {
  const completeCta = { enabled: true, action: "book", label: "Book", style: "standard" } as const;

  it("an ASIDE composition (sidebar/floating) keeps the CTA in the top region — never inside the rail", () => {
    const resolved = resolveUiConfig({
      navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "drawer" },
      cta: { ...completeCta },
    });
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved,
        header,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: items,
        ctaLabel: "Book",
        ctaHref: "/book",
        locale: "en",
        pageBindings: [],
      }),
    );
    expect(html).toContain("ui-shell-header-row");
    const ctaAt = html.indexOf("nav-item-cta");
    // Below the header / above the rail — structurally OUTSIDE the aside.
    expect(ctaAt).toBeGreaterThan(html.indexOf("<header>"));
    expect(ctaAt).toBeLessThan(html.indexOf("shell-sidebar-desktop-rail"));
    expect(ctaAt).toBeLessThan(html.indexOf("ui-sidebar-rail-panel"));
    // Exactly ONE action, and never hidden behind a responsive utility (the one
    // instance is reachable at every width — no duplicate desktop+mobile pair).
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
    expect(html).not.toContain('class="hidden md:block"');
  });

  it("a BOTTOM-BAR composition keeps the CTA in the top region — never in the bar", () => {
    const resolved = resolveUiConfig({
      navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "bottom-bar" },
      cta: { ...completeCta },
    });
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved,
        header,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: items,
        bottomNav: { label: "Primary", moreLabel: "More", links: [{ href: "/1", label: "One" }] },
        ctaLabel: "Book",
        ctaHref: "/book",
        locale: "en",
        pageBindings: [],
      }),
    );
    expect(html).toContain("ui-shell-bottom-bar");
    const ctaAt = html.indexOf("nav-item-cta");
    expect(ctaAt).toBeGreaterThan(html.indexOf("<header>"));
    expect(ctaAt).toBeLessThan(html.indexOf("ui-shell-bottom-bar"));
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
  });

  it("a DRAWER composition keeps the CTA in the top region — never in the disclosure", () => {
    const resolved = resolveUiConfig({
      navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "drawer" },
      cta: { ...completeCta },
    });
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved,
        header,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: items,
        ctaLabel: "Book",
        ctaHref: "/book",
        locale: "en",
        pageBindings: [],
      }),
    );
    expect(html.indexOf("nav-item-cta")).toBeGreaterThan(html.indexOf("<header>"));
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
    // A closed disclosure renders no dialog at all — nothing is composed into it.
    expect(html).not.toContain('role="dialog"');
  });

  it("composes NO CTA at all when cta.enabled is false (never invented)", () => {
    const resolved = resolveUiConfig({
      navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "bottom-bar" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved,
        header,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: items,
        ctaLabel: "Book",
        ctaHref: "/book",
        locale: "en",
        pageBindings: [],
      }),
    );
    expect(html).not.toContain("ui-shell-cta");
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/book");
  });
});

describe("ShellMobileNav (client) — deterministic SSR states + dialog semantics", () => {
  it("renders the trigger (below the breakpoint) + a CLOSED drawer (nothing else rendered)", () => {
    const html = renderToStaticMarkup(
      ShellMobileNav({ pattern: "drawer", triggerLabel: "Menu", id: "m", children: items }),
    );
    expect(html).toContain("md:hidden");
    expect(html).toContain('aria-expanded="false"');
    // B1: the trigger owns the deterministic id; aria-controls targets the
    // `${id}-panel` id that exists only once the dialog is open.
    expect(html).toContain('id="m"');
    expect(html).toContain('aria-controls="m-panel"');
    expect(html).not.toContain('id="m-panel"');
    // Closed drawer renders no dialog markup:
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("/en");
  });

  it("composes the overlay primitive for the overlay pattern (closed by default)", () => {
    const html = renderToStaticMarkup(
      ShellMobileNav({ pattern: "overlay", triggerLabel: "Menu", id: "o", children: items }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"'); // closed SSR — deterministic
  });
});