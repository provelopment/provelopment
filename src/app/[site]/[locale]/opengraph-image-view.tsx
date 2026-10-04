/**
 * THE OPENGRAPH IMAGE VIEW (FOUNDATION-MULTISITE-M16)
 * ==================================================
 *
 * The VISUAL part of the social image — its size, its content type and the pure style constants that draw it —
 * extracted so BOTH boundaries that render it compose exactly ONE view:
 *
 *   `/[site]/[locale]/opengraph-image`          the ONE-Spoke compatibility boundary (public path)
 *   `/~spoke/[segment]/[site]/[locale]/…`       the hostname-selected Spoke (internal path)
 *
 * Neither boundary owns a style, a size or a word: the Spoke-specific values come from the context-bound
 * model (`./opengraph-model`), and the two boundaries cannot drift apart because there is one view.
 */
import type { ReactElement } from "react";

import type { OpenGraphImageModel } from "./opengraph-model";

/** The image's fixed platform size. */
export const OPEN_GRAPH_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** The image's fixed content type. */
export const OPEN_GRAPH_IMAGE_CONTENT_TYPE = "image/png";

/** The branded preview: the context's name, its localized tagline and its canonical origin. */
export function openGraphImageElement(model: OpenGraphImageModel): ReactElement {
  return (
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
        {model.siteName}
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
        {model.tagline}
      </div>

      <div style={{ display: "flex", fontSize: 26, color: "#a3a3a3" }}>{model.imageUrl}</div>
    </div>
  );
}
