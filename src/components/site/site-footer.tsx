import Link from "next/link";
import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import type { DirectionLinkResolver } from "@/application/direction-link";
import { legalLabel, resolveLegalDocs } from "@/core/legal";
import { BusinessInfo } from "./business-info";
import { connectMethodLabel } from "./connect-method-label";
import { ContextConnectHeading } from "./context-connect-heading";
import { ContextNavLinks, type ContextNavLink } from "./context-nav-links";

interface SiteFooterProps {
    readonly locale: string;
    /** Provider-resolved direction link resolver (composed at the app boundary). */
    readonly directionLinkResolver: DirectionLinkResolver;
}

export async function SiteFooter({ locale, directionLinkResolver }: SiteFooterProps) {
    const dictionary = getDictionary(locale);
    // Phase K: the legacy global footer NAP is suppressed when operating
    // regions are configured — regional pages expose their own region's
    // identity, and the global block must never leak into them.
    const hasRegions = Object.keys(siteConfig.regions).length > 0;

    // Legal documents: exposed only at the intersection of the `legal[]`
    // config block and canonical (default-locale) content. Resolved with the
    // same content repository used everywhere else.
    const legalRepository = createFileSystemPageContentRepository({
        defaultLocale: siteConfig.defaultLocale,
        collection: "legal",
    });
    const canonicalLegalSlugs = await legalRepository.listSlugs(siteConfig.defaultLocale);
    const legalLinks = resolveLegalDocs(siteConfig.legal, canonicalLegalSlugs);

    const navLinks: readonly ContextNavLink[] = siteConfig.navigation.map((item) => ({
        href: item.href,
        label: dictionary.navigation.items[item.href] ?? item.label,
    }));

    // Phase M refinement — the footer Connect section is a pure gateway:
    //  - the section HEADING is the Connect-page link (ContextConnectHeading,
    //    resolved by the same URL-authoritative core resolver the header uses);
    //  - beneath it sit ONLY the configured connection methods (localized via
    //    the same connectMethodLabel helper the Connect page uses), so there is
    //    no duplicate Connect item and no separate Contact item — Message Us
    //    (the `/contact` method) is the single message-form action;
    //  - methods are region-aware: an internal one (`/contact`) is only shown
    //    where the (locale, region) context actually has it; external deep
    //    links (mailto/tel/https/viber) never reset locale or location.
    const methodLinks: readonly ContextNavLink[] = (siteConfig.connect?.methods ?? []).map(
        (method) => ({
            href: method.href,
            label: connectMethodLabel(dictionary, method),
            key: method.id,
            demoOnly: method.demoOnly,
        }),
    );

    return (
        <footer className="mt-16 border-t border-border">
            <div className="mx-auto grid max-w-4xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
                {hasRegions ? null : (
                    <BusinessInfo locale={locale} directionLinkResolver={directionLinkResolver} />
                )}

                <div>
                    <ContextConnectHeading
                        locale={locale}
                        label={dictionary.sections.connect}
                    />

                    <ContextNavLinks
                        locale={locale}
                        links={methodLinks}
                        className="mt-3 space-y-2"
                        linkClassName="hover:text-primary"
                        demoBadgeLabel={dictionary.connect.demoBadge}
                    />

                    <ul className="mt-3 space-y-2">
                        {siteConfig.socialLinks.map((socialLink) => (
                            <li key={socialLink.platform}>
                                <a
                                    href={socialLink.href}
                                    rel="noreferrer"
                                    target="_blank"
                                    className="hover:text-primary"
                                >
                                    {socialLink.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>

                <nav aria-label={dictionary.navigation.footerLabel}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {dictionary.sections.navigate}
                    </h2>

                    <ContextNavLinks
                        locale={locale}
                        links={navLinks}
                        className="mt-3 space-y-2"
                        linkClassName="hover:text-primary"
                    />
                </nav>

                {legalLinks.length > 0 ? (
                    <nav aria-label={dictionary.legal.heading}>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            {dictionary.legal.heading}
                        </h2>

                        <ul className="mt-3 space-y-2">
                            {legalLinks.map((doc) => (
                                <li key={doc.slug}>
                                    <Link
                                        href={`/${locale}/legal/${doc.slug}`}
                                        className="hover:text-primary"
                                    >
                                        {legalLabel(dictionary.legal.labels, doc)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                ) : null}

                <p className="self-end text-sm text-muted-foreground sm:text-right lg:text-left">
                    &copy; {new Date().getFullYear()} {siteConfig.name}
                </p>
            </div>
        </footer>
    );
}