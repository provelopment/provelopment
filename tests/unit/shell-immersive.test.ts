import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `Sidebar` /
 * `ShellMobileNav` and the client switchers call hooks with no context under
 * `renderToStaticMarkup`; per the established D1 pattern we add no browser/testing
 * dependency, so this suite provides minimal STATELESS hook stubs. `mockForcedOpen`
 * toggles the deterministic mobile-overlay/drawer disclosure so BOTH invariants are
 * provable under static rendering: CLOSED SSR (no dialog, no CTA, nothing focusable)
 * and the OPEN composition (the CTA is a child of the dialog). The behavioral matrix
 * (keyboard/focus/Escape/backdrop/reduced-motion) is the mandatory UI-10 browser
 * gate — it is NOT duplicated here.
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
// hooks so the REAL content-layer wiring (the mobile CTA consumer) is testable
// under static rendering.
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
 * UI-09 — Immersive preset through the Shell Engine + content layer.
 *
 * These server-render tests prove the Immersive SHELL is a declarative
 * composition (the fourth architectural proof after Classic UI-06, Focus UI-07,
 * Workspace UI-08), with ONE minimal vocabulary-driven content-layer consumer fix
 * that makes the already-declared mobile overlay CTA observable:
 *  - the decision core maps Immersive to aside trajectories (desktop `floating`
 *    and tablet `floating` both live in the ASIDE slot) plus the mobile `overlay`;
 *  - desktop/tablet `floating` resolves through the EXISTING aside composition —
 *    two mutually-exclusive responsive `Sidebar` bands with distinct ids (same
 *    machinery as Adaptive/Workspace). This proves what the architecture ACTUALLY
 *    guarantees; it does NOT assert any invented distinct floating treatment;
 *  - mobile `overlay` resolves through the existing `ShellMobileNav
 *    pattern="overlay"` → `OverlayNavigation` (a Drawer composition), closed by
 *    default at SSR (no dialog/CTA/focusable);
 *  - standard CTA: renders in the aside ≥md and inside the overlay <md when
 *    enabled + label + href (aside via UI-05; overlay via the UI-09 consumer fix);
 *    disabled/no-href/no-label → no CTA; no invented destination;
 *  - drawer behavior is unchanged (the consumer still serves `drawer`);
 *  - CTA does not leak into the desktop/header path; deterministic IDs/ARIA; no
 *    duplicate landmarks/IDs; no bottom bar; i18n inertness.
 *
 * These tests assert PRESENT STRUCTURE only — they do NOT invent `floating` or
 * `minimal` visual contracts, both of which remain deferred (see
 * todo-milestone-ui-09.md §5).
 */

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const headerPlain = el("header", null, "Brand");
const footer = el("footer", null, "Foot");
const main = el("p", null, "Body");

const base = { locale: "en", pageBindings: [] };

const allIds = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

const rail = el("ul", null, el("li", null, el("a", { href: "/en/1" }, "One")));
const immersive = resolveUiConfig({ preset: "immersive" });
const immersiveWithCta = resolveUiConfig({
  preset: "immersive",
  cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
});

describe("ShellEngine — Immersive desktop/tablet floating (existing aside composition)", () => {
  it("renders a standard header, the floating→aside trajectory, and NO bottom bar", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: immersive,
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
    // Floating resolves through the EXISTING aside → two responsive Sidebar bands:
    expect(html).toContain('id="shell-sidebar-desktop-rail"');
    expect(html).toContain('id="shell-sidebar-tablet-rail"');
    expect(html).toContain('class="hidden lg:block"');
    expect(html).toContain('class="hidden md:block lg:hidden"');
    // No bottom-bar composition:
    expect(html).not.toContain("shell-bottom-bar");
    expect(html).not.toContain("ui-shell-bottom-bar");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the desktop+tablet aside bands are mutually exclusive (+ distinct ids, one landmark per width)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: immersive,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ...base,
      }),
    );
    expect(html.match(/aria-label="Primary"/g) ?? []).toHaveLength(2); // both bands present
    expect(html).toContain("flex flex-col flex-1 lg:flex-row lg:flex-wrap");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders NO aside CTA for preset-only immersive (enabled false)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: immersive,
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
      preset: "immersive",
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

  it("enabled + label + href renders the aside CTA inside the sidebar (standard style, no prominent)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: immersiveWithCta,
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
    expect(html).not.toContain("ui-cta-prominent"); // immersive profile style stays standard
    expect(html.indexOf("nav-item-cta")).toBeGreaterThan(html.indexOf("shell-sidebar-desktop-rail"));
  });

  it("disabled + label + href renders nothing", () => {
    const resolved = resolveUiConfig({
      preset: "immersive",
      cta: { enabled: false, action: "book", label: "Book", href: "/booking" },
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
        ctaLabel: "Book",
        ctaHref: "/booking",
        ...base,
      }),
    );
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });
});

