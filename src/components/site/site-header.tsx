import Link from "next/link";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { LanguageSwitcher } from "./language-switcher";

interface SiteHeaderProps {
    readonly locale: string;
}

export function SiteHeader({ locale }: SiteHeaderProps) {
    const dictionary = getDictionary(locale);

    return (
        <header className="border-b border-border">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4">
                <div>
                    <Link
                        href={`/${locale}`}
                        className="font-semibold tracking-tight hover:text-primary"
                    >
                        {siteConfig.name}
                    </Link>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <nav aria-label={dictionary.navigation.primaryLabel}>
                        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            {siteConfig.navigation.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={`/${locale}${item.href === "/" ? "" : item.href}`}
                                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {dictionary.navigation.items[item.href] ?? item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <LanguageSwitcher
                        locale={locale}
                        label={dictionary.language.label}
                    />
                </div>
            </div>
        </header>
    );
}