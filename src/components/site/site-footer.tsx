import Link from "next/link";
import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import type { DirectionLinkResolver } from "@/application/direction-link";
import { legalLabel, resolveLegalDocs } from "@/core/legal";
import { BusinessInfo } from "./business-info";

interface SiteFooterProps {
    readonly locale: string;
    /** Provider-resolved direction link resolver (composed at the app boundary). */
    readonly directionLinkResolver: DirectionLinkResolver;
}

export async function SiteFooter({ locale, directionLinkResolver }: SiteFooterProps) {
    const dictionary = getDictionary(locale);

    // Legal documents: exposed only at the intersection of the `legal[]`
    // config block and canonical (default-locale) content. Resolved with the
    // same content repository used everywhere else.
    const legalRepository = createFileSystemPageContentRepository({
        defaultLocale: siteConfig.defaultLocale,
        collection: "legal",
    });
    const canonicalLegalSlugs = await legalRepository.listSlugs(siteConfig.defaultLocale);
    const legalLinks = resolveLegalDocs(siteConfig.legal, canonicalLegalSlugs);

    return (
        <footer className="mt-16 border-t border-border">
            <div className="mx-auto grid max-w-4xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
                <BusinessInfo locale={locale} directionLinkResolver={directionLinkResolver} />

                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {dictionary.sections.connect}
                    </h2>

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

                    <ul className="mt-3 space-y-2">
                        {siteConfig.navigation.map((item) => (
                            <li key={item.href}>
                                <Link
                                    href={`/${locale}${item.href === "/" ? "" : item.href}`}
                                    className="hover:text-primary"
                                >
                                    {dictionary.navigation.items[item.href] ?? item.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
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