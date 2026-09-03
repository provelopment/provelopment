import Link from "next/link";

/**
 * NavItem (UI-03 — Shared UI Primitives).
 *
 * GENUINELY SERVER-SAFE navigation item: purely data-driven and serializable.
 * It deliberately accepts NO callback/event-handler props and cannot render a
 * `<button>` wrapper — an interactive client action is a separate future
 * primitive/contract, never smuggled into NavItem.
 *
 * Renders a single `<li>` containing either a Next `<Link>` (internal href) or
 * a plain anchor (external). Active state is conveyed via `aria-current="page"`
 * (styling-only active treatment is prohibited); external links open in a new
 * tab with `rel="noreferrer"` and optionally carry the demo badge.
 */
export interface NavItemModel {
  /** Visible label. */
  readonly label: string;
  /** Internal route (e.g. `/about`) or absolute external href. */
  readonly href: string;
  /** Whether this item is the current page (→ `aria-current="page"`). */
  readonly active?: boolean;
  /** Treat the link as external (new-tab + rel=noreferrer). */
  readonly external?: boolean;
  /** Optional decorative chip rendered beside the label. */
  readonly badge?: string;
  /** Stable React key (defaults to href). */
  readonly key?: string;
  /** CTA prominence variant (adds the CTA class — pure visual intent). */
  readonly variant?: "standard" | "cta";
}

export interface NavItemProps {
  readonly item: NavItemModel;
  /** Extra classes for the link (composer-provided). */
  readonly className?: string;
}

export function NavItem({ item, className }: NavItemProps) {
  const { label, href, active, external, badge, variant } = item;
  const baseClass = variant === "cta" ? (className ?? "") + " nav-item-cta" : className;

  return (
    <li className={active === true ? "aria-current-page" : undefined}>
      <Link
        href={href}
        aria-current={active === true ? "page" : undefined}
        className={baseClass?.trim()}
        rel={external ? "noreferrer" : undefined}
        target={external ? "_blank" : undefined}
      >
        {label}
        {badge ? <span className="nav-item-badge">{badge}</span> : null}
      </Link>
    </li>
  );
}