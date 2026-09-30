import { describe, expect, it } from "vitest";

import { capsuleDirectory } from "@/config/deployment-build.mjs";
import {
  contentDigestSubject,
  RELEASE_DIGEST_SCOPE_ID,
  RELEASE_PAYLOAD_FORMAT,
} from "@/core/foundation-release/content-digest.mjs";
import { RELEASE_CONTENT_POLICY_ID } from "@/core/foundation-release/manifest.mjs";
import {
  foundationInstallationAdoptionRecord,
  installationIsEstablishedFrom,
  offsetInstant,
  portableInstallationSeed,
  INSTALLATION_ADOPTION_RECORD_FILE_NAME,
  INSTALLATION_CONTENT_SCOPE,
  INSTALLATION_GENERATED_STATE_IGNORE_RULE,
  INSTALLATION_SEED_NON_PORTABLE_PATHS,
  INSTALLATION_SEED_REFUSED_PATHS,
  INSTALLATION_SEED_REQUIREMENTS,
} from "@/core/foundation-installation/establishment";
import {
  initialInstallationOperationalState,
  startInstallationAttempt,
  INSTALLATION_FAILURE_CATEGORIES,
  INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
} from "@/core/foundation-installation/index";
import type { FoundationReleaseReference } from "@/core/foundation-release/reference";

import { digestReleaseEntries } from "../../scripts/release/release-digest.mjs";
import { contentDigest, sha256Hex } from "../../src/adapters/installation/node-content-files";

/**
 * THE RULES OF ESTABLISHMENT, WITHOUT A FILESYSTEM (FOUNDATION-B4B)
 * ===============================================================
 *
 * Establishment's rules are pure, so they are proved here: what a seed must contain, what generated state a
 * seed may never contain, the ignore rule that keeps the operational record out of authored state, the
 * adoption record's shape, the completion predicate, and the ONE content encoding that a release digest and
 * an installation digest share.
 */
const RELEASE: FoundationReleaseReference = {
  tag: "provelopment-foundation-v20990101.0000",
  repository: "https://github.com/provelopment/provelopment-foundation",
  commit: "1".repeat(40),
  tree: "2".repeat(40),
  manifestFormat: 1,
  content: { policy: RELEASE_CONTENT_POLICY_ID, digest: `sha256:${"3".repeat(64)}`, fileCount: 12 },
};

const CANDIDATE = { release: RELEASE.tag, authored: `sha256:${"4".repeat(64)}`, materialized: `sha256:${"5".repeat(64)}` };

describe("what a complete installation is made of", () => {
  it("names the authored surfaces every installation needs, each with a reason", () => {
    expect(INSTALLATION_SEED_REQUIREMENTS.map((requirement) => requirement.path)).toEqual([
      "site.config.json",
      "config/i18n",
      "content/pages",
      "content/assets",
    ]);
    expect(INSTALLATION_SEED_REQUIREMENTS[0].kind).toBe("file");
    for (const requirement of INSTALLATION_SEED_REQUIREMENTS) {
      expect(requirement.kind).toBe(requirement.path === "site.config.json" ? "file" : "directory");
      expect(requirement.reason.length).toBeGreaterThan(20);
    }
  });

  it("refuses generated state in a seed — the operational record above all", () => {
    expect(INSTALLATION_SEED_REFUSED_PATHS.map((refused) => refused.path)).toEqual([
      INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
    ]);
    expect(INSTALLATION_SEED_REFUSED_PATHS[0].reason).toMatch(/GENERATED/);
  });

  it("names the ignore rule that keeps the operational record out of authored state", () => {
    expect(INSTALLATION_GENERATED_STATE_IGNORE_RULE).toBe(INSTALLATION_OPERATIONAL_STATE_FILE_NAME);
  });

  it("asks the platform's own authority for the capsule's relative name, never spelling it", () => {
    // The use case addresses the installation's capsule through this value, and the authority composes it.
    expect(capsuleDirectory("")).toBe("deployment");
    expect(INSTALLATION_ADOPTION_RECORD_FILE_NAME).toBe("foundation-baseline.json");
  });
});

