"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

/**
 * PageBanner (P6-3B — page banner, replacing the former `TitleBar`/`logo-title`
 * concept; P6-3C — responsive scaling + centering contract).
 *
 * A per-PAGE banner image rendered ABOVE the header (its own region, never part
 * of the header). Contract:
 *  - CONFIGURED-ONLY: the server resolves `site.assets.banners` (a page-slug →
 *    absolute-URL record) to composable assets for entries whose file actually
 *    exists under `public/assets/`, and passes that map here. A page with no
 *    entry renders NOTHING — no placeholder, no reserved blank block, and never
 *    another page's banner.
 *  - ALWAYS CENTERED: the graphic is horizontally centered within the available
 *    page width in every case (narrower than, equal to, or wider than the
 *    available width).
 *  - NEVER OVERFLOWS: a graphic wider than the available width scales DOWN
 *    proportionally until it fits; horizontal overflow is impossible.
 *  - BOUNDED UPSCALE: the server reads the graphic's intrinsic size, so the
 *    effective display width is `min(available page width, 1.5 × natural width)`
 *    — the image fills the page up to 1.5× its own size and stops there. It is
 *    never enlarged merely to fill the page. When the intrinsic size cannot be
 *    read, the banner never upscales at all (natural size at most).
 *  - ASPECT RATIO PRESERVED: width and height always scale proportionally from
 *    the source (never cropped, never distorted).
 *  - NO ARTIFICIAL HEIGHT: the rendered height derives from the scaled graphic's
 *    intrinsic ratio — no fixed height, no vertical padding, no crop.
 *  - NO STRUCTURAL PADDING: no padding/margin/border/shadow/radius around the
 *    image (any whitespace belongs inside the artwork).
 *  - DECORATIVE: `alt=""` — the header renders the configured header brand mark
 *    with the real brand accessible name, so the banner must not duplicate it.
 *  - Client component because the current page is only known at render time
 *    (`usePathname`); the banner MAP itself is computed on the server
 *    (`node:fs` availability + intrinsic-size reads never reach the browser).
 */
export interface BannerAsset {
  /** Same-origin banner path (only entries whose file exists). */
  readonly src: string;
  /** Intrinsic width in CSS pixels, when the header could be decoded. */
  readonly width?: number;
  /** Intrinsic height in CSS pixels, when the header could be decoded. */
  readonly height?: number;
}

export interface PageBannerProps {
  /** Page slug → composable banner asset (only entries whose file exists). */
  readonly banners: Readonly<Record<string, BannerAsset>>;
  /** Configured operating-region ids (skipped when deriving the page slug). */
  readonly regionIds: readonly string[];
}

/**
 * The permitted maximum display width for a graphic of `naturalWidth`: 1.5×
 * its own size, at (sub-pixel) precision. Exported so the sizing contract is
 * directly testable without a browser.
 */
export function bannerMaxWidth(naturalWidth: number): number {
  return Math.round(naturalWidth * 1.5 * 100) / 100;
}

/**
 * Derives the PAGE slug from a pathname: drop the leading locale segment, then
 * an optional operating-region segment, then take the first remaining segment
 * (`""` → the home page). E.g. `/en`, `/en/berlin`, `/en/berlin/about` →
 * `home`/`home`/`about`.
 */
export function pageSlugFromPathname(pathname: string, regionIds: readonly string[]): string {
  const segments = pathname.split("/").filter(Boolean);
  const rest = segments.slice(1); // segments[0] is the locale
  const page = regionIds.includes(rest[0] ?? "") ? rest.slice(1) : rest;
  return page[0] ?? "home";
}

export function PageBanner({ banners, regionIds }: PageBannerProps) {
  const pathname = usePathname() ?? "";
  const slug = pageSlugFromPathname(pathname, regionIds);
  const banner = banners[slug];
  if (!banner?.src) return null;
  // P6-3C — a readable intrinsic width opts the image into the bounded-upscale
  // presentation (fill up to 1.5×); without it the CSS keeps the graphic at its
  // natural size, so the banner can never be enlarged merely to fill the page.
  const sized = banner.width !== undefined && banner.width > 0;
  const style = sized
    ? ({ "--ui-banner-max-width": `${bannerMaxWidth(banner.width as number)}px` } as CSSProperties)
    : undefined;

  return (
    <div className="ui-page-banner">
      {/* Deliberate plain <img>: `site.assets.*` are adopter-owned absolute URLs
          re-derived to a same-origin path (see `assetPathFromUrl`), outside the
          Next Image optimizer's allow-list requirement. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={banner.src}
        alt=""
        className="ui-page-banner-image"
        width={banner.width}
        height={banner.height}
        data-banner-sized={sized ? "true" : undefined}
        style={style}
      />
    </div>
  );
}
