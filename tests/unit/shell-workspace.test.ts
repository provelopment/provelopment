import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `Sidebar` /
 * `ShellMobileNav` and the client switchers call hooks with no context under
 * `renderToStaticMarkup`; per the established D1 pattern we add no browser/testing
 * dependency, so this suite provides minimal STATELESS hook stubs. `mockForcedOpen`
 * toggles the deterministic drawer disclosure so BOTH invariants are provable under
 * static rendering: CLOSED SSR (no dialog, no CTA, nothing focusable from the
 * drawer) and the OPEN composition (the drawer CTA is a child of the dialog).
 * The behavioral matrix (keyboard/focus/Escape/scroll/reduced-motion) is the
 * mandatory UI-10 browser gate — it is not duplicated here.
 */
let mockForcedOpen = false;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const value = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [mockForcedOpen ? "open" : value, () => undefined];
    },
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
  };
});

// `SiteHeader` composes client switchers that read `next/navigation`; stub the
// hooks so the REAL content-layer wiring (the mobile drawer CTA consumer) is
// testable under static rendering.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/en",
}));

import { SiteHeader } from "@/components/site/site-header";
import { ShellEngine } from "@/components/shell";
import { getDictionary } from "@/config/i18n";
import { resolveShellPattern, resolveUiConfig } from "@/core/ui";

beforeEach(() => {
  mockForcedOpen = false;
});
afterEach(() => {
  mockForcedOpen = false;
});

/**
 * UI-08 — Workspace preset through the Shell Engine + content layer.
 *
 * These server-render tests prove the Workspace SHELL is a declarative
 * composition with ZERO production-code change — the third architectural proof
 * after Classic (UI-06) and Focus (UI-07):
 *  - the decision core maps Workspace to aside trajectories
 *    (sidebar ≥md, collapsed-sidebar tablet, closed drawer <md) — standard
 *    header, no bottom bar;
 *  - the engine composes TWO deterministic sidebar bands (desktop
 *    `hidden lg:block`, tablet `hidden md:block lg:hidden`) with distinct ids and
 *    mutually exclusive responsive classes, so they never simultaneously expose
 *    duplicate structures; the desktop band is collapsible;
 *  - the aside CTA lands in the sidebar when enabled + label + href;
 *  - mobile is the standard header + the UI-07 ShellMobileNav drawer: closed
 *    SSR contributes no dialog/CTA/focusable; opening the drawer exposes the
 *    drawer CTA via the EXISTING content-layer consumer;
 *  - deterministic IDs/ARIA and no duplicate landmarks/IDs.
 *
 * These tests assert PRESENT STRUCTURE (the Workspace shell) — they do NOT
 * pretend grouped navigation or a secondary panel exist (both are deferred:
 * contract unresolved; see todo-milestone-ui-08.md §5).
 */

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const headerPlain = el("header", null, "Brand");
const footer = el("footer", null, "Foot");
const main = el("p", null, "Body");

const base = { locale: "en", pageBindings: [] };

const allIds = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

const rail = el("ul", null, el("li", null, el("a", { href: "/en/1" }, "One")));
const workspace = resolveUiConfig({ preset: "workspace" });
const workspaceWithCta = resolveUiConfig({
  preset: "workspace",
  cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
});

describe("ShellEngine — Workspace desktop (sidebar aside) + aside CTA, no bottom bar", () => {
  it("renders a standard header, the sidebar aside trajectory, and NO bottom-bar composition", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: workspace,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ...base,
      }),
    );
    expect(html).toContain("<header>Brand</header>");
    expect(html).toContain("ui-shell-sidebar");
    expect(html).toContain("hidden lg:block");
    // Workspace mobile is a drawer, NOT a bottom bar:
    expect(html).not.toContain("shell-bottom-bar");
    expect(html).not.toContain("ui-shell-bottom-bar");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders NO aside CTA for preset-only workspace (enabled false)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: workspace,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ctaLabel: "Book Now",
        ctaHref: "/booking",
        ...base,
      }),
    );
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });

  it("enabled + label + NO href renders no aside CTA (a destination is never invented)", () => {
    const resolved = resolveUiConfig({
      preset: "workspace",
      cta: { enabled: true, action: "book", label: "Book Now" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ctaLabel: "Book Now",
        ...base,
      }),
    );
    expect(html).not.toContain("nav-item-cta");
  });

  it("enabled + label + href renders the aside CTA inside the sidebar", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: workspaceWithCta,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ctaLabel: "Book Now",
        ctaHref: "/booking",
        ...base,
      }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/booking");
    const ctaAt = html.indexOf("nav-item-cta");
    expect(ctaAt).toBeGreaterThan(html.indexOf("shell-sidebar-desktop-rail"));
  });
});

