import type { ResolvedSiteNotice } from "@/core/notice";

/**
 * THE SITE-WIDE NOTICE (R1 — generic shell chrome)
 * ===============================================
 *
 * ONE opt-in message rendered by the shell on EVERY page of the Spoke that enables it, immediately below the
 * persistent header and above page content — never copied into a page's authored content, never a page-level
 * banner (that is `PageBanner`, a per-page decorative region above the header) and never an alert or a dialog.
 *
 * THE PLATFORM OWNS THE MARKUP; THE ADOPTER OWNS THE WORDS. Nothing here knows what the notice is ABOUT: the
 * copy arrives already localized (dictionary `siteNotice.title` / `siteNotice.body`), and the build's copy lock
 * has already refused a Spoke that enables the notice without copy for a locale it serves, so this component
 * can never render an empty band.
 *
 * SEMANTICS
 * ---------
 *   · `<aside role="note">` — an informational companion to the page, announced as such and never a heading
 *     (`<h1>`–`<h6>` levels are the page's own, so the notice cannot disturb the document outline);
 *   · the title is a paragraph, not a heading, for the same reason — visually prominent, semantically neutral;
 *   · the tone is INTENT (`information` | `attention`) carried as a `data-ui-site-notice-tone` attribute the
 *     stylesheet maps onto EXISTING design tokens, so light/dark themes are handled where every other colour is;
 *   · long copy wraps naturally at narrow widths, and no interactive element is created;
 *   · `w-full basis-full` because the band is composed INSIDE the shell's frame, which is a wrapping flex
 *     container at every width (the aside rail sits BESIDE the page from `md` up): a full-width band declares
 *     its own basis there, exactly as the sticky bottom bar does, so it can never be laid out as a SIDEBAR
 *     column beside the content — which is what would grow the document horizontally at a narrow width.
 */
export interface SiteNoticeCopy {
  /** The localized leading line. */
  readonly title: string;
  /** The localized sentence(s). */
  readonly body: string;
}

interface SiteNoticeProps {
  /** The RESOLVED notice (`@/core/notice`): present only when this Spoke presents one. */
  readonly notice: ResolvedSiteNotice;
  /** The current locale's wording for it. */
  readonly copy: SiteNoticeCopy;
}

export function SiteNotice({ notice, copy }: SiteNoticeProps) {
  return (
    <aside
      role="note"
      aria-label={copy.title}
      data-ui-site-notice="true"
      data-ui-site-notice-tone={notice.tone}
      className="ui-site-notice w-full basis-full border-b border-border"
    >
      <div className="mx-auto max-w-page px-4 py-3">
        <p className="break-words text-sm font-semibold text-foreground">{copy.title}</p>
        <p className="mt-1 break-words text-sm text-muted-foreground">{copy.body}</p>
      </div>
    </aside>
  );
}
