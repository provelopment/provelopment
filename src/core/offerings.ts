import type { PageContent } from "./page-content";
import type { OperationalRegion } from "./region";

/**
 * Offerings content model (Phase C, Tier 1).
 *
 * A deliberately type-agnostic "offering": services, products, packages,
 * programs, consultations, etc. are all represented the same way — no `kind`
 * field, no commerce semantics. `price` is a display-only string; `image` is an
 * optional site-root-relative asset path under `public/`.
 *
 * `content/offerings/` is the canon for which offerings exist (the canonical
 * set is the default-locale slugs); `features.offerings` and `navigation[]` are
 * separate concerns (capability/exposure and discoverability respectively).
 */
/**
 * The intent behind an offering's single call to action.
 *
 * An Offering is descriptive visitor-facing content, NOT an operational entity.
 * These intents only express how a visitor can follow up:
 *
 *  - `book`     → the platform's booking seam (features.booking) — an outbound,
 *                 provider-neutral deep link resolved at the composition boundary;
 *  - `contact`  → the Foundation's contact route (`/{locale}/contact`);
 *  - `external` → the explicitly supplied external/deep link in `href`.
 */
export type OfferingActionIntent = "book" | "contact" | "external";

/** Phase C refinement — the optional single call-to-action on an offering. */
export interface OfferingAction {
  readonly intent: OfferingActionIntent;
  /**
   * Optional label override. Defaults to the localized dictionary label per
   * intent (`booking.book` / `connect.methods.message` / `offerings.externalCta`).
   */
  readonly label?: string;
  /**
   * Required (and allowed) ONLY for `intent: "external"` — the literal
   * external/deep-link destination (syntactic validation only). Forbidden for
   * `book` and `contact`: the platform resolves those destinations.
   */
  readonly href?: string;
}

export interface OfferingsContent extends PageContent {
  /** Required short description used in the listing card and meta description. */
  readonly blurb: string;
  /** Display-only string (e.g. "From $40"). No currency/financial semantics. */
  readonly price?: string;
  /** Optional region-specific price overrides (e.g. { sydney: "From A$150", tokyo: "From ¥15,000" }). */
  readonly regionalPrices?: Readonly<Record<string, string>>;
  /** Optional currency-specific price overrides (e.g. { AUD: "From A$150", EUR: "From €150" }). */
  readonly pricesByCurrency?: Readonly<Record<string, string>>;
  /** Listing sort key (ascending). Omitted entries sort last (then by slug). */
  readonly order?: number;
  /** When true the card is shown first in the listing (before any order sort). */
  readonly featured?: boolean;
  /** Site-root-relative path under `public/`, e.g. `/images/offerings/x.jpg`. */
  readonly image?: string;
  /** "What's included" checklist rendered on the detail page. */
  readonly deliverables?: readonly string[];
  /** Offering-specific Q&A rendered as a native disclosure on the detail page. */
  readonly faq?: readonly { readonly question: string; readonly answer: string }[];
  /** Optional single outbound call-to-action (see `OfferingActionIntent`). */
  readonly action?: OfferingAction;
}

const DEMO_CURRENCY_PRICES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "starter-package": {
    AUD: "From A$150",
    CAD: "From CA$150",
    GBP: "From £150",
    EUR: "From €150",
    USD: "From $150",
    JPY: "From ¥15,000",
    KRW: "From ₩150,000",
    CNY: "From ¥1,000",
    RUB: "From 15 000 ₽",
    IDR: "From Rp 1.500.000",
  },
  consultation: {
    AUD: "From A$40",
    CAD: "From CA$40",
    GBP: "From £40",
    EUR: "From €40",
    USD: "From $40",
    JPY: "From ¥4,000",
    KRW: "From ₩40,000",
    CNY: "From ¥300",
    RUB: "From 4 000 ₽",
    IDR: "From Rp 400.000",
  },
};

/**
 * Resolves the display price for an offering given an optional operational region.
 *
 * 1. If explicit `regionalPrices[region.id]` is defined, use it.
 * 2. If explicit `pricesByCurrency[region.currency]` is defined, use it.
 * 3. If standard demo offering slug matches, use the realistic currency amount.
 * 4. If a region with a configured currencySymbol is provided, replaces `$` with that symbol.
 * 5. Otherwise (unspecified region / default), returns `offering.price`.
 */
