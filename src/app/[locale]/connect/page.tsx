import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { MarkdownContent } from "@/components/site/markdown-content";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Section } from "@/components/ui/section";
import { Heading } from "@/components/ui/heading";
import { Grid } from "@/components/ui/grid";
import { connectMethodLabel } from "@/components/site/connect-method-label";
import { connectivityIcon } from "@/components/site/connectivity-links";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, buildTwitterData, resolveOgImageUrl } from "@/core/seo-metadata";
import { isInternalHref } from "@/core/regional-pages";

const pageContentRepository = createFileSystemPageContentRepository({
  defaultLocale: siteConfig.defaultLocale,
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface ConnectPageProps {
  readonly params: Promise<{ readonly locale: string }>;
}

function languageAlternates(): Record<string, string> {
  return buildLanguageAlternates({
    baseUrl: siteConfig.url,
    locales: localeCodes,
    defaultLocale: siteConfig.defaultLocale,
    path: "/connect",
  });
}

export async function generateMetadata({ params }: ConnectPageProps): Promise<Metadata> {
  const { locale } = await params;
  const content = await pageContentRepository.findBySlug("connect", locale);

  const title = content?.title ?? "Connect";
  const canonical = `${siteConfig.url}/${locale}/connect`;
  const ogImage = resolveOgImageUrl(siteConfig.assets?.ogImage, siteConfig.url, locale);

  return {
    title,
    description: siteConfig.description,
    alternates: {
      canonical,
      languages: languageAlternates(),
    },
    openGraph: buildOpenGraphData({
      baseUrl: siteConfig.url,
      siteName: siteConfig.name,
      locale,
      title,
      fallbackDescription: siteConfig.description,
      url: canonical,
      imageUrl: ogImage,
      alternateLocales: localeCodes.filter((code) => code !== locale),
    }),
    twitter: buildTwitterData({
      title,
      fallbackDescription: siteConfig.description,
      imageUrl: ogImage,
    }),
  };
}

/**
 * The Connect page (Phase M) — the first-class communication/connection hub.
 * Content is markdown (`content/pages/<locale>/connect.md`); for each
 * configured connection method a card is rendered with the method's label and
 * target. Methods marked `demoOnly` carry a visible demo badge, and the page
 * always displays the demo notice: a visitor can never mistake the template's
 * demonstration options for a real integration.
 *
 * CONNECTIVITY ICON SEAM — a method may also carry the optional generic `icon`
 * asset (`connect.methods[i].icon`). It renders as supplementary, decorative
 * artwork in the `[icon] Label` arrangement and is screened by
 * `availableIconName`, so a method with no icon (or an unavailable one) is still
 * a complete, authoritative text action. The page never names a platform: the
 * runtime learns only "an optional asset belongs to this connectivity item".
 */
export default async function ConnectPage({ params }: ConnectPageProps) {
  const { locale } = await params;
  const content = await pageContentRepository.findBySlug("connect", locale);
  if (!content) notFound();

  const dictionary = getDictionary(locale);

  return (
    <Section as="article">
      <Heading level={1} tone="title">{dictionary.connect.heading}</Heading>
      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>

      <Grid columns="sm:grid-cols-2" gap="gap-4" className="mt-8">
        {siteConfig.connect?.methods.map((method) => {
          const label = connectMethodLabel(dictionary, method);
          return (
            <li
              key={method.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <span className="flex min-w-0 items-center gap-2 font-medium">
                {/* CONNECTIVITY ICON SEAM — optional supplementary artwork in the
                    SAME `[icon] Label` arrangement as the footer. Reserved with
                    the shared size convention (`.ui-nav-item-icon` = 1em, never
                    oversized); decorative only, so the label below stays the
                    authoritative name and the method renders identically when no
                    icon is configured or the configured file is unavailable. */}
                <AssetIcon
                  asset={connectivityIcon(method.icon)}
                  className="ui-nav-item-icon"
                />
                <span className="min-w-0 break-words">{label}</span>
                {method.demoOnly ? (
                  <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                    {dictionary.connect.demoBadge}
                  </span>
                ) : null}
              </span>
              {isInternalHref(method.href) ? (
                <a href={method.href} className="text-sm font-medium text-primary hover:underline">
                  {label}
                </a>
              ) : (
                <a
                  href={method.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {label}
                </a>
              )}
            </li>
          );
        })}
      </Grid>

      <p className="mt-8 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
        {dictionary.connect.demoNotice}
      </p>
    </Section>
  );
}



