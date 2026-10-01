import { NavItem, type NavItemModel } from "./nav-item";

/**
 * BottomNavigation (UI-03 — Shared UI Primitives).
 *
 * A narrow-viewport primary navigation bar (roadmap §15 "bottom-bar"/"bottom
 * navigation"). It is a SERVER component over the same NavItem primitive:
 * landmark `<nav aria-label>` + list, `aria-current="page"` on the active
 * item, built at ≥44px touch-target spacing via tokens.
 *
 * No breakpoint/media-query logic lives here — the shell engine (UI-04)
 * decides WHEN a bottom bar is the appropriate composition. Props-driven,
 * presentation-agnostic, serializable (no callbacks).
 *
 * LAYOUT OWNERSHIP (FOUNDATION-DEFECT-NAV1A). The bar's rows are the `<li>`
 * children of the `<ul>`, so the LIST owns their flow and wrapping. The
 * composer supplies that through `listClassName`; `className` remains the
 * LANDMARK box around it (this component renders `<nav>` → `<ul>` → items, so a
 * layout utility on the `<nav>` can only ever lay out that single list child —
 * which is how the bar came to stack its links one per row). Nothing here
 * changes for a consumer that passes neither.
 */
export interface BottomNavigationProps {
  /** Accessible label for the landmark. */
  readonly label: string;
  /** Items (limited to a small bar set by the composer). */
  readonly items: readonly NavItemModel[];
  /** Class for the landmark box (outer `<nav>`). Presentation-neutral by default. */
  readonly className?: string;
  /**
   * Class for the list that OWNS the item rows (the `<ul>` holding the `<li>`
   * children). The horizontal flow, the wrapping and the inter-link gap belong
   * here — never on the `<nav>`.
   */
  readonly listClassName?: string;
  readonly linkClassName?: string;
}

export function BottomNavigation({ label, items, className, listClassName, linkClassName }: BottomNavigationProps) {
  return (
    <nav aria-label={label} className={className}>
      <ul className={listClassName}>
        {items.map((item) => (
          <NavItem key={`${item.key ?? item.href}:${item.label}`} item={item} className={linkClassName} />
        ))}
      </ul>
    </nav>
  );
}