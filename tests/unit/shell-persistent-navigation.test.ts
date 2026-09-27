import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * NOTE: `Sidebar` / `ShellBottomBar` (client) call hooks with no context under
 * `renderToStaticMarkup`; as in the other shell suites, minimal STATELESS stubs
 * capture the deterministic initial state, and `next/navigation` is stubbed so
 * the bottom bar's pathname resolution is deterministic. The behavioral half of
 * this contract (real scrolling) is the browser matrix — the
 * `persistent-navigation` scenario.
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
import { Sidebar } from "@/components/ui/sidebar";
import type { PageRegionBinding } from "@/core/region";
import { resolveUiConfig, type UiConfigInput } from "@/core/ui";

/**
 * PERSISTENT NAVIGATION — THE COMPOSITION CONTRACT (FOUNDATION-N1).
 *
 * The usability contract is "a visitor never has to scroll back to the top of
 * the page to navigate elsewhere". It is implemented as ONE rule with TWO
 * persistent regions, never simultaneously:
 *
 *   - the shell's TOP region (`.ui-shell-top`) persists wherever the HEADER is
 *     the navigation carrier (a header-slot composition, or every width below
 *     `md`), and the primary CTA deliberately stays OUTSIDE it in normal flow;
 *   - the aside rail's content column (`.ui-sidebar-rail-sticky`) persists
 *     wherever a RAIL band is composed beside the content.
 *
 * The engine marks the rail widths on the top region (`--rail-md` / `--rail-lg`)
 * so the two can never overlap and no measured offset is needed. This suite
 * asserts the COMPOSITION (which element is persistent where, that both markers
 * come from the resolved slot vocabulary, and that the CTA is NOT part of it) and
 * the CSS contract implementing it; the browser matrix asserts the rendered
 * behaviour (stickiness, reachability, no overlap, anchor clearance).
 */

const globals = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
const sidebarSource = readFileSync(
  path.resolve(__dirname, "../../src/components/ui/sidebar.tsx"),
  "utf8",
);
const engineSource = readFileSync(
  path.resolve(__dirname, "../../src/components/shell/shell-engine.tsx"),
  "utf8",
);

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const header = el("header", null, "Brand");
const main = el("p", null, "Body");
const footer = el("footer", null, "Foot");
const asideContent = el("ul", null, el("li", null, "Rail"));
const pageBindings: readonly PageRegionBinding[] = [];

const render = (overrides: Record<string, unknown>) =>
  renderToStaticMarkup(
    ShellEngine({
      resolved: resolveUiConfig({}),
      header,
      main,
      footer,
      mainId: "main",
      locale: "en",
      pageBindings,
      ...overrides,
    } as Parameters<typeof ShellEngine>[0]),
  );

/** The class attribute of the shell's top-region container. */
const topRegionClass = (html: string): string =>
  /<div class="(ui-shell-top[^"]*)"/.exec(html)?.[1] ?? "";

/** The declarations of one CSS rule block, or "" when the rule is absent. */
const cssBlock = (source: string, pattern: RegExp): string =>
  new RegExp(pattern.source + "\\s*\\{([^}]*)\\}").exec(source)?.[1] ?? "";

/** A composition that composes NO rail band (header-slot navigation at md+). */
const HEADER_SLOT_UI: UiConfigInput = {
  navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
};

