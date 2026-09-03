import { describe, expect, it } from "vitest";

import {
  DISCLOSURE_CLOSED,
  DISCLOSURE_OPEN,
  createInitialDisclosure,
  disclosureReducer,
} from "@/components/ui";

/**
 * UI-03 — Shared UI interaction state (pure; framework-free by design).
 *
 * The disclosure state machine shared by the interactive primitives (Sidebar,
 * collapsible NavGroup, and composable Drawer triggers). Being pure, it is
 * tested here in the node env; the primitives' SSR/markup behavior is covered
 * by `ui-primitives.test.ts`; the full browser keyboard/focus/Escape matrix
 * is the UI-10 behavioral gate.
 */

describe("disclosureReducer", () => {
  it("is deterministic and idempotent (closed → toggle → open)", () => {
    expect(disclosureReducer(DISCLOSURE_CLOSED, { type: "toggle" })).toBe(DISCLOSURE_OPEN);
    expect(disclosureReducer(DISCLOSURE_OPEN, { type: "toggle" })).toBe(DISCLOSURE_CLOSED);
  });

  it("open/close/escape settle deterministically", () => {
    expect(disclosureReducer(DISCLOSURE_CLOSED, { type: "open" })).toBe(DISCLOSURE_OPEN);
    expect(disclosureReducer(DISCLOSURE_OPEN, { type: "close" })).toBe(DISCLOSURE_CLOSED);
    expect(disclosureReducer(DISCLOSURE_OPEN, { type: "escape" })).toBe(DISCLOSURE_CLOSED);
    expect(disclosureReducer(DISCLOSURE_CLOSED, { type: "escape" })).toBe(DISCLOSURE_CLOSED);
  });

  it("redundant actions leave the state unchanged (no churn)", () => {
    expect(disclosureReducer(DISCLOSURE_OPEN, { type: "open" })).toBe(DISCLOSURE_OPEN);
    expect(disclosureReducer(DISCLOSURE_CLOSED, { type: "close" })).toBe(DISCLOSURE_CLOSED);
  });
});

describe("createInitialDisclosure", () => {
  it("defaults to closed for the deterministic SSR-safe initial state", () => {
    expect(createInitialDisclosure()).toBe(DISCLOSURE_CLOSED);
    expect(createInitialDisclosure(false)).toBe(DISCLOSURE_CLOSED);
    expect(createInitialDisclosure(true)).toBe(DISCLOSURE_OPEN);
  });
});