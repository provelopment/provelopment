import type { BookingFeatureConfig } from "@/core/booking";

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
