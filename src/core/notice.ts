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
 * Two questions only: IS a notice presented, and in WHAT TONE. The wording is NOT here — it is localized
 * copy that belongs to the deployment's dictionary (`siteNotice.title` / `siteNotice.body`), so this module
 * cannot contain a business sentence, a product name or a language.
 *
 *   absent config          NO notice — no markup, no wrapper, no attribute. Every existing installation
 *                          renders exactly what it rendered before.
 *   `mode: "shown"`        the notice IS presented, in `tone` (`information` when the adopter states none).
 *   `mode: "hidden"`       the notice is NOT presented, but the adopter's wording may stay in place, so a
 *                          site can be silenced for a while without deleting its translations.
 *
 * An unknown `mode` or `tone` never reaches this module: the configuration schema refuses it at build time,
 * so a typo cannot silently disable a notice a visitor was meant to read.
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
}

/** The RESOLVED notice the shell composes: presented, with its tone decided. */
export interface ResolvedSiteNotice {
  /** Always `shown`: a resolved notice exists only when it is presented. */
  readonly mode: "shown";
  readonly tone: SiteNoticeTone;
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
  return Object.freeze({ mode: "shown" as const, tone: authored.tone ?? DEFAULT_SITE_NOTICE_TONE });
}

/**
 * The dictionary FIELDS an enabled notice must resolve for every locale it is presented in.
 *
 * Exported so the build-time lock names exactly the fields the shell reads, and so a future field cannot be
 * added to the markup while the lock keeps checking the old set: ONE list, read by both.
 */
export const SITE_NOTICE_COPY_FIELDS = ["title", "body"] as const;
