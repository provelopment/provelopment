import type { CSSProperties } from "react";

/**
 * P12-HG — the optional DECORATIVE header band / structural graphic layer.
 *
 * THIS IS NOT THE HEADER IDENTITY MARK. The header brand link stays the
 * independent `site.assets.logo` (`logo-header` role) element inside
 * `SiteHeader`; a deployment may have a logo, a decorative band, both, or
 * neither. It is also NOT the page banner: `site.assets.banners` is a
 * PAGE-SPECIFIC banner map rendered ABOVE the whole shell (`PageBanner`),
 * while this role is GLOBAL and belongs TO the header. Neither seam is
 * consumed, moved or altered here.
 *
 * WHY THE BAND IS THE HEADER'S OWN BACKGROUND — and not a positioned child
 * layer like `.ui-page-background` / `.ui-footer-graphic`:
 *
 *  - The header hosts the shell's mobile navigation, whose `Drawer` /
 *    `OverlayNavigation` panels are `position: fixed` with `z-index: 40/50`
 *    (globals.css). ANY stacking context on `<header>` (or on its content
 *    container) would confine those panels to it — the `isolation: isolate`
 *    technique the footer safely uses is NOT transferable here.
 *  - A positioned child layer with `z-index: -1` would additionally be painted
 *    UNDER the header's own `background-color`, so it would vanish entirely
 *    under the shipped `data-ui-header="elevated"` treatment.
 *  - A CSS `background-image` on the header element needs no stacking context,
 *    no `position` and no extra DOM, because the painting model already yields
 *    exactly the required order: the header's own `background-color`, then the
 *    band, then EVERY in-flow header descendant (logo, navigation, switchers,
 *    mobile trigger). It is therefore correct for all `data-ui-header`
 *    presentation variants, and it can never add layout height, reserve space,
 *    shift the banner/main, or introduce horizontal overflow.
 *
 * DECORATIVE ONLY — a CSS background carries no semantics by construction:
 *  - it contributes NO DOM node, no accessible name, no `role`/`alt` and no
 *    reading-order entry, so it can never appear in the accessibility tree;
 *  - it cannot be focused, hovered or clicked, and it can never intercept a
 *    pointer event or a text selection — the header's links and controls stay
 *    fully interactive. (No `pointer-events` override is applied: disabling
 *    pointer events on the header would disable its own logo and navigation.)
 *
 * NO ARTWORK ENGINEERING: the engine applies no colour, opacity, blend mode,
 * filter, mask or animation of its own — the approved artwork carries its own
 * final appearance and is displayed faithfully. Only the generic
 * scaling/positioning one asset needs to survive the responsive header is
 * declared in `globals.css`.
 */

/** The header attribute marking a configured decorative band (test/observability hook). */
export const HEADER_GRAPHIC_ATTRIBUTE = "data-ui-header-graphic";

/** The inline custom property carrying the resolved band URL into the CSS layer. */
export const HEADER_GRAPHIC_STYLE_PROPERTY = "--ui-header-graphic" as const;

/** The decorative-band attributes to spread onto the shell `<header>`. */
export interface HeaderGraphicBandProps {
  readonly "data-ui-header-graphic"?: "true";
  readonly style?: CSSProperties;
}

/**
 * Builds the decorative band attributes for the shell `<header>`: the marker
 * attribute plus the resolved same-origin path as an inline custom property, or
 * an EMPTY object when nothing is configured / the configured file is missing.
 *
 * An unconfigured (or configured-but-missing) role therefore emits no
 * attribute, no style and no CSS at all, so the header stays byte-identical to
 * the pre-P12-HG header.
 *
 * All presentation (scaling, cropping, anchoring) lives in `globals.css`, per
 * the framework convention that components hand values over as custom
 * properties instead of declaring styles inline.
 */
export function headerGraphicBandProps(src: string | undefined): HeaderGraphicBandProps {
  if (!src) return {};
  return {
    "data-ui-header-graphic": "true",
    // Quoted like `PageBackground` so any path is a valid CSS url() token.
    style: { [HEADER_GRAPHIC_STYLE_PROPERTY]: `url(${JSON.stringify(src)})` } as CSSProperties,
  };
}