export function resolveOfferingPrice(
  offering: {
    readonly slug?: string;
    readonly price?: string;
    readonly regionalPrices?: Readonly<Record<string, string>>;
    readonly pricesByCurrency?: Readonly<Record<string, string>>;
  },
  region?: OperationalRegion | null,
): string | undefined {
  if (!region) {
    return offering.price;
  }

  if (region.id && offering.regionalPrices?.[region.id]) {
    return offering.regionalPrices[region.id];
  }

  if (region.currency && offering.pricesByCurrency?.[region.currency]) {
    return offering.pricesByCurrency[region.currency];
  }

  if (offering.slug && region.currency && DEMO_CURRENCY_PRICES[offering.slug]?.[region.currency]) {
    return DEMO_CURRENCY_PRICES[offering.slug][region.currency];
  }

  if (!offering.price) {
    return undefined;
  }

  if (region.currencySymbol) {
    return offering.price.replace(/\$/g, region.currencySymbol);
  }

  return offering.price;
}

/**
 * Conservative display-price parser for SEO structured data (Phase S).
 *
 * `price` is a DISPLAY-ONLY string (Phase C) — never a modeled numeric/currency
 * value. This parser extracts a bare numeric string for `Service.offers.price`
 * ONLY when the entire value is a simple number with an optional single
 * leading currency symbol, which is stripped but NEVER recorded as currency
 * (`priceCurrency` is never emitted — currency is not modeled). Anything else
 * (ranges such as "From $150", suffixed text like "$2,500 / month", words like
 * "Custom Quote", …) yields `null` and the caller omits `offers`: we never
 * guess. An Offering remains descriptive visitor-facing content.
 */
const leadingCurrencySymbolPattern = /^[$€£¥₽]/;

export function parseDisplayPrice(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const withoutSymbol = trimmed.replace(leadingCurrencySymbolPattern, "");
  return /^\d[\d.,]*$/.test(withoutSymbol) ? withoutSymbol : null;
}

/**
 * A resolved offering action — provider-neutral and framework-free. Components
 * consume THIS shape plus a localized label; they never see providers, config,
 * or the raw `OfferingAction`.
 */
export type ResolvedOfferingAction =
  | { readonly kind: "link"; readonly href: string; readonly external: boolean }
  | { readonly kind: "none" };

/**
 * Already-resolved destinations supplied by the APPLICATION/composition
 * boundary. Passing destinations in (rather than a locale) keeps this pure
 * core resolver framework- and i18n-independent: the boundary resolves the
 * booking seam and the localized internal contact route.
 */
export interface OfferingActionResolution {
  /** External booking destination from the booking seam; `null` when disabled. */
  readonly bookingHref: string | null;
  /** Already-localized internal contact destination (e.g. `/{locale}/contact`). */
  readonly contactHref: string | null;
}

/**
 * Resolves an offering's optional action into a concrete link (or `none`).
 * Deterministic and pure:
 *
 *  - no action           → `none`
 *  - `book`              → external link to the booking seam, or `none` when
 *                          booking is unavailable (never a broken link);
 *  - `contact`           → internal link to the contact route;
 *  - `external`          → literal deep link from `href`.
 */
export function resolveOfferingAction(
  action: OfferingAction | undefined,
  resolution: OfferingActionResolution,
): ResolvedOfferingAction {
  if (!action) return { kind: "none" };

  if (action.intent === "book") {
    return resolution.bookingHref
      ? { kind: "link", href: resolution.bookingHref, external: true }
      : { kind: "none" };
  }

  if (action.intent === "contact") {
    return resolution.contactHref
      ? { kind: "link", href: resolution.contactHref, external: false }
      : { kind: "none" };
  }

  // intent === "external"
  return action.href
    ? { kind: "link", href: action.href, external: true }
    : { kind: "none" };
}

export interface OfferingsListItem {
  readonly slug: string;
  readonly title: string;
  readonly blurb: string;
  readonly price?: string;
  /** Listing sort key (ascending). Omitted entries sort last (then by slug). */
  readonly order?: number;
  readonly featured?: boolean;
  readonly image?: string;
}

/**
 * Minimal shape `sortOfferings` operates on (any object carrying the sort
 * keys). Optionality is preserved so `OfferingsContent` satisfies it directly.
 */
export interface SortableOffering {
  readonly slug: string;
  readonly order?: number;
  readonly featured?: boolean;
}

/**
 * Listing sort: featured first, then `order` ascending (missing last), then
 * slug ascending as a stable tiebreak. Pure and deterministic.
 */
export function sortOfferings<T extends SortableOffering>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const featuredA = a.featured ? 1 : 0;
    const featuredB = b.featured ? 1 : 0;
    if (featuredA !== featuredB) return featuredB - featuredA;

    const orderA = a.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.order ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;

    return a.slug.localeCompare(b.slug);
  });
}

/**
 * An offering slug is canonical only when it exists in the default locale.
 * This prevents the ambiguous case of an offering that exists solely in a
 * non-default locale silently falling back to English under a different slug.
 */
export function isCanonicalOffering(slug: string, canonicalSlugs: readonly string[]): boolean {
  return canonicalSlugs.includes(slug);
}