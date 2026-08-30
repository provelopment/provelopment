"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { siteConfig } from "@/config";
import {
  isInternalHref,
  parseRegionalPath,
  resolveNavHref,
} from "@/core/regional-pages";

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
 * External links (`mailto:`, `tel:`, `https:`, …) pass through as plain
 * anchors; internal links become Next `<Link>`s.
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

  const listClassName = className ?? "space-y-2";
  const linkClass = linkClassName ?? "hover:text-primary";

  function renderLabel(label: string, demoOnly?: boolean) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {label}
        {demoBadgeLabel && demoOnly ? (
          <span className="rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
            {demoBadgeLabel}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <ul aria-label={ariaLabel} className={listClassName}>
      {resolved.map((link) => {
        const key = link.key ?? link.href;
        return link.external ? (
          <li key={key}>
            <a href={link.href} rel="noreferrer" target="_blank" className={linkClass}>
              {renderLabel(link.label, link.demoOnly)}
            </a>
          </li>
        ) : (
          <li key={key}>
            <Link href={link.href} className={linkClass}>
              {renderLabel(link.label, link.demoOnly)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}