describe("the adoption record an establishment writes", () => {
  it("has exactly the record's keys: the release, when, and by which work", () => {
    const record = foundationInstallationAdoptionRecord(RELEASE, {
      adoptedAt: "2099-01-01T07:00:00+07:00",
      establishedBy: "FOUNDATION-B4B test",
    });
    expect(Object.keys(record).sort()).toEqual(["adoptedAt", "establishedBy", "release"]);
    expect(record.release).toEqual(RELEASE);
    // Acquisition is deliberately NOT recorded: where the bytes came from is an act's detail, not identity.
    expect(JSON.stringify(record)).not.toMatch(/acquiredFrom|acquired from|payloadDirectory/);
  });

  it("refuses a release that is not a valid immutable reference, and a missing work id", () => {
    expect(() =>
      foundationInstallationAdoptionRecord(
        { ...RELEASE, tag: "main" },
        { adoptedAt: "2099-01-01T07:00:00+07:00", establishedBy: "x" },
      ),
    ).toThrow(/valid immutable Foundation release/);
    expect(() =>
      foundationInstallationAdoptionRecord(RELEASE, { adoptedAt: "2099-01-01T07:00:00+07:00", establishedBy: "  " }),
    ).toThrow(/which work established it/);
    expect(() =>
      foundationInstallationAdoptionRecord(RELEASE, { adoptedAt: "2099-01-01T07:00:00Z", establishedBy: "x" }),
    ).toThrow(/offset ISO-8601 instant/);
  });

  it("records a moment in the offset form the authored record already uses, without losing the instant", () => {
    const moment = new Date("2099-01-01T07:00:00Z");
    const record = offsetInstant(moment);
    expect(record).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    // The same instant, whichever timezone the machine recording it is in.
    expect(new Date(record).getTime()).toBe(moment.getTime());
  });
});

describe("the completion predicate establishment asks itself", () => {
  const attempt = () =>
    startInstallationAttempt(initialInstallationOperationalState({ name: "i", repository: "r" }), {
      kind: "install",
      target: RELEASE,
      at: "2099-01-01T00:00:00Z",
    });

  it("is false for an installation that was never activated", () => {
    expect(installationIsEstablishedFrom(attempt(), { release: RELEASE, candidate: CANDIDATE })).toBe(false);
  });

  it("is true only for the EXACT release and candidate, and only for the two scoped digests", () => {
    // The predicate is what stops a plausible-looking record from being read as a completed establishment:
    // the release must match in every respect the contract records, and the live revision must be the
    // candidate's materialised digest.
    expect(INSTALLATION_CONTENT_SCOPE.AUTHORED).toBe("installation-authored-v1");
    expect(INSTALLATION_CONTENT_SCOPE.MATERIALIZED).toBe("installation-materialized-v1");
    expect(INSTALLATION_CONTENT_SCOPE.AUTHORED).not.toBe(INSTALLATION_CONTENT_SCOPE.MATERIALIZED);
    expect(initialInstallationOperationalState({ name: "i", repository: "r" }).current.live).toBeNull();
  });
});

describe("one content encoding, used by both a release and an installation", () => {
  const files = [
    { path: "b.txt", bytes: new TextEncoder().encode("second\n") },
    { path: "a.txt", bytes: new TextEncoder().encode("first\n") },
  ];

  it("is order-independent and scope-sensitive", () => {
    const entries = files.map((file) => ({ path: file.path, sha256: sha256Hex(file.bytes) }));
    const forward = contentDigestSubject(entries, { scope: INSTALLATION_CONTENT_SCOPE.AUTHORED });
    const reversed = contentDigestSubject([...entries].reverse(), { scope: INSTALLATION_CONTENT_SCOPE.AUTHORED });
    expect(forward).toBe(reversed);
    expect(contentDigestSubject(entries, { scope: INSTALLATION_CONTENT_SCOPE.MATERIALIZED })).not.toBe(forward);
    // A path order that depended on the locale would make two machines disagree about the same content set.
    expect(forward.split("\n")[1]).toMatch(/^a\.txt\0/);
  });

  it("gives the RELEASE tooling and the INSTALLATION adapters the same digest for the same content", () => {
    const entries = files.map((file) => ({ path: file.path, sha256: sha256Hex(file.bytes) }));
    const scope = `${RELEASE_DIGEST_SCOPE_ID} ${RELEASE_CONTENT_POLICY_ID} manifest-format:${RELEASE_PAYLOAD_FORMAT}`;
    const releaseSide = digestReleaseEntries(entries);
    const installationSide = contentDigest(files, scope);
    expect(installationSide).toBe(releaseSide.digest);
    expect(releaseSide.fileCount).toBe(2);
  });

  it("refuses an ambiguous or empty content set rather than producing a meaningless identity", () => {
    const entries = [{ path: "a.txt", sha256: sha256Hex(new TextEncoder().encode("x")) }];
    expect(() => contentDigestSubject(entries, { scope: "" })).toThrow(/scope/);
    expect(() => contentDigestSubject([], { scope: "s" })).toThrow(/no files/);
    expect(() => contentDigestSubject([...entries, ...entries], { scope: "s" })).toThrow(/more than once/);
    expect(() => contentDigestSubject([{ path: "a\nb", sha256: entries[0].sha256 }], { scope: "s" })).toThrow(
      /encodable/,
    );
  });
});

