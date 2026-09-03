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

/**
 * UI-04 — Shell pattern decision core tests (pure, framework-free).
 *
 * Verifies the deterministic mapping of RESOLVED vocabulary values → shell
 * composition decision, for EVERY value in each per-viewport pattern vocab.
 * The core must never behave differently based on preset identity; only the
 * resolved values drive it.
 */

const defaults = resolveUiConfig({});

describe("resolveShellPattern — Foundation defaults", () => {
  it("yields classic top-bar ≥md and a closed drawer <md, NO CTA", () => {
    const d = resolveShellPattern(defaults);
    expect(d.desktop.primitiveKind).toBe("top-bar");
    expect(d.desktop.slot).toBe("header");
    expect(d.tablet.primitiveKind).toBe("top-bar");
    expect(d.mobile.primitiveKind).toBe("drawer");
    expect(d.mobile.trigger).toBe(true);
    expect(d.cta.present).toBe(false);
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
  it("is a pure function of resolved values, never preset identity", () => {
    // Same resolved values → same decision, regardless of how they arose
    // (explicit config with no preset vs a preset that yields them).
    const explicit = resolveUiConfig({ navigation: { desktop: "sidebar" } });
    const fromPreset = resolveUiConfig({ preset: "adaptive" });
    // These differ structurally (desktop sidebar match), so assert the mapping
    // for the SAME value is stable:
    expect(resolveShellPattern(explicit).desktop.primitiveKind).toBe("sidebar");
    expect(resolveShellPattern(fromPreset).desktop.primitiveKind).toBe("sidebar");
  });

  it("places CTA only when resolved.cta.enabled", () => {
    const off = resolveUiConfig({});
    const on = resolveUiConfig({ cta: { enabled: true, action: "book", label: "Book", style: "standard" } });
    const onMobileBottom = resolveUiConfig({
      navigation: { mobile: "bottom-bar" },
      cta: { enabled: true, action: "book", label: "Book", style: "standard" },
    });
    expect(resolveShellPattern(off).cta.present).toBe(false);
    expect(resolveShellPattern(on).cta.present).toBe(true);
    expect(resolveShellPattern(onMobileBottom).mobile.ctaSlot).toBe("bottom");
  });

  it("keeps the closed-by-default mobile layer deterministic (drawer trigger=true, nothing else decided)", () => {
    const d = resolveShellPattern(defaults);
    expect(d.mobile.primitiveKind).toBe("drawer");
    expect(d.mobile.ctaSlot).toBe("none");
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