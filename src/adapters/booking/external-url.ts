import type { BookingActionResolver } from "@/application/booking-action";

export const BOOKING_PROVIDER = "external-url";

/**
 * Static external booking action adapter: deep-links to the adopter's public
 * booking destination (e.g. a Calendly/public booking page). No booking API,
 * OAuth, account credentials, scheduling backend, or widget SDK — this phase
 * intentionally establishes only the static-action seam.
 */
export function createExternalUrlBookingActionResolver(url: string): BookingActionResolver {
  return {
    resolve: () => ({ kind: "link", href: url, provider: BOOKING_PROVIDER }),
  };
}
