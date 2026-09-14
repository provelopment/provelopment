import type { SocialLink } from "@/config";
import { availableIconName } from "@/config/assets";

import type { ContextNavLink } from "./context-nav-links";

/**
 * CONNECTIVITY ICON SEAM — the ONE projection from validated connectivity
 * configuration to the shared link model (framework boundary).
 *
 * Both connectivity families (`socialLinks[]` and `connect.methods[]`) carry the
 * SAME optional generic `icon` leaf, and both are screened here — so there is no
 * second loader, no connectivity-specific filesystem subsystem and no platform
 * registry:
 *
 *   absent key  → `undefined` (no icon; the shared renderer simply renders
 *                 nothing);
 *   configured  → the filename when it is backed by a real `public/assets/`
 *                 file, otherwise `""` (the established deliberate no-icon
 *                 value) — never a broken `<img>`.
 *
 * DELIBERATE DIFFERENCE from the control/navigation icon leaves (P6-1): a
 * connectivity icon that has no backing file is NOT a loud build failure. The
 * owner requirement is that connectivity artwork is strictly SUPPLEMENTARY —
 * text stays authoritative — so artwork that is missing, not yet produced, not
 * yet trademark-approved or simply not deployed must degrade the item to a
 * plain text link. It may never fail a deployment, error a page, or drop a
 * communication method. The `icon` VALUE SHAPE is still validated loudly by the
 * schema (paths/URLs/query strings are rejected), so a misconfigured leaf is
 * still caught at build time; only "no file yet" is tolerated.
 *
 * The engine never learns what a platform is — it only resolves "an optional
 * asset belongs to this connectivity item".
 *
 * Server-side only (imports the framework filesystem screening layer): used by
 * the footer and the Connect page, never by a client component.
 */
export function connectivityIcon(icon: string | undefined): string | undefined {
  return icon === undefined ? undefined : availableIconName(icon);
}

/**
 * Social/profile destinations as shared connectivity links.
 *
 * Identity follows the established P5-6 rule: a destination (`href`) and a
 * platform name are **not** React identity — the same platform may legitimately
 * be configured twice (two GitHub profiles) — so the key is position-derived
 * exactly like `navItemKey` in `nav-links.ts`. `label`/`href` remain the
 * authoritative text contract.
 */
export function socialConnectivityLinks(
  socialLinks: readonly SocialLink[],
): readonly ContextNavLink[] {
  return socialLinks.map((socialLink, index) => ({
    href: socialLink.href,
    label: socialLink.label,
    key: `social:${index}`,
    icon: connectivityIcon(socialLink.icon),
  }));
}
