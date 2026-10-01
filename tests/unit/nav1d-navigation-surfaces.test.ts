import { siteConfig } from "@/config";
import { siteSetOf } from "@/core/site";

// S1E3A — the shell engine receives config-derived context via props (it imports no config):
const SITE_SET = siteSetOf(siteConfig.sites, siteConfig.defaultSite);

import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * The established static-render idiom for the shell: the engine renders without hooks, but the
 * client controls beside it call hooks with no context under `renderToStaticMarkup`, so this suite
 * stubs them (no browser/testing dependency). The BEHAVIOURAL evidence — measured geometry at every
 * viewport, sticky persistence while scrolling, focus-ring bounds — is the browser matrix's job;
 * this suite pins the composition, ownership and stylesheet contracts those measurements depend on.
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
import {
  MOBILE_NAVIGATION_PATTERNS,
  SHELL_LAYOUT_PATTERNS,
  applyShellLayout,
  mobileDisclosureCompositions,
  railLayouts,
  resolveShellPattern,
  resolveUiConfig,
  shellLayoutCompositions,
} from "@/core/ui";

const globals = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const engineSource = readFileSync(
  path.join(process.cwd(), "src", "components", "shell", "shell-engine.tsx"),
  "utf8",
);
const barSource = readFileSync(
  path.join(process.cwd(), "src", "components", "shell", "shell-bottom-bar.tsx"),
  "utf8",
);

/** The switcher enabled with the documented default; the canonical single composition. */
const enabled = resolveUiConfig({ layoutSwitcher: { enabled: true } });
const canonical = resolveUiConfig({});

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
      sidebarLabels: { show: "Show navigation", hide: "Hide navigation" },
      bottomNav,
      locale: "en",
      pageBindings: [],
      siteSet: SITE_SET,
    }),
  );
}

/** The one rail landmark of a band, as markup — with its band id replaced by a constant. */
function railMarkupOf(html: string, band: "desktop" | "tablet" | "mobile"): string {
  const id = `shell-sidebar-${band}`;
  const start = html.indexOf(`id="${id}-rail"`);
  expect(start, `${id}-rail is composed`).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<nav", start);
  const close = html.indexOf("</nav>", start);
  return html
    .slice(open, close + "</nav>".length)
    .split(id)
    .join("shell-sidebar-BAND");
}

/**
 * FOUNDATION-DEFECT-NAV1D — ONE SIDEBAR AT EVERY VIEWPORT, ONE FULL-WIDTH MENU SURFACE.
 *
 * The owner's model is that a MODE is the visitor's navigation at every width: Sidebar mode
 * presents the SAME persistent sticky sidebar at desktop, tablet and mobile, and Menu Bar mode
 * presents a full-width sticky bottom navigation at every width. The defects this suite pins were
 * both forms of the opposite: below `md` the sidebar was SUBSTITUTED by a `Show navigation`
 * disclosure band, and the bottom bar's surface collapsed to a content-sized block inside the
 * shell's wrapping row.
 *
 * These are the durable contracts: ONE rail composition serving every band, identical rail markup
 * per band, no drawer owned by Sidebar mode, the rail's symmetrical padding and focus-ring room,
 * and a bottom surface that spans the viewport with its content bounded only by the page-edge inset.
 */
describe("NAV1D — one sidebar for every viewport", () => {
  it("declares the mobile leaf as the SAME persistent rail, in the shipped vocabulary", () => {
    // A configuration may state "the sidebar, at every width" directly — the vocabulary value the
    // `sidebar` layout preset names.
    expect(MOBILE_NAVIGATION_PATTERNS).toContain("persistent-sidebar");
    expect(SHELL_LAYOUT_PATTERNS.sidebar.mobile).toBe("persistent-sidebar");
    // …and it resolves to a rail in the ASIDE slot, with no disclosure trigger: the mobile band is
    // served by the same primitive the ≥md bands are, never by a substitute.
    const decision = resolveShellPattern(applyShellLayout(enabled, "sidebar"));
    expect(decision.mobile.slot).toBe("aside");
    expect(decision.mobile.primitiveKind).toBe("sidebar");
    expect(decision.mobile.trigger).toBe(false);
    expect(decision.mobile.presentsNavigation).toBe(true);
  });

  it("serves ONE rail composition to every band — the viewport never selects a different sidebar", () => {
    for (const band of ["mobile", "tablet", "desktop"] as const) {
      expect(railLayouts(enabled, band), band).toEqual(["sidebar"]);
    }
    // The menu-bar composition places no rail in any band, so the switcher's two structures stay
    // disjoint: the sidebar layout owns the rail, the menu-bar layout owns the sticky bar.
    const menuBar = shellLayoutCompositions(enabled).find(
      (composition) => composition.layout === "menu-bar",
    );
    for (const band of ["mobile", "tablet", "desktop"] as const) {
      expect(menuBar?.decision[band].slot, band).toBe("header");
    }
  });

  it("composes the SAME rail markup in all three bands (only the width gate differs)", () => {
    const engine = engineHtml(enabled);
    const desktop = railMarkupOf(engine, "desktop");
    const tablet = railMarkupOf(engine, "tablet");
    const mobile = railMarkupOf(engine, "mobile");
    // Byte-identical apart from the band's own id: same landmark, same control, same state
    // attributes, same navigation — the "same sidebar" claim, measured on the markup.
    expect(tablet).toBe(desktop);
    expect(mobile).toBe(desktop);
    // Each band is presented by its own gate, and the mobile band's is the `<md` one.
    expect(engine).toContain('<div class="hidden lg:block" data-ui-shell-part="rail"');
    expect(engine).toContain('<div class="hidden md:block lg:hidden" data-ui-shell-part="rail"');
    expect(engine).toContain('<div class="md:hidden" data-ui-shell-part="rail"');
  });
});

