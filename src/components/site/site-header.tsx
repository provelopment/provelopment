import Link from "next/link";
import { getDictionary, siteConfig } from "@/config";

interface SiteHeaderProps {
    readonly locale: string;
}

export function SiteHeader({ locale }: SiteHeaderProps) {
    const dictionary = getDictionary(locale);

    return (
        <header className="border-b border-border">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
                <div>
                    <Link
                        href={`/${locale}`}
                        className="font-semibold tracking-tight hover:text-primary"
                    >
                        {siteConfig.name}
                    </Link>
                </div>

                <nav aria-label={dictionary.navigation.primaryLabel}>
                    <ul className="flex items-center gap-4">
                        {siteConfig.navigation.map((item) => (
                            <li key={item.href}>
                                <Link
                                    href={`/${locale}${item.href === "/" ? "" : item.href}`}
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    {item.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </header>
    );
}