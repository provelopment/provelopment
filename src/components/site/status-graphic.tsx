"use client";

import { useStatusGraphic } from "./status-graphic-context";

/**
 * P12-SG — the optional DECORATIVE status graphic for the error and not-found
 * surfaces.
 *
 * ONE ROLE SERVES BOTH SURFACES. The audit established that
 * `[locale]/error.tsx` and `[locale]/not-found.tsx` render the SAME status
 * frame: a `<Section className="py-24 text-center">` containing an `h1`
 * (`text-4xl font-bold tracking-tight`), a `p` (`mt-4 text-muted-foreground`)
 * and an action area — identical geometry, identical centered composition,
 * identical text hierarchy. One replaceable graphic therefore serves both
 * truthfully, so this is ONE role (`site.assets.statusGraphic`) and NOT two.
 *
 * THIS IS NOT AN ERROR ICON AND NOT SEMANTIC STATUS COMMUNICATION. The status
 * heading, the supporting message and the retry/navigation controls remain the
 * complete, authoritative expression of the state; the page is fully
 * understandable and operable with NO graphic at all. Nothing is ever moved out
 * of the text layer into the artwork.
 *
 * WHY IT IS TRANSPORTED RATHER THAN RESOLVED HERE: this is a Client Component
 * (so it can be rendered by the client-side `error.tsx` boundary as well as by
 * the server-rendered `not-found.tsx`), and the asset resolver reads
 * `node:fs`. The resolved asset therefore arrives through
 * `StatusGraphicProvider` from the `[locale]` layout — the same transport the
 * error copy uses. See `./status-graphic-context.tsx`.
 *
 * DECORATIVE ONLY:
 *  - `aria-hidden="true"` on the wrapper and `alt=""` on the image, so the
 *    graphic contributes NO accessible name, NO `role` and NO reading-order
 *    entry — it can never be mistaken for the status of the page;
 *  - no interactive element and no `tabindex`, so it is never focusable;
 *  - `pointer-events: none` (see `.ui-status-graphic` in globals.css), so it can
 *    never capture a click, a text selection or focus — the retry button and the
 *    navigation links stay fully clickable.
 *
 * STRUCTURAL BEHAVIOUR: the box is IN FLOW, centred, immediately above the
 * status heading, and deliberately NOT absolutely positioned — a status page has
 * no reserved surface to layer onto, and an out-of-flow layer would either be
 * clipped by the page frame or float over the heading. Because the box is a
 * plain block at the START of the existing frame, the `h1`/`p`/actions keep
 * their exact order, spacing and hierarchy.
 *
 * NO UNPREDICTABLE LAYOUT: the intrinsic `width`/`height` resolved on the server
 * are passed as HTML attributes, so the browser reserves the correct
 * aspect-ratio box before the file loads (no layout shift) and the artwork is
 * displayed at its NATURAL size, only ever scaling DOWN to fit narrow viewports
 * — it is never enlarged merely to fill the page, never cropped and never
 * distorted. The engine applies NO colour, opacity, filter or blend mode: the
 * approved artwork carries its own final appearance. Static only — no animation,
 * no parallax, no observers.
 *
 * When nothing is configured (or the configured file is missing) this component
 * renders `null`, so an unconfigured deployment gains no DOM at all and both
 * status pages are byte-identical to their pre-P12-SG output.
 */
export function StatusGraphic() {
  const asset = useStatusGraphic();
  if (!asset) return null;

  return (
    <div className="ui-status-graphic" aria-hidden="true">
      {/* Deliberate plain <img>: `site.assets.*` are adopter-owned absolute URLs
          re-derived to a same-origin path (see `assetPathFromUrl`), outside the
          Next Image optimizer's allow-list requirement. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.src}
        alt=""
        className="ui-status-graphic-image"
        width={asset.width}
        height={asset.height}
      />
    </div>
  );
}
