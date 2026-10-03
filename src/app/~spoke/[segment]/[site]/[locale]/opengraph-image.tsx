import { ImageResponse } from "next/og";

import { openGraphImageModelForContext } from "@/app/[site]/[locale]/opengraph-model";
import {
  OPEN_GRAPH_IMAGE_CONTENT_TYPE,
  OPEN_GRAPH_IMAGE_SIZE,
  openGraphImageElement,
} from "@/app/[site]/[locale]/opengraph-image-view";

import { spokeRequestContext } from "../../spoke-request-context";

/**
 * THE PER-HOST OPENGRAPH IMAGE — the internal image route (FOUNDATION-MULTISITE-M16)
 * ================================================================================
 *
 * A PUBLIC request for `/<site>/<locale>/opengraph-image` is dispatched by hostname exactly like a page, so
 * this route renders the image of the Spoke THAT HOST selected:
 *
 *     alpha.example/ww/en/opengraph-image   →   Alpha's identity, Alpha's words, Alpha's origin
 *     beta.example/ww/en/opengraph-image    →   Beta's, from Beta's own context
 *
 * The public URL is unchanged (the rewrite is internal), the model is the SAME context-bound model the
 * established boundary uses, and the view is the SAME view — this file contributes no style, no size and no
 * word of its own. Two Spokes may serve the same public pathname and still produce different images, because
 * each is composed from the context its own host resolved to.
 */
export const size = OPEN_GRAPH_IMAGE_SIZE;
export const contentType = OPEN_GRAPH_IMAGE_CONTENT_TYPE;

interface SpokeOpengraphImageProps {
  readonly params: Promise<{
    readonly segment: string;
    readonly site: string;
    readonly locale: string;
  }>;
}

export default async function SpokeOpengraphImage({ params }: SpokeOpengraphImageProps) {
  const { segment, site, locale } = await params;
  const context = await spokeRequestContext(segment);
  const model = openGraphImageModelForContext(context, site, locale);

  return new ImageResponse(openGraphImageElement(model), size);
}
