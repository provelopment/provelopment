import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { deploymentPaths } from "@/config/deployment-root";

import { COUNTRY_SITE_CODES, WORLDWIDE_SITE_CODE, isSiteCode } from "@/core/site-code";

/**
 * THE COUNTRY-CODE REFERENCE IS GUARDED, NOT TRUSTED (FOUNDATION-S1E3B).
 *
 * `content/COUNTRY-CODES.md` is the user-facing list an owner reads before naming a folder, so it
 * must never drift from the ONE runtime authority (`@/core/site-code`). These assertions are
 * deliberately mechanical — they read the document's marked, machine-checkable section rather than
 * its prose — so a code that is added to, removed from or duplicated in either side fails the
 * normal gate.
 *
 * The reserved Worldwide value is checked SEPARATELY: `ww` is Foundation-defined, not an ISO country,
 * and it must not appear in the country list.
 */
const referencePath = path.join(deploymentPaths().root, "content", "COUNTRY-CODES.md");
const document = readFileSync(referencePath, "utf8");

const START = "<!-- CODES:START -->";
const END = "<!-- CODES:END -->";
const section = document.slice(document.indexOf(START) + START.length, document.indexOf(END));

/** Every code the document lists, in document order. */
const documented = [...section.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
const documentedOnce = new Set(documented);

describe("the country-code reference matches the runtime authority", () => {
  it("marks a machine-checkable section at all", () => {
    expect(document).toContain(START);
    expect(document).toContain(END);
    expect(document.indexOf(START)).toBeLessThan(document.indexOf(END));
  });

  it("lists EVERY recognized country code", () => {
    const missing = COUNTRY_SITE_CODES.filter((code) => !documentedOnce.has(code));
    expect(missing, `content/COUNTRY-CODES.md is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists NOTHING that is not a recognized country code", () => {
    const unsupported = documented.filter((code) => !COUNTRY_SITE_CODES.includes(code));
    expect(
      unsupported,
      `content/COUNTRY-CODES.md lists unsupported codes: ${unsupported.join(", ")}`,
    ).toEqual([]);
  });

  it("lists each country code exactly once", () => {
    const duplicates = documented.filter((code, index) => documented.indexOf(code) !== index);
    expect(duplicates, `duplicated: ${[...new Set(duplicates)].join(", ")}`).toEqual([]);
    expect(documentedOnce.size).toBe(COUNTRY_SITE_CODES.length);
  });

  it("keeps the reserved Worldwide value OUT of the country list", () => {
    expect(COUNTRY_SITE_CODES).not.toContain(WORLDWIDE_SITE_CODE);
    expect(documentedOnce.has(WORLDWIDE_SITE_CODE)).toBe(false);
    expect(section).not.toContain(WORLDWIDE_SITE_CODE);
  });

  it("keeps the reserved Worldwide entry documented, separately and as the reserved value", () => {
    // The reserved value must remain readable in the document (it is a usable site code)…
    expect(document).toMatch(new RegExp(`\`${WORLDWIDE_SITE_CODE}\`[^\\n]*Worldwide`));
    // …and it must be described as Foundation-defined rather than as a country code.
    expect(document).toContain("defined by Foundation");
    expect(isSiteCode(WORLDWIDE_SITE_CODE)).toBe(true);
  });

  it("gives every listed code a readable country name", () => {
    for (const line of section.split(/\r?\n/).filter((entry) => entry.trim().length > 0)) {
      for (const cell of line.split(" · ")) {
        const name = cell.replace(/`[^`]+`/, "").trim();
        expect(name.length, `missing name in: ${cell}`).toBeGreaterThan(1);
      }
    }
  });
});

describe("the reference is published where an author looks", () => {
  it("is linked from the content map", () => {
    const map = readFileSync(path.join(deploymentPaths().root, "content", "README.md"), "utf8");
    expect(map).toContain("COUNTRY-CODES.md");
  });

  it("is linked from both authoring roots", () => {
    for (const root of ["content/pages/markdown/README.md", "content/pages/json/README.md"]) {
      expect(readFileSync(path.join(deploymentPaths().root, root), "utf8"), root).toContain(
        "COUNTRY-CODES.md",
      );
    }
  });
});
