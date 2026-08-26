import { notFound } from "next/navigation";

/**
 * Catch-all so unmatched paths within a locale render the locale-scoped
 * 404 instead of falling back to an unprefixed global page.
 */
export default function CatchAllPage() {
  notFound();
}