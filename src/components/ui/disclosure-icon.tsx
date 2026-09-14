/**
 * P6-1 — the shared sidebar Show/Hide disclosure icon (one rendering path).
 *
 * Shows the sidebar open/close asset for EVERY disclosure control — the
 * desktop/tablet rail toggle (`Sidebar`) and the mobile drawer/overlay trigger
 * + close control (`ShellMobileNav`) — so the icon contract stays single:
 * a fixed-size, decoratively-hidden (`alt=""` + `aria-hidden`) asset beside
 * the label; the VISIBLE TEXT (or, for icon-only controls, the button's
 * `aria-label` fallback) is the accessible name.
 *
 * Asset contract (P5-5/P6-1): the caller supplies a plain `public/assets/`
 * filename already screened by the framework layer (`availableIconName`), so a
 * name present here is either a real file or a deliberate `""`/omission — the
 * DOM NEVER receives an unresolvable `<img>`.
 *
 * Implementation: the shared decorative asset-icon node (`AssetIcon`,
 * `./asset-icon`) — one rendering path for configurable supplementary artwork,
 * so this control and any other decorative asset node can never drift.
 */
import { AssetIcon } from "./asset-icon";

export interface DisclosureIconProps {
  /** Plain asset filename ("" / omitted → no icon element). */
  readonly asset?: string;
  /** Extra classes (sizing/marker contract, e.g. `ui-mobile-nav-icon`). */
  readonly className?: string;
}

export function DisclosureIcon({ asset, className }: DisclosureIconProps) {
  return <AssetIcon asset={asset} className={className} />;
}