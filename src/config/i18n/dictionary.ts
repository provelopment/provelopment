/**
 * User-facing interface strings for one locale.
 *
 * Components must render interface copy from a dictionary; hard-coded
 * user-facing copy in components violates the internationalization
 * boundary.
 */
export interface Dictionary {
  readonly sections: {
    readonly about: string;
    readonly contact: string;
    readonly connect: string;
    readonly navigate: string;
  };
  readonly navigation: {
    readonly primaryLabel: string;
    readonly footerLabel: string;
  };
  readonly notFound: {
    readonly title: string;
    readonly message: string;
    readonly returnHome: string;
  };
}