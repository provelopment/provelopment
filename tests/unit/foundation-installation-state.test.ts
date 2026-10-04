import { describe, expect, it } from "vitest";

import {
  INSTALLATION_HEALTH,
  INSTALLATION_LIFECYCLE_HISTORY_LIMIT,
  installationActivationState,
  installationOperationalStateIssues,
  initialInstallationOperationalState,
  isUtcInstant,
  parseInstallationOperationalState,
  utcInstant,
  type FoundationInstallationOperationalState,
} from "@/core/foundation-installation";

import { FIRST_RELEASE, installationIdentity, event, operationalState } from "../support/foundation-installation-fixture";

/**
 * THE DURABLE RECORD'S CONTRACT (FOUNDATION-B4A)
 * =============================================
 *
 * The record is read by people and machines that did not write it, so the two properties that matter are: it
 * says what is true NOW without reading prose or history, and a CONTRADICTION is refused rather than
 * repaired. This suite states the second property exhaustively — every refusal below is a situation that
 * would otherwise be quietly "fixed" into a plausible-looking lie about an installation.
 *
 * Nothing here touches a filesystem or a clock: the record is data, and every instant is passed in.
 */

/**
 * The record with its readonly contract RELAXED.
 *
 * These tests build records that are wrong ON PURPOSE, so they must be able to write fields the contract
 * declares readonly — the point is to describe an invalid document, not to produce one the types allow.
 */
type Loose<T> = T extends readonly (infer U)[]
  ? Loose<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Loose<T[K]> }
    : T;
type LooseRecord = Loose<FoundationInstallationOperationalState>;

/** The issues of the fixture record with ONE edit applied, so each test states its own contradiction. */
function issuesAfter(edit: (record: LooseRecord) => void): string[] {
  const record = structuredClone(operationalState()) as LooseRecord;
  edit(record);
  return installationOperationalStateIssues(record);
}

/** The joined issues, so a failure message is readable rather than a wall of array output. */
const reported = (issues: readonly string[]): string => issues.join("\n");

describe("a fresh installation is unestablished rather than assumed healthy", () => {
  it("starts with no live identity, OFFLINE health and nothing attempted", () => {
    const fresh = initialInstallationOperationalState(installationIdentity());

    expect(installationOperationalStateIssues(fresh)).toEqual([]);
    expect(fresh.current.live).toBeNull();
    expect(fresh.current.lastAttempt).toBeNull();
    expect(fresh.current.health).toBe(INSTALLATION_HEALTH.OFFLINE);
    // Nothing has been evaluated, so nothing claims a moment: an undated OFFLINE is honest.
    expect(fresh.current.healthEvaluatedAt).toBeNull();
    expect(fresh.history).toEqual([]);
    expect(installationActivationState(fresh)).toBe("unestablished");
  });

  it("refuses to build a state for an installation identity that is not usable", () => {
    expect(() => initialInstallationOperationalState(installationIdentity({ name: "   " }))).toThrow(/not a usable/);
    expect(() => initialInstallationOperationalState(installationIdentity({ repository: "" }))).toThrow(/not a usable/);
  });
});

