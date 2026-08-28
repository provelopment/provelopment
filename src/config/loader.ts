import rawSiteConfig from "../../site.config.json";
import type { z } from "zod";

import { siteConfigFileSchema } from "./schema";
import type { Business, BusinessContact } from "@/core/business";
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

  const business = toNormalizedBusiness(json);

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
    business,
    analytics: json.features?.analytics,
    contactFeature: json.features?.contact,
    offeringsFeature: json.features?.offerings,
    legal: json.legal,
  };
}

/**
 * Builds the normalized `Business` object consumed by the application.
 *
 * The loader is the ONLY place that knows whether the adopter used the new
 * `business` block or legacy top-level `contact`. Every downstream consumer
 * reads the normalized shape, so the bridge can later be removed cleanly.
 */
function toNormalizedBusiness(json: SiteConfigFile): Business {
  const block = json.business;
  const legacyContact = json.contact;

  const contact: BusinessContact = {
    email: block?.contact?.email ?? legacyContact.email,
    phone: block?.contact?.phone ?? legacyContact.phone,
  };

  return {
    timezone: block?.timezone,
    type: block?.type,
    name: block?.name ?? json.site.name,
    tagline: block?.tagline ?? json.site.tagline,
    description: block?.description ?? json.site.description,
    contact,
    locations: (block?.locations ?? []).map((loc) => ({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      geo: loc.geo,
      phone: loc.phone,
      timezone: loc.timezone,
      hours: loc.hours,
    })),
  };
}

/**
 * The application's validated configuration.
 *
 * This is the only sanctioned way to read `site.config.json`; importing
 * the JSON directly anywhere else bypasses validation.
 */
export const siteConfig: SiteConfig = parseSiteConfig(rawSiteConfig);