/**
 * VIS2S / R1 — THE SHARED FOOTER LINK TARGET CONTRACT.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The footer's links were plain inline text anchors with no minimum box, so every
 * one of them measured exactly one line tall (21px) — and the narrowest, a short
 * label like `Help`, measured 36×21. The interactive target therefore depended on
 * the LENGTH OF A LABEL, which is not something a visitor can be asked to
 * compensate for.
 *
 * The floor is the one the shared shell already applies to the header brand and
 * the mobile navigation trigger (`inline-flex min-h-11 min-w-11 items-center`):
 * Tailwind's `11` is `2.75rem` = **44px**, the programme's interactive-target
 * contract. Footer links keep their existing typography and colour treatment —
 * only the interactive BOX is guaranteed, never enlarged type.
 *
 * R1 — AND THE BOX MUST BE ABLE TO BREAK A LONG TOKEN (`ui-footer-break-anywhere`).
 * A flex container's automatic minimum WIDTH is the min-content width of its
 * content, so a 49-character address or URL used to force the whole column wider
 * than its track and overrun the neighbouring one — `break-words` (inherited
 * `overflow-wrap: break-word`) did NOT help, because that value deliberately leaves
 * min-content sizing alone. `overflow-wrap: anywhere` is the one value that also
 * lowers the box's min-content width, so the box shrinks to its column and the token
 * WRAPS inside it (the stylesheet owns that rule: `.ui-footer-break-anywhere`). No
 * break is inserted into adopter content, and the ≥44px floor and the vertical
 * centring are unchanged.
 *
 * ONE AUTHORITY, COMPOSED: this module exports the target floor only. Each footer
 * control composes its own visual treatment on top (`hover:text-primary`, the
 * Connect heading's typography, the business-info links), so a future visual
 * change cannot silently drop the floor, and the floor cannot smuggle in a visual
 * style of its own.
 */
export const FOOTER_TARGET_CLASS =
  "inline-flex min-h-11 min-w-11 items-center ui-footer-break-anywhere";

/** The default footer LINK treatment: the target floor plus the hover colour. */
export const FOOTER_LINK_CLASS = `${FOOTER_TARGET_CLASS} hover:text-primary`;

/**
 * R1 — THE ONE FOOTER SECTION-HEADING CONTRACT.
 *
 * WHY IT EXISTS. The footer's section headings (Contact, Connect, an authored footer group, Navigate, Legal)
 * occupy comparable columns, so their visible text must start at the SAME vertical position — and it did not:
 * the Connect heading IS a link, so it carried the shared 44px target floor and its single line was
 * vertically CENTRED inside that box, while the plain `<h2>` headings sat at the top of their own ~20px box.
 * The result was a visible step between adjacent columns.
 *
 * TWO constants, ONE contract:
 *
 *   `FOOTER_HEADING_CLASS`      the heading's TYPOGRAPHY (one spelling, so no heading can drift visually);
 *   `FOOTER_HEADING_BOX_CLASS`  the box EVERY heading's text sits in — the SAME 44px floor the links use, so
 *                               a linked heading and an unlinked heading align exactly, and neither drops
 *                               below the platform's interactive-target minimum when it IS a link.
 *
 * The box carries LAYOUT only (no colour, no hover, no typography), so a heading that is a link composes its
 * own treatment on top — exactly as `FOOTER_TARGET_CLASS` is composed everywhere else in the footer.
 */
export const FOOTER_HEADING_CLASS =
  "text-sm font-semibold uppercase tracking-wide text-muted-foreground";

/** The box a footer heading's TEXT sits in (the same floor the footer's links take). */
export const FOOTER_HEADING_BOX_CLASS = FOOTER_TARGET_CLASS;
