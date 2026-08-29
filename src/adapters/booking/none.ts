import type { BookingActionResolver } from "@/application/booking-action";

/**
 * Explicit disabled adapter. Used when booking is not configured or provider is
 * `"none"` — the intentional off state. Always returns `{ kind: "none" }`.
 */
export function createNoneBookingActionResolver(): BookingActionResolver {
  return {
    resolve: () => ({ kind: "none" }),
  };
}
