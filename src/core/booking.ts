/**
 * Booking/calendar integration domain model (Phase H, Tier 1).
 *
 * Framework-free and provider-agnostic. The booking capability is deliberately
 * a STATIC EXTERNAL ACTION (a deep link to an external scheduler destination),
 * not an embedded third-party widget. Providers are replaceable without
 * touching core/application/UI code.
 *
 * The booking destination URL is PUBLIC configuration, not a secret. A future
 * interactive embed (Calendly inline, Google Calendar iframe, …) is a separate
 * client capability and is explicitly out of scope for this phase.
 *
 * Future calendar providers (external URL, Calendly, Google Calendar, Apple
 * Calendar, ICS, …) are added as adapters + a widened provider enum, never as
 * today's dependencies.
 */
export type BookingProvider = "external-url" | "none";

/** `features.booking` in `site.config.json` (validated by the config schema). */
export interface BookingFeatureConfig {
  readonly provider: BookingProvider;
  /** Public external booking destination (required when provider is `"external-url"`). */
  readonly url?: string;
}

/**
 * Thrown by the booking factory when a configured provider cannot be honoured
 * (for example `external-url` without a booking url). A configured-but-broken
 * booking must fail loudly — it must never silently degrade to the `none`
 * adapter, which would hide a deployment error.
 */
export class BookingMisconfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingMisconfigurationError";
  }
}
