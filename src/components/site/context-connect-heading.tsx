"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { resolveNavHref, bindingsForSite } from "@/core/regional-pages";
import { pathContextOr, sitePrefixPath } from "@/core/site";
import { FOOTER_HEADING_BOX_CLASS, FOOTER_HEADING_CLASS } from "./footer-link-class";
import { useClientRouting } from "./client-routing-context";

interface ContextConnectHeadingProps {
  readonly locale: string;
  /** Localized section heading (also the link's accessible name). */
  readonly label: string;
}

/**
 * Phase M refinement — the footer's **Connect** section heading IS the link to
 * the Connect gateway page. Resolved through the same URL-authoritative core
 * resolver the header uses:
 *
 *  - generic context   → `/{locale}/connect`;
 *  - regional context  → `/{locale}/{region}/connect` when that regional page
 *    exists;
 *  - regional page with no regional Connect page (`/de/berlin` etc.) → the
 *    heading renders WITHOUT a link (never an invented URL, never a silent
 *    reset to the generic/English page).
 *
 * No regional URL is ever constructed manually here.
 */
export function ContextConnectHeading({ locale, label }: ContextConnectHeadingProps) {
  const pathname = usePathname();
  // M14 — the routing facts arrive from the SERVER's projection for the CURRENT Spoke.
  const routing = useClientRouting();
  const parsed = pathContextOr(
    routing.siteSet,
    routing.pageBindings,
    pathname ?? `/${locale}`,
    locale,
  );
  // S1/M14 — the heading resolves INSIDE the current site's own bindings (a binding declared for another
  // site can never answer here), so the generic context reaches the generic Connect page, a regional
  // context with a regional Connect reaches it, and a regional context WITHOUT one renders no link at all.
  const href = resolveNavHref(
    bindingsForSite(routing.pageBindings, parsed.site.code),
    locale,
    parsed.region,
    "/connect",
    sitePrefixPath(parsed.site),
  );

  // R1 — THE ONE FOOTER HEADING CONTRACT. The typography and the box the heading's TEXT sits in both come
  // from the shared footer contract (`footer-link-class.ts`), so this LINKED heading's visible text starts at
  // the same vertical position as the unlinked headings beside it — while the link keeps the platform's ≥44px
  // interaction target (`FOOTER_HEADING_BOX_CLASS` IS that floor).
  const linkClass = `${FOOTER_HEADING_BOX_CLASS} ${FOOTER_HEADING_CLASS} hover:text-primary transition-colors`;

  return (
    <h2 className={FOOTER_HEADING_CLASS}>
      {href ? (
        <Link href={href} className={linkClass}>
          {label}
        </Link>
      ) : (
        <span className={FOOTER_HEADING_BOX_CLASS}>{label}</span>
      )}
    </h2>
  );
}