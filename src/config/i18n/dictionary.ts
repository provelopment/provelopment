/**
 * User-facing interface strings for one locale.
 *
 * Components must render interface copy from a dictionary; hard-coded
 * user-facing copy in components violates the internationalization
 * boundary.
 */
export interface Dictionary {
  /** Localized home-page hero copy shown above the fold. */
  readonly home: {
    readonly tagline: string;
    readonly description: string;
  };
  readonly sections: {
    readonly about: string;
    readonly contact: string;
    readonly connect: string;
    readonly navigate: string;
  };
  readonly navigation: {
    readonly primaryLabel: string;
    readonly footerLabel: string;
    /**
     * Localized navigation-item labels keyed by href (`"/"`, `"/about"`,
     * …). Lookups fall back to the label configured in `site.config.json`
     * when a key is missing, so custom pages need no dictionary entry.
     */
    readonly items: { readonly [href: string]: string };
  };
  readonly notFound: {
    readonly title: string;
    readonly message: string;
    readonly returnHome: string;
  };
}