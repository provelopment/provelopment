import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";

import { currentBuildRuntimeContext } from "@/config/installation-runtime";

import { layoutForContext, layoutMetadataForContext, spokeServerComposition } from "./server-composition";
import "../globals.css";

/**
 * THE ROOT LAYOUT — the COMPATIBILITY CALLER of the shared document composition (FOUNDATION-MULTISITE-M13)
 * ==========================================================================================================
 *
 * S1 — the ROOT layout of a SITE-SCOPED URL space: `/{site}/{locale}/...`. The document's `lang`, the
 * dictionary, the navigation, the footer and every internal URL belong to ONE site; that site and locale are
 * resolved by the SAME ONE resolver the page uses, inside `./server-composition`.
 *
 * WHAT STAYS HERE is the STATIC PLATFORM: the brand typography, the stylesheet import, the mobile-browser
 * chrome colors and the static-parameter policy. Those are facts about this deployment's platform — not about a
 * request — so they are module-level and are never turned into request state.
 *
 * WHAT MOVED is every Spoke-specific derived value (the site set, the resolved UI configuration, the
 * configured-icon assertion, the analytics provider, the direction-link resolver, the context-bound
 * dictionary access, the context-bound asset answers and the Site-switch destinations): they are derived
 * from the explicit context the route hands to the composition, so two contexts cannot share chrome.
 */

// P6-2D — brand typography (content/assets/branding/branding-schema.md): the brand's primary
// heading/body typeface family is Inter, Plus Jakarta Sans, or Geist Sans;
// Plus Jakarta Sans is the sanctioned brand choice here (the one code-surface
// change CUSTOMIZING.md documents for re-branding fonts). Monospace stays
// Geist Mono — the spec makes no monospace statement.
const brandSans = Plus_Jakarta_Sans({
  variable: "--font-brand-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** The `<html>` class names: the font variables plus the document-level layout/antialiasing facts. */
const HTML_CLASS_NAME = `${brandSans.variable} ${geistMono.variable} h-full antialiased`;

/**
 * Unknown SITES and LOCALES are not rendered on demand: only the (site, locale) combinations the
 * configuration declares are generated, which is what `dynamicParams = false` enforces.
 */
export const dynamicParams = false;

/**
 * Mobile-browser chrome theme colors, mirroring the semantic `--background`
 * token for each scheme (Phase D). Keep in step with the token section of
 * globals.css when re-theming.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

interface LocaleLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly segments?: string[] }>;
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  return layoutMetadataForContext(
    spokeServerComposition(currentBuildRuntimeContext()),
    (await params).segments,
  );
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  // The context is chosen ONCE, here at the boundary — the accepted one-Spoke compatibility seam — and the
  // shared composition derives the whole document from it.
  const composition = spokeServerComposition(currentBuildRuntimeContext());
  return layoutForContext(composition, (await params).segments, children, HTML_CLASS_NAME);
}
