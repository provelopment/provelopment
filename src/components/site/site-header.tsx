import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { regionDisplayName } from "@/core/display-labels";
import { configuredRegionIds } from "@/core/regional-pages";
import { resolveShellPattern, type ResolvedUiConfig } from "@/core/ui";
import { ShellMobileNav } from "@/components/shell";
import { ContextNavLinks, type ContextNavLink } from "./context-nav-links";
import { LanguageSwitcher } from "./language-switcher";
import { LocationSwitcher } from "./location-switcher";

interface SiteHeaderProps {
    readonly locale: string;
    /** The resolved UI configuration (UI-02), computed once by the layout. */
    readonly resolved: ResolvedUiConfig;
}

export function SiteHeader({ locale, resolved }: SiteHeaderProps) {
    const dictionary = getDictionary(locale);
    const mobilePattern = resolveShellPattern(resolved).mobile.primitiveKind;
    // Phase M: the selector inventory is every CONFIGURED operating location
    // (`business.regions` is authoritative), so once any region is configured
    // the Location selector is available for every locale.
    const hasLocations = configuredRegionIds(siteConfig.regions).length > 0;
    const configuredRegionIdsList = configuredRegionIds(siteConfig.regions);
    // Phase M refinement — localized + English display names (pure helper).
    const regionLabels = Object.fromEntries(
        configuredRegionIdsList.map((regionId) => [
            regionId,
            regionDisplayName(locale, siteConfig.regions[regionId]),
        ]),
    );

    const navLinks: readonly ContextNavLink[] = siteConfig.navigation.map((item) => ({
        href: item.href,
        label: dictionary.navigation.items[item.href] ?? item.label,
    }));

    const navListElement = (
        <ContextNavLinks
            locale={locale}
            links={navLinks}
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
            linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
        />
    );

    // UI-04 responsive split (locked zero-visual-delta): the desktop/tablet nav
    // landmark is EXACTLY today's markup at ≥md. Below `md`, when the resolved
    // mobile pattern is a distinct layer (drawer/overlay/bottom-bar), the
    // desktop/tablet landmark hides and the ShellMobileNav layer (below) takes
    // over; when the mobile pattern is "top", the landmark stays visible at all
    // widths (no hiding — byte-identical).
    const desktopNavClassName =
        mobilePattern === "top" ? undefined : "hidden md:block";

    return (
        <header className="border-b border-border">
            <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4">
                <ContextNavLinks
                    locale={locale}
                    links={[{ href: "/", label: siteConfig.name }]}
                    className="font-semibold tracking-tight"
                />

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <nav aria-label={dictionary.navigation.primaryLabel} className={desktopNavClassName}>
                        {navListElement}
                    </nav>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        {hasLocations ? (
                            <LocationSwitcher
                                locale={locale}
                                label={dictionary.location.label}
                                unspecifiedLabel={dictionary.location.unspecified}
                                regionLabels={regionLabels}
                            />
                        ) : null}
                        <LanguageSwitcher
                            locale={locale}
                            label={dictionary.language.label}
                        />
                    </div>
                </div>

                {mobilePattern === "drawer" || mobilePattern === "overlay" ? (
                    <ShellMobileNav
                        pattern={mobilePattern}
                        id="shell-mobile-nav"
                        triggerLabel={dictionary.navigation.primaryLabel}
                        className="md:hidden"
                    >
                        {navListElement}
                    </ShellMobileNav>
                ) : null}
            </div>
        </header>
    );
}