describe("establishment reports failures in the platform's own vocabulary", () => {
  it("uses only categories the lifecycle contract already defines", () => {
    for (const category of ["release-resolution", "installation-validation", "materialization", "promotion"]) {
      expect(INSTALLATION_FAILURE_CATEGORIES).toContain(category);
    }
  });
});

/**
 * AN EXISTING INSTALLATION'S CAPSULE IS A VALID SEED (FOUNDATION-B4B-A2)
 * ====================================================================
 *
 * The documented procedure seeds an establishment with an established installation's own capsule
 * (`--seed deployment`), and such a capsule carries that installation's adoption record. Treating that
 * record as authored material made the documented path fail, so the rule is stated here, once: the seed's
 * own records are EXCLUDED from the portable capsule rather than refused, because a capsule is expected to
 * have them.
 */
describe("a source installation's own records are not portable authored material", () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  const files = [
    { path: "site.config.json", bytes: encode("{}\n") },
    { path: INSTALLATION_ADOPTION_RECORD_FILE_NAME, bytes: encode("the source installation's own adoption\n") },
    { path: "content/pages/home.md", bytes: encode("# Home\n") },
    { path: "content/assets/logo.svg", bytes: encode("<svg/>\n") },
  ];

  it("names the source's adoption record as the record that does not travel", () => {
    expect(INSTALLATION_SEED_NON_PORTABLE_PATHS.map((record) => record.path)).toEqual([
      INSTALLATION_ADOPTION_RECORD_FILE_NAME,
    ]);
    expect(INSTALLATION_SEED_NON_PORTABLE_PATHS[0].reason).toMatch(/adoption record/);
  });

  it("EXCLUDES it rather than refusing it: an existing capsule is the ordinary seed", () => {
    // Ownership, not severity. A capsule is EXPECTED to carry its own adoption record, so that record must
    // not make the seed unusable; generated runtime state is not authored material at all, so it is still
    // refused outright and stays visible as a mistake.
    const refused = INSTALLATION_SEED_REFUSED_PATHS.map((entry) => entry.path);
    expect(refused).not.toContain(INSTALLATION_ADOPTION_RECORD_FILE_NAME);
    expect(refused).toContain(INSTALLATION_OPERATIONAL_STATE_FILE_NAME);
  });

  it("splits a seed into what travels and what is left behind, losing nothing", () => {
    const { portable, notInherited } = portableInstallationSeed(files);
    expect(portable.map((file) => file.path)).toEqual([
      "site.config.json",
      "content/pages/home.md",
      "content/assets/logo.svg",
    ]);
    expect(notInherited.map((file) => file.path)).toEqual([INSTALLATION_ADOPTION_RECORD_FILE_NAME]);
    expect(portable.length + notInherited.length).toBe(files.length);
  });

  it("leaves a capsule without such a record exactly as it is", () => {
    const { portable, notInherited } = portableInstallationSeed([files[0], files[2], files[3]]);
    expect(notInherited).toEqual([]);
    expect(portable).toHaveLength(3);
  });

  it("excludes the capsule's OWN record, not a same-named file a page author wrote deeper in the tree", () => {
    // Equality on the seed-relative path: a page document that happens to share the name travels like any
    // other page, and only the capsule's own lifecycle record is left behind.
    const page = { path: "content/pages/json/ww/en/foundation-baseline.json", bytes: encode("{}\n") };
    const { portable, notInherited } = portableInstallationSeed([page]);
    expect(notInherited).toEqual([]);
    expect(portable).toEqual([page]);
  });
});
