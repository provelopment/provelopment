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
 *  - ONE Show/Hide navigation vocabulary: the toggle FLIPS with state (closed →
 *    the show control, open → the hide control) — the same two concepts as the
 *    mobile trigger + close control;
 *  - the toggle is a REAL semantic interactive control (button) with the
 *    show/hide ICON from the default asset + the localized label;
 *  - UI1-A3 — BOTH states are declared in the markup as a STATE PAIR and the
 *    stylesheet presents exactly one, because a statically generated document
 *    cannot know the visitor's browser-local preference: the pair is what lets
 *    the pre-paint bridge show the visitor's OPEN control before React runs.
 *    "One vocabulary" is therefore asserted as PRESENTATION — each variant
 *    carries its semantic hook and the inactive label is `display: none` (never
 *    merely visually hidden), so it cannot join the accessible name.
 *  - every P5-5A icon/text combination is preserved:
 *      icon+text → both; icon-only → no visible text + aria-label fallback;
 *      text-only → no <img> at all; neither → label fallback (P0-1: a
 *      collapsible rail is NEVER a dead-end — never a broken image, never an
 *      empty box, never an orphan aria-controls).
 */
describe("P6-1 — Sidebar disclosure (desktop/tablet)", () => {
  /** The control's declared variants, read from the static markup (the OPEN state's variant first). */
  const toggleContent = (html: string) => {
    const button = /<button[^>]*class="ui-sidebar-toggle"[^>]*>([\s\S]*?)<\/button>/.exec(html);
    const inner = button ? button[1] : "";
    const icons = [...inner.matchAll(/<img[^>]*src="\/assets\/([^"]+)"[^>]*class="([^"]*)"/g)].map((match) => ({
      asset: match[1],
      classes: match[2],
    }));
    const labels = [...inner.matchAll(/<span class="([^"]*)">([^<]*)<\/span>/g)].map((match) => ({
      classes: match[1],
      text: match[2],
    }));
    return { inner, icons, labels };
  };

  it("open rail declares the HIDE control first and the SHOW variant second, with the state hooks", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Show navigation",
        hideLabel: "Hide navigation",
        open: { icon: "sidebar-open.svg", text: undefined },
        close: { icon: "sidebar-close.svg", text: undefined },
        children: rail,
      }),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="s-panel"');
    // The shipped close icon + "Hide navigation" are the OPEN state's variant, declared FIRST — the P6-3B
    // page-icon pair declares `-open` first for the same reason.
    expect(html).toContain("/assets/sidebar-close.svg");
    expect(html).toContain("Hide navigation");
    const { icons, labels } = toggleContent(html);
    expect(icons).toEqual([
      { asset: "sidebar-close.svg", classes: "ui-sidebar-toggle-icon ui-sidebar-toggle-icon-open" },
      { asset: "sidebar-open.svg", classes: "ui-sidebar-toggle-icon ui-sidebar-toggle-icon-closed" },
    ]);
    expect(labels).toEqual([
      { classes: "ui-sidebar-toggle-label ui-sidebar-toggle-label-open", text: "Hide navigation" },
      { classes: "ui-sidebar-toggle-label ui-sidebar-toggle-label-closed", text: "Show navigation" },
    ]);
    // A real interactive control, not static text. The OPEN state's name is "Hide navigation" — the label
    // that is on screen — and the state's own `aria-label` carries the SAME string (never the other
    // state's), so what is announced and what is painted can never disagree.
    expect(html).toContain('class="ui-sidebar-toggle"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Hide navigation"');
    expect(html).not.toContain('aria-label="Show navigation"');
  });

  it("collapsed rail declares the SAME pair (only the state it presents differs)", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        collapsed: true,
        showLabel: "Show navigation",
        hideLabel: "Hide navigation",
        open: { icon: "sidebar-open.svg", text: undefined },
        close: { icon: "sidebar-close.svg", text: undefined },
        children: rail,
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Show navigation");
    // …and the collapsed state announces its OWN name, never the open state's.
    expect(html).toContain('aria-label="Show navigation"');
    expect(html).not.toContain('aria-label="Hide navigation"');
    const { icons, labels } = toggleContent(html);
    // Identical markup in both states — that is exactly what lets the pre-paint bridge present the visitor's
    // own state before React exists: only `data-collapsed` (and the presentation keyed on it) differs.
    expect(icons.map((icon) => icon.asset)).toEqual(["sidebar-close.svg", "sidebar-open.svg"]);
    expect(labels.map((label) => label.text)).toEqual(["Hide navigation", "Show navigation"]);
    // P6-3A — the panel is PERSISTENT (collapse is a width state, not display:none).
    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('id="s-panel" class="ui-sidebar-rail-panel"');
  });

  it("icon-only (text: \"\") declares NO label variant in either state and keeps the name via aria-label", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Show navigation",
        hideLabel: "Hide navigation",
        open: { icon: "sidebar-open.svg", text: "" },
        close: { icon: "sidebar-close.svg", text: "" },
        children: rail,
      }),
    );
    // Open rail → hide control: icon-only, no label at all, aria-label name.
    const { icons, labels } = toggleContent(html);
    expect(icons.map((icon) => icon.asset)).toEqual(["sidebar-close.svg", "sidebar-open.svg"]);
    // `text: ""` is EXPLICIT icon-only (P5-5) in BOTH states: no variant paints a
    // label the adopter deliberately removed, and the accessible name carries
    // the meaning. Conflating `""` with "unset" would paint one.
    expect(labels).toEqual([]);
    expect(html).toContain('aria-label="Hide navigation"');
  });

  it("text-only (icon: \"\") declares NO image element in either variant", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Show navigation",
        hideLabel: "Hide navigation",
        open: { icon: "", text: "Show navigation" },
        close: { icon: "", text: "Hide navigation" },
        children: rail,
      }),
    );
    const { icons, labels } = toggleContent(html);
    expect(icons).toEqual([]);
    expect(labels).toEqual([
      { classes: "ui-sidebar-toggle-label ui-sidebar-toggle-label-open", text: "Hide navigation" },
      { classes: "ui-sidebar-toggle-label ui-sidebar-toggle-label-closed", text: "Show navigation" },
    ]);
  });

  it("BOTH leaves empty → the toggle stays reachable with the localized label (P0-1: never a dead-end, never a broken image)", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Show navigation",
        hideLabel: "Hide navigation",
        open: { icon: "", text: "" },
        close: { icon: "", text: "" },
        children: rail,
      }),
    );
    expect(html).toContain('aria-controls="s-panel"');
    const { icons, labels } = toggleContent(html);
    expect(icons).toEqual([]);
    // P0-1 wins in BOTH states: each variant carries its own localized label, so
    // whichever one the presentation selects, the toggle is named and reachable.
    expect(labels.map((label) => label.text)).toEqual(["Hide navigation", "Show navigation"]);
    expect(html).not.toContain("<img");
    expect(html).toContain('type="button"');
  });

  it("default labels are the canonical English Show/Hide navigation when none are supplied", () => {
    const html = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, open: { icon: undefined, text: undefined }, close: { icon: undefined, text: undefined }, children: rail }),
    );
    expect(html).toContain("Hide navigation");
    // The PRIMITIVE never invents an icon: the shipped default asset is resolved
    // by the COMPOSER (`resolveControlPresentation`, `defaultIcon`), so a
    // primitive rendered with no icon leaf is a text-only control — and must
    // therefore never emit a broken `<img>`.
    expect(html).not.toContain("<img");
    expect(html).toContain('aria-controls="s-panel"');
  });
});