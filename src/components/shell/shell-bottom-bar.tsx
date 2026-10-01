"use client";

import { usePathname } from "next/navigation";

import { BottomNavigation } from "@/components/ui/bottom-navigation";
import { NavItem } from "@/components/ui/nav-item";
import type { NavItemModel } from "@/components/ui/nav-item";
import type { PageRegionBinding } from "@/core/region";
import { isInternalHref, resolveNavHref } from "@/core/regional-pages";
import { pathContextOr, sitePrefixPath, type SiteSet } from "@/core/site";
import { menuModeClass, splitBottomNavItems, type MenuMode } from "@/core/ui";

import { ShellMobileNav } from "./shell-mobile-nav";

/**
 * ShellBottomBar (UI-05 — Shell Engine).
 *
 * The COMPOSED mobile "bottom-bar" layer for the Adaptive personality. It is
 * the interactive/region-aware counterpart of `ShellMobileNav`:
 *
 *  - resolves the same region-aware hrefs + active state as the site header's
 *    navigation (pure `@/core/regional-pages` helpers; content passes
 *    `pageBindings` + `locale` via props — no config import);
 *  - applies the DETERMINISTIC content rule (`splitBottomNavItems` from the
 *    decision core): the first `BOTTOM_NAV_PRIMARY_LIMIT` items render in the
 *    `BottomNavigation` bar, the remainder (when non-empty) is exposed through
 *    a closed-by-default "More" drawer;
 *  - composes ONLY the shared primitives (`BottomNavigation`, `NavItem`,
 *    `ShellMobileNav`) — no presentation identity, no business rules.
 *
 * A11y contract: single `<nav>` landmark (the bar) at <md; the More drawer is
 * a `role=dialog` overlay (closed-by-default SSR, Escape closes) that is never
 * simultaneously present in the tab order with the bar. ≥44px touch targets.
 */
export interface ShellBottomBarLink {
  readonly href: string;
  readonly label: string;
  readonly key?: string;
  readonly demoOnly?: boolean;
  /** P5-5 — optional navigation-item icon (plain public/assets filename). */
  readonly icon?: string;
  /** P5-5 — semantically disabled (aria-disabled, not navigable). */
  readonly disabled?: boolean;
}

export interface ShellBottomBarProps {
  /** Accessible label for the bar landmark (localized by the composer). */
  readonly label: string;
  /** Accessible label for the "More" drawer trigger (localized). */
  readonly moreLabel: string;
  /** Navigation content (labels already localized; hrefs resolved here). */
  readonly links: readonly ShellBottomBarLink[];
  readonly locale: string;
  /** Configured region page bindings (content layer passes its site config). */
  readonly pageBindings: readonly PageRegionBinding[];
  /**
   * S1E3A — the deployment's resolved SITES, passed in like every other config-derived value.
   * The engine layer never imports `@/config`: it receives the site set and resolves the current
   * site/locale/region context from the URL with the ONE core helper.
   */
  readonly siteSet: SiteSet;
  /** Localized demo badge label (for `demoOnly` items). */
  readonly demoBadgeLabel?: string;
  /** P6-1 — label for the explicit "Hide navigation" control in the More drawer
   * (the shared sidebar contract; absent → no close control renders). */
  readonly closeLabel?: string;
  /** P5-5 — bottom-menu presentation mode (open | compact | closed). */
  readonly mode?: MenuMode;
  /**
   * N2/NAV1A — inert layout-scope markers (`data-ui-shell-part` /
   * `data-ui-shell-layouts`): which composed layout(s) this bar IS the mobile
   * navigation for. The stylesheet exposes exactly one mobile surface per active
   * layout, so a bar owned by another layout is `display: none` — outside the
   * accessibility tree and the tab order. Absent → no attributes (one-composition
   * sites are byte-identical).
   */
  readonly scope?: Readonly<Record<string, string>>;
  /**
   * NAV1B — the width gate this bar is presented at, derived from the composition that owns
   * it (`bandClassName(mobileSurfaceBands(composition.decision))`): `md:hidden` for the
   * canonical sidebar composition, and NO gate for a Menu-bar composition, whose sticky bar
   * is the navigation at every width. The shell engine is the only caller that decides it;
   * the component never reads a breakpoint of its own, and the default is the shipped
   * mobile-only presentation so a direct consumer is unchanged.
   */
  readonly bandsClassName?: string;
  /**
   * NAV1A — the layouts this bar presents, forwarded to its "More" drawer so an
   * open overflow dialog is withdrawn (and closed) when the visitor switches away
   * from this layout. See `ShellMobileNav`.
   */
  readonly activeLayouts?: readonly string[];
  /** P5-5 — configuration for the shared "Hide navigation" disclosure control. */
  readonly sidebarClose?: { readonly icon?: string; readonly text?: string };
}

