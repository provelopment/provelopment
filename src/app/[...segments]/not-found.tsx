import Link from "next/link";
import { segments } from "next/root-params";

import { runtimeContextForCurrentRequest } from "@/config/spoke-request";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
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
 *
 * M17 — THE BOUNDARY RULE APPLIES HERE TOO. Next hands this route no props, so it takes the Spoke the
 * REQUEST selected (the boundary's exact hostname claim, carried on a private upstream header) and reads the
 * configuration, the path context and the dictionary from THAT context. No module-global Spoke authority is
 * involved, and no other Spoke can answer.
 */
export default async function NotFound() {
  const path = await segments();
  // A not-found surface is reached from inside the public route tree, so a selection exists — and if it does
  // not, failing loudly is the only honest answer: never another Spoke's dictionary.
  const context = await runtimeContextForCurrentRequest();
  if (context === null) {
    throw new Error(
      "FOUNDATION-MULTISITE-M17: no Spoke answers this request, so no not-found surface can be composed.",
    );
  }
  const siteConfig = context.siteConfig;
  const request = pathContextOr(
    siteSetOf(siteConfig.sites, siteConfig.defaultSite),
    siteConfig.pageBindings,
    `/${(path ?? []).join("/")}`,
    siteConfig.defaultSite.defaultLocale,
  );
  const dictionary = dictionaryAccessForRuntimeContext(context).get(
    request.localePath,
    request.site.code,
  );

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
          href={sitePath(request.site, request.localePath) as string}
          className="font-medium text-primary hover:underline"
        >
          {dictionary.notFound.returnHome}
        </Link>
      </p>
    </Section>
  );
}