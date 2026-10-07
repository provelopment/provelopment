import { describe, expect, it } from "vitest";

import {
  contentWidthClass,
  densityClass,
  resolveShellPattern,
  resolveUiConfig,
  type DesktopNavigationPattern,
  type MobileNavigationPattern,
  type ShellPrimitiveKind,
  type TabletNavigationPattern,
} from "@/core/ui";
import * as shellCore from "@/core/ui/shell";

/**
 * UI-04 — Shell pattern decision core tests (pure, framework-free).
 *
 * Verifies the deterministic mapping of RESOLVED vocabulary values → shell
 * composition decision, for EVERY value in each per-viewport pattern vocab.
 * The core must never behave differently based on presentation identity; only
 * the resolved values drive it.
 */

const defaults = resolveUiConfig({});

describe("resolveShellPattern — canonical Foundation presentation", () => {
  it("yields aside sidebar ≥md and a bottom bar <md, NO CTA", () => {
    const d = resolveShellPattern(defaults);
    expect(d.desktop.primitiveKind).toBe("sidebar");
    expect(d.desktop.slot).toBe("aside");
    expect(d.tablet.primitiveKind).toBe("collapsed-sidebar");
    expect(d.tablet.slot).toBe("aside");
    expect(d.mobile.primitiveKind).toBe("bottom-bar");
    expect(d.mobile.trigger).toBe(false);
    expect(d.cta.present).toBe(false);
  });

  it("models an explicit top-bar override on top of the canonical defaults", () => {
    const topBar = resolveUiConfig({
      navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
    });
    const d = resolveShellPattern(topBar);
    expect(d.desktop.primitiveKind).toBe("top-bar");
    expect(d.desktop.slot).toBe("header");
    expect(d.tablet.primitiveKind).toBe("top-bar");
    expect(d.mobile.primitiveKind).toBe("drawer");
    expect(d.mobile.trigger).toBe(true);
  });
});

describe("resolveShellPattern — full per-viewport vocabulary coverage", () => {
  it("maps every desktop pattern", () => {
    const cases: Array<[DesktopNavigationPattern, ShellPrimitiveKind, "header" | "aside"]> = [
      ["top", "top-bar", "header"],
      ["sidebar", "sidebar", "aside"],
      ["minimal", "minimal", "header"],
      ["floating", "floating", "aside"],
    ];
    for (const [name, kind, slot] of cases) {
      const r = resolveUiConfig({ navigation: { desktop: name } });
      const d = resolveShellPattern(r);
      expect(d.desktop.primitiveKind, `desktop ${name}`).toBe(kind);
      expect(d.desktop.slot, `desktop ${name} slot`).toBe(slot);
    }
  });

  it("maps every tablet pattern", () => {
    const cases: Array<[TabletNavigationPattern, ShellPrimitiveKind]> = [
      ["top-compact", "top-bar"],
      ["collapsed-sidebar", "collapsed-sidebar"],
      ["minimal", "minimal"],
      ["floating", "floating"],
    ];
    for (const [name, kind] of cases) {
      const r = resolveUiConfig({ navigation: { tablet: name } });
      expect(resolveShellPattern(r).tablet.primitiveKind, `tablet ${name}`).toBe(kind);
    }
  });

  it("maps every mobile pattern", () => {
    const cases: Array<[MobileNavigationPattern, ShellPrimitiveKind, boolean]> = [
      ["drawer", "drawer", true],
      ["bottom-bar", "bottom-bar", false],
      ["top", "top", false],
      ["overlay", "overlay", true],
    ];
    for (const [name, kind, trigger] of cases) {
      const r = resolveUiConfig({ navigation: { mobile: name } });
      const d = resolveShellPattern(r);
      expect(d.mobile.primitiveKind, `mobile ${name}`).toBe(kind);
      expect(d.mobile.trigger, `mobile ${name} trigger`).toBe(trigger);
    }
  });
});

describe("resolveShellPattern — decision boundaries", () => {
  it("is a pure function of resolved values, never presentation identity", () => {
    // The SAME resolved value always maps to the SAME decision, however it arose.
    const explicit = resolveUiConfig({ navigation: { desktop: "sidebar" } });
    const canonical = resolveUiConfig({});
    expect(resolveShellPattern(explicit).desktop.primitiveKind).toBe("sidebar");
    expect(resolveShellPattern(canonical).desktop.primitiveKind).toBe("sidebar");
    expect(resolveShellPattern(explicit)).toEqual(resolveShellPattern(canonical));
  });

  it("P6-3C — the CTA slot is the ONE top region for EVERY viewport when resolved.cta.enabled", () => {
    const off = resolveUiConfig({});
    const on = resolveUiConfig({ cta: { enabled: true, action: "book", label: "Book", style: "standard" } });
    const onMobileBottom = resolveUiConfig({
      navigation: { mobile: "bottom-bar" },
      cta: { enabled: true, action: "book", label: "Book", style: "standard" },
    });
    expect(resolveShellPattern(off).cta.present).toBe(false);
    expect(resolveShellPattern(on).cta.present).toBe(true);
    // The navigation composition NEVER moves the CTA: aside (sidebar/floating),
    // drawer and bottom-bar viewports all resolve the SAME top slot — never
    // "aside", "drawer" or "bottom". That is what makes "Book now" live once,
    // outside the sidebar, at every width.
    expect(resolveShellPattern(on).desktop.ctaSlot).toBe("top");
    expect(resolveShellPattern(on).tablet.ctaSlot).toBe("top");
    expect(resolveShellPattern(on).mobile.ctaSlot).toBe("top");
    expect(resolveShellPattern(onMobileBottom).mobile.ctaSlot).toBe("top");
  });

  it("keeps the mobile layer deterministic (bottom-bar has no trigger; drawer/overlay triggers)", () => {
    const d = resolveShellPattern(defaults);
    expect(d.mobile.primitiveKind).toBe("bottom-bar");
    expect(d.mobile.trigger).toBe(false);
    expect(d.mobile.ctaSlot).toBe("none");
  });
});

describe("R1 — the retired 'first four + More' rule is GONE from the decision core", () => {
  /**
   * The owner retired the bottom bar's overflow presentation: every configured destination now renders in
   * the bar and wraps. The platform constant and the split rule were REMOVED rather than left as dead
   * compatibility logic, so the module no longer publishes either — this test fails if a future change
   * reintroduces a "first N + remainder" content rule beside the wrapping bar.
   */
  it("no longer exports the limit or the split rule", () => {
    expect(Object.keys(shellCore)).not.toContain("BOTTOM_NAV_PRIMARY_LIMIT");
    expect(Object.keys(shellCore)).not.toContain("splitBottomNavItems");
    expect(Object.keys(shellCore).sort()).toEqual(
      [
        "SHELL_BANDS",
        "bandClassName",
        "contentWidthClass",
        "densityClass",
        "mobileSurfaceBands",
        "resolveShellPattern",
      ].sort(),
    );
  });
});

describe("densityClass / contentWidthClass", () => {
  it("maps every density and content-width value (defaults emit nothing)", () => {
    expect(densityClass("compact")).toBe("ui-density-compact");
    expect(densityClass("comfortable")).toBe("");
    expect(densityClass("spacious")).toBe("ui-density-spacious");

    expect(contentWidthClass("narrow")).toBe("max-w-screen-md");
    expect(contentWidthClass("standard")).toBe("");
    expect(contentWidthClass("wide")).toBe("max-w-screen-2xl");
    expect(contentWidthClass("full")).toBe("max-w-none");
  });
});