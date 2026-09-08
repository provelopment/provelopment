import { siteConfig } from "@/config";
import { availableIconName } from "@/config/assets";
import { getDictionary } from "@/config/i18n";

import type { ContextNavLink } from "./context-nav-links";

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
    position: item.position,
    disabled: item.disabled,
  }));
}