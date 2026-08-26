import rawSiteConfig from "../../site.config.json";
import type { z } from "zod";

import { siteConfigFileSchema } from "./schema";
import type { SiteConfig } from "./site-config";

/** The validated shape of `site.config.json`. */
export type SiteConfigFile = z.infer<typeof siteConfigFileSchema>;

/**
 * Validates a raw configuration object against the schema and maps it to
 * the flattened `SiteConfig` shape consumed by the application.
 *
 * Throws a descriptive error listing every problem when validation fails,
 * so bad edits fail fast at build time.
 */
export function parseSiteConfig(raw: unknown): SiteConfig {
  const result = siteConfigFileSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "(root)";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid site configuration:\n${details}`);
  }

  const json = result.data;

  return {
    url: json.site.url,
    name: json.site.name,
    tagline: json.site.tagline,
    description: json.site.description,
    defaultLocale: json.i18n.defaultLocale,
    locales: json.i18n.locales,
    contact: json.contact,
    socialLinks: json.socialLinks,
    navigation: json.navigation,
    analytics: json.features?.analytics,
  };
}

/**
 * The application's validated configuration.
 *
 * This is the only sanctioned way to read `site.config.json`; importing
 * the JSON directly anywhere else bypasses validation.
 */
export const siteConfig: SiteConfig = parseSiteConfig(rawSiteConfig);