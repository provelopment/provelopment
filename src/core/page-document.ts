/**
 * THE DECLARATIVE PAGE DOCUMENT (FOUNDATION-PAGES-A2)
 * ==================================================
 *
 * The second first-class authoring mode's contract: a JSON page describes a page as
 * DATA — an explicit envelope and an ordered list of sections — and nothing else. It
 * is not a back door into the application runtime:
 *
 *   · no JavaScript, no executable expressions, no imports, no JSX;
 *   · no author-supplied component names, no `eval`, no event handlers;
 *   · no raw HTML, no `style`, no class names, no pixel values;
 *   · no URLs this platform has not classified (`@/core/safe-url`).
 *
 * Everything a document may say is declared HERE, as data and as one Zod schema, so
 * documentation tooling can read the vocabulary and tests can assert it. A property
 * that is not declared is REFUSED rather than ignored: a typo must fail the build
 * naming the file, never silently produce a page missing what the author wrote.
 *
 * WHY IT LIVES IN `@/core`
 * ------------------------
 * The document model is a domain contract (what a page may BE), and it is
 * framework-free: Zod is the platform's established validation technology and the
 * only import beyond core itself (`@/core/contact-inquiry` is the precedent). The
 * filesystem, the locale and the React presentation are all somebody else's job —
 * this module validates, it does not read, resolve or render.
 *
 * NESTING IS BOUNDED ON PURPOSE
 * -----------------------------
 * A page has sections; a section has ITEMS. There is no section inside a section and
 * no arbitrary recursive component tree, because unbounded nesting makes schema
 * validation, the heading outline and the accessibility contract unpredictable. The
 * one place a section carries structured "inner" content (`columns`) is bounded to
 * side-by-side text blocks with a mandatory title, which is a layout decision and not
 * a second document.
 *
 * THE PAGE TITLE IS THE ONLY H1
 * -----------------------------
 * `title` is required and renders as the page's `<h1>` — one page-level heading,
 * always, exactly as the Markdown mode's page title does. Section `heading`s are
 * level 2 and item titles are level 3, so the outline can never be ambiguous or
 * multiple-H1. A section may not declare its own heading level: the level is a
 * property of where the heading lives, never of author taste.
 */
import { z } from "zod";

import { isPageRoutePath } from "./page-route-path";
import { classifyAuthorUrl } from "./safe-url";

/** The ONE supported envelope version. A document naming another one is refused. */
export const PAGE_DOCUMENT_SCHEMA_VERSION = 1;

/** Structural bounds. Every one of them is enforced by the schema below. */
export const PAGE_MAX_SECTIONS = 40;
export const PAGE_MAX_ITEMS = 24;
export const PAGE_MAX_ACTIONS = 3;
export const PAGE_MAX_HEADING = 160;
export const PAGE_MAX_LABEL = 120;
export const PAGE_MAX_TEXT = 4000;
export const PAGE_MAX_CELL = 400;
export const PAGE_MAX_CAPTION = 400;
export const PAGE_MAX_COLUMNS = 4;
export const PAGE_MAX_TABLE_ROWS = 60;
export const PAGE_MAX_STATS = 6;

/** Every section type the vocabulary supports. This list IS the vocabulary. */
export const PAGE_SECTION_TYPES = [
  "hero",
  "prose",
  "media",
  "gallery",
  "actions",
  "callout",
  "cards",
  "features",
  "columns",
  "steps",
  "stats",
  "quote",
  "table",
  "faq",
  "list",
  "divider",
] as const;

export type PageSectionType = (typeof PAGE_SECTION_TYPES)[number];

/** Finite presentation vocabularies. A value outside one of these is refused. */
export const PAGE_SECTION_SURFACES = ["plain", "muted", "bordered"] as const;
export const PAGE_ALIGNMENTS = ["start", "center"] as const;
export const PAGE_ITEM_COLUMNS = [2, 3, 4] as const;
export const PAGE_ACTION_VARIANTS = ["primary", "secondary", "link"] as const;
export const PAGE_CALLOUT_TONES = ["note", "info", "warning"] as const;
export const PAGE_MEDIA_POSITIONS = ["start", "end"] as const;

