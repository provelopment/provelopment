import type { MetadataRoute } from "next";
import { siteConfig } from "@/config";

/** Static routes that exist under `src/app/[locale]`. */
const routes = ["", "/about", "/resources"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const rootEntry: MetadataRoute.Sitemap = [
    {
      url: siteConfig.url,
      lastModified,
    },
  ];

  const localizedEntries: MetadataRoute.Sitemap = siteConfig.locales.flatMap(
    ({ code }) =>
      routes.map((route) => ({
        url: `${siteConfig.url}/${code}${route}`,
        lastModified,
      })),
  );

  return [...rootEntry, ...localizedEntries];
}