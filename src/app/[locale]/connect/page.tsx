import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { MarkdownContent } from "@/components/site/markdown-content";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
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

  return {
    title: content?.title ?? "Connect",
    alternates: {
      canonical: `${siteConfig.url}/${locale}/connect`,
      languages: languageAlternates(),
    },
  };
}

/**
 * The Connect page (Phase M) — the first-class communication/connection hub.
 * Content is markdown (`content/pages/<locale>/connect.md`); for each
 * configured connection method a card is rendered with the method's label and
 * target. Methods marked `demoOnly` carry a visible demo badge, and the page
 * always displays the demo notice: a visitor can never mistake the template's
 * demonstration options for a real integration.
 */
export default async function ConnectPage({ params }: ConnectPageProps) {
  const { locale } = await params;
  const content = await pageContentRepository.findBySlug("connect", locale);
  if (!content) notFound();

  const dictionary = getDictionary(locale);

  return (
    <article className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{dictionary.connect.heading}</h1>
      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {siteConfig.connect?.methods.map((method) => (
          <li
            key={method.id}
            className="flex items-center justify-between rounded-lg border border-border bg-accent/50 p-4"
          >
            <span className="font-medium">
              {method.label}
              {method.demoOnly ? (
                <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                  {dictionary.connect.demoBadge}
                </span>
              ) : null}
            </span>
            {isInternalHref(method.href) ? (
              <a href={method.href} className="text-sm font-medium text-primary hover:underline">
                {method.label}
              </a>
            ) : (
              <a
                href={method.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                {method.label}
              </a>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-8 rounded-lg border border-border bg-accent p-4 text-sm text-muted-foreground">
        {dictionary.connect.demoNotice}
      </p>
    </article>
  );
}