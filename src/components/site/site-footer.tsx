import Link from "next/link";
import { siteConfig } from "@/config";

export function SiteFooter() {
    return (
        <footer className="mt-16 border-t border-border">
            <div className="mx-auto grid max-w-4xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Contact
                    </h2>

                    {siteConfig.contact.email ? (
                        <p className="mt-3">
                            <a
                                href={`mailto:${siteConfig.contact.email}`}
                                className="hover:text-primary"
                            >
                                {siteConfig.contact.email}
                            </a>
                        </p>
                    ) : null}

                    {siteConfig.contact.phone ? (
                        <p className="mt-3">
                            <a
                                href={`tel:${siteConfig.contact.phone}`}
                                className="hover:text-primary"
                            >
                                {siteConfig.contact.phone}
                            </a>
                        </p>
                    ) : null}
                </div>

                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Connect
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

                <nav aria-label="Footer navigation">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Navigate
                    </h2>

                    <ul className="mt-3 space-y-2">
                        {siteConfig.navigation.map((item) => (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    className="hover:text-primary"
                                >
                                    {item.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>

                <p className="self-end text-sm text-muted-foreground sm:text-right lg:text-left">
                    &copy; {new Date().getFullYear()} {siteConfig.name}
                </p>
            </div>
        </footer>
    );
}