describe("PERSISTENT NAVIGATION — the shell's TOP region", () => {
  it("an ASIDE composition marks BOTH rail bands, so the rail (not the header) persists there", () => {
    const html = render({ resolved: resolveUiConfig({}), asideContent });
    expect(topRegionClass(html)).toBe(
      "ui-shell-top ui-shell-top--rail-md ui-shell-top--rail-lg md:w-full",
    );
    // The header itself is inside the persistent region, and the region is a
    // direct child of the shell frame (a content-sized wrapper would leave
    // `sticky` no room to stay pinned).
    expect(html.indexOf('class="ui-shell-top')).toBeLessThan(html.indexOf("<header>"));
    expect(html).toContain('<div class="flex flex-col flex-1 md:flex-row md:flex-wrap');
  });

  it("a HEADER-SLOT composition marks no rail band — the header is the persistent navigation at every width", () => {
    const html = render({ resolved: resolveUiConfig({ ...HEADER_SLOT_UI }) });
    expect(topRegionClass(html)).toBe("ui-shell-top");
    expect(html).not.toMatch(/ui-shell-top--rail/);
    // No rail is composed, so nothing depends on an aside marker either.
    expect(html).not.toContain("ui-sidebar-rail");
  });

  it("a MIXED composition marks each band separately (the header persists exactly where it carries the navigation)", () => {
    const lgOnly = render({
      resolved: resolveUiConfig({ navigation: { desktop: "sidebar", tablet: "top-compact" } }),
      asideContent,
    });
    expect(topRegionClass(lgOnly)).toBe("ui-shell-top ui-shell-top--rail-lg md:w-full");

    const mdOnly = render({
      resolved: resolveUiConfig({ navigation: { desktop: "top", tablet: "collapsed-sidebar" } }),
      asideContent,
    });
    expect(topRegionClass(mdOnly)).toBe("ui-shell-top ui-shell-top--rail-md md:w-full");
  });

  it("marks NO rail band when no rail is actually composed (the marker follows the composition, not the configuration)", () => {
    // An aside INTENT with no aside content is not a composed rail: the content
    // layer withholds the slot (P5-5 `navigation.sidebar.mode: "closed"`), so no
    // band exists and the header stays the persistent region.
    const noContent = render({ resolved: resolveUiConfig({}) });
    expect(topRegionClass(noContent)).toBe("ui-shell-top");
    expect(noContent).not.toContain("ui-sidebar-rail");
  });

  it("marks the band for EVERY aside-slot composition (the decision core maps `floating` to the aside slot too)", () => {
    // `floating` is composed through the SAME aside rail machinery, so the rail —
    // not the header — is the persistent navigation there as well. The markers
    // follow the resolved SLOT, so no per-composition branch exists.
    const floating = render({
      resolved: resolveUiConfig({ navigation: { desktop: "floating", tablet: "floating" } }),
      asideContent,
    });
    expect(topRegionClass(floating)).toBe(
      "ui-shell-top ui-shell-top--rail-md ui-shell-top--rail-lg md:w-full",
    );
  });

  it("keeps the primary CTA in NORMAL FLOW — persistence is for navigation, never for actions", () => {
    const html = render({
      resolved: resolveUiConfig({
        cta: { enabled: true, action: "book", label: "Book", href: "/book", style: "standard" },
      }),
      asideContent,
      ctaLabel: "Book",
      ctaHref: "/book",
    });
    const regionStart = html.indexOf('class="ui-shell-top');
    const ctaRowAt = html.indexOf('class="ui-shell-header-row');
    const ctaAt = html.indexOf("nav-item-cta");
    expect(regionStart).toBeGreaterThan(-1);
    expect(regionStart).toBeLessThan(ctaRowAt);
    expect(ctaRowAt).toBeLessThan(ctaAt);
    // The persistent class list appears exactly once — on the header region only,
    // so the action row is not part of what persists. The action still renders
    // exactly once, for every viewport (P6-3C unchanged).
    expect(html.match(/ui-shell-top[" ]/g) ?? []).toHaveLength(1);
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
  });

  it("keeps a content-layer disclosure trigger (the mobile 'Show navigation' control) INSIDE the persistent region", () => {
    const html = render({
      resolved: resolveUiConfig({ ...HEADER_SLOT_UI }),
      header: el("header", null, el("button", { id: "shell-mobile-nav" }, "Show navigation")),
    });
    const regionStart = html.indexOf('class="ui-shell-top');
    const triggerAt = html.indexOf('id="shell-mobile-nav"');
    expect(regionStart).toBeGreaterThan(-1);
    expect(triggerAt).toBeGreaterThan(regionStart);
  });
});

describe("PERSISTENT NAVIGATION — the rail's content column", () => {
  it("wraps the control and the panel, changing no id, no order and no landmark", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Show navigation",
        hideLabel: "Hide navigation",
        children: el("ul", null, el("li", null, "Rail")),
      }),
    );
    const railAt = html.indexOf('class="ui-sidebar-rail"');
    const columnAt = html.indexOf('class="ui-sidebar-rail-sticky"');
    const toggleAt = html.indexOf('class="ui-sidebar-toggle"');
    const panelAt = html.indexOf('id="s-panel" class="ui-sidebar-rail-panel"');
    expect(railAt).toBeGreaterThan(-1);
    expect(columnAt).toBeGreaterThan(railAt);
    expect(columnAt).toBeLessThan(toggleAt);
    expect(toggleAt).toBeLessThan(panelAt);
    // One landmark, one panel id, no second navigation region.
    expect(html.match(/<nav /g) ?? []).toHaveLength(1);
    expect(html.match(/id="s-panel"/g) ?? []).toHaveLength(1);
  });

  it("adds exactly ONE plain block wrapper in the component (no class list, no props)", () => {
    expect(sidebarSource).toContain('<div className="ui-sidebar-rail-sticky">');
    // Once in the JSX, once in the primitive's own documentation of the rule.
    expect(sidebarSource.match(/ui-sidebar-rail-sticky/g) ?? []).toHaveLength(2);
  });
});

