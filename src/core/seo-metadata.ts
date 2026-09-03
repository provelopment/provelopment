/**
 * Phase S — pure, framework-free metadata helpers.
 *
 * No React, no Next.js, no adapters, no config loaders, no locale machinery.
 * Callers (the app/composition boundary) pass already-resolved values derived
 * from `siteConfig` and route context; these helpers only shape them
 * deterministically so every page's OpenGraph + Twitter metadata is consistent
 * and derived — never hardcoded, never duplicated across pages.
 */

export interface OpenGraphDataOptions {
  /** Deployed origin, e.g. `https://example.com` (`siteConfig.url`). */
  readonly baseUrl: string;
  readonly siteName: string;
  /** Configured BCP-47 locale code, passed through unchanged (no mapping). */
  readonly locale: string;
  /** Page title (also emits the document `<title>` at the boundary). */
  readonly title: string;
  /** Page-specific description; falls back to `fallbackDescription`. */
  readonly description?: string;
  /** Site-level description (`siteConfig.description`) used as the fallback. */
  readonly fallbackDescription?: string;
  /** Absolute canonical URL of this page; defaults to `${baseUrl}/${locale}`. */
  readonly url?: string;
  /**
   * Absolute social-preview image URL. Defaults to the existing generated
   * per-locale route `${baseUrl}/${locale}/opengraph-image`.
   */
  readonly imageUrl?: string;
  /** Every other configured locale, emitted as `og:locale:alternate`. */
  readonly alternateLocales?: readonly string[];
}

export interface OpenGraphData {
  readonly title: string;
  readonly description: string;
  readonly type: "website";
  readonly url: string;
  readonly siteName: string;
  readonly locale: string;
  readonly images: { readonly url: string }[];
  readonly alternateLocale?: string[];
}

/** Builds the deterministic OpenGraph metadata object for a page. */
export function buildOpenGraphData(options: OpenGraphDataOptions): OpenGraphData {
  const {
    baseUrl,
    siteName,
    locale,
    title,
    description,
    fallbackDescription,
    url,
    imageUrl,
    alternateLocales,
  } = options;

  const data: OpenGraphData = {
    title,
    description: description?.trim() || fallbackDescription?.trim() || "",
    type: "website",
    url: url ?? `${baseUrl}/${locale}`,
    siteName,
    locale,
    images: [{ url: imageUrl ?? `${baseUrl}/${locale}/opengraph-image` }],
    ...(alternateLocales && alternateLocales.length > 0
      ? { alternateLocale: [...alternateLocales] }
      : {}),
  };

  return data;
}

export interface TwitterDataOptions {
  readonly title: string;
  /** Page-specific description; falls back to `fallbackDescription`. */
  readonly description?: string;
  /** Site-level description used as the fallback. */
  readonly fallbackDescription?: string;
  /** Absolute image URL for the `summary_large_image` card. */
  readonly imageUrl: string;
}

export interface TwitterData {
  readonly card: "summary_large_image";
  readonly title: string;
  readonly description: string;
  readonly images: string[];
}

/** Builds the deterministic Twitter card metadata object for a page. */
export function buildTwitterData(options: TwitterDataOptions): TwitterData {
  return {
    card: "summary_large_image",
    title: options.title,
    description: options.description?.trim() || options.fallbackDescription?.trim() || "",
    images: [options.imageUrl],
  };
}