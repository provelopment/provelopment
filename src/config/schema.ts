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
});

export const siteConfigFileSchema = z.object({
  site: siteSettingsSchema,
  i18n: i18nConfigSchema,
  contact: contactConfigSchema,
  socialLinks: z.array(socialLinkSchema),
  navigation: z.array(navigationItemSchema),
  features: featuresConfigSchema.optional(),
});