import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { configuredRegionIds } from "@/core/regional-pages";
import { ContextNavLinks, type ContextNavLink } from "./context-nav-links";
import { LanguageSwitcher } from "./language-switcher";
import { LocationSwitcher } from "./location-switcher";

interface SiteHeaderProps {
    readonly locale: string;
}

export function SiteHeader({ locale }: SiteHeaderProps) {
    const dictionary = getDictionary(locale);
    // Phase M: the selector inventory is every CONFIGURED operating location
    // (`business.regions` is authoritative), so once any region is configured
    // the Location selector is available for every locale.
    const hasLocations = configuredRegionIds(siteConfig.regions).length > 0;

    const navLinks: readonly ContextNavLink[] = siteConfig.navigation.map((item) => ({
        href: item.href,
        label: dictionary.navigation.items[item.href] ?? item.label,
    }));

    return (
        <header className="border-b border-border">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4">
                <ContextNavLinks
                    locale={locale}
                    links={[{ href: "/", label: siteConfig.name }]}
                    className="font-semibold tracking-tight"
                />

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <nav aria-label={dictionary.navigation.primaryLabel}>
                        <ContextNavLinks
                            locale={locale}
                            links={navLinks}
                            className="flex flex-wrap items-center gap-x-4 gap-y-2"
                            linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        />
                    </nav>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        {hasLocations ? (
                            <LocationSwitcher
                                locale={locale}
                                label={dictionary.location.label}
                                unspecifiedLabel={dictionary.location.unspecified}
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