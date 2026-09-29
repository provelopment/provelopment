import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
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

/**
 * UI1-A3-A1 — WHAT THE CONTROL DECLARES FOR THE PRE-PAINT SEMANTIC BRIDGE.
 *
 * `aria-expanded` and the accessible name cannot be selected by a stylesheet, so the ONE pre-paint bridge
 * (`@/components/ui/sidebar-contract`) applies the OPEN state's semantics to the control. Where the name is
 * AUTHOR-SUPPLIED (the documented icon-only mode) the bridge has to take it from the markup, and that is what
 * these rows assert: the declaration exists exactly where it is needed, carries exactly the value the runtime
 * would render — including the adopter's own copy — and is ABSENT everywhere else, so an invented name can
 * never override a label that is on screen.
 */
describe("UI1-A3-A1 — the control declares the semantics a static document cannot express", () => {
  const declaredOpenName = /data-ui-sidebar-toggle-name-open="([^"]*)"/;
  /** The disclosure control's own tag, so a name is only ever read from the element that claims it. */
  const buttonTag = (html: string) => /<button[^>]*class="ui-sidebar-toggle"[^>]*>/.exec(html)?.[0] ?? "";

  it("declares the OPEN state's name for an author-supplied-name (icon-only) control", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        open: { icon: "sidebar-open.svg", text: "" },
        close: { icon: "sidebar-close.svg", text: "" },
        children: rail,
      }),
    );
    // The primitive renders the state it was given (an OPEN rail here): its own author-supplied name, plus the
    // declaration the bridge needs to present that same name while the state is still only in the preference.
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Hide navigation"');
    expect(declaredOpenName.exec(html)?.[1]).toBe("Hide navigation");
  });

  it("declares the adopter's own copy, never the platform's default", () => {
    const html = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        showLabel: "Expand the menu",
        hideLabel: "Collapse the menu",
        open: { icon: "sidebar-open.svg", text: "" },
        close: { icon: "sidebar-close.svg", text: "" },
        children: rail,
      }),
    );
    expect(declaredOpenName.exec(html)?.[1]).toBe("Collapse the menu");
  });

  it("declares the fallback label for a state with NO explicit text, and nothing when text is explicit", () => {
    // The original P5-5/P6-1 rule (preserved by UI1-A3) renders `aria-label` for a state without explicit
    // text, so the bridge is told that name — the same value the runtime renders for the same state.
    const fallback = renderToStaticMarkup(
      Sidebar({
        label: "Navigation",
        id: "s",
        collapsible: true,
        open: { icon: "sidebar-open.svg" },
        close: { icon: "sidebar-close.svg" },
        children: rail,
      }),
    );
    expect(declaredOpenName.exec(fallback)?.[1]).toBe("Hide navigation");
    expect(fallback).toContain('aria-label="Hide navigation"');

    // Explicit text in the adopter's configuration: the visible label carries the name (the stylesheet selects
    // it per state), so nothing is declared and no `aria-label` is invented.
    for (const leaves of [
      { open: { icon: "sidebar-open.svg", text: "Open menu" }, close: { icon: "sidebar-close.svg", text: "Close menu" } },
      { open: { icon: "", text: "" }, close: { icon: "", text: "" } },
      { open: { icon: "", text: "Open menu" }, close: { icon: "", text: "Close menu" } },
      { open: { icon: "sidebar-open.svg", text: "" }, close: { icon: "sidebar-close.svg", text: "Close menu" } },
    ]) {
      const html = renderToStaticMarkup(
        Sidebar({ label: "Navigation", id: "s", collapsible: true, ...leaves, children: rail }),
      );
      expect(html, JSON.stringify(leaves)).not.toContain("data-ui-sidebar-toggle-name-open");
      // The rail landmark carries its own name; the CONTROL must not carry a second one.
      expect(buttonTag(html), JSON.stringify(leaves)).not.toContain("aria-label=");
    }
  });
});

/**
 * UI1-A3-A1 — THE COMPONENT AND THE BRIDGE SHARE ONE SET OF HOOK NAMES.
 *
 * The markup the bridge finds controls by, and the attribute it takes the OPEN state's name from, are declared
 * in the ONE authority (`@/components/ui/sidebar-contract`) and consumed by BOTH the component and the script.
 * A literal in the component would be a second authority waiting to drift: the bridge would keep applying a
 * name the control no longer declares, and nothing would fail. This row makes that drift a failing test.
 */
describe("UI1-A3-A1 — one set of hook names, declared once", () => {
  const component = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "components", "ui", "sidebar.tsx"),
    "utf8",
  );

  it("reaches the control hook and the OPEN-name hook through the contract's own names", () => {
    expect(component).toContain("SIDEBAR_TOGGLE_CLASS");
    expect(component).toContain("SIDEBAR_TOGGLE_OPEN_NAME_ATTRIBUTE");
    expect(component).toContain("from \"./sidebar-preference\"");
    // No literal class, and no literal attribute name: either one would silently defeat the bridge.
    expect(component).not.toContain('className="ui-sidebar-toggle"');
    expect(component).not.toContain('"data-ui-sidebar-toggle-name-open"');
  });

  it("suppresses hydration warning on the bridge's OWN element and nowhere else", () => {
    // The tolerance is exactly the one the layout documents for the marker on `<html>`: the DOM carries the
    // value the runtime is about to render for the same preference. It must stay narrow — one element, one
    // attribute-write surface — never a blanket over a subtree.
    expect((component.match(/^ +suppressHydrationWarning$/gm) ?? []).length).toBe(1);
    expect(component).toMatch(/suppressHydrationWarning[\s\S]{0,140}?SIDEBAR_TOGGLE_OPEN_NAME_ATTRIBUTE/);
  });
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