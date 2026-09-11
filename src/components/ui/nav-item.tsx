import Link from "next/link";

import { NavBadge } from "./nav-badge";

/**
 * P5-5 — plain icon-asset filename → public URL. Deliberately inlined (the UI
 * primitives boundary forbids `@/core` imports in shared UI primitives): this
 * is the same projection the core `iconAssetUrl` helper provides for shell/
 * content-layer consumers, so behavior is identical everywhere.
 */
const toAssetUrl = (name: string): string => `/assets/${name}`;

/** Icon placement within a control. */
type IconPosition = "start" | "end";

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
  /**
   * P5-5 — optional icon asset (plain public/assets filename). Rendered as a
   * fixed-size, decoratively-hidden asset beside the label; the label (or the
   * surrounding list's aria) remains the accessible name. Compact menu mode
   * hides the label via the shared `.ui-nav-mode-compact` rule — never by
   * removing it from the DOM.
   */
  readonly icon?: string;
  /**
   * P6-3B — optional EXPANDED-state sidebar item icon (plain public/assets
   * filename). When supplied (with/without `closedIcon`), the item renders a
   * state-paired icon: `openIcon` in the expanded sidebar, `closedIcon` when
   * collapsed (CSS toggles on the rail's `data-collapsed`). Prefer this pair
   * over the single `icon` for sidebar items.
   */
  readonly openIcon?: string;
  /** P6-3B — optional COLLAPSED-state sidebar item icon (see `openIcon`). */
  readonly closedIcon?: string;
  /** P5-5 — icon placement within the item ("start" leading, "end" trailing). */
  readonly iconPosition?: IconPosition;
  /**
   * P5-5 — semantic disabled state: renders `aria-disabled="true"`, is NOT
   * navigable and is removed from the tab order. Never silently dropped.
   */
  readonly disabled?: boolean;
  /**
   * P5-5 — explicit accessible name (used when the visible label is empty, e.g.
   * an icon-only CTA). The Foundation NEVER relies on a bare image for a name,
   * and never leaves an empty accessible label.
   */
  readonly ariaLabel?: string;
}

export interface NavItemProps {
  readonly item: NavItemModel;
  /** Extra classes for the link (composer-provided). */
  readonly className?: string;
}

export function NavItem({ item, className }: NavItemProps) {
  const { label, href, active, external, badge, variant, icon, disabled, ariaLabel } = item;
  const openIcon = item.openIcon;
  const closedIcon = item.closedIcon;
  const iconPosition = item.iconPosition ?? "start";
  const hasIcon = Boolean(icon || openIcon || closedIcon);
  const baseClass = variant === "cta" ? (className ?? "") + " nav-item-cta" : className;
  const liClass = [active === true ? "aria-current-page" : undefined, hasIcon ? "ui-nav-item--has-icon" : undefined]
    .filter(Boolean)
    .join(" ");

  // P5-5 — a disabled nav item is semantically disabled: it is not navigable
  // and leaves the tab order, and is announced as disabled. It stays in the
  // DOM (document content) so screen-reader users and the layout are stable.
  //
  // P6-3B — an item may render a STATE-PAIRED icon (`iconOpen`/`iconClosed`);
  // the sidebar rail's `data-collapsed` attribute + CSS decides which is
  // visible, so no client state is needed. The single `icon` remains the
  // one-icon path used by the header/bottom-bar surfaces (and by sidebar items
  // that only configure `icon`). Every icon is decorative (`alt=""`); the
  // visible label (or the item's accessible name) remains the accessible name.
  const singleIconNode = icon ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={toAssetUrl(icon)} alt="" aria-hidden="true" className="ui-nav-item-icon" />
  ) : null;
  const pairedIconNode =
    !icon && (openIcon || closedIcon) ? (
      <>
        {openIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toAssetUrl(openIcon)}
            alt=""
            aria-hidden="true"
            className="ui-nav-item-icon ui-nav-item-icon-open"
          />
        ) : null}
        {closedIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toAssetUrl(closedIcon)}
            alt=""
            aria-hidden="true"
            className="ui-nav-item-icon ui-nav-item-icon-closed"
          />
        ) : null}
      </>
    ) : null;
  const iconNode = singleIconNode ?? pairedIconNode;
  const labelNode = <span className="ui-nav-item-label">{label}</span>;
  const content = (
    <>
      {iconPosition === "end" ? labelNode : null}
      {iconNode}
      {iconPosition === "start" ? labelNode : null}
      {badge ? <NavBadge label={badge} /> : null}
    </>
  );

  if (disabled === true) {
    return (
      <li className={liClass || undefined}>
        <span aria-disabled="true" className={baseClass?.trim()}>
          {content}
        </span>
      </li>
    );
  }

  return (
    <li className={liClass || undefined}>
      <Link
        href={href}
        aria-current={active === true ? "page" : undefined}
        aria-label={ariaLabel}
        className={baseClass?.trim()}
        rel={external ? "noreferrer" : undefined}
        target={external ? "_blank" : undefined}
      >
        {content}
      </Link>
    </li>
  );
}