describe("PERSISTENT NAVIGATION — the CSS contract (globals.css)", () => {
  it("declares every class the shell composes, so engine and stylesheet cannot drift", () => {
    for (const className of [
      "ui-shell-top",
      "ui-shell-top--rail-md",
      "ui-shell-top--rail-lg",
      "ui-sidebar-rail-sticky",
    ]) {
      expect(globals, className).toContain(`.${className}`);
    }
  });

  it("makes the top region sticky with its own surface, IN FLOW (never covering content)", () => {
    const block = cssBlock(globals, /\.ui-shell-top/);
    expect(block).toMatch(/position:\s*sticky/);
    expect(block).toMatch(/top:\s*0/);
    expect(block).toMatch(/z-index:\s*30/);
    // The page's own canvas token, so scrolling content can never show through.
    expect(block).toMatch(/background-color:\s*var\(--background\)/);
    // Sticky, never fixed: a fixed region would need page padding and could
    // cover the footer.
    expect(globals).not.toMatch(/\.ui-shell-top[^{]*\{[^}]*position:\s*fixed/);
  });

  it("returns the top region to normal flow EXACTLY in the bands where a rail is composed", () => {
    // Bounded at md…lg: at lg+ a tablet-rail-only composition keeps the
    // navigation-carrying header persistent.
    const mdBlock = cssBlock(
      globals,
      /@media \(min-width: 48rem\) and \(max-width: 63\.999rem\) \{\s*\.ui-shell-top--rail-md/,
    );
    expect(mdBlock).toMatch(/position:\s*static/);
    expect(mdBlock).toMatch(/z-index:\s*auto/);
    expect(mdBlock).toMatch(/background-color:\s*transparent/);

    const lgBlock = cssBlock(globals, /@media \(min-width: 64rem\) \{\s*\.ui-shell-top--rail-lg/);
    expect(lgBlock).toMatch(/position:\s*static/);
  });

  it("keeps a fragment target clear of the persistent top region, and only where it persists", () => {
    expect(globals).toMatch(/--ui-shell-top-clearance:\s*6rem/);
    expect(globals).toMatch(
      /html:has\(\.ui-shell-top\)\s*\{\s*scroll-padding-top:\s*var\(--ui-shell-top-clearance\)/,
    );
    // In each rail band the clearance is removed: nothing changes where the top
    // region scrolls normally.
    expect(globals).toMatch(/html:has\(\.ui-shell-top--rail-md\)\s*\{\s*scroll-padding-top:\s*0/);
    expect(globals).toMatch(/html:has\(\.ui-shell-top--rail-lg\)\s*\{\s*scroll-padding-top:\s*0/);
  });

  it("makes the rail's content column persistent, viewport-bounded and self-scrolling", () => {
    const block = cssBlock(globals, /\.ui-sidebar-rail-sticky/);
    expect(block).toMatch(/position:\s*sticky/);
    expect(block).toMatch(/top:\s*0/);
    // Bounded by the VIEWPORT, not by the page.
    expect(block).toMatch(/max-height:\s*100dvh/);
    // A navigation taller than the viewport stays reachable...
    expect(block).toMatch(/overflow-y:\s*auto/);
    // ...and its internal scroll never chains to the page.
    expect(block).toMatch(/overscroll-behavior:\s*contain/);
  });

  it("keeps the rail OUT of the scroll-container trap, and keeps its divider contract", () => {
    const railBlock = cssBlock(globals, /\.ui-sidebar-rail/);
    // `overflow-x: hidden` would compute `overflow-y: auto`, making the rail a
    // scroll container — `sticky` inside it would then pin to the RAIL instead of
    // the viewport, and the rail could never persist.
    expect(railBlock).toMatch(/overflow-x:\s*clip/);
    expect(railBlock).not.toMatch(/overflow-x:\s*hidden/);
    // P6-3A/P6-3B geometry is untouched: the rail's own box still fills the shell
    // row, so its divider still spans it.
    expect(railBlock).toMatch(/height:\s*100%/);
    expect(railBlock).toMatch(/border-inline-end:\s*1px solid var\(--border\)/);
    expect(globals).toMatch(/\.ui-shell-sidebar\s*>\s*div\s*\{[^}]*height:\s*100%/);
  });

  it("adds no motion of its own (the existing reduced-motion rule governs)", () => {
    expect(cssBlock(globals, /\.ui-shell-top/)).not.toMatch(/animation|transition/);
    expect(cssBlock(globals, /\.ui-sidebar-rail-sticky/)).not.toMatch(/animation|transition/);
    expect(globals).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe("PERSISTENT NAVIGATION — genericity (no site, host or business concept)", () => {
  it("derives every persistence decision from the resolved slot vocabulary, never from configuration or identity", () => {
    // The two markers are a function of the DECISION's slots only.
    expect(engineSource).toContain('asideActive && decision.tablet.slot === "aside"');
    expect(engineSource).toContain('asideActive && decision.desktop.slot === "aside"');
    // No configuration, no adapter, no hostname/site/tenancy concept.
    for (const forbidden of ["@/config", "@/adapters", "siteId", "tenant", "regional"]) {
      expect(engineSource.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it("keeps every width, breakpoint and colour OUT of the shell (markers here, values once in the stylesheet)", () => {
    // The engine composes class markers; it carries no media query, no pixel or
    // rem value and no colour of its own. The band bounds live once in
    // globals.css, expressed as the composition's own Tailwind breakpoints.
    for (const forbidden of ["@media", "min-width", "max-width", "768", "1024"]) {
      expect(engineSource, forbidden).not.toContain(forbidden);
    }
    // The persistent regions are token-driven: no literal colour is introduced.
    expect(cssBlock(globals, /\.ui-shell-top/)).not.toMatch(/#/);
    expect(cssBlock(globals, /\.ui-sidebar-rail-sticky/)).not.toMatch(/#/);
  });
});
