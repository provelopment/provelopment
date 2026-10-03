import type { Metadata } from "next";

import {
  pageForContext,
  pageMetadataForContext,
  spokeServerComposition,
  staticParamsForContext,
} from "@/app/[...segments]/server-composition";
import { hostRoutingForBuild } from "@/config/spoke-routing";

import { spokePublicDestination } from "../spoke-request-context";

/**
 * THE INTERNAL SPOKE PAGE — the ONE page renderer of a hostname-selected Spoke (FOUNDATION-MULTISITE-M16)
 * =====================================================================================================
 *
 * The parameters are the PUBLIC path a visitor actually requested (`<site>/<locale>/<route>`), handed here
 * by the request boundary's rewrite — the runtime segment is the PARENT segment, not part of them — so every
 * URL the composition emits is the public URL and the internal prefix cannot appear anywhere in a document.
 *
 * The page is composed by the SAME shared composition the public route uses, from the context the parent
 * layout selected by runtime segment alone. There is no second renderer and no second inventory.
 *
 * STATIC PARAMETERS (M16). Two Spokes may legitimately serve the SAME public path (`alpha/ww/en/about` and
 * `beta/ww/en/about` are different HOSTS, not different URLs), so the internal inventory is the cartesian
 * product of
 *
 *     runtime segment  ×  that context's Site  ×  that Site's locale  ×  that context's discovered route
 *
 * built by the accepted per-context authority (`staticParamsForContext`) for EVERY declared context — which
 * is why two Spokes cannot collide internally and no public URL ever carries a segment.
 */
interface SpokePageProps {
  readonly params: Promise<{ readonly segment: string; readonly segments?: string[] }>;
}

export async function generateStaticParams(): Promise<
  { segment: string; segments: string[] }[]
> {
  const routing = hostRoutingForBuild();

  const params: { segment: string; segments: string[] }[] = [];
  for (const spoke of routing.spokes) {
    // One context per declared Spoke: composed from ITS identity, never from a "current" build context.
    const { runtimeContextForSegment } = await import("@/config/spoke-request");
    const context = runtimeContextForSegment(spoke.runtimeSegment);
    if (context === null) continue;

    for (const page of await staticParamsForContext(spokeServerComposition(context))) {
      params.push({ segment: spoke.runtimeSegment, segments: page.segments });
    }
  }

  return params;
}

export async function generateMetadata({ params }: SpokePageProps): Promise<Metadata> {
  const { segment, segments } = await params;
  const { context, destination } = await spokePublicDestination(segment, segments ?? []);
  return pageMetadataForContext(spokeServerComposition(context), destination.segments as string[]);
}

export default async function SpokePage({ params }: SpokePageProps) {
  const { segment, segments } = await params;
  const { context, destination } = await spokePublicDestination(segment, segments ?? []);
  return pageForContext(spokeServerComposition(context), destination.segments as string[]);
}