describe("ShellEngine — Immersive decision trajectories (floating aside, overlay, no bottom bar)", () => {
  it("resolveShellPattern(immersive) maps floating/floating to aside, overlay to header+trigger", () => {
    const d = resolveShellPattern(immersive);
    expect(d.desktop.primitiveKind).toBe("floating");
    expect(d.desktop.slot).toBe("aside");
    expect(d.tablet.primitiveKind).toBe("floating");
    expect(d.tablet.slot).toBe("aside");
    expect(d.mobile.primitiveKind).toBe("overlay");
    expect(d.mobile.slot).toBe("header");
    expect(d.mobile.trigger).toBe(true);
  });

  it("immersive + complete CTA: aside/aside/drawer ctaSlots (no bottom)", () => {
    const d = resolveShellPattern(immersiveWithCta);
    expect(d.desktop.ctaSlot).toBe("aside");
    expect(d.tablet.ctaSlot).toBe("aside");
    expect(d.mobile.ctaSlot).toBe("drawer"); // the overlay uses the drawer CTA decision
    expect(d.cta.present).toBe(true);
  });
});

describe("SiteHeader — Immersive mobile overlay + overlay CTA (UI-09 content-layer consumer fix)", () => {
  const resolvedCta = resolveUiConfig({
    preset: "immersive",
    cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
  });

  it("CLOSED SSR: trigger present; NO dialog/CTA/focusable; single nav landmark; no duplicate ids", () => {
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    expect(html).toContain('id="shell-mobile-nav"');
    expect(html).toContain('aria-controls="shell-mobile-nav-panel"');
    expect(html).not.toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("md:hidden");
    // Immersive (aside composition) exposes its single ≥md nav landmark in the
    // shell SIDEBAR (both desktop+tablet slots are aside), not in the header:
    expect(html).not.toContain('aria-label="Primary navigation"');
    // Closed overlay contributes no dialog, no CTA, no links/focusables:
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("OPEN overlay (forced): the overlay CTA appears INSIDE the dialog via the UI-09 consumer (standard style)", () => {
    mockForcedOpen = true;
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    expect(html.match(/role="dialog"/g) ?? []).toHaveLength(1);
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/booking");
    expect(html).not.toContain("ui-cta-prominent"); // immersive profile style stays standard
    // B1: trigger owns the id; panel uses `-panel` id and is named by trigger.
    expect(html).toContain('id="shell-mobile-nav"');
    expect(html).toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-labelledby="shell-mobile-nav"');
    expect(html).toContain("ui-drawer-backdrop");
    expect(html.indexOf("nav-item-cta")).toBeGreaterThan(html.indexOf('id="shell-mobile-nav-panel"'));
  });

  it("OPEN overlay with enabled + label but NO href: still no CTA inside the dialog (never invented)", () => {
    mockForcedOpen = true;
    const resolvedNoHref = resolveUiConfig({
      preset: "immersive",
      cta: { enabled: true, action: "book", label: "Book Now" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedNoHref }));
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
  });

  it("OPEN overlay with disabled CTA: still no CTA inside the dialog", () => {
    mockForcedOpen = true;
    const resolvedDisabled = resolveUiConfig({
      preset: "immersive",
      cta: { enabled: false, action: "book", label: "Book", href: "/booking" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedDisabled }));
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });

  it("the CTA does not leak into the desktop/header path for the overlay composition", () => {
    // Immersive's desktop/tablet slots are aside, so the header renders NO ≥md nav
    // and NO header CTA — the only CTA (when open) lives in the overlay dialog.
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    expect(html).not.toContain("ui-shell-header-row");
    // In the CLOSED header there is no CTA anywhere:
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("ui-shell-cta");
  });
});

describe("SiteHeader — the UI-09 consumer keeps drawer behavior unchanged", () => {
  // A drawer-based preset (workspace) with a complete CTA still composes the CTA
  // inside the DRAWER (unchanged from UI-07/UI-08) — the overlay admission must not
  // regress it. Uses the same forced-open hook.
  it("a drawer-pattern preset still puts the CTA inside the drawer dialog", () => {
    mockForcedOpen = true;
    const resolvedDrawer = resolveUiConfig({
      preset: "workspace",
      cta: { enabled: true, action: "book", label: "Book", href: "/book" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedDrawer }));
    expect(html.match(/role="dialog"/g) ?? []).toHaveLength(1);
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/book");
    // B1: drawer-parity path uses the same corrected panel relationship.
    expect(html).toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-labelledby="shell-mobile-nav"');
    expect(html.indexOf("nav-item-cta")).toBeGreaterThan(html.indexOf('id="shell-mobile-nav-panel"'));
  });
});

describe("SiteHeader — Immersive (overlay, not bottom-bar) never emits the bottom-bar-only i18n value", () => {
  it("moreMenu dictionary value is absent from the Immersive header assembly", () => {
    const dictionary = getDictionary("en");
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: immersive }));
    expect(html).not.toContain(dictionary.navigation.moreMenu);
  });
});

