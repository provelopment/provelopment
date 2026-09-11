import { siteConfig } from "@/config";
import { assetPathFromUrl } from "@/config/assets";

/**
 * TitleBar (P6-2D — Foundation Brand Presentation & Title Bar).
 *
 * Renders the `logo-title` generic branding role (`site.assets.logoTitle`,
 * the real runtime file at `public/assets/logo-title.jpg`) as the Foundation's
 * principal page-title brand mark — the visual position the P6-2D mission
 * calls out as primary, distinct from the header (which stays text-only) and
 * from `logo-header`/`logo-footer` (JSON-LD / footer roles).
 *
 * Contract:
 *  - RESOLVED-CONFIG driven: reads `siteConfig.assets?.logoTitle` — never a
 *    hard-coded Provelopment filename. Absent → renders nothing (the shared
 *    generic-asset-role convention: an adopter without a title logo yet gets
 *    no broken image, exactly like every other `site.assets.*` leaf).
 *  - Deliberate plain `<img>` (mirrors `NavItem`'s icon-asset precedent,
 *    `src/components/ui/nav-item.tsx`): `site.assets.*` values are adopter-
 *    owned ABSOLUTE URLs (FS-4) that may point at any host/CDN, so this stays
 *    outside the Next.js Image optimizer's local/allow-listed-domain
 *    requirement — no `next.config.ts` `images.remotePatterns` coupling to a
 *    specific deployment's asset host is ever required. `assetPathFromUrl`
 *    (`src/config/assets.ts`) re-derives the same-origin path portion, so
 *    the rendered `<img>` always resolves against the CURRENT origin (never
 *    coupled to whether the configured `site.url` matches the browser's
 *    actual host — the same reasoning `<link rel="canonical">`/JSON-LD do
 *    NOT need, since those are meant to name the site's own canonical URL).
 *  - INTRINSIC aspect ratio preserved via explicit `width`/`height` (the
 *    actual shipped asset is 240×135 ≈ 16:9) — never stretched/cropped; the
 *    box scales responsively (`height: auto`, capped by `max-width`) so it
 *    never overflows its container or collides with navigation.
 *  - MEANINGFUL image: the shipped artwork carries the wordmark + tagline as
 *    pixels, so `alt` is the real accessible name (`siteConfig.name`) — never
 *    an empty/decorative alt for a mark that is the page's visual identity.
 *  - Rendered ONCE, above the shell (header/nav/main), on every locale/page —
 *    never duplicated per-route, never substituting `logo-header`.
 *  - Framework-neutral position: this lives in `components/site` (the
 *    content layer, same tier as `SiteHeader`/`SiteFooter`), NOT
 *    `components/ui` — it is config-driven, which the shared UI primitives
 *    boundary forbids.
 */
export function TitleBar() {
  const logoTitle = siteConfig.assets?.logoTitle;
  if (!logoTitle) return null;

  return (
    <div className="ui-title-bar border-b border-border bg-background">
      <div className="mx-auto flex max-w-page items-center justify-center px-4 py-6 sm:py-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetPathFromUrl(logoTitle)}
          alt={siteConfig.name}
          width={240}
          height={135}
          className="ui-title-bar-logo h-auto max-w-full"
        />
      </div>
    </div>
  );
}
