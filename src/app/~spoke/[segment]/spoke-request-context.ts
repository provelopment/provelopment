import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { INTERNAL_SPOKE_HEADER } from "@/config/spoke-internal-namespace";
import { runtimeContextForSegment } from "@/config/spoke-request";
import type { SpokeRuntimeContext } from "@/config/installation-runtime";

import { completePublicPath, type LocaleHints, type PublicDestination } from "./spoke-navigation";

/**
 * WHAT ONE INTERNAL SPOKE REQUEST RESOLVES TO (FOUNDATION-MULTISITE-M16)
 * ====================================================================
 *
 * THREE steps, shared by the internal route's layout, page, metadata generators and OpenGraph image — so
 * they cannot disagree about which Spoke a request belongs to or what public path it names:
 *
 *     the runtime segment   → `runtimeContextForSegment` (the ONLY selector) — or NOT FOUND
 *     the rewrite marker    → required; a request that was not rewritten renders nothing
 *     the public segments   → completed INSIDE this Spoke (redirect) or resolved (destination)
 *
 * Nothing here selects a Spoke by hostname (the boundary already did that), nothing reads a global
 * configuration, and nothing composes a URL that contains the internal prefix.
 */
export async function spokeRequestContext(segment: string): Promise<SpokeRuntimeContext> {
  const requestHeaders = await headers();
  if (requestHeaders.get(INTERNAL_SPOKE_HEADER) !== segment) notFound();

  const context = runtimeContextForSegment(segment);
  if (context === null) notFound();
  return context;
}

/** The visitor's language hints, exactly the accepted negotiation inputs. */
async function localeHints(): Promise<LocaleHints> {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  return {
    cookieLocale: cookieStore.get("NEXT_LOCALE")?.value,
    acceptLanguage: requestHeaders.get("accept-language") ?? undefined,
  };
}

/**
 * The PUBLIC destination of one internal request: an incomplete path is completed with a public 307
 * redirect (never another Spoke, never the internal prefix); a complete one resolves.
 */
export async function spokePublicDestination(
  segment: string,
  segments: readonly string[],
): Promise<{ readonly context: SpokeRuntimeContext; readonly destination: PublicDestination }> {
  const context = await spokeRequestContext(segment);
  const completion = completePublicPath(context.siteConfig, segments, await localeHints());
  if ("redirectPath" in completion) redirect(completion.redirectPath);
  return { context, destination: completion.destination };
}
