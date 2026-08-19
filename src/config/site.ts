import type { SiteConfig } from "./site-config";

export const siteConfig = {
  name: "Provelopment",
  tagline: "Open source software and education for the modern web",
  description:
    "Provelopment helps small businesses build and maintain a strong web presence through open source software, practical education, and developer-focused resources.",
  contact: {
    email: "hello@provelopment.com",
  },
  socialLinks: [
    {
      platform: "github",
      label: "GitHub",
      href: "https://github.com/provelopment",
    },
    {
      platform: "youtube",
      label: "YouTube",
      href: "https://www.youtube.com/@provelopment",
    },
  ],
  navigation: [
    {
      label: "Home",
      href: "/",
    },
    {
      label: "About",
      href: "/about",
    },
    {
      label: "Resources",
      href: "/resources",
    },
  ],
} satisfies SiteConfig;