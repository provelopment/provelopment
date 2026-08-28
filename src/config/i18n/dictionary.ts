import { z } from "zod";

/**
 * Zod schema for a single locale's user-facing interface strings.
 *
 * The schema is the source of truth; `Dictionary` is derived from it via
 * `z.infer`, so a component-visible type can never drift from the runtime
 * validator. Each locale's JSON under `config/i18n/<locale>.json` is
 * validated against this at module load, so a malformed or incomplete
 * translation fails the build (or tests) with actionable errors.
 *
 * The schema establishes shape and required keys only. It does NOT attempt
 * to judge translation quality — native-speaker review is a separate concern.
 */
export const dictionarySchema = z.object({
  /** Localized home-page hero copy shown above the fold. */
  home: z.object({
    tagline: z.string(),
    description: z.string(),
  }),
  sections: z.object({
    about: z.string(),
    contact: z.string(),
    connect: z.string(),
    navigate: z.string(),
  }),
  navigation: z.object({
    primaryLabel: z.string(),
    footerLabel: z.string(),
    /** Localized navigation-item labels keyed by href (`"/"`, `"/about"`, …). */
    items: z.record(z.string(), z.string()),
  }),
  notFound: z.object({
    title: z.string(),
    message: z.string(),
    returnHome: z.string(),
  }),
  /** Accessible label for the locale selector. */
  language: z.object({
    label: z.string(),
  }),
  /** Business-profile labels (open/closed/hours display). */
  business: z.object({
    open: z.string(),
    closed: z.string(),
    noHours: z.string(),
    hoursLabel: z.string(),
  }),
  /** Generic accessibility UI strings. */
  a11y: z.object({
    skipToContent: z.string(),
  }),
  /** Contact form strings (Phase B). */
  contact: z.object({
    heading: z.string(),
    nameLabel: z.string(),
    emailLabel: z.string(),
    subjectLabel: z.string(),
    messageLabel: z.string(),
    submit: z.string(),
    sending: z.string(),
    honeypotLabel: z.string(),
    success: z.string(),
    demoNotice: z.string(),
    unconfigured: z.string(),
    configError: z.string(),
    sendError: z.string(),
    errors: z.object({
      name: z.string(),
      email: z.string(),
      subject: z.string(),
      message: z.string(),
    }),
  }),
});

export type Dictionary = z.infer<typeof dictionarySchema>;
export type DictionaryType = typeof dictionarySchema;