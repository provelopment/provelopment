import { describe, expect, it } from "vitest";

import {
  assertConfiguredIconAssetsExist,
  availableIconName,
  iconAssetAvailable,
  type IconConfigSource,
} from "@/config/assets";

/**
 * P6-1 — the icon-asset availability contract (framework layer):
 *  - a configured icon leaf must be backed by a real `public/assets/` file —
 *    otherwise the configuration FAILS LOUDLY at build time (P5-5A invalid →
 *    loud) instead of rendering a broken-image placeholder;
 *  - `""` / absent leaves are DELIBERATE absence and never fail;
 *  - `availableIconName` (the render boundary projection) returns "" when the
 *    asset is unavailable, so components are never handed a name that could
 *    produce a broken `<img>`.
 */
describe("P6-1 — configured icon assets", () => {
  it("the shipped default sidebar icons are real files under public/assets", () => {
    expect(iconAssetAvailable("sidebar-open.svg")).toBe(true);
    expect(iconAssetAvailable("sidebar-close.svg")).toBe(true);
  });

  it("availableIconName preserves missing/empty verbatim and neutralizes unavailable names (never a broken image)", () => {
    expect(availableIconName("sidebar-open.svg")).toBe("sidebar-open.svg");
    expect(availableIconName("definitely-missing-icon.svg")).toBe("");
    expect(availableIconName("")).toBe("");
    expect(availableIconName(undefined)).toBeUndefined();
  });

  it("a config with ONLY existing/empty/absent icon leaves validates", () => {
    expect(() =>
      assertConfiguredIconAssetsExist(minimalConfigWithIcons({ open: "sidebar-open.svg", close: "sidebar-close.svg" })),
    ).not.toThrow();
    expect(() => assertConfiguredIconAssetsExist(minimalConfigWithIcons({}))).not.toThrow();
    expect(() =>
      assertConfiguredIconAssetsExist(minimalConfigWithIcons({ open: "", close: "sidebar-close.svg", cta: "" })),
    ).not.toThrow();
  });

  it("a configured icon without a backing file FAILS LOUDLY, naming the exact leaf", () => {
    const config = minimalConfigWithIcons({ open: "nope-icon.svg" });
    expect(() => assertConfiguredIconAssetsExist(config)).toThrow(/nope-icon\.svg/);
    expect(() => assertConfiguredIconAssetsExist(config)).toThrow(/ui\.navigation\.sidebar\.open\.icon/);
  });

  it("navigation[] item icons are also validated", () => {
    const config = minimalConfigWithIcons({}, { icon: "missing-item-icon.svg" });
    expect(() => assertConfiguredIconAssetsExist(config)).toThrow(/navigation\[0\]\.icon/);
  });
});

interface IconOverrides {
  readonly open?: string;
  readonly close?: string;
  readonly cta?: string;
}

function minimalConfigWithIcons(
  icons: IconOverrides,
  navItem?: { readonly icon?: string; readonly label?: string; readonly href?: string },
): IconConfigSource {
  return {
    ui: {
      navigation: {
        sidebar: {
          open: { icon: icons.open },
          close: { icon: icons.close },
        },
      },
      cta: { icon: icons.cta },
    },
    navigation: [
      navItem ?? { label: "Home", href: "/" },
    ],
  };
}