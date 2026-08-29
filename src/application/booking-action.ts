/**
 * Port for resolving a booking action for the current locale (Phase H).
 *
 * Implementations live in `src/adapters/booking/*`. Each provider is
 * interchangeable. The resolver receives the active locale so a future
 * provider can return a localized booking destination or label; today's static
 * external action ignores it other than as future-proofing.
 *
 * A booking action is a STATIC EXTERNAL LINK — never an embedded widget. The
 * link label is resolved from the platform dictionary by the presentation
 * layer; the port carries only the destination and provider.
 */
export type BookingAction =
  | { readonly kind: "link"; readonly href: string; readonly provider: string }
  | { readonly kind: "none" };

export interface BookingActionContext {
  readonly locale: string;
}

export interface BookingActionResolver {
  resolve(context: BookingActionContext): BookingAction;
}
