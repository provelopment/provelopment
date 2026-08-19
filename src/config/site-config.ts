export interface SocialLink {
  readonly platform: string;
  readonly label: string;
  readonly href: string;
}

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
}

export interface ContactConfig {
  readonly email?: string;
  readonly phone?: string;
}

export interface SiteConfig {
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly contact: ContactConfig;
  readonly socialLinks: readonly SocialLink[];
  readonly navigation: readonly NavigationItem[];
}