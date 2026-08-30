import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { connectMethodLabel } from "@/components/site/connect-method-label";

function method(id: string) {
  const found = siteConfig.connect?.methods.find((m) => m.id === id);
  if (!found) throw new Error(`no configured connect method "${id}"`);
  return found;
}

describe("Phase M refinement — connection-method labels (shared page/footer helper)", () => {
  it("uses the localized dictionary override where present", () => {
    const fr = getDictionary("fr");
    // French dictionary overrides message/email/phone labels.
    expect(connectMethodLabel(fr, method("message"))).toBe(fr.connect.methods?.message);
    expect(connectMethodLabel(getDictionary("de"), method("email"))).toBe("E-Mail");
  });

  it("falls back to the configured label for proper nouns", () => {
    const fr = getDictionary("fr");
    expect(connectMethodLabel(fr, method("whatsapp"))).toBe("WhatsApp");
    expect(connectMethodLabel(fr, method("telegram"))).toBe("Telegram");
    expect(connectMethodLabel(fr, method("viber"))).toBe("Viber");
  });

  it("the message form is consistently called Message Us in English", () => {
    expect(connectMethodLabel(getDictionary("en"), method("message"))).toBe("Message Us");
  });

  it("Viber is a configured demo-only method", () => {
    const viber = method("viber");
    expect(viber.href).toMatch(/^viber:\/\//);
    expect(viber.demoOnly).toBe(true);
  });
});