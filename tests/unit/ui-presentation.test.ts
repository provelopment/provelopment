import { describe, expect, it } from "vitest";

import { uiConfigSchema } from "@/config/schema";
import {
  PRESENTATION_DEFAULTS,
  PRESENTATION_HEADERS,
  PRESENTATION_HEROES,
  PRESENTATION_RHYTHMS,
  PRESENTATION_SURFACES,
  PRESENTATION_TYPOGRAPHIES,
  presentationDataAttributes,
  radiusDataAttribute,
  resolveUiConfig,
  uiPresetProfiles,
  UI_PRESETS,
} from "@/core/ui";

/**
 * P5-3 — Preset differentiation (generalized presentation intent).
 *
 * Contract:
 *  1. Each preset OWNs a coherent presentation intent (typography, rhythm,
 *     surface, header, hero) PLUS default density/content-width/radius — this
 *     is the VOLUNTARY visual differentiation, expressed through generalized
 *     vocabulary (never preset-name switches).
 *  2. The five presets NEVER collapse to identical presentation — the guard
 *     that a reviewer could tell them apart without the selector.
 *  3. The `ui.presentation` namespace is a generalized, validated config
 *     surface: any vocabulary value is valid, custom (non-preset) config
 *     expresses the same intent, and invalid values are rejected safely.
 *  4. The resolved presentation maps to inert `data-ui-*` renderer attributes
 *     (framework-neutral; the renderer implements them, not the components).
 */
describe("P5-3 — each preset resolves a distinct presentation intent", () => {
  it("every preset resolves its own presentation profile + density/content/radius", () => {
    for (const preset of UI_PRESETS) {
      const resolved = resolveUiConfig({ preset });
      const profile = uiPresetProfiles[preset];
      expect(resolved.presentation).toEqual(profile.presentation);
      expect(resolved.density).toBe(profile.density);
      expect(resolved.content.width).toBe(profile.content.width);
      expect(resolved.theme.radius).toBe(profile.theme.radius);
    }
  });

  it("the five presets do NOT collapse to identical presentation (checkpoint guard)", () => {
    const signatures = UI_PRESETS.map((preset) => {
      const r = resolveUiConfig({ preset });
      return JSON.stringify({ presentation: r.presentation, density: r.density, width: r.content.width, radius: r.theme.radius });
    });
    expect(new Set(signatures).size).toBe(UI_PRESETS.length);
  });

  it("Adaptive is the balanced/general-purpose baseline (matches the Foundation defaults)", () => {
    const resolved = resolveUiConfig({ preset: "adaptive" });
    expect(resolved.presentation).toEqual(PRESENTATION_DEFAULTS);
    expect(resolved.density).toBe("comfortable");
    expect(resolved.content.width).toBe("standard");
    expect(resolved.theme.radius).toBe("medium");
  });

  it("Classic is structured/editorial: editorial type, structured rhythm, paper surfaces, rule header, split hero", () => {
    const resolved = resolveUiConfig({ preset: "classic" });
    expect(resolved.presentation).toEqual({
      typography: "editorial",
      rhythm: "structured",
      surface: "paper",
      header: "rule",
      hero: "split",
    });
  });

  it("Focus is minimal/content-first: minimal type, airy rhythm, minimal surfaces, bare header, center hero, narrow", () => {
    const resolved = resolveUiConfig({ preset: "focus" });
    expect(resolved.presentation.typography).toBe("minimal");
    expect(resolved.presentation.rhythm).toBe("airy");
    expect(resolved.presentation.surface).toBe("minimal");
    expect(resolved.presentation.header).toBe("bare");
    expect(resolved.presentation.hero).toBe("center");
    expect(resolved.content.width).toBe("narrow");
  });

  it("Workspace is dense/utility: utility type, dense rhythm, instrument surfaces, compact header, concise hero, wide", () => {
    const resolved = resolveUiConfig({ preset: "workspace" });
    expect(resolved.presentation.typography).toBe("utility");
    expect(resolved.presentation.rhythm).toBe("dense");
    expect(resolved.presentation.surface).toBe("instrument");
    expect(resolved.presentation.header).toBe("compact");
    expect(resolved.presentation.hero).toBe("concise");
    expect(resolved.density).toBe("compact");
    expect(resolved.content.width).toBe("wide");
  });

  it("Immersive is spacious/visual: expressive type, spacious rhythm, layered surfaces, elevated header, showcase", () => {
    const resolved = resolveUiConfig({ preset: "immersive" });
    expect(resolved.presentation.typography).toBe("expressive");
    expect(resolved.presentation.rhythm).toBe("spacious");
    expect(resolved.presentation.surface).toBe("layered");
    expect(resolved.presentation.header).toBe("elevated");
    expect(resolved.presentation.hero).toBe("showcase");
    expect(resolved.density).toBe("spacious");
    expect(resolved.theme.radius).toBe("large");
  });
});

