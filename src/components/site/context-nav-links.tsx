"use client";

import { usePathname } from "next/navigation";

import { siteConfig } from "@/config";
import {
  isInternalHref,
  parseRegionalPath,
  resolveNavHref,
} from "@/core/regional-pages";
import { NavItem } from "@/components/ui/nav-item";

export interface ContextNavLink {
  readonly href: string;
  readonly label: string;
  /** Stable React key (defaults to the resolved href when omitted). */
  readonly key?: string;
  /** Marks configured demonstration entries with a badge (Phase M refinement). */
  readonly demoOnly?: boolean;
}

interface ContextNavLinksProps {
  readonly locale: string;
  readonly links: readonly ContextNavLink[];
  /** Optional `nav` grouping label (footer sections) or `void` (plain list). */
  readonly ariaLabel?: string;
  readonly className?: string;
  /** Extra classes applied to every link (brand vs nav vs footer styling). */
  readonly linkClassName?: string;
  /** Localized demo badge label (rendered for `demoOnly` links). */
  readonly demoBadgeLabel?: string;
}

/**
 * Phase M — URL-authoritative, region-aware navigation links.
 *
 * The active page context is read from the current URL (server-resolved, no
 * client state). In a REGIONAL context only pages that actually exist for
 * (locale, region) are exposed (a nav item must never promise one page and
 * silently deliver another); `href === "/"` always resolves to the regional
 * LANDING — Home means "home for the currently selected location". In the
 * generic context flat `/{locale}{href}` routes are used.
 *
 * P0-5 (link-semantics convergence): the LINK SEMANTICS live in the shared
 * `NavItem` primitive — internal Next `<Link>`, external new-tab +
 * `rel="noreferrer"`, `aria-current="page"` on the active internal item, and
 * the badge chip. This component owns the CONTEXT that NavItem must not:
 * URL/region-aware destination resolution, active-page computation from the
 * pathname (UI-10 B2), and the list composition. Every placement — the ≥md
 * header nav, the aside (sidebar) bands, the mobile drawer/overlay children,
 * and the footer Connect list — therefore renders through exactly one link
 * semantic/rendering path. External links (`mailto:`, `tel:`, `https:`, …)
 * resolve here, then render through the same NavItem external contract.
 */
export function ContextNavLinks({
  locale,
  links,
  ariaLabel,
  className,
  linkClassName,
  demoBadgeLabel,
}: ContextNavLinksProps) {
  const pathname = usePathname();
  const parsed = parseRegionalPath(siteConfig.pageBindings, pathname ?? `/${locale}`);

  const resolved = links.flatMap((link) => {
    const href = resolveNavHref(siteConfig.pageBindings, locale, parsed.region, link.href);
    if (href === null) return [];
    return [{ ...link, href, external: !isInternalHref(link.href) }];
  });

  // B2 (UI-10): the active page is conveyed via `aria-current="page"` on the
  // internal link whose RESOLVED href equals the current pathname — the same
  // route-comparison convention the bottom navigation uses
  // (shell-bottom-bar.tsx). External links never carry aria-current.
  const resolvedWithActive = resolved.map((link) => ({
    ...link,
    active: !link.external && pathname === link.href,
  }));

  const listClassName = className ?? "space-y-2";
  const linkClass = linkClassName ?? "hover:text-primary";

  return (
    <ul aria-label={ariaLabel} className={listClassName}>
      {resolvedWithActive.map((link) => (
        <NavItem
          key={link.key ?? link.href}
          item={{
            label: link.label,
            href: link.href,
            active: link.active,
            external: link.external,
            badge: link.demoOnly && demoBadgeLabel ? demoBadgeLabel : undefined,
          }}
          className={linkClass}
        />
      ))}
    </ul>
  );
}