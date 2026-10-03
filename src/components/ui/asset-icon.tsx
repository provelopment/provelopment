/**
 * The shared DECORATIVE asset-icon node — ONE implementation for every
 * configurable, supplementary graphic that is not the navigation-item icon
 * painted by `NavItem` (e.g. the sidebar disclosure control, and the
 * CONNECTIVITY ICON SEAM's Connect-page connectivity mark).
 *
 * Contract (identical to the P5-5/P6-1 icon contract every configured leaf
 * obeys):
 *  - `asset` is either a plain `public/assets/` filename (resolved here as
 *    `/assets/<name>`) OR a same-origin asset path the framework layer already
 *    resolved (`availableIconUrl` / `availableFooterGraphicPath` — S3F1), which
 *    is rendered VERBATIM. The second form exists because a generated runtime
 *    file is not always at `/assets/<name>`: a Spoke's own replaceable artwork is
 *    served from that Spoke's namespace (`/spokes/<segment>/assets/<name>`) while
 *    the platform library stays at `/assets/<name>`, and only the framework layer
 *    (which sees the filesystem) can say which. Either way the framework layer
 *    screens availability first, so an unavailable file arrives here as `""`;
 *  - `""`/absent → NO element at all (never a broken `<img>`) — the surrounding
 *    authoritative text (label, method name, control label) carries the meaning;
 *  - ALWAYS decorative: `alt=""` + `aria-hidden="true"`, never focusable, no
 *    accessible name of its own, no redundant "GitHub GitHub" announcement;
 *  - the caller supplies the sizing class from the existing size contract
 *    (`.ui-nav-item-icon` = 1em inline, `inline-flex` + `gap` alignment), so
 *    intrinsic dimensions can never overflow layout;
 *  - the engine never recolours, filters, crops or animates the file: a
 *    monochrome/`currentColor` asset and a self-contained full-colour mark are
 *    both served byte-for-byte (no per-platform styling).
 *
 * Deliberate plain `<img>`: adopters can drop in any asset format without the
 * Next Image optimizer/SVG restrictions.
 */
export interface AssetIconProps {
  /** Plain asset filename, or a same-origin asset path already resolved ("", omitted → no icon). */
  readonly asset?: string;
  /** Sizing/marker contract class from the existing icon size convention. */
  readonly className?: string;
}

/**
 * The ONE filename → URL projection, and the ONE place a RESOLVED path is passed through unchanged.
 * Kept as a shared function so the sidebar, the mobile navigation and the connectivity mark can never
 * disagree about it.
 */
export function assetIconSrc(asset: string | undefined): string | undefined {
  if (!asset || asset === "") return undefined;
  return asset.startsWith("/") ? asset : `/assets/${asset}`;
}

export function AssetIcon({ asset, className }: AssetIconProps) {
  const src = assetIconSrc(asset);
  if (src === undefined) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden="true" className={className} />;
}
