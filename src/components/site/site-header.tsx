import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { regionDisplayName } from "@/core/display-labels";
import { configuredRegionIds } from "@/core/regional-pages";
import { resolveShellPattern, type ResolvedUiConfig } from "@/core/ui";
import { ShellMobileNav } from "@/components/shell";
import { NavCta } from "@/components/ui/nav-cta";
import { ContextNavLinks, type ContextNavLink } from "./context-nav-links";
import { LanguageSwitcher } from "./language-switcher";
import { LocationSwitcher } from "./location-switcher";
import { getSiteNavLinks } from "./nav-links";

interface SiteHeaderProps {
    readonly locale: string;
    /** The resolved UI configuration (UI-02), computed once by the layout. */
    readonly resolved: ResolvedUiConfig;
}

export function SiteHeader({ locale, resolved }: SiteHeaderProps) {
    const dictionary = getDictionary(locale);
    const decision = resolveShellPattern(resolved);
    const mobilePattern = decision.mobile.primitiveKind;
    const desktopSlot = decision.desktop.slot;
    const tabletSlot = decision.tablet.slot;
    // The header renders the ≥md navigation landmark ONLY when the resolved
    // composition places navigation in the header slot (top-bar patterns). With
    // an aside composition (adaptive sidebar) the single nav landmark lives in
    // the shell sidebar instead — exactly one exposed landmark per viewport.
    const hasHeaderNav = desktopSlot === "header" || tabletSlot === "header";
    const desktopNavClassName = !hasHeaderNav
        ? undefined
        : desktopSlot === "header" && tabletSlot === "header"
            ? "hidden md:block"
            : desktopSlot === "header"
                ? "hidden lg:block"
                : "hidden md:block lg:hidden";
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

    const navLinks: readonly ContextNavLink[] = getSiteNavLinks(locale);

    const navListElement = (
        <ContextNavLinks
            locale={locale}
            links={navLinks}
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
            linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
        />
    );

    // UI-07 (D2) + UI-09 (overlay): the latent `ctaSlot: "drawer"` decision
    // acquires its content-layer consumer HERE. When the decision says the mobile
    // CTA slot is the drawer (mobile `drawer` OR `overlay` pattern — both map to
    // the drawer CTA slot in the decision core) AND an adopter CTA materializes
    // (enabled + label + href), the CTA is composed as a child of the
    // ShellMobileNav drawer/overlay. No engine machinery, no Drawer/Overlay change:
    // closed SSR still renders no dialog (and therefore no CTA / no focusable), and
    // opening exposes the CTA among its existing children. The branch is on the
    // decision-core VALUES (ctaSlot, primitive kind) — never preset identity — and
    // `href` is adopter-owned (never invented).
    const ctaLabel = resolved.cta.label;
    const ctaHref = resolved.cta.href;
    const mobileDrawerCta =
        decision.mobile.ctaSlot === "drawer" &&
        (mobilePattern === "drawer" || mobilePattern === "overlay") &&
        resolved.cta.enabled &&
        ctaLabel &&
        ctaHref ? (
            <NavCta
                item={{ label: ctaLabel, href: ctaHref }}
                className={`ui-drawer-cta${resolved.cta.style === "prominent" ? " ui-cta-prominent" : ""}`}
            />
        ) : null;

    return (
        <header className="border-b border-border">
            <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4">
                <ContextNavLinks
                    locale={locale}
                    links={[{ href: "/", label: siteConfig.name }]}
                    className="font-semibold tracking-tight"
                />

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {hasHeaderNav ? (
                        <nav aria-label={dictionary.navigation.primaryLabel} className={desktopNavClassName}>
                            {navListElement}
                        </nav>
                    ) : null}

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
                        {mobileDrawerCta}
                    </ShellMobileNav>
                ) : null}
            </div>
        </header>
    );
}