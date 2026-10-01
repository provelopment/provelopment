import Link from "next/link";

import { siteConfig } from "@/config";
import { assetPathFromUrl, availableHeaderGraphicPath } from "@/config/assets";
import { getDictionary } from "@/config/i18n";
import { regionDisplayName } from "@/core/display-labels";
import { regionsForSite } from "@/core/regional-pages";
import {
    headerNavigationLayouts,
    layoutScopeAttributes,
    menuModeClass,
    resolveShellPattern,
    type ResolvedUiConfig,
} from "@/core/ui";
import { ContextNavLinks, type ContextNavLink } from "./context-nav-links";
import { Stack } from "@/components/ui/stack";
import { LanguageSwitcher } from "./language-switcher";
import { LayoutSwitcher } from "./layout-switcher";
import { LocationSwitcher } from "./location-switcher";
import { SiteSelector, type SiteSelectorOption } from "./site-selector";
import { getSiteNavLinks } from "./nav-links";
import { headerGraphicBandProps } from "./header-graphic";

interface SiteHeaderProps {
    /** The locale PATH KEY of the current URL (`en`, `fr-ca`) — the dictionary's key too. */
    readonly locale: string;
    /** The resolved UI configuration (UI-02), computed once by the layout. */
    readonly resolved: ResolvedUiConfig;
    /**
     * S1E2 — the site whose page tree this header belongs to: it selects the site's dictionary and
     * the site's effective navigation. Absent → the deployment's default site (the single-site case).
     */
    readonly siteId?: string;
    /**
     * S1E2 — the Site selector's options, resolved server-side by `@/application/site-switch`.
     * Fewer than two options (or absent) → NO selector renders, so a single-site deployment's
     * header is byte-identical to before.
     */
    readonly siteSwitch?: readonly SiteSelectorOption[];
}

/**
 * EN-M (English-master closure) — THE HEADER LINK HIT-AREA BOX.
 *
 * One definition of the ≥44px interaction-box contract the header's links share.
 * It carries LAYOUT only: typography, colour and state treatments stay with each
 * surface, so the box can be applied to a link whose visual design must not move.
 */
export const TOUCH_TARGET_BOX_CLASS = "inline-flex min-h-11 min-w-11 items-center";

/**
 * EN-M (English-master closure) — THE HEADER NAVIGATION LINK CONTRACT.
 *
 * The ≥44px interaction-target contract the programme already applies to the
 * mobile navigation trigger (VIS1C), the brand/home link (VIS1C) and the footer
 * links (VIS2S) was MISSING on the header's own navigation links: `text-sm` with
 * no vertical box produced a 20px-tall target at every desktop width, and the
 * same 20px in the drawer's vertical list — the smallest interactive targets in
 * the shell.
 *
 * The fix grows the INTERACTIVE BOX only, exactly like the brand link next to
 * it: `inline-flex` + `min-h-11` (+ `min-w-11`, so a short label can never be
 * narrower than the target floor). Typography, colour, the transition and
 * `aria-current` active treatment are unchanged, and the header's own height
 * does not move: the row is already ≥44px tall because the brand lockup is, so
 * the navigation links simply occupy the height the header already has.
 *
 * The same box is applied to the TEXT brand fallback (`TOUCH_TARGET_BOX_CLASS`)
 * — the path an adopter without a configured logo uses — so the "go home"
 * target meets the same floor with its typography untouched.
 *
 * This is a SHARED SHELL change — no profile CSS and no new configuration
 * surface, so every adopter and every site profile inherits it.
 */
export const HEADER_NAV_LINK_CLASS = `${TOUCH_TARGET_BOX_CLASS} text-sm text-muted-foreground transition-colors hover:text-foreground`;

