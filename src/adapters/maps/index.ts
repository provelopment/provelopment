import type { MapsFeatureConfig } from "@/core/maps";
import type { DirectionLinkResolver } from "@/application/direction-link";
import { createGoogleMapsDirectionLinkResolver } from "./google-maps";
import { createNoneDirectionLinkResolver } from "./none";

export {
  GOOGLE_MAPS_PROVIDER,
  createGoogleMapsDirectionLinkResolver,
} from "./google-maps";
export { createNoneDirectionLinkResolver } from "./none";

/**
 * Resolves the configured maps provider to a concrete resolver.
 *
 * The factory only SELECTS an adapter; the adapter owns all provider
 * behaviour. A missing config block, or an explicit `provider: "none"`, is the
 * intentional disabled state (no directions link, site works normally).
 *
 * There is no misconfiguration path here: the schema restricts `provider` to
 * `"google" | "none"` and a keyless deep link has no environment/secret
 * requirement, so a valid config always honours itself.
 */
export function createDirectionLinkResolver(
  config: MapsFeatureConfig | undefined,
): DirectionLinkResolver {
  if (!config || config.provider === "none") {
    return createNoneDirectionLinkResolver();
  }
  return createGoogleMapsDirectionLinkResolver();
}
