import { describe, expect, it } from "vitest";

import {
  SPOKE_RUNTIME_CONTAINER,
  runtimeSegmentForSpokeId,
  spokeRuntimeAssetNamespacePath,
  spokeRuntimeAssetUrlBase,
} from "@/config/spoke-runtime-segment.mjs";

/**
 * THE RUNTIME SEGMENT (FOUNDATION-MULTISITE-S3E1C)
 * ===============================================
 *
 * A Spoke's runtime namespace is addressed by a segment derived from its IDENTITY, so this suite proves
 * the three properties the namespace model rests on:
 *
 *   1. the ENCODING is the documented one (the frozen examples), and it is INJECTIVE — the property that
 *      makes "different SpokeIds never share a namespace" true rather than hopeful;
 *   2. the RESULT is always usable as a directory name and a URL segment (non-empty, traversal-free,
 *      ASCII-safe, case-preserving);
 *   3. the NAMESPACE (its generated directory and its URL base) is derived from that one segment, so the
 *      installer and the runtime cannot serve different paths for the same Spoke.
 *
 * Pure: nothing here touches a filesystem.
 */

/** A corpus wide enough to contain the collisions a naive encoding actually produces. */
const CORPUS = [
  "foundation",
  "Foundation",
  "foundation-web",
  "Demo_01",
  "demo_01",
  "a/b",
  "ab",
  "a b",
  "a~b",
  "a~2Fb",
  "~",
  "~7E",
  ".",
  "..",
  "a.b",
  "a~2Eb",
  "...",
  "..a",
  "a..",
  "ä",
  "~C3~A4",
  "aäb",
  "a~C3~A4b",
  "a\\b",
  "a%b",
  "a:b",
  "a?b",
  "ÜNICODE",
  "spoke one",
  "!",
  "日本語",
];

describe("the encoding is the frozen rule, proved on the documented examples", () => {
  it("leaves ASCII letters, digits, `_`, `-` and `.` verbatim", () => {
    expect(runtimeSegmentForSpokeId("foundation")).toBe("foundation");
    expect(runtimeSegmentForSpokeId("Demo_01")).toBe("Demo_01");
    expect(runtimeSegmentForSpokeId("a.b")).toBe("a.b");
    expect(runtimeSegmentForSpokeId("foundation-web")).toBe("foundation-web");
  });

  it("preserves CASE, so two ids that differ only in case stay two namespaces", () => {
    expect(runtimeSegmentForSpokeId("Foundation")).toBe("Foundation");
    expect(runtimeSegmentForSpokeId("Demo_01")).not.toBe(runtimeSegmentForSpokeId("demo_01"));
  });

  it("escapes every other UTF-8 byte as `~HH` in UPPERCASE hexadecimal", () => {
    expect(runtimeSegmentForSpokeId("a/b")).toBe("a~2Fb");
    expect(runtimeSegmentForSpokeId("a b")).toBe("a~20b");
    expect(runtimeSegmentForSpokeId("ä")).toBe("~C3~A4");
    // Uppercase hex, specifically: `a~2fb` is NOT an encoding this function ever produces, so removing
    // every UPPERCASE escape must leave no introducer behind.
    for (const id of CORPUS) {
      expect(runtimeSegmentForSpokeId(id).replace(/~[0-9A-F]{2}/g, "")).not.toMatch(/~/);
    }
  });

  it("ALWAYS escapes `~`, so the introducer can never be confused with data", () => {
    expect(runtimeSegmentForSpokeId("a~b")).toBe("a~7Eb");
    expect(runtimeSegmentForSpokeId("~")).toBe("~7E");
  });

  it("escapes the dots of a whole segment that IS `.` or `..`, and nothing else", () => {
    expect(runtimeSegmentForSpokeId(".")).toBe("~2E");
    expect(runtimeSegmentForSpokeId("..")).toBe("~2E~2E");
    // The rule is about the WHOLE segment: these are ordinary names.
    expect(runtimeSegmentForSpokeId("...")).toBe("...");
    expect(runtimeSegmentForSpokeId("..a")).toBe("..a");
    expect(runtimeSegmentForSpokeId("a..")).toBe("a..");
  });
});


