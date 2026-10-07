import type { BookingFeatureConfig } from "@/core/booking";
import { SITE_NOTICE_COPY_FIELDS, type ResolvedSiteNotice } from "@/core/notice";

import type { Dictionary } from "./dictionary";

/**
 * F1 — THE BOOKING-LABEL INVARIANT, AS A PURE RULE (S3F2A2-D1)
 * ============================================================
 *
 * When booking is enabled via `features.booking.provider = "external-url"`, every configured
 * locale that can render the booking experience must have a non-empty localized `booking.book`
 * label. A missing label must not silently look like disabled booking.
 *
 * Booking absent (or disabled) is a valid state and skips the check entirely. Uses the ACTUAL
 * per-locale dictionaries (no default-locale fallback) so a single locale with a missing label is
 * caught and named.
 *
 * WHY THE RULE LIVES IN ITS OWN MODULE. It is a PURE function of its arguments — a dictionary map,
 * the feature configuration and the keys to check — and TWO bindings must apply the SAME rule: the
 * compatibility binding in `./index` (at module load, over the deployment it just loaded) and the
 * SpokeRuntimeContext-bound runtime dictionary access (`../runtime-dictionaries`, over ONE explicit
 * context). Keeping the function in `./index` would have forced the runtime access to import a
 * module whose own body loads a process-global registry, which is precisely the isolation
 * S3F2A2-D1 exists to provide. So the invariant is DEFINED HERE, ONCE: `./index` re-exports it, and
 * neither binding restates any part of it (the diagnostic wording above is the single accepted one).
 */
export function assertBookingLabelPresent(
  dictionaries: ReadonlyMap<string, Dictionary>,
  bookingFeature: BookingFeatureConfig | undefined,
  locales: readonly string[],
): void {
  if (bookingFeature?.provider !== "external-url") return;

  const missing = locales.filter((code) => {
    const label = dictionaries.get(code)?.booking?.book?.trim();
    return !label;
  });

  if (missing.length > 0) {
    throw new Error(
      `Booking is enabled (features.booking.provider = "external-url") but the following ` +
        `configured locale(s) are missing a non-empty localized "booking.book" label: ${missing.join(", ")}. ` +
        `Add "booking.book" to each config/i18n/<locale>.json, or disable booking, so an enabled ` +
        `booking CTA is never silently hidden.`,
    );
  }
}

/**
 * R1 — THE SITE-WIDE NOTICE COPY INVARIANT, AS A PURE RULE
 * =======================================================
 *
 * When a Spoke PRESENTS the site-wide notice (`siteNotice.mode: "shown"` in its `site.config.json`), every
 * locale that Spoke serves must resolve BOTH notice fields. A missing sentence must not render as an empty
 * highlighted band — a visitor would see the chrome of a message and none of its content.
 *
 * A notice that is absent or explicitly `hidden` is a valid state and skips the check entirely. The rule
 * reads the ACTUAL per-(Site, locale) dictionaries (no default-locale fallback), so a single locale with
 * missing copy is caught and NAMED — the diagnostic identifies the Spoke (or compatibility context), the
 * locale and the missing FIELD, because "some locale is missing something" is not actionable.
 *
 * It lives beside the booking lock, in the same pure module, for the same reason: TWO bindings apply the
 * same rules (the compatibility binding in `./index` and the SpokeRuntimeContext-bound access in
 * `../runtime-dictionaries`), and neither restates any part of them.
 *
 * @param dictionaries the effective dictionaries, keyed `<siteCode>/<localePath>`
 * @param notice the RESOLVED notice this Spoke presents, or `null`
 * @param context what to name in the diagnostic (the Spoke identity, or the compatibility binding)
 */
export function assertSiteNoticeCopyPresent(
  dictionaries: ReadonlyMap<string, Dictionary>,
  notice: ResolvedSiteNotice | null,
  context: string,
): void {
  if (notice === null) return;

  const missing: string[] = [];
  for (const [key, dictionary] of dictionaries) {
    const copy = dictionary.siteNotice;
    for (const field of SITE_NOTICE_COPY_FIELDS) {
      if (!copy?.[field]?.trim()) missing.push(`"${key}" is missing "siteNotice.${field}"`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `The site-wide notice is enabled ("siteNotice.mode": "shown") in ${context}, but the following ` +
        `served (Site, locale) dictionaries do not resolve its copy: ${missing.join("; ")}. ` +
        `Add "siteNotice": { "title": "…", "body": "…" } to each locale's dictionary (or to that Site's ` +
        `override), or set "siteNotice.mode" to "hidden" — an enabled notice must never publish blank ` +
        `copy.`,
    );
  }
}

/**
 * R1 — THE CROSS-SPOKE SWITCHER LABEL INVARIANT, AS A PURE RULE
 * ============================================================
 *
 * When an Installation authors a cross-Spoke switcher (`spokeSwitcher` in its manifest), every page of EVERY
 * Spoke presents that control — so every locale of every Spoke must be able to NAME it. The accessible name
 * is localized copy (`spokeSwitcher.label`), never a hard-coded English word, and a locale that cannot
 * resolve it must not render an unnamed control.
 *
 * `required` is FALSE for an Installation that authors no switcher, and then nothing is checked: a
 * deployment without the control is unchanged, and its dictionaries need no such section.
 *
 * @param dictionaries the effective dictionaries, keyed `<siteCode>/<localePath>`
 * @param required whether this Installation authors a cross-Spoke switcher at all
 * @param context what to name in the diagnostic (the Spoke identity, or the compatibility binding)
 */
export function assertSpokeSwitcherLabelPresent(
  dictionaries: ReadonlyMap<string, Dictionary>,
  required: boolean,
  context: string,
): void {
  if (!required) return;

  const missing: string[] = [];
  for (const [key, dictionary] of dictionaries) {
    if (!dictionary.spokeSwitcher?.label?.trim()) {
      missing.push(`"${key}" is missing "spokeSwitcher.label"`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `This Installation authors a cross-Spoke switcher ("spokeSwitcher" in its Spoke collection), so ` +
        `every Spoke presents that control and every served locale must name it — but ${context} does ` +
        `not resolve it for: ${missing.join("; ")}. Add "spokeSwitcher": { "label": "…" } to each ` +
        `locale's dictionary, so the control is never unnamed for a visitor (or a screen reader).`,
    );
  }
}
