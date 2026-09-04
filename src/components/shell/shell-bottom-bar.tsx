"use client";

import { usePathname } from "next/navigation";

import { BottomNavigation } from "@/components/ui/bottom-navigation";
import { NavItem } from "@/components/ui/nav-item";
import type { NavItemModel } from "@/components/ui/nav-item";
import type { PageRegionBinding } from "@/core/region";
import { isInternalHref, parseRegionalPath, resolveNavHref } from "@/core/regional-pages";
import { splitBottomNavItems } from "@/core/ui";

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
 *    `ShellMobileNav`) — no preset identity, no business rules.
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
  /** Localized demo badge label (for `demoOnly` items). */
  readonly demoBadgeLabel?: string;
  /** Primary CTA composed only when the engine resolved `cta.enabled`+labels. */
  readonly cta?: { readonly label: string; readonly href: string };
}

export function ShellBottomBar({
  label,
  moreLabel,
  links,
  locale,
  pageBindings,
  demoBadgeLabel,
  cta,
}: ShellBottomBarProps) {
  const pathname = usePathname();
  const parsed = parseRegionalPath(pageBindings, pathname ?? `/${locale}`);
  const region = parsed.region;

  const resolved: NavItemModel[] = links.flatMap((link) => {
    const href = resolveNavHref(pageBindings, locale, region, link.href);
    if (href === null) return [];
    return [
      {
        label: link.label,
        href,
        key: link.key ?? href,
        active: pathname === href,
        external: !isInternalHref(link.href),
        badge: link.demoOnly && demoBadgeLabel ? demoBadgeLabel : undefined,
      },
    ];
  });

  const ctaItems: NavItemModel[] = cta ? [{ label: cta.label, href: cta.href, variant: "cta" }] : [];
  const { primary, remainder } = splitBottomNavItems([...ctaItems, ...resolved]);

  return (
    <div className="ui-shell-bottom-bar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:hidden">
      <BottomNavigation label={label} items={primary} className="flex items-center justify-around gap-x-1" />
      {remainder.length > 0 ? (
        <ShellMobileNav pattern="drawer" id="shell-bottom-more" triggerLabel={moreLabel}>
          <ul>
            {remainder.map((item) => (
              <NavItem key={item.key ?? item.href} item={item} />
            ))}
          </ul>
        </ShellMobileNav>
      ) : null}
    </div>
  );
}