describe("P5-3 — generalized `ui.presentation` configuration surface", () => {
  it("the schema admits every presentation vocabulary value", () => {
    for (const typography of PRESENTATION_TYPOGRAPHIES) {
      expect(uiConfigSchema.safeParse({ presentation: { typography } }).success).toBe(true);
    }
    for (const rhythm of PRESENTATION_RHYTHMS) {
      expect(uiConfigSchema.safeParse({ presentation: { rhythm } }).success).toBe(true);
    }
    for (const surface of PRESENTATION_SURFACES) {
      expect(uiConfigSchema.safeParse({ presentation: { surface } }).success).toBe(true);
    }
    for (const header of PRESENTATION_HEADERS) {
      expect(uiConfigSchema.safeParse({ presentation: { header } }).success).toBe(true);
    }
    for (const hero of PRESENTATION_HEROES) {
      expect(uiConfigSchema.safeParse({ presentation: { hero } }).success).toBe(true);
    }
  });

  it("invalid presentation values are rejected safely (closed vocabulary)", () => {
    expect(uiConfigSchema.safeParse({ presentation: { typography: "fancy" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { rhythm: "loud" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { surface: "glossy" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { header: "neon" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { hero: "explode" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { trad: "editorial" } }).success).toBe(false);
  });

  it("custom (non-preset) configuration expresses the same generalized presentation", () => {
    const resolved = resolveUiConfig({
      presentation: { typography: "editorial", rhythm: "airy", surface: "paper", header: "rule", hero: "center" },
    });
    expect(resolved.preset).toBe("adaptive"); // personality still Adaptive
    expect(resolved.presentation).toEqual({
      typography: "editorial",
      rhythm: "airy",
      surface: "paper",
      header: "rule",
      hero: "center",
    });
  });

  it("an explicit presentation override wins per-leaf without canceling the preset", () => {
    const resolved = resolveUiConfig({
      preset: "classic",
      presentation: { typography: "utility" },
      density: "compact",
    });
    expect(resolved.preset).toBe("classic"); // personality preserved
    expect(resolved.presentation.typography).toBe("utility"); // override wins
    expect(resolved.presentation.rhythm).toBe("structured"); // profile
    expect(resolved.presentation.surface).toBe("paper"); // profile
    expect(resolved.density).toBe("compact"); // override wins
  });
});

describe("P5-3 — renderer data-attribute mapping (framework-neutral)", () => {
  it("maps a resolved presentation to the generalized data-ui-* attributes", () => {
    const attrs = presentationDataAttributes({
      typography: "editorial",
      rhythm: "structured",
      surface: "paper",
      header: "rule",
      hero: "split",
    });
    expect(attrs).toEqual({
      "data-ui-typography": "editorial",
      "data-ui-rhythm": "structured",
      "data-ui-surface": "paper",
      "data-ui-header": "rule",
      "data-ui-hero": "split",
    });
  });

  it("maps the resolved radius to the data-ui-radius corner language", () => {
    expect(radiusDataAttribute("none")).toEqual({ "data-ui-radius": "none" });
    expect(radiusDataAttribute("large")).toEqual({ "data-ui-radius": "large" });
  });

  it("each preset resolves distinct renderer attributes (no two presets share a mask)", () => {
    const masks = UI_PRESETS.map((preset) => {
      const r = resolveUiConfig({ preset });
      return JSON.stringify({ ...presentationDataAttributes(r.presentation), ...radiusDataAttribute(r.theme.radius) });
    });
    expect(new Set(masks).size).toBe(UI_PRESETS.length);
  });
});
