import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * Same stateless hook stubs as sidebar.test.tsx — `Sidebar` is a client
 * component using useState; these stubs capture the deterministic INITIAL
 * state for markup assertions. Real geometry/keyboard behavior is verified by
 * the CDP browser matrix.
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

const globals = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const rail = createElement("span", null, "rail");

/**
 * P6-3A — the persistent horizontal sidebar rail (desktop/tablet sidebar
 * compositions). Collapse is a HORIZONTAL WIDTH state (`data-collapsed`), never
 * `display:none`: the rail is always present with a thin border, expands to the
 * intended width showing icons + labels, and contracts to a narrow icon-only
 * rail. Mobile navigation architecture is deliberately unchanged by P6-3A.
 */
describe("P6-3A — persistent horizontal sidebar rail", () => {
  it("collapse is a width state, never display:none — the panel is always rendered", () => {
    const collapsed = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, collapsed: true, children: rail }),
    );
    const expanded = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, children: rail }),
    );
    // Persistent DOM: the panel element is present in BOTH states, never hidden.
    expect(collapsed).toContain('id="s-panel" class="ui-sidebar-rail-panel"');
    expect(expanded).toContain('id="s-panel" class="ui-sidebar-rail-panel"');
    expect(collapsed).not.toContain('class="hidden"');
    expect(expanded).not.toContain('class="hidden"');
    // A stable width-state hook for the CSS + tests.
    expect(collapsed).toContain('data-collapsed="true"');
    expect(expanded).toContain('data-collapsed="false"');
    // The rail is a real `nav` landmark with the persistent-rail class.
    expect(collapsed).toContain('class="ui-sidebar-rail"');
  });

  it("the toggle remains present + semantically correct in both states (never a dead-end)", () => {
    const collapsed = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, collapsed: true, showLabel: "Show Sidebar", hideLabel: "Hide Sidebar", open: { icon: "sidebar-open.svg", text: undefined }, close: { icon: "sidebar-close.svg", text: undefined }, children: rail }),
    );
    const expanded = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, showLabel: "Show Sidebar", hideLabel: "Hide Sidebar", open: { icon: "sidebar-open.svg", text: undefined }, close: { icon: "sidebar-close.svg", text: undefined }, children: rail }),
    );
    expect(collapsed).toContain('type="button"');
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain('aria-controls="s-panel"');
    expect(expanded).toContain('aria-expanded="true"');
    // ONE Show/Hide Sidebar vocabulary (P6-1 preserved).
    expect(collapsed).toContain("Show Sidebar");
    expect(expanded).toContain("Hide Sidebar");
  });
});

describe("P6-3A — rail CSS contract (geometry, border, transition, icon sizing)", () => {
  it("CSS defines explicit expanded + collapsed rail widths, a thin border, and a horizontal width transition", () => {
    expect(globals).toMatch(/--ui-sidebar-rail-expanded:\s*13\.75rem/);
    expect(globals).toMatch(/--ui-sidebar-rail-collapsed:\s*4\.5rem/);
    expect(globals).toMatch(/--ui-sidebar-rail-collapsed-sm:\s*3rem/);
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\s*\\{[^}]*width:\\s*var\\(--ui-sidebar-rail-expanded\\)"));
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\s*\\{[^}]*border-inline-end:\\s*1px solid var\\(--border\\)"));
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\s*\\{[^}]*transition:\\s*width\\s+200ms"));
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\[data-collapsed=\"true\"\\]\\s*\\{[^}]*width:\\s*var\\(--ui-sidebar-rail-collapsed\\)"));
    expect(globals).toMatch(new RegExp("@media \\(max-width: 1023\\.98px\\)\\s*\\{[^}]*width:\\s*var\\(--ui-sidebar-rail-collapsed-sm\\)"));
  });

  it("collapsed rail keeps navigation reachable: labels are hidden only for icon-bearing items", () => {
    expect(globals).toMatch(/\.ui-sidebar-rail\[data-collapsed="true"\]\s*li\.ui-nav-item--has-icon\s*\.ui-nav-item-label/);
    expect(globals).not.toMatch(/\.ui-sidebar-rail\[data-collapsed="true"\]\s*li\s*\.ui-nav-item-label\s*\{/);
  });

  it("responsive sidebar navigation-icon sizing: 32x32 base, 64x64 at >=lg (scoped to the sidebar rail)", () => {
    expect(globals).toMatch(new RegExp("\\.ui-shell-sidebar\\s+\\.ui-nav-item-icon\\s*\\{[^}]*width:\\s*2rem"));
    expect(globals).toMatch(new RegExp("\\.ui-shell-sidebar\\s+\\.ui-nav-item-icon\\s*\\{[^}]*height:\\s*2rem"));
    expect(globals).toMatch(new RegExp("@media \\(min-width: 1024px\\)\\s*\\{[^}]*\\.ui-shell-sidebar\\s+\\.ui-nav-item-icon\\s*\\{[^}]*width:\\s*4rem"));
    expect(globals).toMatch(new RegExp("@media \\(min-width: 1024px\\)\\s*\\{[^}]*\\.ui-shell-sidebar\\s+\\.ui-nav-item-icon\\s*\\{[^}]*height:\\s*4rem"));
  });

  it("mobile navigation architecture is untouched: the rail frame is still >=md only, and the rail owns the width", () => {
    const engine = readFileSync(
      path.join(process.cwd(), "src", "components", "shell", "shell-engine.tsx"),
      "utf8",
    );
    expect(engine).toContain('sidebarClassName="ui-shell-sidebar hidden md:block lg:shrink-0"');
    expect(engine).not.toContain("lg:w-60");
  });
});