export type PageSectionSurface = (typeof PAGE_SECTION_SURFACES)[number];
export type PageAlignment = (typeof PAGE_ALIGNMENTS)[number];
export type PageActionVariant = (typeof PAGE_ACTION_VARIANTS)[number];
export type PageCalloutTone = (typeof PAGE_CALLOUT_TONES)[number];
export type PageMediaPosition = (typeof PAGE_MEDIA_POSITIONS)[number];

/**
 * WHICH FIELDS ARE MARKDOWN — declared once, as data, so the guide, the schema and the
 * renderer cannot disagree. Every field named here is rendered by the SAME safe
 * Markdown renderer the Markdown authoring mode uses (`@/adapters/markdown/safe-markdown`
 * through `SafeMarkdownContent`): raw HTML in a JSON page is inert for exactly the same
 * reason it is inert in a Markdown page, and unsafe destinations fail closed by the
 * same policy (`@/core/safe-url`). No second renderer, no second policy.
 */
export const PAGE_MARKDOWN_FIELDS: readonly string[] = [
  "prose.body",
  "callout.body",
  "cards.items[].body",
  "features.items[].body",
  "columns.items[].body",
  "steps.items[].body",
  "faq.items[].answer",
  "list.items[].detail",
  "quote.body",
  "hero.lede",
  "hero.support",
  "media.caption",
  "gallery.items[].caption",
  "table.caption",
  "section.lede",
];

/**
 * THE HEADING OUTLINE — one unambiguous contract, declared as data.
 *
 * A page has exactly ONE level-1 heading: its `title`, rendered by the page renderer
 * (exactly as the Markdown mode's page title is). A section heading is level 2 and an
 * item title is level 3. No field selects a level, so no document can produce a second
 * h1, a skipped level or an unordered outline.
 */
export const PAGE_HEADING_LEVELS = {
  page: 1,
  section: 2,
  item: 3,
} as const;

const enumMessage = (values: readonly (string | number)[]): string =>
  `must be one of: ${values.join(", ")}`;

/** A Markdown field: rendered by the safe Markdown renderer, never as raw HTML. */
const markdownTextSchema = z.string().trim().min(1).max(PAGE_MAX_TEXT);

const headingSchema = z.string().trim().min(1).max(PAGE_MAX_HEADING);
const labelSchema = z.string().trim().min(1).max(PAGE_MAX_LABEL);
const captionSchema = z.string().trim().min(1).max(PAGE_MAX_CAPTION);
/** A table cell stays PLAIN TEXT: it is emitted into `<td>`/`<th>`, never parsed. */
const cellSchema = z.string().trim().min(1).max(PAGE_MAX_CELL);

const headingFields = {
  heading: headingSchema.optional(),
  lede: markdownTextSchema.optional(),
};

const surfaceField = {
  surface: z.enum(PAGE_SECTION_SURFACES, { message: enumMessage(PAGE_SECTION_SURFACES) }).optional(),
};

const alignField = {
  align: z.enum(PAGE_ALIGNMENTS, { message: enumMessage(PAGE_ALIGNMENTS) }).optional(),
};

const itemColumnsField = {
  columns: z
    .union([z.literal(2), z.literal(3), z.literal(4)], { message: enumMessage(PAGE_ITEM_COLUMNS) })
    .optional(),
};

/**
 * A destination this platform has classified (`@/core/safe-url`): a same-site path, a
 * fragment, a relative reference, or http/https/mailto/tel. Everything else — and every
 * executable scheme — is refused while the file is being read, so a page can never
 * publish a destination an author did not intend.
 */
const destinationSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => classifyAuthorUrl(value).ok, {
    message:
      "must be a same-site path (e.g. /contact), a fragment, or an http, https, mailto or tel destination",
  });

/** Another page OF THIS SITE, named by its route path (locale is added when rendered). */
const routeTargetSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isPageRoutePath, {
    message: 'must be a page route path, e.g. "services" or "services/web-design"',
  });

/**
 * An asset reference: a same-site path (the platform convention is `/assets/<file>`,
 * which is what the site owner edits and what `pnpm assets:sync` mirrors) or an
 * absolute http(s) URL. There is no second asset subsystem for JSON pages.
 */
const assetReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      const verdict = classifyAuthorUrl(value);
      if (!verdict.ok) return false;
      return verdict.href.startsWith("/") || /^https?:\/\//i.test(verdict.href);
    },
    {
      message:
        "must be a same-site asset path (e.g. /assets/photo.png) or an absolute http(s) URL",
    },
  );

/**
 * An image. Accessibility is not optional and not a matter of memory: an image either
 * DESCRIBES something (`alt`) or declares itself decorative (`"decorative": true`) —
 * and the two are mutually exclusive, so an author cannot satisfy the schema while
 * leaving a screen-reader user with an unnamed picture.
 */
const imageSchema = z
  .strictObject({
    src: assetReferenceSchema,
    alt: captionSchema.optional(),
    decorative: z.boolean().optional(),
  })
  .refine((image) => image.decorative === true || (image.alt !== undefined && image.alt.length > 0), {
    message:
      'needs "alt" text describing the image, or "decorative": true when the image conveys nothing',
    path: ["alt"],
  })
  .refine((image) => image.decorative !== true || image.alt === undefined || image.alt.length === 0, {
    message: '"decorative": true means the image conveys nothing, so it cannot also carry alt text',
    path: ["alt"],
  });

/**
 * AN ACTION — a label and a destination, and nothing else. There is no event handler,
 * no callback and no author-supplied behaviour: a link is a link. Exactly one
 * destination form is set: `href` (classified by `@/core/safe-url`) or `route` (another
 * page of this site, resolved against the visitor's locale when rendered).
 */
const actionSchema = z
  .strictObject({
    label: labelSchema,
    href: destinationSchema.optional(),
    route: routeTargetSchema.optional(),
    variant: z
      .enum(PAGE_ACTION_VARIANTS, { message: enumMessage(PAGE_ACTION_VARIANTS) })
      .optional(),
  })
  .refine((action) => (action.href === undefined) !== (action.route === undefined), {
    message:
      'must set exactly one of "href" (a destination) or "route" (another page of this site)',
  });

const actionsSchema = z.array(actionSchema).min(1).max(PAGE_MAX_ACTIONS);

/** A list entry: a plain label, or a label with detail text and an optional destination. */
const listItemSchema = z
  .strictObject({
    label: labelSchema,
    detail: markdownTextSchema.optional(),
    href: destinationSchema.optional(),
    route: routeTargetSchema.optional(),
  })
  .refine((item) => item.href === undefined || item.route === undefined, {
    message: 'may set "href" or "route", not both',
  });

const listItemsSchema = z
  .array(z.union([labelSchema, listItemSchema]))
  .min(1)
  .max(PAGE_MAX_ITEMS);

/** A card: title, optional Markdown body, optional image, optional short meta line. */
const cardItemSchema = z.strictObject({
  title: headingSchema,
  body: markdownTextSchema.optional(),
  image: imageSchema.optional(),
  meta: labelSchema.optional(),
  action: actionSchema.optional(),
});

/** A feature: the same as a card minus media/meta, with an optional decorative icon. */
const featureItemSchema = z.strictObject({
  title: headingSchema,
  body: markdownTextSchema.optional(),
  icon: assetReferenceSchema.optional(),
});

/**
 * A column: EITHER a Markdown body OR a short plain list, never both and never a nested
 * section — the explicit boundary that keeps this vocabulary a page, not a component
 * tree.
 */
