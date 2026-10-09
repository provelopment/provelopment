/**
 * THE SITE-WIDE NOTICE (R1 — generic shell chrome)
 * ===============================================
 *
 * ONE opt-in, site-wide message rendered by the shell on EVERY page of the Spoke that enables it: the
 * generic capability an adopter uses to say something to every visitor — that a demonstration site carries
 * fictitious business information, that a service is interrupted, that an offer applies everywhere — without
 * copying that message into each page's authored content.
 *
 * WHY THE VOCABULARY IS PURE, AND WHY IT IS SO SMALL
 * -------------------------------------------------
 * Three facts only: IS a notice presented, in WHAT TONE, and does it REPLACE the page-level introductory
 * notices that some page chrome would otherwise render. The wording is NOT here — it is localized copy that
 * belongs to the deployment's dictionary (`siteNotice.title` / `siteNotice.body`), so this module cannot
 * contain a business sentence, a product name or a language.
 *
 *   absent config          NO notice — no markup, no wrapper, no attribute. Every existing installation
 *                          renders exactly what it rendered before.
 *   `mode: "shown"`        the notice IS presented, in `tone` (`information` when the adopter states none).
 *                          `replacesDemoNotices` may then declare that THIS notice STANDS IN FOR the
 *                          introductory demonstration notices page chrome renders beside a demonstration
 *                          contact form and on the Connect page: one introductory notice per page instead of
 *                          two. Absent or `false` leaves every one of those notices rendering, so nothing
 *                          changes for an installation that does not ask for it.
 *   `mode: "hidden"`       the notice is NOT presented, but the adopter's wording may stay in place, so a
 *                          site can be silenced for a while without deleting its translations. Replacement is
 *                          meaningless here — there would be no notice to replace the page-level notices
 *                          WITH — so the configuration schema REFUSES `replacesDemoNotices: true` beside a
 *                          non-presented mode instead of removing a warning and putting nothing in its place.
 *
 * An unknown `mode` or `tone`, or a non-boolean replacement opt-in, never reaches this module: the
 * configuration schema refuses it at build time, so a typo cannot silently disable a notice a visitor was
 * meant to read.
 *
 * Framework-neutral: pure data and pure functions. No filesystem, no configuration parse, no dictionary.
 */

/** Every mode a Site may author. `shown` presents the notice; `hidden` is an explicit silence. */
export const SITE_NOTICE_MODES = ["shown", "hidden"] as const;
export type SiteNoticeMode = (typeof SITE_NOTICE_MODES)[number];

/** Every tone a Site may author. A tone is INTENT (accessible markup + token treatment), never a colour. */
export const SITE_NOTICE_TONES = ["information", "attention"] as const;
export type SiteNoticeTone = (typeof SITE_NOTICE_TONES)[number];

/** The tone a shown notice is presented in when the adopter states none. */
export const DEFAULT_SITE_NOTICE_TONE: SiteNoticeTone = "information";

/** The authored leaf, as `site.config.json` carries it. Absent entirely → no notice. */
export interface AuthoredSiteNotice {
  readonly mode?: SiteNoticeMode;
  readonly tone?: SiteNoticeTone;
  /**
   * Does THIS notice stand in for the page-level introductory demonstration notices that page chrome renders
   * beside a demonstration contact form and on the Connect page? `true` is the adopter's explicit opt-in to
   * ONE introductory notice per page; absent or `false` leaves every page-level notice exactly as it was.
   *
   * The configuration schema refuses `true` unless the notice is PRESENTED (`mode: "shown"`): replacement
   * without a notice would remove a warning and put nothing in its place.
   */
  readonly replacesDemoNotices?: boolean;
}

/**
 * The RESOLVED notice the shell composes: presented, with its tone and its replacement decision decided.
 */
export interface ResolvedSiteNotice {
  /** Always `shown`: a resolved notice exists only when it is presented. */
  readonly mode: "shown";
  readonly tone: SiteNoticeTone;
  /**
   * Whether this presented notice stands in for the page-level introductory demonstration notices. Decided
   * HERE, ONCE, from the authored leaf — never re-read from the configuration at a call site — so the shell
   * and any page chrome that asks the same question cannot disagree about what the adopter asked for.
   */
  readonly replacesDemoNotices: boolean;
}

/**
 * The notice this Site presents, or `null` when it presents none.
 *
 * `null` — never a defaulted object — is the ONE representation of "no notice", so a consumer cannot
 * accidentally render an empty notice block, and the shell's markup stays byte-identical for every
 * installation that declares none.
 */
export function resolveSiteNotice(
  authored: AuthoredSiteNotice | undefined | null,
): ResolvedSiteNotice | null {
  if (authored === undefined || authored === null) return null;
  if (authored.mode !== "shown") return null;
  return Object.freeze({
    mode: "shown" as const,
    tone: authored.tone ?? DEFAULT_SITE_NOTICE_TONE,
    // Only a PRESENTED notice can replace anything. The schema refuses the impossible combination; this
    // coalesces an UNVALIDATED input (a hand-built fixture, a future caller) to the same answer rather than
    // trusting a value the configuration layer would have refused.
    replacesDemoNotices: authored.replacesDemoNotices === true,
  });
}

/**
 * The dictionary FIELDS an enabled notice must resolve for every locale it is presented in.
 *
 * Exported so the build-time lock names exactly the fields the shell reads, and so a future field cannot be
 * added to the markup while the lock keeps checking the old set: ONE list, read by both.
 */
export const SITE_NOTICE_COPY_FIELDS = ["title", "body"] as const;
