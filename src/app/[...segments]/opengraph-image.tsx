import { ImageResponse } from "next/og";

import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { pathContextOr, siteLocalePath, siteSetOf } from "@/core/site";

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

interface OpengraphImageProps {
  readonly params: Promise<{ readonly segments?: string[] }>;
}

/**
 * Generates a branded social preview image at build time.
 *
 * S1 — the image is SITE-SCOPED like the page it belongs to: the path resolves to exactly one
 * site + locale (an unknown path deterministically to the default site), so the tagline and the
 * printed address are that site's.
 */
export default async function OpengraphImage({ params }: OpengraphImageProps) {
  const { segments } = await params;
  const request = pathContextOr(
    siteSetOf(siteConfig.sites, siteConfig.defaultSite),
    siteConfig.pageBindings,
    `/${(segments ?? []).join("/")}`,
    siteConfig.defaultSite.defaultLocale,
  );
  const dictionary = getDictionary(request.localePath, request.site.code);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1e3a8a 100%)",
          padding: "80px",
          color: "#ededed",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#60a5fa",
          }}
        >
          {siteConfig.name}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 940,
          }}
        >
          {dictionary.home.tagline}
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#a3a3a3" }}>
          {`${siteConfig.url}${siteLocalePath(request.site, request.localePath)}`}
        </div>
      </div>
    ),
    size,
  );
}