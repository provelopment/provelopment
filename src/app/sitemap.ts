import type { MetadataRoute } from "next";
import { siteConfig } from "@/config";

/** Static routes that exist in `src/app`. */
const routes = ["", "/about", "/resources"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
  }));
}