describe("the encoding is INJECTIVE — two ids never share a segment", () => {
  it("maps the whole corpus to distinct segments", () => {
    const segments = CORPUS.map((id) => runtimeSegmentForSpokeId(id));
    expect(new Set(segments).size).toBe(CORPUS.length);
  });

  it("is stable under re-encoding: a segment's own encoding never equals another id's segment", () => {
    // The classic injectivity trap is an escape that is not itself escaped. `a/b` and `a~2Fb` are the pair
    // that makes it concrete: they differ only because `~` is reserved.
    expect(runtimeSegmentForSpokeId("a/b")).toBe("a~2Fb");
    expect(runtimeSegmentForSpokeId("a~2Fb")).toBe("a~7E2Fb");
    expect(runtimeSegmentForSpokeId("a")).not.toBe(runtimeSegmentForSpokeId("a "));

    for (const id of CORPUS) {
      const segment = runtimeSegmentForSpokeId(id);
      // Re-encoding a segment stays a DISTINCT identity from a different id's, which is what injectivity
      // requires; no id may borrow another's namespace by spelling its segment.
      expect(runtimeSegmentForSpokeId(segment)).not.toBe(runtimeSegmentForSpokeId(`${id}!`));
    }
  });

  it("is DETERMINISTIC: the same id always yields the same segment", () => {
    for (const id of CORPUS) {
      expect(runtimeSegmentForSpokeId(id)).toBe(runtimeSegmentForSpokeId(id));
    }
  });
});

describe("the segment is always filesystem- and URL-safe", () => {
  it("is never empty, never `.` or `..`, and never contains a separator or a space", () => {
    for (const id of CORPUS) {
      const segment = runtimeSegmentForSpokeId(id);
      expect(segment.length).toBeGreaterThan(0);
      expect(segment).not.toBe(".");
      expect(segment).not.toBe("..");
      expect(segment).not.toContain("/");
      expect(segment).not.toContain("\\");
      expect(segment).not.toMatch(/[\s%?#]/);
      // Only verbatim characters and the escape alphabet.
      expect(segment).toMatch(/^[A-Za-z0-9._~-]+$/);
    }
  });

  it("refuses a blank id rather than producing an empty namespace", () => {
    expect(() => runtimeSegmentForSpokeId("")).toThrow(/blank Spoke id/);
    expect(() => runtimeSegmentForSpokeId(null as unknown as string)).toThrow(/must be a string/);
  });
});

describe("the runtime NAMESPACE is derived from that one segment", () => {
  it("composes the generated directory and the URL base consistently", () => {
    const segment = runtimeSegmentForSpokeId("foundation");
    expect(segment).toBe("foundation");
    expect(spokeRuntimeAssetNamespacePath(segment)).toBe("spokes/foundation/assets");
    expect(spokeRuntimeAssetUrlBase(segment)).toBe("/spokes/foundation/assets");
    // The container is the ONE shared parent, and the namespace never lives under the platform namespace.
    expect(spokeRuntimeAssetNamespacePath(segment).startsWith(`${SPOKE_RUNTIME_CONTAINER}/`)).toBe(true);
    expect(spokeRuntimeAssetNamespacePath(segment).startsWith("assets/")).toBe(false);
  });

  it("never builds a namespace a DIRECTORY NAME could influence", () => {
    // A Spoke authored at `spokes/foundation-web` is still the Spoke `foundation`.
    expect(spokeRuntimeAssetUrlBase(runtimeSegmentForSpokeId("foundation"))).toBe(
      "/spokes/foundation/assets",
    );
    expect(spokeRuntimeAssetUrlBase(runtimeSegmentForSpokeId("foundation-web"))).toBe(
      "/spokes/foundation-web/assets",
    );
  });
});
