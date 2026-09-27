import { Heading } from "@/components/ui/heading";
import type { PageDocument, PageSection } from "@/core/page-document";
import {
  CalloutSection,
  ActionsSection,
  DividerSection,
  ProseSection,
  QuoteSection,
} from "./page-sections/text-sections";
import { CardsSection, GallerySection, HeroSection, MediaSection } from "./page-sections/media-sections";
import { FeaturesSection, ListSection, StatsSection, StepsSection } from "./page-sections/items-sections";
import { ColumnsSection, FaqSection, TableSection } from "./page-sections/structure-sections";

/**
 * THE DECLARATIVE PAGE COMPOSER — ONE RENDER ENTRY
 * ===============================================
 *
 * The JSON authoring mode's presentation boundary: a VALIDATED document goes in, a page
 * comes out. It is the only place that knows which section type maps to which Foundation
 * presentation, so no route ever switches on a section type, and it is
 * configuration-independent and site-neutral: it receives the document and the locale of
 * the URL being rendered, and nothing else.
 *
 *   document  →  this composer  →  the shared primitives (`Heading`, `Grid`, `NavItem`,
 *                                   `SafeMarkdownContent`, …) via `./page-sections/*`
 *
 * THE ONE H1. The document's `title` is the page's level-1 heading, rendered here — the
 * same contract the Markdown mode's page title has, so both modes produce exactly one
 * page-level heading and the section vocabulary can never add a second one.
 *
 * The switch below is EXHAUSTIVE over `PageSection["type"]`: the `never` assignment at
 * the end means a new section type cannot be added to the vocabulary without a
 * presentation for it, which is how "validated" and "rendered" cannot drift apart.
 */
export interface PageDocumentContentProps {
  readonly document: PageDocument;
  /** The locale of the URL being rendered — how `route` destinations become hrefs. */
  readonly locale: string;
  /**
   * Whether this composer renders the document's level-1 heading. `true` for a page whose
   * only heading is its title (the generic page route and the locale root). The two
   * dedicated routes (`/connect`, `/contact`) pass `false`, because THEY own the page
   * heading from the interface dictionary — and exactly one h1 must exist either way.
   */
  readonly withTitle?: boolean;
}

/** One section → one presentation. The id is unique per page (used as the label id). */
function renderSection(section: PageSection, locale: string, index: number) {
  const id = `page-section-${index + 1}`;
  switch (section.type) {
    case "hero":
      return <HeroSection key={id} section={section} locale={locale} id={id} />;
    case "prose":
      return <ProseSection key={id} section={section} locale={locale} id={id} />;
    case "media":
      return <MediaSection key={id} section={section} locale={locale} id={id} />;
    case "gallery":
      return <GallerySection key={id} section={section} locale={locale} id={id} />;
    case "actions":
      return <ActionsSection key={id} section={section} locale={locale} id={id} />;
    case "callout":
      return <CalloutSection key={id} section={section} locale={locale} id={id} />;
    case "cards":
      return <CardsSection key={id} section={section} locale={locale} id={id} />;
    case "features":
      return <FeaturesSection key={id} section={section} locale={locale} id={id} />;
    case "columns":
      return <ColumnsSection key={id} section={section} locale={locale} id={id} />;
    case "steps":
      return <StepsSection key={id} section={section} locale={locale} id={id} />;
    case "stats":
      return <StatsSection key={id} section={section} locale={locale} id={id} />;
    case "quote":
      return <QuoteSection key={id} section={section} locale={locale} id={id} />;
    case "table":
      return <TableSection key={id} section={section} locale={locale} id={id} />;
    case "faq":
      return <FaqSection key={id} section={section} locale={locale} id={id} />;
    case "list":
      return <ListSection key={id} section={section} locale={locale} id={id} />;
    case "divider":
      return <DividerSection key={id} />;
    default: {
      // Unreachable: every declared type is handled above. If a type is ever added to
      // the vocabulary without a presentation, this stops the build instead of silently
      // rendering nothing.
      const unhandled: never = section;
      throw new Error(`Unsupported page section reached the renderer: ${JSON.stringify(unhandled)}`);
    }
  }
}

export function PageDocumentContent({ document, locale, withTitle = true }: PageDocumentContentProps) {
  return (
    <>
      {withTitle ? (
        <Heading level={1} tone="title">
          {document.title}
        </Heading>
      ) : null}
      {document.sections.map((section, index) => renderSection(section, locale, index))}
    </>
  );
}
