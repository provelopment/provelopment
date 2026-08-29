import {
  BookingMisconfigurationError,
  type BookingFeatureConfig,
} from "@/core/booking";
import type { BookingActionResolver } from "@/application/booking-action";
import { createExternalUrlBookingActionResolver } from "./external-url";
import { createNoneBookingActionResolver } from "./none";

export { BookingMisconfigurationError } from "@/core/booking";
export {
  BOOKING_PROVIDER,
  createExternalUrlBookingActionResolver,
} from "./external-url";
export { createNoneBookingActionResolver } from "./none";

/**
 * Resolves the configured booking provider to a concrete resolver.
 *
 * The factory only SELECTS an adapter; the adapter owns all provider behaviour.
 * A missing config block, or an explicit `provider: "none"`, is the intentional
 * disabled state (no booking CTA, site works normally).
 *
 * A CONFIGURED-but-broken provider must fail loudly, never silently degrade to
 * `none`: `provider: "external-url"` without a booking url throws
 * `BookingMisconfigurationError`. (The config schema additionally rejects this
 * at build time; this factory throw is the defensive runtime contract and the
 * unit-tested path.)
 */
export function createBookingActionResolver(
  config: BookingFeatureConfig | undefined,
): BookingActionResolver {
  if (!config || config.provider === "none") {
    return createNoneBookingActionResolver();
  }

  const url = config.url?.trim();
  if (!url) {
    throw new BookingMisconfigurationError(
      'features.booking.provider is "external-url" but no booking url is set. ' +
        "Add the public booking destination as features.booking.url in site.config.json, " +
        'or set the provider to "none". The booking action will not render a broken link.',
    );
  }

  return createExternalUrlBookingActionResolver(url);
}
