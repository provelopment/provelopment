import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { regionDisplayName } from "@/core/display-labels";
import { configuredRegionIds } from "@/core/regional-pages";
import { menuModeClass, resolveShellPattern, type ResolvedUiConfig } from "@/core/ui";
import { ShellMobileNav } from "@/components/shell";
import { Cta } from "@/components/ui/cta";
import { Stack } from "@/components/ui/stack";
import { ContextNavLinks, type ContextNavLink } from "./context-nav-links";
import { LanguageSwitcher } from "./language-switcher";
import { LocationSwitcher } from "./location-switcher";
import { PresetSwitcher } from "./preset-switcher";
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
    const hasHeaderNav = (desktopSlot === "header" || tabletSlot === "header") && resolved.navigation.top.mode !== "closed";
    const topModeClass = menuModeClass(resolved.navigation.top.mode);
    const sidebarModeClass = menuModeClass(resolved.navigation.sidebar.mode);
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
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${topModeClass ?? ""}`}
            linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
        />
    );

    // P5-4 — Shared responsive navigation contract: the mobile sidebar
    // disclosure (drawer AND overlay — the whole "View Sidebar" contract)
    // presents navigation as a clean VERTICAL list, one item per line. The
    // horizontal `flex flex-wrap` class belongs ONLY to the ≥md header
    // top-navigation; previously the drawer pattern reused that horizontal
    // list, so classic/focus/workspace wrapped multiple items per line inside
    // the drawer (immersive's overlay showed the intended vertical layout).
    // A single vocabulary-agnostic list now yields the same vertical
    // presentation for every mobile disclosure (immersive markup is unchanged).
    const mobileNavListElement = (
        <ContextNavLinks
            locale={locale}
            links={navLinks}
            className={`flex flex-col items-start gap-y-2 ${sidebarModeClass ?? ""}`}
            linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
            // P5-5 — the mobile sidebar disclosure orders by configured
            // region (top → middle → bottom) like the aside rail.
            sortByRegion
        />
    );

    // P0-2 — the mobile drawer/overlay CTA uses the SAME shared `Cta`
    // capability as the engine's header/aside/bottom compositions. The
    // placement decision remains vocabulary-driven (`decision.mobile.ctaSlot`
    // is "drawer" exactly for the drawer/overlay compositions); `Cta` owns the
    // single presence predicate (enabled ∧ href ∧ visible content ∧ accessible
    // name) + prominence + P5-5 icon/state. Closed SSR renders no dialog (and
    // therefore no CTA / no focusable); opening exposes the CTA among the
    // disclosure's children.
    const ctaLabel = resolved.cta.label;
    const ctaHref = resolved.cta.href;
    const mobileDrawerCta =
        decision.mobile.ctaSlot === "drawer" &&
        (mobilePattern === "drawer" || mobilePattern === "overlay") ? (
            <Cta
                enabled={resolved.cta.enabled}
                style={resolved.cta.style}
                label={ctaLabel}
                href={ctaHref}
                action={resolved.cta.action}
                icon={resolved.cta.icon}
                iconPosition={resolved.cta.iconPosition}
                state={resolved.cta.state}
                className="ui-drawer-cta"
            />
        ) : null;

    return (
        <header className="ui-site-header border-b border-border">
            <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4">
                <ContextNavLinks
                    locale={locale}
                    links={[{ href: "/", label: siteConfig.name }]}
                    className="font-semibold tracking-tight"
                />

                <Stack direction="row" gap="gap-x-4 gap-y-2" items="items-center">
                    {hasHeaderNav ? (
                        <nav aria-label={dictionary.navigation.primaryLabel} className={desktopNavClassName}>
                            {navListElement}
                        </nav>
                    ) : null}

                    <Stack direction="row" gap="gap-x-3 gap-y-2" items="items-center">
                        <PresetSwitcher
                            label={dictionary.presetComparison.label}
                            currentSuffix={dictionary.presetComparison.current}
                        />
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
                    </Stack>
                </Stack>

                {mobilePattern === "drawer" || mobilePattern === "overlay" ? (
                    <ShellMobileNav
                        pattern={mobilePattern}
                        id="shell-mobile-nav"
                        triggerLabel={dictionary.navigation.viewSidebar ?? "View Sidebar"}
                        className="md:hidden"
                        closeLabel={dictionary.navigation.closeSidebar ?? "Close Sidebar"}
                        // P5-5 — the sidebar disclosure content is configured by
                        // `ui.navigation.sidebar` (icon asset + visible text).
                        open={{
                            icon: resolved.navigation.sidebar.open.icon,
                            text: resolved.navigation.sidebar.open.text,
                        }}
                        close={{
                            icon: resolved.navigation.sidebar.close.icon,
                            text: resolved.navigation.sidebar.close.text,
                        }}
                    >
                        {mobileNavListElement}
                        {mobileDrawerCta}
                    </ShellMobileNav>
                ) : null}
            </div>
        </header>
    );
}