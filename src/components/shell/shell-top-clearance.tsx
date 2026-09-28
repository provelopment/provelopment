"use client";

import { useEffect } from "react";

/**
 * KEEPS THE FRAGMENT-TARGET CLEARANCE IN STEP WITH THE PERSISTENT TOP REGION (R1C)
 * ===============================================================================
 *
 * `html { scroll-padding-top: var(--ui-shell-top-clearance) }` is what stops a fragment target —
 * the skip link's `#main`, any in-page anchor — from landing BENEATH the sticky top region.
 *
 * The stylesheet ships a static allowance for that clearance, but the region's real height is not
 * static: it grows with the chrome a deployment actually configures, because a row of visitor
 * controls (Site / Location / Language / Layout) wraps at narrow widths and the translated labels
 * differ in length. A fixed number is therefore either too small — a target hides under the header,
 * which is the defect this fixes — or needlessly large.
 *
 * This measures the region and publishes its exact height as the SAME single custom property, so
 * nothing else changes: the media-range rules that REMOVE the clearance where the top region is not
 * persistent still win, and with no top region (or before hydration) the stylesheet's allowance is
 * what applies. No Germany-specific rule exists anywhere — the clearance follows whatever chrome
 * the deployment serves.
 */
export function ShellTopClearance() {
  useEffect(() => {
    const region = document.querySelector<HTMLElement>(".ui-shell-top");
    if (region === null) return undefined;

    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty(
        "--ui-shell-top-clearance",
        `${Math.ceil(region.getBoundingClientRect().height)}px`,
      );
    };

    apply();
    // The height changes when the chrome re-wraps (viewport width, a longer translated label), so
    // it is re-measured rather than computed once.
    const observer = new ResizeObserver(apply);
    observer.observe(region);
    window.addEventListener("resize", apply);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--ui-shell-top-clearance");
    };
  }, []);

  return null;
}
