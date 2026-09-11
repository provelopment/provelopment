"use client";

import { usePathname } from "next/navigation";

/**
 * PageBanner (P6-3B — page banner, replacing the former `TitleBar`/`logo-title`
 * concept).
 *
 * A per-PAGE banner image rendered ABOVE the header (its own region, never part
 * of the header). Contract:
 *  - CONFIGURED-ONLY: the server resolves `site.assets.banners` (a page-slug →
 *    absolute-URL record) to same-origin paths for entries whose file actually
 *    exists under `public/assets/`, and passes that map here. A page with no
 *    entry renders NOTHING — no placeholder, no reserved blank block, and never
 *    another page's banner.
 *  - INTRINSIC HEIGHT: the graphic occupies the full available page width with
 *    `height: auto`, so the rendered height follows the supplied graphic's
 *    aspect ratio (no fixed height, so a narrow/wide/tall banner all work).
 *  - NO STRUCTURAL PADDING: the banner has no padding/margin/border/shadow/
 *    radius around the image (any whitespace belongs inside the artwork).
 *  - DECORATIVE: `alt=""` — the header renders the configured header brand mark
 *    with the real brand accessible name, so the banner must not duplicate it.
 *  - Client component because the current page is only known at render time
 *    (`usePathname`); the banner MAP itself is computed on the server
 *    (`node:fs` availability check never reaches the browser).
 */
export interface PageBannerProps {
  /** Page slug → same-origin banner path (only entries whose file exists). */
  readonly banners: Readonly<Record<string, string>>;
  /** Configured operating-region ids (skipped when deriving the page slug). */
  readonly regionIds: readonly string[];
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
  const src = banners[slug];
  if (!src) return null;

  return (
    <div className="ui-page-banner">
      {/* Deliberate plain <img>: `site.assets.*` are adopter-owned absolute URLs
          re-derived to a same-origin path (see `assetPathFromUrl`), outside the
          Next Image optimizer's allow-list requirement. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="ui-page-banner-image" />
    </div>
  );
}
