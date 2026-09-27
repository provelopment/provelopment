import Link from "next/link";
import { segments } from "next/root-params";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { pathContextOr, sitePath, siteSetOf } from "@/core/site";
import { StatusGraphic } from "@/components/site/status-graphic";
import { Section } from "@/components/ui/section";

/**
 * The 404 status page.
 *
 * S1 — the status page is SITE-SCOPED like every other URL: the root params name the site
 * scope, so the copy is the locale's dictionary and the "return home" link is the CURRENT
 * site's home (a bare `/` would negotiate from scratch and could land on another site's URLs).
 * An unknown path resolves deterministically to the default site — never a guess about which
 * site the visitor meant.
 */
export default async function NotFound() {
  const path = await segments();
  const request = pathContextOr(
    siteSetOf(siteConfig.sites, siteConfig.defaultSite),
    siteConfig.pageBindings,
    `/${(path ?? []).join("/")}`,
    siteConfig.defaultSite.defaultLocale,
  );
  const dictionary = getDictionary(request.locale);

  return (
    <Section className="py-24 text-center">
      {/* P12-SG — optional decorative status graphic (ONE role shared with
          `error.tsx`, which renders this identical status frame). Renders
          NOTHING when unconfigured, so the heading/message/link below remain the
          complete expression of the state. */}
      <StatusGraphic />
      <h1 className="text-4xl font-bold tracking-tight">
        {dictionary.notFound.title}
      </h1>
      <p className="mt-4 text-muted-foreground">{dictionary.notFound.message}</p>
      <p className="mt-6">
        <Link
          href={sitePath(request.site, request.locale) as string}
          className="font-medium text-primary hover:underline"
        >
          {dictionary.notFound.returnHome}
        </Link>
      </p>
    </Section>
  );
}