export function SiteHeader({ locale, resolved, siteId, siteSwitch }: SiteHeaderProps) {
    const dictionary = getDictionary(locale, siteId);
    const decision = resolveShellPattern(resolved);
    const desktopSlot = decision.desktop.slot;
    const tabletSlot = decision.tablet.slot;
    // NAV1B — THE HEADER COMPOSES NO MOBILE NAVIGATION. The sidebar composition's
    // constrained-width disclosure belongs to the sidebar/shell boundary and is composed there
    // by the shell engine, so this header owns exactly two semantic rows (identity + the
    // navigation-MODE selector, then every other control). Previously it lived here, where it
    // migrated between the header's lines as the visitor controls changed width — the reported
    // defect.
    // N2 — when the layout switcher is enabled the header must ALSO carry the
    // navigation for every composed layout that uses the header slot, because which
    // structure is displayed is decided client-side: the header's nav and the rail
    // both exist and the active layout presentation exposes exactly one of them
    // (globals.css — shell layout presentation).
    const layoutHeaderLayouts = resolved.layoutSwitcher.enabled
        ? headerNavigationLayouts(resolved)
        : [];
    // The header renders the ≥md navigation landmark ONLY when the resolved
    // composition places navigation in the header slot (top-bar patterns) or a
    // composed layout does. With an aside composition (adaptive sidebar) the single
    // nav landmark lives in the shell sidebar instead — exactly one exposed landmark
    // per viewport, in either case.
    const headerNavPresent =
        desktopSlot === "header" || tabletSlot === "header" || layoutHeaderLayouts.length > 0;
    const hasHeaderNav = headerNavPresent && resolved.navigation.top.mode !== "closed";
    const topModeClass = menuModeClass(resolved.navigation.top.mode);
    const desktopNavClassName = !hasHeaderNav
        ? undefined
        : layoutHeaderLayouts.length > 0
            // A switcher composes this navigation for a layout that uses it at BOTH
            // md bands, so the class covers whichever layout is active.
            ? "hidden md:block"
            : desktopSlot === "header" && tabletSlot === "header"
                ? "hidden md:block"
                : desktopSlot === "header"
                    ? "hidden lg:block"
                    : "hidden md:block lg:hidden";
    // R1C — the selector's inventory is the ACTIVE SITE's own locations, so a deployment with
    // several sites shows the Location control exactly where locations exist: Global (which binds
    // none) renders no Location control at all, and Germany's Berlin/Frankfurt can never be
    // offered on another site. Within a site the rule is unchanged — configuration, never
    // "locations compatible with my language" (Phase M).
    const siteRegionIds = regionsForSite(siteConfig.pageBindings, siteId ?? siteConfig.defaultSite.code);
    const hasLocations = siteRegionIds.length > 0;
    const configuredRegionIdsList = siteRegionIds;
    // Phase M refinement — localized + English display names (pure helper).
    const regionLabels = Object.fromEntries(
        configuredRegionIdsList.map((regionId) => [
            regionId,
            regionDisplayName(locale, siteConfig.regions[regionId]),
        ]),
    );

    const navLinks: readonly ContextNavLink[] = getSiteNavLinks(locale, siteId);
    // P6-3B — the header's left brand slot renders the configured header logo
    // (the `site.assets.logo` role), replacing the former text label.
    // `assetPathFromUrl` keeps it same-origin; intrinsic aspect ratio is
    // preserved (`h-8 w-auto`, responsive); accessible name = the site name.
    // Absent config → the previous text brand link (graceful, never broken).
    const headerLogoSrc = assetPathFromUrl(siteConfig.assets?.logo);
    // P12-HG — the optional decorative header band (`site.assets.headerGraphic`,
    // the `header-graphic` role). Resolved on the SERVER through the shared
    // availability rule, so a configured-but-missing file resolves to
    // `undefined` → no band at all (and `node:fs` never reaches the browser).
    // It is painted as the header's OWN background (`headerGraphicBandProps`),
    // so it needs no extra DOM and cannot disturb the header's layout, the
    // page banner, the identity logo or the navigation.
    const headerGraphic = availableHeaderGraphicPath(siteConfig.assets?.headerGraphic);

    // The ≥md header navigation list — composed only for a CUSTOM composition that presents
    // one (NAV1B: neither shipped layout does; a Menu-bar composition presents its navigation
    // in the sticky bottom bar at every width).
    const navListElement = (
        <ContextNavLinks
            locale={locale}
            links={navLinks}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${topModeClass ?? ""}`}
            linkClassName={HEADER_NAV_LINK_CLASS}
        />
    );

    // NAV1B — WHO BELONGS TO THE SECONDARY ROW. `SiteSelector` (only when the deployment
    // serves more than one site), `LocationSwitcher` (only where the active site binds
    // locations) and `LanguageSwitcher` (only when more than one locale is configured) are the
    // existing CONTEXTUAL SELECTION GROUP: the controls that choose the context a page is read
    // in. The navigation-MODE selector is deliberately NOT one of them — it belongs to the top
    // row, beside the identity. A ≥md navigation a custom composition presents is not a
    // dropdown either, but it is secondary chrome: it shares this row rather than disturbing
    // the top row's fixed ownership.
    const siteSelectorPresent = siteSwitch !== undefined && siteSwitch.length > 1;
    const languageSelectorPresent = siteConfig.locales.length > 1;
    const hasSecondaryControls =
        hasHeaderNav || siteSelectorPresent || hasLocations || languageSelectorPresent;

    // P6-3C — NO mobile drawer/overlay CTA is composed here. The primary CTA
    // has ONE authoritative home (the shell's top region, below the header), so
    // the disclosure carries navigation only: opening the drawer can never
    // expose a second Book Now alongside the always-visible top one.
    
    // P12-HG — the optional decorative header band is the header's OWN
    // background layer, so it needs no extra DOM, no stacking context and no
    // `z-index`: a background always paints behind the header's in-flow content
    // (logo, navigation, switchers, mobile trigger) and above the header's own
    // background colour. Unconfigured → no attribute and no inline style, so
    // the header renders exactly as it did before P12-HG.
    return (
        <header className="ui-site-header border-b border-border" {...headerGraphicBandProps(headerGraphic)}>
            <div className="mx-auto max-w-page px-4 py-4">
                {/* ── TOP SEMANTIC ROW — IDENTITY + THE NAVIGATION-MODE SELECTOR ────────
                    NAV1B — this row owns exactly two things, at EVERY width: the identity,
                    and the Sidebar/Menu-bar selector anchored to the right edge of the padded
                    header content. The selector keeps its normal control sizing, never
                    stretches across the row, and never moves into the control row below. The
                    identity takes the remaining space; when the two cannot share one line the
                    identity wraps BELOW the selector (never over it, never moving it). */}
                <div
                    className={
                        headerLogoSrc
                            ? // NAV1B-V1 — A GRAPHIC IDENTITY IS NOT A WRAPPING TEXT COLUMN. The row
                              // keeps ONE track, so the graphic's clamp is the header's own CONTENT
                              // width (never a narrow column), the selector stays in the same cell at
                              // its right edge, and the stylesheet stacks it ABOVE the graphic it
                              // overlaps. The TEXT case below is untouched.
                              "ui-site-header-top ui-site-header-top--graphic grid items-start"
                            : "ui-site-header-top grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2"
                    }
                >
                    <div
                        className={
                            headerLogoSrc
                                ? "ui-site-header-identity min-w-0"
                                : "ui-site-header-identity min-w-0 break-words"
                        }
                    >
                        {headerLogoSrc ? (
                            <Link
                                href={`/${locale}`}
                                aria-label={siteConfig.name}
                                // VIS1C — a >= 44px-tall HIT AREA for the brand/home link.
                                // The lockup artwork stays at its `h-8` visual scale; the
                                // interactive box around it grows so the site's primary
                                // "go home" target is comfortably tappable.
                                className="ui-site-header-brand inline-flex min-h-11 min-w-11 items-center"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={headerLogoSrc}
                                    alt={siteConfig.name}
                                    className="ui-site-header-logo h-8 w-auto"
                                />
                            </Link>
                        ) : (
                            <ContextNavLinks
                                locale={locale}
                                links={[{ href: "/", label: siteConfig.name }]}
                                className="font-semibold tracking-tight"
                                // EN-M — the text brand fallback is the "go home" target for an
                                // adopter with no configured logo; it takes the same ≥44px box
                                // (its own typography and weight are untouched).
                                linkClassName={TOUCH_TARGET_BOX_CLASS}
                            />
                        )}
                    </div>

                    {/* N2/NAV1B — the ONE navigation-MODE control, shown only when the visitor
                        actually has more than one presentation to choose from (the switcher's
                        own `enabled` semantics: disabled → the site presents exactly one
                        effective option, so there is nothing to select and no control). */}
                    {resolved.layoutSwitcher.enabled ? (
                        <div className="ui-site-header-mode justify-self-end">
                            <LayoutSwitcher
                                label={dictionary.layout.label}
                                defaultLayout={resolved.layoutSwitcher.default}
                                labels={{
                                    sidebar: dictionary.layout.sidebar,
                                    "menu-bar": dictionary.layout.menuBar,
                                }}
                            />
                        </div>
                    ) : null}
                </div>

                {/* ── SECONDARY SEMANTIC ROW — EVERY OTHER HEADER CONTROL ───────────────
                    NAV1B — the contextual selectors (Site → Location → Language) and any ≥md
                    header navigation a CUSTOM composition presents live HERE: always below the
                    top row, left-aligned at the padded edge, in normal control sizing. They
                    wrap INSIDE this row when the width needs it and never move up. */}
                {hasSecondaryControls ? (
                    // The shared `Stack` (flex-wrap row + gap + item alignment) owns this row's
                    // flow: its controls wrap INSIDE the row and can never move up. The TOP row is
                    // a two-column grid instead, because its contract is not a wrapping flow —
                    // the selector stays anchored at the right edge while the identity yields
                    // (`Stack` deliberately expresses no column tracks: see `ui/stack.tsx`).
                    <Stack
                        direction="row"
                        gap="gap-x-3 gap-y-2"
                        items="items-center"
                        className="ui-site-header-context mt-3"
                    >
                    {hasHeaderNav ? (
                        <nav
                            aria-label={dictionary.navigation.primaryLabel}
                            className={desktopNavClassName}
                            {...layoutScopeAttributes(
                                "top-nav",
                                layoutHeaderLayouts,
                                resolved.layoutSwitcher.enabled,
                            )}
                        >
                            {navListElement}
                        </nav>
                    ) : null}

                    {/* S1E2 — the SITE selector comes first: it changes the whole context
                        (page tree + labels + navigation), which every other selector then
                        acts INSIDE. Rendered only when the deployment serves more than one
                        site, so a single-site deployment is unchanged. */}
                    {siteSelectorPresent ? (
                        <SiteSelector
                            current={siteId ?? siteConfig.defaultSite.code}
                            label={dictionary.site.label}
                            options={siteSwitch ?? []}
                        />
                    ) : null}
                    {hasLocations ? (
                        <LocationSwitcher
                            locale={locale}
                            label={dictionary.location.label}
                            unspecifiedLabel={dictionary.location.unspecified}
                            regionLabels={regionLabels}
                        />
                    ) : null}
                    {languageSelectorPresent ? (
                        <LanguageSwitcher locale={locale} label={dictionary.language.label} />
                    ) : null}
                    </Stack>
                ) : null}
            </div>
        </header>
    );
}