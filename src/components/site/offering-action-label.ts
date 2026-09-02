import type { Dictionary } from "@/config/i18n/dictionary";
import type { OfferingActionIntent } from "@/core/offerings";

/**
 * Phase C — localized default label for an offering action intent.
 *
 * The label is applied at the COMPOSITION BOUNDARY (never in core): the pure
 * core resolver produces the link, the dictionary supplies the localized
 * text, and presentation components receive the already-resolved label.
 *
 *   - `book`     → `booking.book` (F1-guaranteed when the booking feature is
 *                  enabled; nullable here so a disabled booking CTA hides);
 *   - `contact`  → `connect.methods.message` (the Message-Us action label);
 *   - `external` → `offerings.externalCta`.
 *
 * Returns `null` when no label is configured — callers treat that as "no CTA
 * to render", never as a hardcoded fallback string.
 */
export function offeringActionLabel(
  intent: OfferingActionIntent,
  dictionary: Dictionary,
): string | null {
  switch (intent) {
    case "book":
      return dictionary.booking?.book?.trim() || null;
    case "contact":
      return dictionary.connect.methods?.message?.trim() || null;
    case "external":
      return dictionary.offerings.externalCta.trim() || null;
  }
}