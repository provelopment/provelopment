/**
 * R3 — THE SIDEBAR'S NAVIGATION-SELECTION POLICY, PER VIEWPORT BAND
 * =================================================================
 *
 * The owner's decision: a navigation selection closes an OPEN rail in the MOBILE band and leaves it exactly as
 * the visitor set it in the TABLET and DESKTOP bands, which must nonetheless remain independently expressible
 * (tablet may change alone in a future task).
 *
 * THE MATRIX THIS SUITE PINS, band by band:
 *
 *   | Viewport | Initial | Action      | Expected |
 *   | -------- | ------- | ----------- | -------- |
 *   | Mobile   | Open    | Select link | Closed   |
 *   | Mobile   | Closed  | Select link | Closed   |
 *   | Tablet   | Open    | Select link | Open     |
 *   | Tablet   | Closed  | Select link | Closed   |
 *   | Desktop  | Open    | Select link | Open     |
 *   | Desktop  | Closed  | Select link | Closed   |
 *
 * WHY THE MATRIX IS PROVED AS A PURE RULE HERE AND AS A REAL CLICK IN A BROWSER. This project's test
 * environment has no DOM (no `jsdom`), and the repository deliberately adds no browser-testing dependency to
 * the unit suite, so the DECISION (`railDismissesOnSelection`, and the per-band table the composer publishes)
 * is proved here exhaustively over that matrix and every band, while the WIRING — a real pointer click and a
 * real keyboard activation, at the real breakpoints, with the real preference storage — is proved by the
 * sidebar-state browser scenario. Nothing infers a viewport width in either place: the primitive takes the
 * policy its band's rail was composed with.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SIDEBAR_SELECTION_POLICY_BY_BAND } from "@/components/shell/shell-engine";
import {
  DEFAULT_SIDEBAR_SELECTION_POLICY,
  SIDEBAR_SELECTION_POLICIES,
  railDismissesOnSelection,
  type SidebarSelectionPolicy,
} from "@/components/ui/sidebar";
import { DISCLOSURE_CLOSED, DISCLOSURE_OPEN } from "@/components/ui/state";
import { SHELL_BANDS, type ShellBand } from "@/core/ui";

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");

/**
 * The source with its COMMENTS removed, so a doc comment that NAMES a forbidden API — which is how this module
 * documents what it refuses to do — is never mistaken for a use of it.
 */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** The owner's decision, as data — the SAME six rows in one comparable shape. */
const EXPECTED_AFTER_SELECTION: Readonly<
  Record<ShellBand, { readonly open: "open" | "closed"; readonly closed: "closed" }>
> = {
  mobile: { open: "closed", closed: "closed" },
  tablet: { open: "open", closed: "closed" },
  desktop: { open: "open", closed: "closed" },
};
// PART2
describe("R3 — one selection policy per band, assigned by the composer", () => {
  it("classifies EVERY shell band, with the owner's policy for each", () => {
    expect(Object.keys(SIDEBAR_SELECTION_POLICY_BY_BAND).sort()).toEqual([...SHELL_BANDS].sort());
    expect(SIDEBAR_SELECTION_POLICY_BY_BAND.mobile).toBe("close");
    expect(SIDEBAR_SELECTION_POLICY_BY_BAND.tablet).toBe("preserve");
    expect(SIDEBAR_SELECTION_POLICY_BY_BAND.desktop).toBe("preserve");
  });

  it("states the three policies SEPARATELY — no band is defined in terms of another", () => {
    const engine = read("src", "components", "shell", "shell-engine.tsx");
    // Three entries of its own: tablet and desktop agree today by DECLARATION, not by aliasing, so revising one
    // of them is a one-line change that cannot disturb the other.
    expect(engine).toContain('mobile: "close"');
    expect(engine).toContain('tablet: "preserve"');
    expect(engine).toContain('desktop: "preserve"');
    // …and each rail reads ITS band's entry, rather than one value shared by every band.
    for (const band of SHELL_BANDS) {
      expect(engine, `${band} reads its own policy`).toContain(`SIDEBAR_SELECTION_POLICY_BY_BAND.${band}`);
    }
    expect(engine, "no rail derives a policy from another band").not.toMatch(
      /SIDEBAR_SELECTION_POLICY_BY_BAND\.(desktop|tablet|mobile)\s*[:=]\s*SIDEBAR_SELECTION_POLICY_BY_BAND/,
    );
  });

  it("hands each band's policy to that band's rail, and to nothing else", () => {
    const engine = read("src", "components", "shell", "shell-engine.tsx");
    // The band table carries the policy beside the band it belongs to…
    expect(engine).toMatch(/readonly band: ShellBand;[\s\S]*?readonly selection: SidebarSelectionPolicy;/);
    // …and the ONE composition of a rail passes it through.
    expect((engine.match(/selection=\{selection\}/g) ?? []).length).toBe(1);
    expect(engine).toMatch(/renderBand\(id, band, selection\)/);
  });
});

