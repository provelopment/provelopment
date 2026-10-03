import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import type { SpokeRuntimeContext } from "@/config/installation-runtime";
import { runtimeContextForCurrentRequest } from "@/config/spoke-request";

import { completePublicPath, type LocaleHints, type PublicDestination } from "./spoke-navigation";

/**
 * WHAT ONE PUBLIC REQUEST RESOLVES TO (FOUNDATION-MULTISITE-M17)
 * =============================================================
 *
 * THREE steps, shared by the public page, its layout, their metadata generators, the OpenGraph image and the
 * contact action — so they cannot disagree about which Spoke a request belongs to or what public path it
 * names:
 *
 *     the request boundary's selection  → `runtimeContextForCurrentRequest` (the ONLY selector) — or NOT FOUND
 *     the public segments               → completed INSIDE this Spoke (redirect) or resolved (destination)
 *     the shared composition            → the accepted M13/M14 renderer, unchanged
 *
 * Nothing here selects a Spoke by hostname (the boundary already did that), nothing reads a global
 * configuration, and nothing composes a URL that contains the retired internal prefix.
 */

/**
 * The Spoke answering THIS request — fail closed.
 *
 * `null` (multi-Spoke Installation with no selection, or a selection this Installation does not declare) is a
 * REFUSAL, not a fallback: there is no default Spoke, no first Spoke, and no hostname resolution here.
 */
export async function requestSpokeContext(): Promise<SpokeRuntimeContext> {
  const context = await runtimeContextForCurrentRequest();
  if (context === null) notFound();
  return context;
}

/**
 * The visitor's language hints, exactly the accepted negotiation inputs.
 *
 * A caller outside a request scope (a build-time or test-time invocation of the boundary) has no cookie store
 * and no request headers: that is a RESULT — no expressed preference — not a failure, so negotiation falls
 * back to the Spoke's own default exactly as it does for a visitor who expressed nothing.
 */
async function localeHints(): Promise<LocaleHints> {
  try {
    const requestHeaders = await headers();
    const cookieStore = await cookies();
    return {
      cookieLocale: cookieStore.get("NEXT_LOCALE")?.value,
      acceptLanguage: requestHeaders.get("accept-language") ?? undefined,
    };
  } catch {
    return {};
  }
}

/**
 * The PUBLIC destination of one request: an incomplete path is completed with a public 307 redirect (never
 * another Spoke, never an internal prefix); a complete one resolves to the context and its public segments.
 */
export async function requestPublicDestination(
  segments: readonly string[],
): Promise<{ readonly context: SpokeRuntimeContext; readonly destination: PublicDestination }> {
  const context = await requestSpokeContext();
  const completion = completePublicPath(context.siteConfig, segments, await localeHints());
  if ("redirectPath" in completion) redirect(completion.redirectPath);
  return { context, destination: completion.destination };
}
