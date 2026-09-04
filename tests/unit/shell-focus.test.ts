import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `ShellMobileNav`
 * (client) uses useState/useEffect, which have no context under
 * `renderToStaticMarkup`; per D1 we add no browser/testing dependency, so this
 * suite provides minimal STATELESS hook stubs. `mockForcedOpen` toggles the
 * deterministic drawer disclosure so BOTH invariants are provable under static
 * rendering: CLOSED SSR (no dialog, no CTA, nothing focusable from the drawer)
 * and the OPEN composition (the drawer CTA is a child of the dialog). The
 * behavioral matrix (keyboard/focus/Escape/scroll/reduced-motion) is the
 * mandatory UI-10 browser gate.
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
 * UI-07 — Focus preset through the Shell Engine + content layer.
 *
 * These server-render tests prove Focus with the SMALLEST declarative
 * extension (D1/D2/D3), with no engine-architecture change:
 *  - the decision core maps Focus to header-slot trajectories
 *    (minimal ≥md, top-compact tablet, closed drawer <md) — no sidebar,
 *    no bottom bar;
 *  - the engine's CTA appears exactly once in the header slot for an
 *    enabled + label + href CTA, with `ui-cta-prominent` ONLY for `style:
 *    "prominent"` (a vocabulary-value branch, never preset identity);
 *  - missing href/label/disabled produces NO CTA anywhere — the Foundation
 *    never invents a destination;
 *  - the latent `ctaSlot: "drawer"` now has its content-layer consumer
 *    (`SiteHeader`), so the Focus mobile CTA is a child of the drawer: closed
 *    SSR contributes nothing focusable; opening the drawer exposes the CTA
 *    inside its existing children;
 *  - the consumer branches purely on decision-core VALUES — the same consumer
 *    serves a Classic config with a complete CTA (not Focus-specific);
 *  - D3: `moreMenu`/`sidebarToggle` values stay absent from the Focus
 *    assembly.
 */

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const headerPlain = el("header", null, "Brand");
const footer = el("footer", null, "Foot");
const main = el("p", null, "Body");

const base = { locale: "en", pageBindings: [] };

const allIds = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

describe("ShellEngine — Focus decision trajectories (no aside, no bottom bar)", () => {
  it("resolveShellPattern(focus) = minimal/header, top-compact/header, drawer/header+trigger", () => {
    const d = resolveShellPattern(resolveUiConfig({ preset: "focus" }));
    expect(d.desktop.primitiveKind).toBe("minimal");
    expect(d.desktop.slot).toBe("header");
    expect(d.desktop.ctaSlot).toBe("none");
    expect(d.tablet.primitiveKind).toBe("top-bar");
    expect(d.tablet.slot).toBe("header");
    expect(d.mobile.primitiveKind).toBe("drawer");
    expect(d.mobile.slot).toBe("header");
    expect(d.mobile.trigger).toBe(true);
    expect(d.mobile.ctaSlot).toBe("none");
    expect(d.cta.present).toBe(false);
  });

  it("focus + complete CTA: header/header/drawer ctaSlots (no aside, no bottom)", () => {
    const d = resolveShellPattern(
      resolveUiConfig({ preset: "focus", cta: { enabled: true, action: "book", label: "Book", href: "/booking", style: "prominent" } }),
    );
    expect(d.desktop.ctaSlot).toBe("header");
    expect(d.tablet.ctaSlot).toBe("header");
    expect(d.mobile.ctaSlot).toBe("drawer");
    expect(d.cta.present).toBe(true);
  });
});

describe("ShellEngine — Focus SSR shell (no sidebar, no bottom bar, neutral CTA)", () => {
  it("renders the plain flex-column wrapper with NO sidebar bands / NO bottom bar", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: resolveUiConfig({ preset: "focus" }), header: headerPlain, main, footer, mainId: "main", ...base }),
    );
    expect(html).toContain('class="flex flex-col flex-1"');
    expect(html).not.toContain("shell-sidebar");
    expect(html).not.toContain("ui-shell-sidebar");
    expect(html).not.toContain("lg:flex-row");
    expect(html).not.toContain("ui-shell-bottom-bar");
    expect(html).toContain('<main id="main">');
  });

  it("renders NO CTA for preset-only focus even when label+href are supplied (enabled false)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: resolveUiConfig({ preset: "focus" }), header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/booking", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });

  it("enabled + label but NO href renders nothing — a destination is never inferred", () => {
    const resolved = resolveUiConfig({ preset: "focus", cta: { enabled: true, action: "book", label: "Book Now" } });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book Now", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
  });
});