const columnItemSchema = z
  .strictObject({
    title: headingSchema,
    body: markdownTextSchema.optional(),
    items: z.array(labelSchema).min(1).max(PAGE_MAX_ITEMS).optional(),
  })
  .refine((column) => (column.body === undefined) !== (column.items === undefined), {
    message:
      'must set exactly one of "body" (Markdown) or "items" (a short list); a column holds no nested sections',
  });

const stepItemSchema = z.strictObject({
  title: headingSchema,
  body: markdownTextSchema.optional(),
});

const statItemSchema = z.strictObject({
  value: labelSchema,
  label: labelSchema,
  detail: markdownTextSchema.optional(),
});

const faqItemSchema = z.strictObject({
  question: headingSchema,
  answer: markdownTextSchema,
});

const galleryItemSchema = z.strictObject({
  image: imageSchema,
  caption: markdownTextSchema.optional(),
});

const itemsOf = <T extends z.ZodTypeAny>(item: T, max = PAGE_MAX_ITEMS) =>
  z.array(item).min(1).max(max);

/** A table row must fill the declared columns exactly — a ragged row fails loudly. */
const tableRowsSchema = z
  .array(z.array(cellSchema).min(1).max(PAGE_MAX_COLUMNS))
  .min(1)
  .max(PAGE_MAX_TABLE_ROWS);

export type PageAction = z.infer<typeof actionSchema>;
export type PageImage = z.infer<typeof imageSchema>;

/**
 * THE SECTION VOCABULARY. Each member declares its `type` as a literal, so the union
 * below is discriminated on it and a validation error can name the exact section and
 * property that is wrong. Every member is STRICT: an undeclared property is refused.
 */
const heroSectionSchema = z.strictObject({
  type: z.literal("hero"),
  eyebrow: labelSchema.optional(),
  lede: markdownTextSchema.optional(),
  actions: actionsSchema.optional(),
  support: markdownTextSchema.optional(),
  ...alignField,
  ...surfaceField,
});

const proseSectionSchema = z.strictObject({
  type: z.literal("prose"),
  ...headingFields,
  body: markdownTextSchema,
  ...alignField,
  ...surfaceField,
});

const mediaSectionSchema = z.strictObject({
  type: z.literal("media"),
  ...headingFields,
  image: imageSchema,
  caption: markdownTextSchema.optional(),
  position: z
    .enum(PAGE_MEDIA_POSITIONS, { message: enumMessage(PAGE_MEDIA_POSITIONS) })
    .optional(),
  ...surfaceField,
});

const gallerySectionSchema = z.strictObject({
  type: z.literal("gallery"),
  ...headingFields,
  items: itemsOf(galleryItemSchema),
  ...itemColumnsField,
  ...surfaceField,
});

const actionsSectionSchema = z.strictObject({
  type: z.literal("actions"),
  ...headingFields,
  actions: actionsSchema,
  ...alignField,
  ...surfaceField,
});

const calloutSectionSchema = z.strictObject({
  type: z.literal("callout"),
  ...headingFields,
  body: markdownTextSchema,
  tone: z.enum(PAGE_CALLOUT_TONES, { message: enumMessage(PAGE_CALLOUT_TONES) }).optional(),
  ...alignField,
  ...surfaceField,
});

const cardsSectionSchema = z.strictObject({
  type: z.literal("cards"),
  ...headingFields,
  items: itemsOf(cardItemSchema),
  ...itemColumnsField,
  ...surfaceField,
});

const featuresSectionSchema = z.strictObject({
  type: z.literal("features"),
  ...headingFields,
  items: itemsOf(featureItemSchema),
  ...itemColumnsField,
  ...surfaceField,
});

const columnsSectionSchema = z.strictObject({
  type: z.literal("columns"),
  ...headingFields,
  items: z.array(columnItemSchema).min(2).max(3),
  ratio: z
    .enum(["equal", "start-wide", "end-wide"], {
      message: enumMessage(["equal", "start-wide", "end-wide"]),
    })
    .optional(),
  ...surfaceField,
});

