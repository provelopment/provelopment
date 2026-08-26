import Link from "next/link";
import { siteConfig } from "@/config";

export function SiteFooter() {
    return (
        <footer>
            <div>
                <h2>Contact</h2>

                {siteConfig.contact.email ? (
                    <p>
                        <a href={`mailto:${siteConfig.contact.email}`}>
                            {siteConfig.contact.email}
                        </a>
                    </p>
                ) : null}

                {siteConfig.contact.phone ? (
                    <p>
                        <a href={`tel:${siteConfig.contact.phone}`}>
                            {siteConfig.contact.phone}
                        </a>
                    </p>
                ) : null}
            </div>

            <div>
                <h2>Connect</h2>

                <ul>
                    {siteConfig.socialLinks.map((socialLink) => (
                        <li key={socialLink.platform}>
                            <a
                                href={socialLink.href}
                                rel="noreferrer"
                                target="_blank"
                            >
                                {socialLink.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>

            <p>&copy; {new Date().getFullYear()} {siteConfig.name}</p>

            <nav aria-label="Footer navigation">
                <ul>
                    {siteConfig.navigation.map((item) => (
                        <li key={item.href}>
                            <Link href={item.href}>{item.label}</Link>
                        </li>
                    ))}
                </ul>
            </nav>
        </footer>
    );
}