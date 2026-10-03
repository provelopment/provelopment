import type { BookingActionResolver } from "@/application/booking-action";
import type { ResolvedPage } from "@/adapters/content/page-sources";
import { BookingAction } from "@/components/site/booking-action";
import { connectMethodLabel } from "@/components/site/connect-method-label";
import { connectivityIcon } from "@/components/site/connectivity-links";
import { ContactForm } from "@/components/site/contact-form";
import { PageDocumentContent } from "@/components/site/page-document-content";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Grid } from "@/components/ui/grid";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import type { RuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import type { RuntimeDictionaryAccess } from "@/config/runtime-dictionaries";
import type { SiteConfig } from "@/config/site-config";

/**
 * THE DEDICATED PAGE CHROME (S1); CONTEXT-BOUND INPUTS (FOUNDATION-MULTISITE-M13)
 * ===============================================================================
 *
 * Two URLs carry specialised chrome rather than the generic page frame — `/connect` (the
 * connectivity inventory) and `/contact` (the contact form) — and a site with no authored home
 * page keeps the configuration-driven starter homepage. All three are ordinary pages at the
 * SOURCE level (authored under `content/pages/<siteId>/<locale>/…` like any other), resolved by
 * the SAME page-source composition the route uses.
 *
 * They live HERE rather than as sibling route files because a site-scoped URL space
 * (`/{sitePrefix}/{locale}/…`) cannot express them as static routes: their URL carries no fixed
 * number of leading segments. Nothing here decides where a page comes from — each component
 * renders a page the route already resolved, inside ONE site's context.
 *
 * M13 — THE CHROME'S FACTS ARE INPUTS: the rendering context's configuration, its dictionary
 * answers and its asset resolver (for the connectivity-icon screening) arrive from the shared
 * composition, so these pages cannot read another Spoke's configuration. The booking-action
 * resolver is likewise built from the SAME context's configuration by the composition.
 */
interface DedicatedPageChrome {
  readonly locale: string;
  readonly siteId?: string;
  /** The rendering context's configuration (never a module-global). */
  readonly siteConfig: SiteConfig;
  /** The same context's dictionary answers. */
  readonly dictionaryAccess: RuntimeDictionaryAccess;
  /** The same context's asset resolver — connectivity icons are screened against ITS namespaces. */
  readonly assets: RuntimeAssetOwnershipResolver;
}

/** The Connect page: the dictionary heading, the authored body, the configured methods. */
export function ConnectPageContent({
  locale,
  siteId,
  page,
  siteConfig,
  dictionaryAccess,
  assets,
}: DedicatedPageChrome & { readonly page: ResolvedPage }) {
  const dictionary = dictionaryAccess.get(locale, siteId ?? siteConfig.defaultSite.code);

  return (
    <Section as="article">
      <Heading level={1} tone="title">
        {dictionary.connect.heading}
      </Heading>
      <div className="mt-6">
        {page.kind === "markdown" ? (
          <SafeMarkdownContent markdown={page.body} />
        ) : (
          // A JSON page authored for `/connect` supplies its sections; this page keeps its own
          // heading (the interface dictionary owns the h1), so the document's title is metadata
          // rather than a second page-level heading.
          <PageDocumentContent document={page.document} locale={locale} withTitle={false} />
        )}
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
                <AssetIcon
                  asset={connectivityIcon(method.icon, assets.availableIconUrl)}
                  className="ui-nav-item-icon"
                />
                <span className="min-w-0 break-words">{label}</span>
                {method.demoOnly ? (
                  <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                    {dictionary.connect.demoBadge}
                  </span>
                ) : null}
              </span>
              <a
                href={method.href}
                {...(method.href.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" })}
                className="text-sm font-medium text-primary hover:underline"
              >
                {label}
              </a>
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

/** The Contact page: the dictionary heading, the authored body, the configured form. */
export function ContactPageContent({
  locale,
  siteId,
  page,
  siteConfig,
  dictionaryAccess,
}: DedicatedPageChrome & { readonly page: ResolvedPage }) {
  const dictionary = dictionaryAccess.get(locale, siteId ?? siteConfig.defaultSite.code);
  const config = siteConfig.contactFeature;
  const demoMode = config?.provider === "stub";

  return (
    <Section as="article">
      <Heading level={1} tone="title">
        {dictionary.contact.heading}
      </Heading>

      {demoMode ? (
        <p className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          {dictionary.contact.demoNotice}
        </p>
      ) : null}

      <div className="mt-6">
        {page.kind === "markdown" ? (
          <SafeMarkdownContent markdown={page.body} />
        ) : (
          <PageDocumentContent document={page.document} locale={locale} withTitle={false} />
        )}
      </div>
      <div className="mt-8">
        <ContactForm config={config} locale={locale} dict={dictionary.contact} />
      </div>
    </Section>
  );
}

/**
 * The generic starter homepage: configuration + dictionary copy, rendered ONLY when the site
 * authors no home page of its own. Authoring one is optional and changes nothing else.
 */
export function StarterHome({
  locale,
  siteId,
  siteConfig,
  dictionaryAccess,
  bookingActions,
}: Omit<DedicatedPageChrome, "assets"> & { readonly bookingActions: BookingActionResolver }) {
  const dictionary = dictionaryAccess.get(locale, siteId ?? siteConfig.defaultSite.code);

  return (
    <>
      <header className="home-hero mx-auto max-w-page px-4 pt-16 pb-10">
        <div className="home-hero-copy">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {siteConfig.name}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {dictionary.home.tagline}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            {dictionary.home.description}
          </p>
        </div>
        <div className="home-hero-actions mt-6">
          {dictionary.booking?.book ? (
            <BookingAction
              action={bookingActions.resolve({ locale })}
              label={dictionary.booking.book}
            />
          ) : null}
        </div>
      </header>

      <section aria-labelledby="home-about-heading" className="mx-auto max-w-page px-4 pb-16">
        <div className="home-card rounded-lg border border-border bg-muted p-6">
          <Heading level={2} tone="section" id="home-about-heading">
            {dictionary.sections.about}
          </Heading>
          <p className="mt-2 text-muted-foreground">{dictionary.home.description}</p>
        </div>
      </section>
    </>
  );
}
