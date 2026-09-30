/**
 * WHY A LIFECYCLE ATTEMPT FAILED (FOUNDATION-B4A)
 * ===============================================
 *
 * An installation's operational record must answer "why did the last attempt fail?" without anyone parsing
 * a stack trace, a log line or a human sentence. So a failure carries TWO things:
 *
 *   category   a value from the closed vocabulary below — the machine-readable answer, and the thing
 *              later phases branch on (which step failed decides what may be retried, and where the
 *              installation's own health is affected);
 *   message    a human line with the detail: the exact release, path or check the category alone cannot
 *              name. It accompanies the category; it never replaces it.
 *
 * THE VOCABULARY IS CLOSED AND SHARED. Each category names ONE lifecycle step, in the order the lifecycle
 * runs them, so the categories double as the honest answer to "how far did the attempt get?". A category
 * outside this set is refused rather than stored: an unknown step would make "why did it fail?"
 * unanswerable in exactly the situation the record exists for. Adding a step later means adding its
 * category here — one vocabulary, one place.
 *
 * WHAT IS DELIBERATELY ABSENT. There is no category for "the operator changed their mind", no category
 * for a candidate that failed because the LIVE installation is broken, and no severity axis. Cancellation
 * is not a failure of the platform, and a live-health failure is a fact about the live installation
 * (`recordInstallationHealth`), not a reason a candidate was rejected.
 *
 * Framework-neutral: pure data, types and predicates.
 */

/** Every machine-readable reason a lifecycle attempt may fail, one per lifecycle step. */
export const INSTALLATION_FAILURE_CATEGORIES = [
  /** The release the installation asked for could not be resolved to an immutable release (unknown tag, unreadable manifest). */
  "release-resolution",
  /** The candidate tree could not be materialized from the release and the installation's authored state. */
  "materialization",
  /** The candidate was built, but the installation's own validation contract rejected it. */
  "installation-validation",
  /** The candidate's site did not build. */
  "build",
  /** The candidate built and served, but visitor-level browser acceptance rejected it. */
  "browser-acceptance",
  /** The validated candidate could not be deployed to the staging environment. */
  "staging-deploy",
  /** The staged candidate was inspected and did not meet the staging health contract. */
  "staging-health",
  /** Promotion of the staged candidate did not complete, so it never became live. */
  "promotion",
  /** The LIVE installation failed its operational-health contract. */
  "live-health",
  /** Returning to a previously known-good live state did not complete. */
  "rollback",
] as const;

/** One machine-readable failure category. */
export type InstallationFailureCategory = (typeof INSTALLATION_FAILURE_CATEGORIES)[number];

/** A failed lifecycle step: the category later phases act on, plus the detail a human needs. */
export interface InstallationFailure {
  readonly category: InstallationFailureCategory;
  /** One human sentence naming what failed. It accompanies the category; it never replaces it. */
  readonly message: string;
}

const CATEGORY_SET: ReadonlySet<string> = new Set(INSTALLATION_FAILURE_CATEGORIES);

/** True when `value` is one of the contract's failure categories. */
export function isInstallationFailureCategory(value: unknown): value is InstallationFailureCategory {
  return typeof value === "string" && CATEGORY_SET.has(value);
}
