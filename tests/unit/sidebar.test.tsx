import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * NOTE: `Sidebar` (client) uses useState, which has no context under
 * `renderToStaticMarkup`; per D1 we add no browser/testing dependency, so this
 * suite provides minimal STATELESS hook stubs (evaluating lazy initializers)
 * so markup captures the deterministic INITIAL state. The behavioral matrix
 * (real collapse → expand → focus/keyboard) is the mandatory browser gate
 * (P0-1/P6-1 matrix checks).
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

import { Sidebar } from "@/components/ui/sidebar";

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const rail = el("span", null, "rail");

/**
 * P6-1 — the desktop/tablet sidebar disclosure contract:
 *  - ONE Show/Hide Sidebar vocabulary: the toggle FLIPS with state (closed →
 *    the show control, open → the hide control) — the same two concepts as the
 *    mobile trigger + close control;
 *  - the toggle is a REAL semantic interactive control (button) with the
 *    show/hide ICON from the default asset + the localized label;
 *  - every P5-5A icon/text combination is preserved:
 *      icon+text → both; icon-only → no visible text + aria-label fallback;
 *      text-only → no <img> at all; neither → label fallback (P0-1: a
 *      collapsible rail is NEVER a dead-end — never a broken image, never an
 *      empty box, never an orphan aria-controls).
 */
describe("P6-1 — Sidebar disclosure (desktop/tablet)", () => {
  it("open rail shows the HIDE control (icon + \"Hide Sidebar\" label) with aria-expanded=true", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Show Sidebar",
        hideLabel: "Hide Sidebar",
        open: { icon: "sidebar-open.svg", text: undefined },
        close: { icon: "sidebar-close.svg", text: undefined },
        children: rail,
      }),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="s-panel"');
    // ONE vocabulary: open → "Hide Sidebar"; the shipped close icon is real.
    expect(html).toContain("Hide Sidebar");
    expect(html).not.toContain("Show Sidebar");
    expect(html).toContain("/assets/sidebar-close.svg");
    // A real interactive control, not static text.
    expect(html).toContain('class="ui-sidebar-toggle"');
    expect(html).toContain('type="button"');
  });

  it("collapsed rail shows the SHOW control (icon + \"Show Sidebar\") with aria-expanded=false", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        collapsed: true,
        showLabel: "Show Sidebar",
        hideLabel: "Hide Sidebar",
        open: { icon: "sidebar-open.svg", text: undefined },
        close: { icon: "sidebar-close.svg", text: undefined },
        children: rail,
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Show Sidebar");
    expect(html).not.toContain("Hide Sidebar");
    expect(html).toContain("/assets/sidebar-open.svg");
    // P6-3A — the panel is PERSISTENT (collapse is a width state, not display:none).
    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('id="s-panel" class="ui-sidebar-rail-panel"');
  });

  it("icon-only (text: \"\") renders NO visible text and keeps the accessible name via aria-label", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Show Sidebar",
        hideLabel: "Hide Sidebar",
        open: { icon: "sidebar-open.svg", text: "" },
        close: { icon: "sidebar-close.svg", text: "" },
        children: rail,
      }),
    );
    // Open rail → hide control: icon-only, no visible text, aria-label name.
    expect(html).toContain("/assets/sidebar-close.svg");
    expect(html).toContain('aria-label="Hide Sidebar"');
    expect(html).not.toMatch(/<span>Hide Sidebar<\/span>/);
  });

  it("text-only (icon: \"\") renders NO image element", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Show Sidebar",
        hideLabel: "Hide Sidebar",
        open: { icon: "", text: "Show Sidebar" },
        close: { icon: "", text: "Hide Sidebar" },
        children: rail,
      }),
    );
    expect(html).toContain("Hide Sidebar");
    expect(html).not.toContain("<img");
  });

  it("BOTH leaves empty → the toggle stays reachable with the localized label (P0-1: never a dead-end, never a broken image)", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Show Sidebar",
        hideLabel: "Hide Sidebar",
        open: { icon: "", text: "" },
        close: { icon: "", text: "" },
        children: rail,
      }),
    );
    expect(html).toContain('aria-controls="s-panel"');
    expect(html).toContain("Hide Sidebar");
    expect(html).not.toContain("<img");
    expect(html).toContain('type="button"');
  });

  it("default labels are the canonical English Show/Hide Sidebar when none are supplied", () => {
    const html = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, open: { icon: undefined, text: undefined }, close: { icon: undefined, text: undefined }, children: rail }),
    );
    expect(html).toContain("Hide Sidebar");
    expect(html).toContain("/assets/sidebar-close.svg");
  });
});