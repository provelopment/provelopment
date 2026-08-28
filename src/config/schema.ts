import { z } from "zod";

/**
 * Schema contract for `site.config.json`.
 *
 * The JSON file is edited by humans and downstream clones; this schema is
 * what makes a bad edit fail fast at build time with an actionable
 * message instead of producing a broken site.
 */

const localeCodePattern = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const localeCode = z
  .string()
  .regex(
    localeCodePattern,
    "must be a BCP 47-style locale code such as 'en' or 'pt-BR'",
  );

export const localeConfigSchema = z.object({
  code: localeCode,
  label: z.string().min(1, "must not be empty"),
});

export const siteSettingsSchema = z.object({
  url: z
    .url("must be an absolute URL including protocol, e.g. https://example.com")
    .refine((url) => !url.endsWith("/"), "must not end with a trailing slash"),
  name: z.string().min(1, "must not be empty"),
  tagline: z.string().min(1, "must not be empty"),
  description: z.string().min(1, "must not be empty"),
});

export const i18nConfigSchema = z
  .object({
    defaultLocale: localeCode,
    locales: z.array(localeConfigSchema).min(1, "must list at least one locale"),
  })
  .refine(
    (i18n) => i18n.locales.some((locale) => locale.code === i18n.defaultLocale),
    {
      message: "defaultLocale must match the code of one entry in locales",
    },
  );

export const contactConfigSchema = z.object({
  email: z.email().optional(),
  phone: z.string().min(1).optional(),
});

const weekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm in 24-hour format");

/**
 * Validates a real IANA timezone identifier using the runtime's `Intl`
 * timezone table (the authoritative, cross-platform list — not a hand-written
 * zone list). Node/ICU throws for unknown identifiers, so a typo in config
 * fails validation at build time with an actionable message.
 */
function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const ianaTimeZoneSchema = z.string().refine(isIanaTimeZone, {
  message:
    "must be a valid IANA timezone identifier, e.g. 'Asia/Jakarta' or 'America/New_York'",
});

const addressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  region: z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
});

const geoCoordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const openIntervalSchema = z
  .object({
    days: z.array(weekdaySchema).min(1, "must list at least one day"),
    open: timeSchema,
    close: timeSchema,
  })
  // A 24h/continuous schedule is intentionally ambiguous in this model
  // (a full-day interval would be 00:00–24:00, not expressible), so reject
  // `open === close`. Overnight (`close < open`) is fully supported.
  .refine((i) => i.open !== i.close, "open and close must differ");

const exceptionalHoursSchema = z.object({
  // ISO date YYYY-MM-DD (validated loosely; content owns correctness).
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  closed: z.boolean().optional(),
  open: timeSchema.optional(),
  close: timeSchema.optional(),
});

const businessHoursSchema = z.object({
  intervals: z.array(openIntervalSchema),
  exceptional: z.array(exceptionalHoursSchema),
});

const businessLocationSchema = z.object({
  id: z.string().min(1, "must not be empty"),
  name: z.string().min(1).optional(),
  address: addressSchema,
  geo: geoCoordsSchema.optional(),
  phone: z.string().min(1).optional(),
  timezone: ianaTimeZoneSchema.optional(),
  hours: businessHoursSchema.optional(),
});

const businessTypeSchema = z.enum([
  "Organization",
  "LocalBusiness",
  "ProfessionalService",
  "Restaurant",
  "Store",
]);

const businessSchema = z.object({
  timezone: ianaTimeZoneSchema.optional(),
  type: businessTypeSchema.optional(),
  name: z.string().min(1).optional(),
  tagline: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  contact: contactConfigSchema.optional(),
  locations: z.array(businessLocationSchema).min(1, "must list at least one location").optional(),
});

export const socialLinkSchema = z.object({
  platform: z.string().min(1, "must not be empty"),
  label: z.string().min(1, "must not be empty"),
  href: z.url("must be an absolute URL including protocol"),
});

export const navigationItemSchema = z.object({
  label: z.string().min(1, "must not be empty"),
  href: z.string().min(1, "must not be empty"),
});

export const featuresConfigSchema = z.object({
  /** Optional functionality, each consumed by its own adapter. */
  analytics: z
    .object({
      provider: z.literal("vercel", {
        message: "supported providers: vercel",
      }),
    })
    .optional(),
  /**
   * Contact inquiry capability. `stub` is the explicit demo default; `webhook`
   * requires the CONTACT_WEBHOOK_URL environment variable at runtime (never
   * stored in this file — secrets are environment-backed).
   */
  contact: z
    .object({
      provider: z.enum(["webhook", "stub"], {
        message: "supported providers: webhook, stub",
      }),
      fields: z
        .object({
          subject: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  /**
   * Offerings catalog (Phase C). Boolean flag: when `true` the `/offerings`
   * routes are enabled and exposed (and included in the sitemap). Controlled
   * independently of `navigation[]` and of the presence of content.
   */
  offerings: z.boolean().optional(),
});

export const siteConfigFileSchema = z.object({
  site: siteSettingsSchema,
  i18n: i18nConfigSchema,
  contact: contactConfigSchema,
  socialLinks: z.array(socialLinkSchema),
  navigation: z.array(navigationItemSchema),
  business: businessSchema.optional(),
  features: featuresConfigSchema.optional(),
});