/**
 * NAV1A — THE STICKY BAR'S LINK LAYOUT, OWNED BY THE LIST (not the landmark).
 *
 * The rows are the `<li>` children of the `<ul>`, so this class belongs there: horizontal
 * flow, natural wrapping, and a consistent inter-link gap. The container's `px-4` page-edge
 * inset (`PAGE_EDGE_INSET_CLASS` below) IS the width the rows wrap inside, so no link text
 * can touch the viewport edge. The bar keeps its natural height and grows only when another
 * row is genuinely required — a fixed single-row height is never imposed.
 */
export const BOTTOM_NAV_LIST_CLASS = "flex flex-wrap items-center gap-x-4 gap-y-2";

/**
 * NAV1A — the bar's LINK box. A flex item's automatic minimum size is its min-content size,
 * so a label allowed to break inside itself would let a row SQUASH its links instead of
 * moving one onto the next line. Keeping each label on one line makes the item's minimum
 * the full label, so a row wraps exactly when the next link genuinely does not fit — which
 * is what the wrapping contract requires.
 */
export const BOTTOM_NAV_LINK_CLASS = "whitespace-nowrap";

/**
 * NAV1A — the bar's horizontal PAGE-EDGE INSET. It is the same `px-4` the header and the
 * footer use (`ui-site-header` / footer bands), so the bar shares the platform's existing
 * page-edge convention instead of introducing a second spacing system. The bar spans the
 * viewport below `md`, so no bounded page-width container applies at those widths.
 */
export const PAGE_EDGE_INSET_CLASS = "px-4";

export function ShellBottomBar({
  label,
  moreLabel,
  links,
  locale,
  pageBindings,
  siteSet,
  demoBadgeLabel,
  closeLabel,
  mode,
  scope,
  activeLayouts,
  bandsClassName = "md:hidden",
  sidebarClose,
}: ShellBottomBarProps) {
  const pathname = usePathname();
  // P5-5 — "closed" means the menu is not composed at all (adopter choice;
  // Escape/backdrop/focus machinery is untouched when present).
  if (mode === "closed") return null;
  const parsed = pathContextOr(
    siteSet,
    pageBindings,
    pathname ?? `/${locale}`,
    locale,
  );
  const region = parsed.region;
  // S1 — links stay inside the CURRENT site: the site's own prefix is part of every href.
  const sitePrefix = sitePrefixPath(parsed.site);

  const resolved: NavItemModel[] = links.flatMap((link) => {
    const href = resolveNavHref(pageBindings, locale, region, link.href, sitePrefix);
    if (href === null) return [];
    return [
      {
        label: link.label,
        href,
        key: link.key ?? href,
        active: pathname === href,
        external: !isInternalHref(link.href),
        badge: link.demoOnly && demoBadgeLabel ? demoBadgeLabel : undefined,
        icon: link.icon,
        disabled: link.disabled,
      },
    ];
  });

  // P6-3C — the bar carries NAVIGATION only. The primary CTA has its single
  // authoritative home in the shell's TOP region (below the header), so it is
  // never duplicated into the bar and can never be obscured by it.
  const { primary, remainder } = splitBottomNavItems(resolved);

  return (
    <div
      // NAV1B — the BAR spans the viewport (it is the sticky surface), while its CONTENT is
      // bounded by the site's own page width and padded by the SAME page-edge inset the header and
      // footer use. On a wide display a handful of links therefore stays aligned with the page
      // instead of being spread from edge to edge, and no link can ever touch the viewport edge.
      className={[
        "ui-shell-bottom-bar sticky bottom-0 z-40 border-t border-border bg-background",
        bandsClassName,
        menuModeClass(mode ?? "open"),
      ]
        .filter(Boolean)
        .join(" ")}
      {...scope}
    >
      <div className={`mx-auto max-w-page ${PAGE_EDGE_INSET_CLASS} py-1`}>
        <BottomNavigation
          label={label}
          items={primary}
          listClassName={BOTTOM_NAV_LIST_CLASS}
          linkClassName={BOTTOM_NAV_LINK_CLASS}
        />
        {remainder.length > 0 ? (
          <ShellMobileNav
            pattern="drawer"
            id="shell-bottom-more"
            triggerLabel={moreLabel}
            closeLabel={closeLabel}
            close={sidebarClose}
            activeLayouts={activeLayouts}
          >
            <ul>
              {remainder.map((item) => (
                <NavItem key={item.key ?? item.href} item={item} />
              ))}
            </ul>
          </ShellMobileNav>
        ) : null}
      </div>
    </div>
  );
}