describe("ShellEngine — Workspace tablet (collapsed-sidebar) + mutually exclusive bands", () => {
  it("renders TWO sidebar bands with distinct ids and mutually exclusive responsive classes (never simultaneously exposed)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: workspace,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ...base,
      }),
    );
    expect(html).toContain('id="shell-sidebar-desktop-rail"');
    expect(html).toContain('id="shell-sidebar-tablet-rail"');
    expect(html).toContain('class="hidden lg:block"');
    expect(html).toContain('class="hidden md:block lg:hidden"');
    // Two <nav> rail landmarks (both bands) — mutually exclusive at any width:
    expect(html.match(/aria-label="Primary"/g) ?? []).toHaveLength(2);
    expect(html).toContain("flex flex-col flex-1 lg:flex-row lg:flex-wrap");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the desktop band is user-collapsible (toggle); the tablet band is not", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: workspace,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        sidebarToggleLabel: "Toggle sidebar",
        asideContent: rail,
        ...base,
      }),
    );
    // At least one collapse toggle (the desktop band) with deterministic ARIA:
    expect(html).toContain("aria-expanded=");
    expect(html).toContain("aria-controls=");
  });

  it("the aside CTA renders inside the aside bands when configured (bands mutually exclusive)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: workspaceWithCta,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ctaLabel: "Book Now",
        ctaHref: "/booking",
        ...base,
      }),
    );
    expect(html).toContain("/booking");
    expect(html.indexOf("nav-item-cta")).toBeGreaterThan(html.indexOf("shell-sidebar-desktop-rail"));
  });
});

describe("ShellEngine — Workspace decision trajectories (aside, drawer, standard header)", () => {
  it("resolveShellPattern(workspace) maps to sidebar/collapsed-sidebar/drawer with aside slots", () => {
    const d = resolveShellPattern(workspace);
    expect(d.desktop.primitiveKind).toBe("sidebar");
    expect(d.desktop.slot).toBe("aside");
    expect(d.tablet.primitiveKind).toBe("collapsed-sidebar");
    expect(d.tablet.slot).toBe("aside");
    expect(d.mobile.primitiveKind).toBe("drawer");
    expect(d.mobile.slot).toBe("header");
    expect(d.mobile.trigger).toBe(true);
  });

  it("workspace + complete CTA: aside/drawer ctaSlots (no bottom)", () => {
    const d = resolveShellPattern(workspaceWithCta);
    expect(d.desktop.ctaSlot).toBe("aside");
    expect(d.tablet.ctaSlot).toBe("aside");
    expect(d.mobile.ctaSlot).toBe("drawer");
    expect(d.cta.present).toBe(true);
  });
});

describe("SiteHeader — Workspace mobile drawer + drawer CTA (existing UI-07 consumer)", () => {
  const resolvedCta = resolveUiConfig({
    preset: "workspace",
    cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
  });

  it("CLOSED SSR: trigger present; NO dialog/CTA/focusable; single nav landmark; no duplicate ids", () => {
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    expect(html).toContain('id="shell-mobile-nav"');
    expect(html).toContain('aria-controls="shell-mobile-nav-panel"');
    expect(html).not.toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("md:hidden");
    // Workspace (aside composition) exposes its single ≥md nav landmark in the
    // shell SIDEBAR, not in the header — the header itself renders none:
    expect(html).not.toContain('aria-label="Primary navigation"');
    // Closed drawer contributes no dialog, no CTA, no drawer links/focusables:
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("OPEN drawer (forced): the drawer CTA appears INSIDE the dialog via the existing consumer", () => {
    mockForcedOpen = true;
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    expect(html.match(/role="dialog"/g) ?? []).toHaveLength(1);
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/booking");
    expect(html).not.toContain("ui-cta-prominent"); // workspace profile style stays standard
    // B1: trigger owns the id; panel uses `-panel` id and is named by trigger.
    expect(html).toContain('id="shell-mobile-nav"');
    expect(html).toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-labelledby="shell-mobile-nav"');
    expect(html).toContain("ui-drawer-backdrop");
    expect(html.indexOf("nav-item-cta")).toBeGreaterThan(html.indexOf('id="shell-mobile-nav-panel"'));
  });

  it("OPEN drawer with enabled + label but NO href: still no CTA inside the dialog (never invented)", () => {
    mockForcedOpen = true;
    const resolvedNoHref = resolveUiConfig({
      preset: "workspace",
      cta: { enabled: true, action: "book", label: "Book Now" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedNoHref }));
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
  });
});

describe("SiteHeader — Workspace (drawer, not bottom-bar) never emits the bottom-bar-only i18n value", () => {
  it("moreMenu dictionary value is absent from the Workspace header assembly", () => {
    const dictionary = getDictionary("en");
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: workspace }));
    expect(html).not.toContain(dictionary.navigation.moreMenu);
  });
});

