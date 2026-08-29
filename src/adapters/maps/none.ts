import type { DirectionLinkResolver } from "@/application/direction-link";

/**
 * Explicit disabled adapter. Used when maps is not configured or provider is
 * `"none"` — the intentional off state. Always returns `{ kind: "none" }`.
 */
export function createNoneDirectionLinkResolver(): DirectionLinkResolver {
  return {
    resolve: () => ({ kind: "none" }),
  };
}