const stepsSectionSchema = z.strictObject({
  type: z.literal("steps"),
  ...headingFields,
  items: itemsOf(stepItemSchema, 12),
  ...surfaceField,
});

const statsSectionSchema = z.strictObject({
  type: z.literal("stats"),
  ...headingFields,
  items: itemsOf(statItemSchema, PAGE_MAX_STATS),
  ...surfaceField,
});

const quoteSectionSchema = z.strictObject({
  type: z.literal("quote"),
  body: markdownTextSchema,
  attribution: labelSchema.optional(),
  role: labelSchema.optional(),
  ...alignField,
  ...surfaceField,
});

const tableSectionSchema = z
  .strictObject({
    type: z.literal("table"),
    ...headingFields,
    columns: z.array(labelSchema).min(1).max(PAGE_MAX_COLUMNS),
    rows: tableRowsSchema,
    caption: markdownTextSchema.optional(),
    ...surfaceField,
  })
  .refine((table) => table.rows.every((row) => row.length === table.columns.length), {
    message: "every row must have exactly one cell per declared column",
    path: ["rows"],
  });

const faqSectionSchema = z.strictObject({
  type: z.literal("faq"),
  ...headingFields,
  items: itemsOf(faqItemSchema),
  ...surfaceField,
});

const listSectionSchema = z.strictObject({
  type: z.literal("list"),
  ...headingFields,
  items: listItemsSchema,
  ordered: z.boolean().optional(),
  ...surfaceField,
});

/** A divider is a pure structural break: it carries nothing but its own type. */
const dividerSectionSchema = z.strictObject({ type: z.literal("divider") });

export const pageSectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  proseSectionSchema,
  mediaSectionSchema,
  gallerySectionSchema,
  actionsSectionSchema,
  calloutSectionSchema,
  cardsSectionSchema,
  featuresSectionSchema,
  columnsSectionSchema,
  stepsSectionSchema,
  statsSectionSchema,
  quoteSectionSchema,
  tableSectionSchema,
  faqSectionSchema,
  listSectionSchema,
  dividerSectionSchema,
]);

export type PageSection = z.infer<typeof pageSectionSchema>;

/**
 * THE PAGE ENVELOPE. `schemaVersion` is explicit and singular: a document naming
 * another version is refused rather than reinterpreted, so a future document can never
 * be half-understood today. `title` is required (it is the page's identity, its
 * metadata title and its ONE h1) and `description` is the optional summary the page's
 * metadata uses when the author supplies one.
 */
export const pageDocumentSchema = z.strictObject({
  schemaVersion: z.literal(PAGE_DOCUMENT_SCHEMA_VERSION, {
    message: `must be the supported schema version ${PAGE_DOCUMENT_SCHEMA_VERSION}`,
  }),
  title: headingSchema,
  description: z.string().trim().min(1).max(PAGE_MAX_TEXT).optional(),
  sections: z.array(pageSectionSchema).max(PAGE_MAX_SECTIONS),
});

export type PageDocument = z.infer<typeof pageDocumentSchema>;

/** `sections[2].items[0].alt` — a precise, greppable place for an author to look. */
export function formatPageDocumentIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(document)";
  let rendered = "";
  for (const segment of path) {
    if (typeof segment === "number") rendered += `[${segment}]`;
    else rendered += rendered.length === 0 ? String(segment) : `.${String(segment)}`;
  }
  return rendered;
}

/**
 * Every issue the schema found, one per line, each with its path. The reader
 * (`@/adapters/content/json-page`) adds the file name, so a bad document reports
 * "which file, which property, what was wrong and what was expected".
 */
export function describePageDocumentIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${formatPageDocumentIssuePath(issue.path)}: ${issue.message}`)
    .join("\n");
}


