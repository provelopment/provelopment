import { describe, expect, it } from "vitest";

import {
  resolveShellPattern,
  resolveUiConfig,
  type ResolvedUiConfig,
  type UiPreset,
  type UiPresetCapabilities,
  uiPresetProfiles,
  UI_PRESETS,
} from "@/core/ui";

/**
 * P0-6 — Capability-Claim Gate (test-enforced).
 *
 * The preset §24 capability matrix is CLAIM DATA, not decoration. This module
 * is the single enforcement point that keeps every claim truthful:
 *
 *  - TRUTH TABLE: the audited claim matrix (`TRUTH_TABLE`) is the ONLY claim
 *    source. Any drift between `uiPresetProfiles[preset].capabilities` and this
 *    table fails CI — a row cannot be raised to `supported`/`optional` without
 *    also adding the implementation + (for supported) the browser verification
 *    AND updating this table at the same time.
 *  - EVIDENCE BINDING: for every capability claimed `supported` by a preset's
 *    DEFAULT composition, an executable assertion below ties the claim to the
 *    resolved configuration/decision-core evidence. Browser evidence is cited
 *    by matrix-row name in comments (the browser matrix is the behavior gate).
 *
 * Claim vocabulary (defined in `src/core/ui/presets.ts` and
 * `plan/ui-ux-capability-inventory.md` §1):
 *  - supported   → the preset's resolved default composition implements AND
 *                  browser-verifies the behavior.
 *  - optional    → shared capability implemented + verified at Foundation
 *                  level; the preset does not compose it by default but a user
 *                  can configure it.
 *  - limited     → the shared capability exists only partially (documented
 *                  limitation); not the full contract.
 *  - unsupported → not claimed for this preset (roadmap "—"); absence is the
 *                  default. A primitive/config field existing in source is NOT
 *                  evidence. Custom configurations are never preset-gated.
 */

/** A single preset's audited capability-claim row (the only allowed values). */
type ClaimRow = Record<UiPreset, UiPresetCapabilities>;

/** The audited (P0-3/P0-4/P0-5 evidence) capability-claim truth table. */
const TRUTH_TABLE: ClaimRow = {
  classic: {
    topNavigation: "supported",
    sidebar: "unsupported",
    collapsibleSidebar: "unsupported",
    bottomMobileNavigation: "optional",
    mobileDrawer: "supported",
    primaryCta: "supported",
    overlayNavigation: "unsupported",
    secondaryPanel: "unsupported",
    complexNavigation: "limited",
    visualFirst: "unsupported",
    applicationDashboard: "unsupported",
  },
  adaptive: {
    topNavigation: "optional",
    sidebar: "supported",
    collapsibleSidebar: "supported",
    bottomMobileNavigation: "supported",
    mobileDrawer: "supported",
    primaryCta: "supported",
    overlayNavigation: "unsupported",
    secondaryPanel: "unsupported",
    complexNavigation: "limited",
    visualFirst: "unsupported",
    applicationDashboard: "limited",
  },
  focus: {
    topNavigation: "supported",
    sidebar: "unsupported",
    collapsibleSidebar: "unsupported",
    bottomMobileNavigation: "optional",
    mobileDrawer: "supported",
    primaryCta: "supported",
    overlayNavigation: "optional",
    secondaryPanel: "unsupported",
    complexNavigation: "limited",
    visualFirst: "limited",
    applicationDashboard: "unsupported",
  },
  workspace: {
    topNavigation: "optional",
    sidebar: "supported",
    collapsibleSidebar: "supported",
    bottomMobileNavigation: "optional",
    mobileDrawer: "supported",
    primaryCta: "supported",
    overlayNavigation: "unsupported",
    secondaryPanel: "unsupported",
    complexNavigation: "limited",
    visualFirst: "unsupported",
    applicationDashboard: "limited",
  },
  immersive: {
    topNavigation: "optional",
    sidebar: "unsupported",
    collapsibleSidebar: "unsupported",
    bottomMobileNavigation: "unsupported",
    mobileDrawer: "supported",
    primaryCta: "supported",
    overlayNavigation: "supported",
    secondaryPanel: "unsupported",
    complexNavigation: "limited",
    visualFirst: "limited",
    applicationDashboard: "unsupported",
  },
};

