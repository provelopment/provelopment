import { siteConfig } from "@/config";
import { availableIconName } from "@/config/assets";
import { getDictionary } from "@/config/i18n";

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
 */
export function getSiteNavLinks(locale: string): readonly ContextNavLink[] {
  const dictionary = getDictionary(locale);
  return siteConfig.navigation.map((item, index) => ({
    href: item.href,
    key: navItemKey(index),
    label: dictionary.navigation.items[item.href] ?? item.label,
    // P5-5 — icon/region/disabled flow straight through the shared link path
    // (Configuration → validated schema → NavItem renderer; no component fork).
    // P6-1 — the icon is screened against public/assets here (the framework
    // boundary), so a missing/unavailable icon never reaches the renderer as a
    // broken-image <img>: unavailable → "" (no icon), absent → undefined.
    icon: item.icon === undefined ? undefined : availableIconName(item.icon),
    // P6-3B — the per-state sidebar icons (screened against public/assets like
    // every other configurable icon). Not defaulted here: the SIDEBAR surface
    // opts into the shipped defaults (`withSidebarNavIcons`), so the header
    // top-nav / bottom bar stay byte-identical (no icons unless configured).
    openIcon: item.iconOpen === undefined ? undefined : availableIconName(item.iconOpen),
    closedIcon: item.iconClosed === undefined ? undefined : availableIconName(item.iconClosed),
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
export function withSidebarNavIcons(links: readonly ContextNavLink[]): readonly ContextNavLink[] {
  return links.map((link) => ({
    ...link,
    openIcon: link.openIcon ?? link.icon ?? DEFAULT_SIDEBAR_ITEM_ICON_OPEN,
    closedIcon: link.closedIcon ?? link.icon ?? DEFAULT_SIDEBAR_ITEM_ICON_CLOSED,
  }));
}