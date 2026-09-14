import type { ReactElement } from "react";

interface FooterGraphicProps {
  /**
   * The resolved same-origin path of the configured `footer-graphic` role, or
   * `undefined` when nothing is configured / the configured file is missing.
   */
  readonly src: string | undefined;
}

/**
 * P12-FG — the optional DECORATIVE footer graphic / watermark layer.
 *
 * THIS IS NOT THE FOOTER IDENTITY MARK. The footer logo stays the independent
 * `site.assets.logoFooter` (`logo-footer` role) element inside `SiteFooter`; a
 * deployment may have a logo, a decorative graphic, both, or neither.
 *
 * DECORATIVE ONLY — the layer must never carry meaning:
 *  - `aria-hidden="true"` and NO accessible name / `role` / `alt` / text, so it
 *    contributes no semantics and never appears in the accessibility tree;
 *  - no interactive element, no `tabindex`, so it is never focusable;
 *  - `pointer-events: none` (see `.ui-footer-graphic` in globals.css), so it can
 *    never capture a click, a text selection or focus — footer links stay fully
 *    clickable.
 *
 * NON-STRUCTURAL — it is `position: absolute; inset: 0; z-index: -1` inside the
 * footer, which carries `relative isolate` (globals.css / site-footer.tsx). The
 * `relative` is the positioning anchor and `isolation: isolate` makes the footer
 * its own stacking context, so the layer is scoped to the footer box: it paints
 * above the footer's own background and always BEHIND the footer's in-flow
 * content. Neither utility adds padding, margin, reserved height or horizontal
 * overflow (both are flow-neutral), so the footer's layout is unchanged. Nothing
 * is rendered at all when `src` is absent, so an unconfigured deployment gains
 * no DOM at all.
 *
 * The graphic is applied as a static CSS `background-image` (a decorative layer,
 * so it bypasses the Next image optimizer — exactly as the P12-BG page
 * background does). No colour, opacity or blend mode is applied by the engine;
 * the approved artwork itself carries the intended subtlety and is never
 * recoloured here. Static only — no animation, no parallax, no motion.
 */
export function FooterGraphic({ src }: FooterGraphicProps): ReactElement | null {
  if (!src) return null;
  return <div className="ui-footer-graphic" aria-hidden="true" style={{ backgroundImage: `url(${src})` }} />;
}