describe("ShellEngine — Focus desktop/tablet CTA (header slot, D3 prominent)", () => {
  it("enabled + label + href renders EXACTLY ONE CTA in the header path with the prominent treatment", () => {
    const resolved = resolveUiConfig({
      preset: "focus",
      cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book Now", ctaHref: "/booking", ...base }),
    );
    expect(html).toContain("ui-shell-header-row");
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
    expect(html).toContain("/booking");
    expect(html).toContain("ui-cta-prominent"); // profile style = prominent
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("standard-style override renders the CTA WITHOUT the prominent treatment", () => {
    const resolved = resolveUiConfig({
      preset: "focus",
      cta: { enabled: true, action: "book", label: "Book", href: "/book", style: "standard" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book", ...base }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).not.toContain("ui-cta-prominent");
  });

  it("disabled + label + href renders nothing", () => {
    const resolved = resolveUiConfig({
      preset: "focus",
      cta: { enabled: false, action: "book", label: "Book", href: "/booking" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/booking", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });

  it("enabled + href but MISSING label renders nothing", () => {
    const resolved = resolveUiConfig({
      preset: "focus",
      cta: { enabled: true, action: "book", href: "/booking" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaHref: "/booking", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
  });
});
describe("SiteHeader — Focus mobile drawer CTA (D2 content-layer consumer)", () => {
  const resolvedCta = resolveUiConfig({
    preset: "focus",
    cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
  });

  it("CLOSED SSR: trigger present; NO dialog, NO CTA, nothing focusable; one ≥md nav landmark; no duplicate ids", () => {
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    // Deterministic trigger/control relationship (drawer CLOSED at SSR):
    expect(html).toContain('aria-controls="shell-mobile-nav-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("md:hidden");
    // One ≥md nav landmark (Focus desktop `minimal` renders the full list in
    // the header slot — no invented "minimalization", D4).
    expect(html.match(/aria-label="Primary navigation"/g) ?? []).toHaveLength(1);
    // Closed drawer contributes no dialog, no CTA, no drawer links/focusables:
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("OPEN drawer (forced): the drawer CTA appears INSIDE the dialog as a child of the drawer", () => {
    mockForcedOpen = true;
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    // Exactly ONE dialog (the mobile drawer) and the CTA lives inside it:
    expect(html.match(/role="dialog"/g) ?? []).toHaveLength(1);
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/booking");
    // D3: the Focus profile is prominent — the drawer CTA gets the treatment too.
    expect(html).toContain("ui-cta-prominent");
    expect(html.indexOf('id="shell-mobile-nav"')).toBeGreaterThan(0);
    expect(html.indexOf("nav-item-cta")).toBeGreaterThan(html.indexOf('role="dialog"'));
    expect(html.indexOf("nav-item-cta")).toBeGreaterThan(html.indexOf('id="shell-mobile-nav"'));
  });

  it("OPEN drawer with enabled + label but NO href: still no CTA inside the dialog (never invented)", () => {
    mockForcedOpen = true;
    const resolvedNoHref = resolveUiConfig({
      preset: "focus",
      cta: { enabled: true, action: "book", label: "Book Now" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedNoHref }));
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
  });

  it("the consumer is generic (vocabulary-driven), NOT Focus-specific: a Classic config with a complete CTA consumes the drawer slot too", () => {
    mockForcedOpen = true;
    const resolvedClassic = resolveUiConfig({
      preset: "classic",
      cta: { enabled: true, action: "book", label: "Book", href: "/book", style: "standard" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedClassic }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/book");
    expect(html).not.toContain("ui-cta-prominent"); // classic style = standard
  });
});

describe("SiteHeader — D3 genericity: Focus never emits the adaptive-only i18n values", () => {
  it("moreMenu and sidebarToggle dictionary values are absent from the Focus assembly", () => {
    const dictionary = getDictionary("en");
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolveUiConfig({ preset: "focus" }) }));
    expect(html).not.toContain(dictionary.navigation.moreMenu);
    expect(html).not.toContain(dictionary.navigation.sidebarToggle);
  });
});