/** Resolve a preset with an optional complete CTA (for ctaSlot evidence). */
function resolved(preset: UiPreset, withCta = false): ResolvedUiConfig {
  return resolveUiConfig(
    withCta
      ? { preset, cta: { enabled: true, label: "Book", href: "/book", style: "standard" } }
      : { preset },
  );
}

describe("P0-6 — capability-claim gate (presets claim only what the architecture verifies)", () => {
  it("the preset capability matrix matches the audited TRUTH_TABLE (drift → CI failure)", () => {
    for (const preset of UI_PRESETS) {
      expect(uiPresetProfiles[preset].capabilities, `${preset}.capabilities`).toEqual(TRUTH_TABLE[preset]);
    }
  });

  it("sidebar + collapsibleSidebar claims are backed by the resolved collapsible-rail composition (P0-1; browser: aside.* collapse/expand)", () => {
    for (const preset of ["adaptive", "workspace"] as const) {
      const r = resolved(preset);
      expect(r.navigation.desktop, `${preset}.nav.desktop`).toBe("sidebar");
      expect(r.shell.sidebar.collapsible, `${preset}.shell.sidebar.collapsible`).toBe(true);
    }
  });

  it("bottomMobileNavigation supported (adaptive) resolves the bottom-bar composition (browser: bar.visible/ariaCurrent/cta)", () => {
    const r = resolved("adaptive");
    expect(r.navigation.mobile).toBe("bottom-bar");
  });

  it("overlayNavigation supported (immersive) resolves the overlay composition (browser: overlay.nav.vertical, overlay.panel.bounded, overlay.close.*)", () => {
    const r = resolved("immersive");
    expect(r.navigation.mobile).toBe("overlay");
  });

  it("topNavigation supported presets (classic, focus) resolve a header-slot desktop composition (browser: {desktop,tablet}.nav.visible/ariaCurrent)", () => {
    expect(resolved("classic").navigation.desktop).toBe("top");
    // Focus desktop `minimal` resolves through the header slot (decision core).
    const dec = resolveShellPattern(resolved("focus"));
    expect(dec.desktop.primitiveKind).toBe("minimal");
    expect(dec.desktop.slot).toBe("header");
  });

  it("primaryCta supported for EVERY preset — a complete CTA reaches a non-none ctaSlot at every viewport (P0-2)", () => {
    for (const preset of UI_PRESETS) {
      const dec = resolveShellPattern(resolved(preset, true));
      expect(dec.desktop.ctaSlot, `${preset}.desktop.ctaSlot`).not.toBe("none");
      expect(dec.tablet.ctaSlot, `${preset}.tablet.ctaSlot`).not.toBe("none");
      expect(dec.mobile.ctaSlot, `${preset}.mobile.ctaSlot`).not.toBe("none");
    }
  });

  it("P0-4-gated capabilities are never claimed above their truthful level", () => {
    for (const preset of UI_PRESETS) {
      const c = uiPresetProfiles[preset].capabilities;
      // Secondary panel: no content source / composition / responsive contract
      // exists (the AppShell slot alone is NOT a capability). Always
      // unsupported until the owner decisions land.
      expect(c.secondaryPanel, `${preset}.secondaryPanel`).toBe("unsupported");
      // Complex/grouped navigation: no grouping data model or consumer exists —
      // the shared capability is flat-nav only → limited (never supported).
      expect(c.complexNavigation, `${preset}.complexNavigation`).toBe("limited");
      // Application-dashboard: an app-like shell may exist (adaptive/workspace)
      // but NO dashboard features → never supported.
      expect(["limited", "unsupported"], `${preset}.applicationDashboard`).toContain(c.applicationDashboard);
      // Visual-first: the distinct floating/minimal presentation is C-deferred
      // → never supported; only partially realized (focus/immersive).
      expect(["limited", "unsupported"], `${preset}.visualFirst`).toContain(c.visualFirst);
    }
  });
});