import { describe, expect, it } from "vitest";

import { navigationItemSchema, uiConfigSchema } from "@/config/schema";

/**
 * P5-5 — schema + validation of the configurable controls & navigation
 * presentation surface.
 *
 * The schema is the FIRST gate of the adopter experience: invalid enums,
 * unsafe asset paths, and unsupported keys must fail fast with actionable
 * messages at build time — never silently at runtime.
 */
const sandbox = (ui: unknown) => uiConfigSchema.safeParse(ui);

describe("P5-5 — ui.navigation.* schema", () => {
  it("accepts the three menu modes on sidebar/top/bottom", () => {
    for (const mode of ["open", "compact", "closed"]) {
      expect(sandbox({ navigation: { sidebar: { mode } } }).success).toBe(true);
      expect(sandbox({ navigation: { top: { mode } } }).success).toBe(true);
      expect(sandbox({ navigation: { bottom: { mode } } }).success).toBe(true);
    }
  });

  it("rejects invalid menu modes", () => {
    for (const bad of ["half-open", "icons", "mini", 1, null]) {
      expect(sandbox({ navigation: { sidebar: { mode: bad } } }).success).toBe(false);
    }
  });

  it("accepts valid icon filenames and explicit empty strings on control leaves", () => {
    expect(sandbox({ navigation: { sidebar: { open: { icon: "my-icon.svg", text: "" } } } }).success).toBe(true);
    expect(sandbox({ navigation: { sidebar: { close: { icon: "" } } } }).success).toBe(true);
    expect(sandbox({ navigation: { sidebar: { open: { icon: "", text: "" } } } }).success).toBe(true);
  });

  it("rejects path/url/unsafe icon references and unknown control keys (strict)", () => {
    expect(sandbox({ navigation: { sidebar: { open: { icon: "../secret.svg" } } } }).success).toBe(false);
    expect(sandbox({ navigation: { sidebar: { open: { icon: "https://x/y.svg" } } } }).success).toBe(false);
    expect(sandbox({ navigation: { sidebar: { open: { buffer: "x" } } } }).success).toBe(false);
  });
});

describe("P5-5 — ui.cta.* schema", () => {
  it("accepts label empty-string, icon asset, iconPosition and state", () => {
    expect(
      sandbox({
        cta: {
          label: "",
          icon: "book.svg",
          iconPosition: "end",
          state: "disabled",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects invalid iconPosition / state values and unsafe icon paths", () => {
    expect(sandbox({ cta: { iconPosition: "before" } }).success).toBe(false);
    expect(sandbox({ cta: { state: "selected" } }).success).toBe(false);
    expect(sandbox({ cta: { icon: "/etc/passwd" } }).success).toBe(false);
  });
});

describe("P5-5 — navigation item icon/region/disabled schema", () => {
  it("accepts an icon + valid region and marks disabled", () => {
    for (const position of ["top", "middle", "bottom"]) {
      expect(
        navigationItemSchema.safeParse({
          label: "Home",
          href: "/",
          icon: "home.svg",
          position,
          disabled: true,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects invalid region values and unsafe icon references on navigation items", () => {
    expect(navigationItemSchema.safeParse({ label: "Home", href: "/", position: "side" }).success).toBe(false);
    expect(navigationItemSchema.safeParse({ label: "Home", href: "/", icon: "a/b.svg" }).success).toBe(false);
    expect(navigationItemSchema.safeParse({ label: "Home", href: "/", icon: "" }).success).toBe(false);
  });
});