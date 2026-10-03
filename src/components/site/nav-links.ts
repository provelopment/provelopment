import type { RuntimeDictionaryAccess } from "@/config/runtime-dictionaries";
import type { SiteConfig } from "@/config/site-config";
import { effectiveSitePageConfig } from "@/config/site-page-config";

import type { ContextNavLink } from "./context-nav-links";

/**
 * P6-3B — the shipped DEFAULT sidebar navigation-item icons. Every sidebar
 * navigation item shows an icon in the expanded state (the default is a large
 * dot) and a distinct icon in the collapsed state (the default is a large
 * plus). These are project-owned generic assets in `public/assets/`, replaceable
 * in place or per item via `navigation[].iconOpen` / `navigation[].iconClosed`
 * (`site.config.json`) — never generated in code.
 */
export const DEFAULT_SIDEBAR_ITEM_ICON_OPEN = "sidebar-default-icon-open.svg";
export const DEFAULT_SIDEBAR_ITEM_ICON_CLOSED = "sidebar-default-icon-closed.svg";

/**
 * P5-6 — stable navigation-item identity derived from the ORIGINAL
 * `site.config.json` position. `href` is a destination — two entries may
 * legitimately point at the same route — so it must NEVER be React identity.
 * The position-derived identity is stable across renders and survives the
 * sidebar region sort (it rides on each link object), which is why every
 * primary-navigation producer assigns it here; the renderer's `key ?? href`
 * fallback then only covers callers that deliberately supply their own key
 * (e.g. the Connect methods, which already carry `id`).
 */
export const navItemKey = (index: number): string => `nav:${index}`;

/**
 * The site's primary navigation inventory as content-layer nav links.
 *
 * Single source used by BOTH the header nav (Content layer) and the adaptive
 * aside/bottom-bar layers (passed into the Shell Engine as content slots):
 * labels are localized via the dictionary; hrefs stay the configured
 * `site.config.json` entries (region-aware resolution happens in the client
 * nav components via `@/core/regional-pages`). Each item carries its
 * P5-6 position-derived `key` so duplicate destinations keep distinct React
 * identity everywhere the list is rendered (header, aside, disclosure,
 * bottom bar).
 *
 * S1E2 — the list belongs to ONE SITE. The inventory comes from that site's EFFECTIVE page-facing
 * configuration (its own override when configured, else the shared list), the labels from that
 * site's dictionary, and every INTERNAL destination is resolved inside that site+locale
 * (`/about` → `/ca/fr/about`), so two sites with the same route names never point at each other.
 * Omitting `siteId` means the context's default site — the single-site deployment, unchanged.
 *
 * M13 — THE CONFIGURATION, THE DICTIONARIES AND THE ICON URLS ARE ALL INPUTS. This helper is reached by
 * the server composition for whatever context is being rendered, so it may hold no Spoke authority of its
 * own: the site config, the context-bound dictionary access and the context's own asset projection
 * (`availableIconUrl` of `createRuntimeAssetOwnershipResolver(context.runtimeAssetNamespaces)`) arrive as
 * arguments. Nothing here reads a module-global, so two contexts cannot share an answer.
 */
export interface SiteNavLinksOptions {
  /** The rendering context's resolved configuration (never a module-global). */
  readonly siteConfig: SiteConfig;
  /** The same context's dictionary answers. */
  readonly dictionary: RuntimeDictionaryAccess;
  /** The same context's icon projection: `availableIconUrl` of ITS asset resolver. */
  readonly iconUrl: (name: string | undefined) => string | undefined;
  /** The locale PATH KEY of the URL. */
  readonly locale: string;
  /** The site whose page tree the list belongs to. Absent → the context's default site. */
  readonly siteId?: string;
}

export function getSiteNavLinks(options: SiteNavLinksOptions): readonly ContextNavLink[] {
  const { siteConfig, dictionary, iconUrl, locale, siteId } = options;
  const pageConfig = effectiveSitePageConfig(siteConfig, siteId ?? siteConfig.defaultSite.code);
  const words = dictionary.get(locale, pageConfig.site.code);
  return pageConfig.navigation.map((item, index) => ({
    // S1E2 — the DESTINATION stays site-relative (`/about`); the site-aware client resolver
    // (`@/core/regional-pages` → `resolveNavHref`, driven by the URL) puts the current site's
    // prefix in front of it, so a navigation link can never point into another site's tree.
    href: item.href,
    key: navItemKey(index),
    label: words.navigation.items[item.href] ?? item.label,
    // P5-5 — icon/region/disabled flow straight through the shared link path
    // (Configuration → validated schema → NavItem renderer; no component fork).
    // P6-1 — the icon is resolved against the generated runtime namespaces here
    // (the framework boundary), so a missing/unavailable icon never reaches the
    // renderer as a broken-image <img>: unavailable → "" (no icon), absent →
    // undefined. S3F1 — the answer is the URL of the namespace that HOLDS the
    // file, so a Spoke's own artwork is served from that Spoke's namespace.
    // M13 — that namespace set is the RENDERING CONTEXT's own (`options.iconUrl`).
    icon: item.icon === undefined ? undefined : iconUrl(item.icon),
    // P6-3B — the per-state sidebar icons (resolved against the same namespaces
    // as every other configurable icon). Not defaulted here: the SIDEBAR surface
    // opts into the shipped defaults (`withSidebarNavIcons`), so the header
    // top-nav / bottom bar stay byte-identical (no icons unless configured).
    openIcon: item.iconOpen === undefined ? undefined : iconUrl(item.iconOpen),
    closedIcon: item.iconClosed === undefined ? undefined : iconUrl(item.iconClosed),
    position: item.position,
    disabled: item.disabled,
  }));
}

/**
 * P6-3B — sidebar-surface decoration: every SIDEBAR navigation item gets an
 * expanded-state and a collapsed-state icon. Resolution (per the established
 * asset contract):
 *   expanded  = `iconOpen`  ?? `icon` ?? `sidebar-default-icon-open.svg`  (dot)
 *   collapsed = `iconClosed` ?? `icon` ?? `sidebar-default-icon-closed.svg` (plus)
 * A legacy single `icon` therefore drives BOTH states (P5-5 behavior
 * preserved); an item with no icon at all gets the shipped defaults. Applied
 * ONLY to the aside rail content, so the header/bottom-bar surfaces are
 * unaffected.
 */
export function withSidebarNavIcons(
  links: readonly ContextNavLink[],
  iconUrl: (name: string | undefined) => string | undefined,
): readonly ContextNavLink[] {
  return links.map((link) => ({
    ...link,
    // S3F1 — the shipped DEFAULT roles resolve to the namespace that holds them (a Spoke's own
    // namespace in an explicit Installation), so a defaulted icon is never a broken image; `""` (not
    // available in any namespace) keeps the P5-5 no-icon contract. M13 — the namespace set is the
    // RENDERING CONTEXT's own, handed in by the caller.
    openIcon: link.openIcon ?? link.icon ?? iconUrl(DEFAULT_SIDEBAR_ITEM_ICON_OPEN),
    closedIcon: link.closedIcon ?? link.icon ?? iconUrl(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED),
  }));
}