describe("NAV1D — Sidebar mode owns no drawer, and owns its Show/Hide control", () => {
  it("composes no drawer, overlay or disclosure band for the sidebar mode", () => {
    const engine = engineHtml(enabled);
    // Nothing substituted for the sidebar below `md`: no disclosure band, no trigger, no closed
    // dialog, no scroll-lock/inert residue and no second navigation structure.
    expect(engine).not.toContain("ui-shell-sidebar-disclosure");
    expect(engine).not.toContain("ui-shell-mobile-nav-trigger");
    expect(engine).not.toContain("shell-mobile-nav");
    expect(engine).not.toContain('data-ui-shell-part="mobile-drawer"');
    expect(engine).not.toContain('role="dialog"');
    expect(engine).not.toContain("ui-drawer-backdrop");
    // The sidebar layout composes no mobile surface at all, and the generic disclosure capability
    // is untouched: a site that configures one explicitly still gets it (and the canonical single
    // composition composes none, exactly as before).
    expect(
      mobileDisclosureCompositions(enabled).map((composition) => composition.layout),
    ).not.toContain("sidebar");
    expect(mobileDisclosureCompositions(canonical)).toEqual([]);
  });

  it("keeps Show/Hide navigation inside the rail it belongs to — never in the page header", () => {
    const engine = engineHtml(enabled);
    expect(engine.match(/class="ui-sidebar-rail"/g) ?? []).toHaveLength(3);
    expect(engine.match(/class="ui-sidebar-toggle"/g) ?? []).toHaveLength(3);
    for (const band of ["desktop", "tablet", "mobile"] as const) {
      const markup = railMarkupOf(engine, band);
      expect(markup, band).toContain("ui-sidebar-toggle");
      expect(markup, band).toContain("Show navigation");
      expect(markup, band).toContain("Hide navigation");
    }
    // The header region is composed BEFORE the rail boundary and carries neither the control nor
    // the disclosure vocabulary.
    const headerTop = engine.indexOf("ui-shell-top");
    const firstRail = engine.indexOf('id="shell-sidebar-desktop-rail"');
    expect(headerTop).toBeGreaterThan(-1);
    expect(headerTop).toBeLessThan(firstRail);
  });
});