describe("R3 — the decision itself: the six-row matrix, over every band", () => {
  /** The state a rail is in after a selection, which is what the owner's table states. */
  const stateAfterSelection = (policy: SidebarSelectionPolicy, before: "open" | "closed"): "open" | "closed" => {
    const dismissed = railDismissesOnSelection(
      policy,
      true,
      before === "open" ? DISCLOSURE_OPEN : DISCLOSURE_CLOSED,
      true,
    );
    return dismissed ? "closed" : before;
  };

  it("closes an OPEN rail only where the band's policy says so, and never touches a CLOSED one", () => {
    for (const band of SHELL_BANDS) {
      const policy = SIDEBAR_SELECTION_POLICY_BY_BAND[band];
      const expected = EXPECTED_AFTER_SELECTION[band];
      expect(stateAfterSelection(policy, "open"), `${band}: OPEN rail + selection`).toBe(expected.open);
      expect(stateAfterSelection(policy, "closed"), `${band}: CLOSED rail + selection`).toBe(expected.closed);
      // The half of the contract the table's CLOSED column rests on, stated directly: a selection reports a
      // dismissal ONLY for an open rail in a `"close"` band.
      expect(railDismissesOnSelection(policy, true, DISCLOSURE_OPEN, true), `${band}: dismissal`).toBe(
        expected.open === "closed",
      );
      expect(railDismissesOnSelection(policy, true, DISCLOSURE_CLOSED, true), `${band}: no dismissal`).toBe(false);
    }
  });

  it("never OPENS a rail — a selection can only ever dismiss one", () => {
    for (const policy of SIDEBAR_SELECTION_POLICIES) {
      // A CLOSED rail is untouched by a selection under EVERY policy: the rule is one-way by construction.
      expect(railDismissesOnSelection(policy, true, DISCLOSURE_CLOSED, true)).toBe(false);
    }
  });

  it("leaves a rail with no disclosure state of its own untouched", () => {
    for (const policy of SIDEBAR_SELECTION_POLICIES) {
      expect(railDismissesOnSelection(policy, false, DISCLOSURE_OPEN, true)).toBe(false);
    }
  });

  it("counts only a DESTINATION activation as a selection — a click on the panel itself is not", () => {
    for (const band of SHELL_BANDS) {
      expect(
        railDismissesOnSelection(SIDEBAR_SELECTION_POLICY_BY_BAND[band], true, DISCLOSURE_OPEN, false),
        band,
      ).toBe(false);
    }
  });

  it("keeps this primitive's long-standing behaviour as the default for a rail that declares nothing", () => {
    expect(DEFAULT_SIDEBAR_SELECTION_POLICY).toBe("close");
    expect(railDismissesOnSelection(DEFAULT_SIDEBAR_SELECTION_POLICY, true, DISCLOSURE_OPEN, true)).toBe(true);
    expect(SIDEBAR_SELECTION_POLICIES).toEqual(["close", "preserve"]);
  });
});

describe("R3 — what the primitive itself must NOT do", () => {
  const sidebar = withoutComments(read("src", "components", "ui", "sidebar.tsx"));

  it("infers no viewport width: the band is the composer's fact, never a runtime measurement", () => {
    for (const detector of ["matchMedia", "innerWidth", "outerWidth", "IntersectionObserver", "ResizeObserver"]) {
      expect(sidebar, `the rail must not measure ${detector}`).not.toContain(detector);
    }
    expect(sidebar, "no resize listener").not.toMatch(/addEventListener\(\s*["']resize/);
  });

  it("keeps ONE writer, ONE rule and the SAME delegated activation predicate", () => {
    // The one writer, unchanged: every state change still goes through `apply`.
    expect((sidebar.match(/storeSidebarPreference\(/g) ?? []).length).toBe(1);
    // The selection path asks the ONE pure rule…
    expect(sidebar).toMatch(
      /function closeForSelection\(event: MouseEvent<HTMLDivElement>\): void \{[\s\S]*?railDismissesOnSelection\(selection, collapsible, state, destination\)[\s\S]*?apply\(DISCLOSURE_CLOSED\)/,
    );
    // …and the mobile event-selection predicate is exactly the one it always was: a delegated click on an anchor
    // inside the rail's own panel, with no routing API and no per-item handler.
    expect(sidebar).toContain('className="ui-sidebar-rail-panel" onClick={closeForSelection}');
    expect(sidebar).toMatch(/target\.closest\("a\[href\]"\)/);
    expect(sidebar).not.toMatch(/from "next\/navigation"/);
  });
});
