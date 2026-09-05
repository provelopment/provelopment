import Image from "next/image";

/**
 * CardImage — P2-10. Shared collection-card image primitive.
 *
 * Before P2-10 the offering-card and portfolio-card repeated the SAME
 * byte-identical `next/image` `fill` + `object-cover` block:
 *
 *     <div className="relative mb-4 h-40 w-full overflow-hidden rounded">
 *       <Image src={...} alt={...} fill sizes="(max-width: 640px) 100vw, 320px" className="object-cover" />
 *     </div>
 *
 * Both share the same stable card-image contract — fixed header aspect
 * (h-40), full-width, `fill` on an `overflow-hidden rounded` relative
 * container, `object-cover` crop, the same responsive `sizes`, and the same
 * conditional "render only when an image is present" behavior. This primitive
 * is the single shared path for that demonstrated contract.
 *
 * Contract:
 *  - presentational only: renders the wrapper + `<Image>`; owns NO content,
 *    NO alt copy, NO layout beyond the demonstrated `h-40` card image block;
 *  - caller owns `src` (validated optional `image?: string` from the content
 *    schema) and `alt` (the item title — the card's accessible copy);
 *  - deliberately NOT used for the offering-detail HERO image (different
 *    height `h-64`, margin `mb-8`, `sizes="100vw"`, non-link context — a
 *    distinct contract that stays local to `OfferingDetail`).
 */
export interface CardImageProps {
  /** Image URL from the content item (already gated by the caller). */
  readonly src: string;
  /** Accessible name — the item title (caller-owned copy). */
  readonly alt: string;
}

export function CardImage({ src, alt }: CardImageProps) {
  return (
    <div className="relative mb-4 h-40 w-full overflow-hidden rounded">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, 320px"
        className="object-cover"
      />
    </div>
  );
}