describe("NAV1D — the sidebar's own geometry is one rule set", () => {
  it("reserves the rail's symmetric padding for its control and its list — no per-band padding", () => {
    // The rail's inline padding is the ONE owned token, on both sides.
    const railRule = /\n\.ui-sidebar-rail \{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(railRule).toContain("padding-inline: var(--ui-sidebar-rail-inline);");
    // The control's box IS the rail's content box: no sidebar-scoped override re-anchors it, the
    // list adds no inset of its own on either side, and no rule reintroduces a two-value padding.
    expect(globals).not.toMatch(/\n\.ui-shell-sidebar \.ui-sidebar-toggle \{/);
    expect(globals).not.toMatch(/\n\.ui-shell-sidebar ul \{/);
    expect(globals).not.toMatch(/padding-inline:\s*[\d.]+(?:rem|px)\s+[\d.]+(?:rem|px)/);
  });

  it("leaves the global focus ring room inside the rail's scrolling column", () => {
    // The column is a clip container on its inline axis (scrolling on one axis clips the other),
    // so it reserves the ring's extent and cancels it with an equal negative margin: the control's
    // geometry is untouched and the `Hide navigation` ring has somewhere to be painted.
    expect(globals).toMatch(/--ui-focus-ring-room:\s*0?\.25rem/);
    const sticky = /\n\.ui-sidebar-rail-sticky \{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(sticky).toContain("padding: var(--ui-focus-ring-room);");
    expect(sticky).toContain("margin: calc(-1 * var(--ui-focus-ring-room));");
    // The ring itself is still the ONE global rule — nothing here removes or shrinks it.
    expect(globals).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/);
    expect(globals).not.toMatch(/outline-none\s*[;{]/);
  });

  it("stops the top region being the persistent navigation where the rail is present", () => {
    // One marker per band in which the composition puts a rail beside the content, including the
    // mobile band — the two persistent regions can never be sticky at the same width.
    expect(engineSource).toContain('"ui-shell-top--rail-mobile"');
    expect(globals).toMatch(/\.ui-shell-top--rail-mobile \{\r?\n\s*position: static;/);
    expect(globals).toMatch(/html:has\(\.ui-shell-top--rail-mobile\) \{\r?\n\s*scroll-padding-top: 0;/);
    // …and the menu-bar layout keeps its own persistence (its bottom bar is the navigation there).
    expect(globals).toMatch(
      /html\[data-ui-shell-layout="menu-bar"\] \.ui-shell-top--rail-mobile \{\r?\n\s*position: sticky;/,
    );
  });

  it("lets the content column and its visitor controls fit the width that is left", () => {
    // NAV1D — an OPEN rail at a phone width leaves the content a few dozen pixels (owner-accepted),
    // so the page must degrade instead of pushing the document sideways: a word that cannot fit
    // breaks (and its min-content sizing follows, which `break-word` alone does not reach), and the
    // header's visitor controls may shrink into the column they are given.
    const contentColumn = /\n\.ui-shell-content-column \{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(contentColumn).toContain("overflow-wrap: anywhere;");
    expect(globals).toMatch(
      /\.ui-site-header-top select\[data-selector\],\r?\n\.ui-site-header-context select\[data-selector\] \{\r?\n\s*min-width: 0;\r?\n\s*max-width: 100%;/,
    );
  });

  it("lays the page out as a wrapping row wherever the rail is beside the content", () => {
    // At every width when the rail covers the mobile band; at `md` and up otherwise. Either way the
    // header, the CTA row and the footer keep their own full-width row basis.
    expect(engineSource).toContain(
      '(railAtMobile ? "flex-row flex-wrap" : "md:flex-row md:flex-wrap")',
    );
    // The full-width regions claim their own line wherever the rail is beside the shrinkable content
    // column, and the content column itself is allowed to use the width that is left.
    expect(engineSource).toContain('railAtMobile ? "w-full basis-full" : "md:w-full"');
    // The content column shares the rail's row with a real flex basis (a wrapping row can never
    // append a zero-basis item to a full line), and shrinks to the width that is left.
    expect(engineSource).toContain('"ui-shell-content-column"');
    expect(globals).toMatch(/\.ui-shell-content-column \{\r?\n\s*flex: 1 1 1px;\r?\n\s*min-width: 0;/);
    expect(engineSource).toContain('railAtMobile ? "ui-shell-sidebar md:shrink-0"');
  });
});

describe("NAV1D — the Menu Bar surface spans the viewport", () => {
  it("gives the sticky bar a full-width surface and a full-width content region", () => {
    const engine = engineHtml(
      resolveUiConfig({ layoutSwitcher: { enabled: true, default: "menu-bar" } }),
    );
    const bar = /<div class="([^"]*ui-shell-bottom-bar[^"]*)"[^>]*>/.exec(engine)?.[1] ?? "";
    expect(bar).toContain("ui-shell-bottom-bar");
    expect(bar).toContain("sticky");
    expect(bar).toContain("w-full");
    expect(bar).toContain("basis-full");
    // Its content is bounded ONLY by the page-edge inset: no page-width container, no centring that
    // would leave the surface reading as an island inside a viewport-wide bar.
    expect(engine).not.toContain("mx-auto max-w-page px-4 py-1");
    const inner = /<div class="(px-4[^"]*)"/.exec(engine)?.[1] ?? "";
    expect(inner).toContain("px-4");
    expect(inner).not.toContain("max-w-page");
    // …and the source states it once, where the bar is composed.
    expect(barSource).toContain("w-full basis-full");
    expect(barSource).not.toContain("mx-auto max-w-page");
  });

  it("leaves the bar's list free to use the available width", () => {
    // The list owns the rows (horizontal flow + natural wrapping); no width bound is imposed on the
    // surface, and no `justify-between` is used to force links apart.
    const barRule = /\n\.ui-shell-bottom-bar \{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(barRule).not.toContain("max-width");
    expect(barSource).not.toContain("justify-between");
    expect(barSource).toContain(
      'BOTTOM_NAV_LIST_CLASS = "flex flex-wrap items-center gap-x-4 gap-y-2"',
    );
  });
});