describe("a valid record is accepted as written", () => {
  it("accepts the fixture, and accepts it again after a JSON round trip", () => {
    const record = operationalState();

    expect(reported(installationOperationalStateIssues(record))).toBe("");
    expect(parseInstallationOperationalState(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(installationActivationState(record)).toBe("active");
  });

  it("names the release the installation runs, and the exact revision serving it", () => {
    const record = parseInstallationOperationalState(operationalState());

    expect(record.current.live?.release.tag).toBe(record.current.lastAttempt?.target.tag);
    expect(record.current.live?.revision).toBe(record.current.lastAttempt?.candidate?.materialized);
  });

  it("refuses an unknown schema version rather than interpreting it", () => {
    expect(reported(issuesAfter((record) => (record.schemaVersion = 2)))).toMatch(/schemaVersion is 2/);
    expect(() => parseInstallationOperationalState({ ...operationalState(), schemaVersion: 1.5 })).toThrow(/FOUNDATION-B4A/);
  });

  it("refuses a record with a missing or an unexpected field", () => {
    expect(reported(issuesAfter((record) => delete (record.current as { health?: unknown }).health))).toMatch(
      /current has keys/,
    );
    expect(reported(issuesAfter((record) => ((record.current as unknown as Record<string, unknown>).extra = "invented")))).toMatch(
      /current has keys/,
    );
  });
});


describe("health and activation cannot disagree", () => {
  it("refuses ONLINE while nothing is live", () => {
    const issues = issuesAfter((record) => {
      record.current.live = null;
      record.current.healthEvaluatedAt = null;
    });

    expect(reported(issues)).toMatch(/ONLINE but nothing is live/);
    expect(issues.some((issue) => /cannot be serving/.test(issue))).toBe(true);
  });

  it("refuses a live installation whose health was never evaluated", () => {
    expect(reported(issuesAfter((record) => (record.current.healthEvaluatedAt = null)))).toMatch(/undated claim/);
  });

  it("refuses a health value outside the contract", () => {
    expect(
      reported(issuesAfter((record) => ((record.current as unknown as Record<string, unknown>).health = "degraded"))),
    ).toMatch(/is not "online" or "offline"/);
  });

  it("allows OFFLINE with a dated evaluation — a live installation that is not serving", () => {
    expect(
      reported(
        issuesAfter((record) => {
          record.current.health = "offline";
          record.current.healthEvaluatedAt = "2026-10-01T10:00:00Z";
        }),
      ),
    ).toBe("");
  });
});

describe("a release is named by an immutable identity, never by a mutable revision", () => {
  for (const tag of ["main", "HEAD", "1".repeat(40), FIRST_RELEASE.replace("initial", "something"), "v2026.09.30-other"]) {
    it(`refuses "${tag.length > 24 ? `${tag.slice(0, 24)}…` : tag}" as a release identity`, () => {
      const issues = issuesAfter((record) => {
        record.current.live!.release.tag = tag;
        record.current.lastAttempt!.target.tag = tag;
        record.current.lastAttempt!.candidate!.release = tag;
      });

      expect(reported(issues)).toMatch(/not a recognized immutable Foundation release identity/);
    });
  }

  it("refuses an impossible release minute even though the shape looks plausible", () => {
    const issues = issuesAfter((record) => {
      record.current.live!.release.tag = "provelopment-foundation-v20261301.1200";
      record.current.lastAttempt!.candidate!.release = "provelopment-foundation-v20261301.1200";
    });

    expect(reported(issues)).toMatch(/not a recognized immutable Foundation release identity/);
  });

  it("refuses a release from another authority, a short commit or a malformed digest", () => {
    const issues = issuesAfter((record) => {
      record.current.live!.release.repository = "https://example.com/somewhere-else";
      record.current.live!.release.commit = "abc";
      record.current.live!.release.content.digest = "not-a-digest";
      record.current.live!.release.content.fileCount = 0;
    });

    expect(reported(issues)).toMatch(/a Foundation release is of/);
    expect(reported(issues)).toMatch(/not a full 40-character commit SHA/);
    expect(reported(issues)).toMatch(/not a sha256: content digest/);
    expect(reported(issues)).toMatch(/not a positive integer/);
  });

  it("refuses a candidate that contains a release other than the one the attempt asked for", () => {
    expect(reported(issuesAfter((record) => (record.current.lastAttempt!.candidate!.release = FIRST_RELEASE)))).toMatch(
      /a candidate may only contain the release that was asked for/,
    );
  });
});

describe("an attempt's own parts must agree with each other", () => {
  it("refuses a stage and an outcome that disagree", () => {
    expect(
      reported(
        issuesAfter((record) => {
          record.current.lastAttempt!.stage = "validating";
          record.current.lastAttempt!.outcome = "succeeded";
        }),
      ),
    ).toMatch(/outcome is "succeeded"/);
  });

  it("refuses a candidate while the attempt is still preparing one", () => {
    expect(reported(issuesAfter((record) => (record.current.lastAttempt!.stage = "preparing")))).toMatch(
      /declares a candidate while it is still preparing/,
    );
  });

  it("refuses a non-preparing attempt that has no candidate to show for itself", () => {
    expect(reported(issuesAfter((record) => (record.current.lastAttempt!.candidate = null)))).toMatch(
      /has no candidate but is at stage/,
    );
  });

  it("refuses an end instant on a pending attempt, and a missing one on a settled attempt", () => {
    expect(
      reported(
        issuesAfter((record) => {
          record.current.lastAttempt!.outcome = "pending";
        }),
      ),
    ).toMatch(/must not record an end instant/);

    expect(reported(issuesAfter((record) => (record.current.lastAttempt!.endedAt = null)))).toMatch(
      /must be a UTC instant once the attempt has settled/,
    );
  });

  it("refuses a failure on an attempt that did not fail, and a silent failure on one that did", () => {
    expect(
      reported(
        issuesAfter((record) => {
          record.current.lastAttempt!.failure = { category: "promotion", message: "it did not" };
        }),
      ),
    ).toMatch(/records a failure but has not failed/);

    expect(
      reported(
        issuesAfter((record) => {
          record.current.lastAttempt!.stage = "failed";
          record.current.lastAttempt!.outcome = "failed";
          record.current.lastAttempt!.failure = null;
        }),
      ),
    ).toMatch(/must record why it failed/);
  });

  it("refuses a failure whose category is outside the vocabulary, or which says nothing", () => {
    const issues = issuesAfter((record) => {
      record.current.lastAttempt!.stage = "failed";
      record.current.lastAttempt!.outcome = "failed";
      record.current.lastAttempt!.failure = { category: "vibes", message: "  " } as never;
    });

    expect(reported(issues)).toMatch(/is not a lifecycle failure category/);
    expect(reported(issues)).toMatch(/must say what failed/);
  });

  it("refuses a promotion whose live revision is not the candidate it validated", () => {
    expect(reported(issuesAfter((record) => (record.current.live!.revision = `sha256:${"f".repeat(64)}`)))).toMatch(
      /the live revision is not the revision of the candidate/,
    );
  });
});


describe("an attempt that contradicts the live state is refused", () => {
  it("refuses a succeeded attempt whose live release is not the release it promoted", () => {
    const issues = issuesAfter((record) => {
      record.current.live!.release = { ...record.current.live!.release, tag: FIRST_RELEASE };
    });

    expect(reported(issues)).toMatch(/promotion promotes the candidate that passed inspection/);
  });

  it("refuses an upgrade or a rollback with nothing live, and an unsettled install that left something live", () => {
    expect(
      reported(
        issuesAfter((record) => {
          record.current.live = null;
          record.current.healthEvaluatedAt = null;
          record.current.lastAttempt!.kind = "upgrade";
        }),
      ),
    ).toMatch(/requires a live installation to move/);

    expect(
      reported(
        issuesAfter((record) => {
          record.current.lastAttempt!.kind = "install";
          record.current.lastAttempt!.stage = "failed";
          record.current.lastAttempt!.outcome = "failed";
          record.current.lastAttempt!.failure = { category: "build", message: "the site did not build" };
        }),
      ),
    ).toMatch(/must leave the installation unestablished/);
  });

  it("accepts a previous live state that shares the live release but is a DIFFERENT revision (an Update)", () => {
    // M20 — an Update changes the authored pages/assets while the release stays live, so its rollback
    // provenance legitimately carries the SAME release and a different revision.
    expect(
      reported(
        issuesAfter((record) => {
          record.current.live!.previous = {
            release: record.current.live!.release,
            revision: `sha256:${"c".repeat(64)}`,
            retiredAt: "2026-10-01T08:00:00Z",
          };
        }),
      ),
    ).toBe("");
  });

  it("refuses a previous live state that IS the live state", () => {
    expect(
      reported(
        issuesAfter((record) => {
          record.current.live!.previous = {
            release: record.current.live!.release,
            revision: record.current.live!.revision,
            retiredAt: "2026-10-01T08:00:00Z",
          };
        }),
      ),
    ).toMatch(/always a different one/);
  });
});

describe("history is an ordered, bounded, closed record of what happened", () => {
  it("refuses an event type outside the vocabulary", () => {
    const issues = issuesAfter((record) => {
      (record.history as unknown[])[0] = event({ type: "deployed" as never });
    });

    expect(reported(issues)).toMatch(/is not a lifecycle event type/);
  });

  it("refuses history that is not ordered oldest first", () => {
    expect(
      reported(
        issuesAfter((record) => {
          record.history = [event({ at: "2026-10-01T10:00:00Z" }), event({ at: "2026-10-01T09:00:00Z" })];
        }),
      ),
    ).toMatch(/earlier than the event before it/);
  });

  it("refuses history longer than the contract's bound", () => {
    expect(
      reported(
        issuesAfter((record) => {
          record.history = Array.from({ length: INSTALLATION_LIFECYCLE_HISTORY_LIMIT + 1 }, () => event());
        }),
      ),
    ).toMatch(/more than the contract's/);
  });

  it("refuses an event that names no recognizable release, or says nothing", () => {
    const issues = issuesAfter((record) => {
      record.history = [event({ release: "main", detail: "  " })];
    });

    expect(reported(issues)).toMatch(/not a recognized immutable release identity/);
    expect(reported(issues)).toMatch(/must say what happened/);
  });
});

describe("recorded instants are UTC, and are provenance rather than identity", () => {
  it("accepts UTC instants with or without milliseconds, and refuses everything else", () => {
    for (const accepted of ["2026-10-01T09:00:00Z", "2026-10-01T09:00:00.123Z"]) {
      expect(isUtcInstant(accepted), accepted).toBe(true);
    }
    for (const refused of [
      "2026-10-01T09:00:00+02:00",
      "2026-10-01 09:00:00Z",
      "2026-10-01T09:00Z",
      "2026-02-31T09:00:00Z",
      "2026-10-01T24:00:00Z",
      "2026-10-01T09:60:00Z",
      "2026-10-01T09:00:00",
      1_759_000_000,
      null,
    ]) {
      expect(isUtcInstant(refused), String(refused)).toBe(false);
    }
  });

  it("records a moment as UTC seconds, truncating rather than rounding", () => {
    expect(utcInstant(new Date("2026-10-01T09:00:00.999Z"))).toBe("2026-10-01T09:00:00Z");
    expect(utcInstant(new Date("2026-10-01T11:00:00+02:00"))).toBe("2026-10-01T09:00:00Z");
  });

  it("refuses a recorded instant that no clock could have produced", () => {
    expect(reported(issuesAfter((record) => (record.current.healthEvaluatedAt = "2026-02-31T09:00:00Z")))).toMatch(
      /healthEvaluatedAt is not a UTC instant/,
    );
    expect(reported(issuesAfter((record) => (record.current.lastAttempt!.startedAt = "2026-10-01T09:00:00")))).toMatch(
      /startedAt is not a UTC instant/,
    );
  });
});
