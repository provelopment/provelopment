import Link from "next/link";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { regionsForLocale } from "@/core/regional-pages";
import { LanguageSwitcher } from "./language-switcher";
import { LocationSwitcher } from "./location-switcher";

interface SiteHeaderProps {
    readonly locale: string;
}

export function SiteHeader({ locale }: SiteHeaderProps) {
    const dictionary = getDictionary(locale);
    const hasLocations = regionsForLocale(siteConfig.pageBindings, locale).length > 0;

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

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        {hasLocations ? (
                            <LocationSwitcher
                                locale={locale}
                                label={dictionary.location.label}
                            />
                        ) : null}
                        <LanguageSwitcher
                            locale={locale}
                            label={dictionary.language.label}
                        />
                    </div>
                </div>
            </div>
        </header>
    );
}