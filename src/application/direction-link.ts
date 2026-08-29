import type { BusinessLocation } from "@/core/business";

/**
 * Port for resolving a directions action from an ALREADY locale-resolved
 * business location (Phase H).
 *
 * Implementations live in `src/adapters/maps/*`. Each provider is
 * interchangeable: the consumer only ever sees this result shape, never a
 * provider URL or provider-specific detail. A provider is expected to produce
 * a deep link from the location's public address/geo — no API key required.
 */
export type DirectionsAction =
  | { readonly kind: "link"; readonly href: string; readonly provider: string }
  | { readonly kind: "none" };

export interface DirectionLinkResolver {
  resolve(location: BusinessLocation): DirectionsAction;
}
