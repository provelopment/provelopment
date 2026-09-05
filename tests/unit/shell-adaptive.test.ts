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

const adaptive = resolveUiConfig({ preset: "adaptive" });
const adaptiveWithCta = resolveUiConfig({
  preset: "adaptive",
  cta: { enabled: true, action: "book", label: "Book", style: "standard" },
});

describe("ShellEngine — Adaptive aside composition (UI-05)", () => {
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
      }),
    );
    expect(html).toContain('id="shell-sidebar-desktop-rail"');
    expect(html).toContain('id="shell-sidebar-tablet-rail"');
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('class="hidden lg:block"');
    expect(html).toContain('class="hidden md:block lg:hidden"');
    expect(html.match(/aria-label="Primary"/g) ?? []).toHaveLength(2);
    expect(html).toContain("flex flex-col flex-1 lg:flex-row lg:flex-wrap");
    // P0-1 sidebar capability: the desktop band is collapsible from the
    // RESOLVED leaf (`shell.sidebar.collapsible`), and the tablet
    // `collapsed-sidebar` band is collapsed-by-default + always expandable.
    expect(html).toContain('aria-controls="shell-sidebar-desktop-panel"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="shell-sidebar-tablet-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('id="shell-sidebar-tablet-panel" class="hidden"');
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
      }),
    );
    expect(html.indexOf('class="hidden lg:block"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="hidden md:block lg:hidden"')).toBeGreaterThan(-1);
    expect(html.indexOf("/en/1")).toBeGreaterThan(-1);
    expect(html).toContain("hidden lg:block");
    expect(html).toContain("hidden md:block lg:hidden");
  });

  it("composes the CTA inside the ASIDE slot only when enabled + label/href supplied", () => {
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
      }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/book");
    const ctaAt = html.indexOf("nav-item-cta");
    expect(ctaAt).toBeGreaterThan(html.indexOf("shell-sidebar-desktop-rail"));
  });
});

describe("ShellEngine — Adaptive bottom-bar composition (UI-05)", () => {
  it("renders a bottom bar with the first 4 items + a CLOSED More drawer for the remainder", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: adaptive,
        header,
        main: mainText,
        footer,
        mainId: "main",
        bottomNav: { label: "Primary", moreLabel: "More", links: sevenLinks },
        locale: "en",
        pageBindings,
      }),
    );
    expect(html).toContain("ui-shell-bottom-bar");
    expect(html).toContain('aria-label="Primary"');
    expect(html.match(/\/en\/[1-4]"/g) ?? []).toHaveLength(4);
    expect(html.indexOf("/en/5")).toBe(-1);
    expect(html.indexOf("/en/6")).toBe(-1);
    expect(html.indexOf("/en/7")).toBe(-1);
    // B1: the More trigger owns the id; aria-controls resolves to the `-panel` id.
    expect(html).toContain('id="shell-bottom-more"');
    expect(html).toContain('aria-controls="shell-bottom-more-panel"');
    expect(html).not.toContain('id="shell-bottom-more-panel"');
    expect(html).not.toContain('role="dialog"');
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("omits the More drawer entirely when the navigation has ≤ 4 items", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: adaptive,
        header,
        main: mainText,
        footer,
        mainId: "main",
        bottomNav: { label: "Primary", moreLabel: "More", links: sevenLinks.slice(0, 3) },
        locale: "en",
        pageBindings,
      }),
    );
    expect(html).toContain("/en/1");
    expect(html).not.toContain("shell-bottom-more");
  });

  it("places the CTA in the bottom bar only when enabled + label/href supplied", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: adaptiveWithCta,
        header,
        main: mainText,
        footer,
        mainId: "main",
        bottomNav: { label: "Primary", moreLabel: "More", links: sevenLinks.slice(0, 4) },
        ctaLabel: "Book",
        ctaHref: "/book",
        locale: "en",
        pageBindings,
      }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/book");
  });
});

describe("ShellEngine — content-slot absence keeps the frame stable", () => {
  it("renders no aside/sidebar and no bottom layer when the content layer supplies none", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: adaptive, header, main: mainText, footer, mainId: "main", locale: "en", pageBindings }),
    );
    expect(html).toContain('<main id="main"');
    expect(html).not.toContain("shell-sidebar");
    expect(html).not.toContain("ui-shell-bottom-bar");
  });
});