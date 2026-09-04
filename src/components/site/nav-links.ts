import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";

import type { ContextNavLink } from "./context-nav-links";

/**
 * The site's primary navigation inventory as content-layer nav links.
 *
 * Single source used by BOTH the header nav (Content layer) and the adaptive
 * aside/bottom-bar layers (passed into the Shell Engine as content slots):
 * labels are localized via the dictionary; hrefs stay the configured
 * `site.config.json` entries (region-aware resolution happens in the client
 * nav components via `@/core/regional-pages`).
 */
export function getSiteNavLinks(locale: string): readonly ContextNavLink[] {
  const dictionary = getDictionary(locale);
  return siteConfig.navigation.map((item) => ({
    href: item.href,
    label: dictionary.navigation.items[item.href] ?? item.label,
  }));
}