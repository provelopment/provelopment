/**
 * Analytics integration domain (Phase I hardening).
 *
 * Deliberately minimal by design: performs no provider selection and
 * introduces no analytics abstraction or megaport. This error exists so a
 * configured but unhonorable analytics provider fails loudly at the adapter
 * factory with a typed domain error (parity with the booking/contact
 * contract) instead of silently mounting nothing.
 */
export class AnalyticsMisconfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsMisconfigurationError";
  }
}