import type { ContactInquirySender } from "@/application/contact-inquiry-sender";

/**
 * Explicit demo/unconfigured adapter. The ONLY purpose is to make the form
 * exercise visibly a no-op: it never claims a delivery happened. It is the
 * default and must never be reached by a deliberately configured webhook.
 */
export function createStubContactInquirySender(): ContactInquirySender {
  return {
    async send() {
      return { ok: false, kind: "unconfiguredDemo" };
    },
  };
}