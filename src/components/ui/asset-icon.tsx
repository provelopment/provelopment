/**
 * The shared DECORATIVE asset-icon node — ONE implementation for every
 * configurable, supplementary graphic that is not the navigation-item icon
 * painted by `NavItem` (e.g. the sidebar disclosure control, and the
 * CONNECTIVITY ICON SEAM's Connect-page connectivity mark).
 *
 * Contract (identical to the P5-5/P6-1 icon contract every configured leaf
 * obeys):
 *  - `asset` is a plain `public/assets/` filename, resolved as `/assets/<name>`;
 *    the framework layer screens availability first (`availableIconName`), so an
 *    unavailable file arrives here as `""`;
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
  /** Plain asset filename ("" / omitted → no icon element). */
  readonly asset?: string;
  /** Sizing/marker contract class from the existing icon size convention. */
  readonly className?: string;
}

export function AssetIcon({ asset, className }: AssetIconProps) {
  if (!asset || asset === "") return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/assets/${asset}`} alt="" aria-hidden="true" className={className} />;
}
