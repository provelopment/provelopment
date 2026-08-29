import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BOOKING_PROVIDER,
  BookingMisconfigurationError,
  createBookingActionResolver,
  createExternalUrlBookingActionResolver,
} from "@/adapters/booking";
import { BookingAction } from "@/components/site/booking-action";
import type { BookingAction as BookingActionResult } from "@/application/booking-action";
import type { BookingFeatureConfig } from "@/core/booking";

describe("external-url booking adapter", () => {
  it("resolves the configured public destination as a link action", () => {
    const resolver = createExternalUrlBookingActionResolver("https://example.com/book");
    const action = resolver.resolve({ locale: "en" });

    expect(action).toEqual({
      kind: "link",
      provider: BOOKING_PROVIDER,
      href: "https://example.com/book",
    });
  });
});

describe("createBookingActionResolver (factory)", () => {
  it("selects the external-url adapter for provider external-url", () => {
    const resolver = createBookingActionResolver({
      provider: "external-url",
      url: "https://cal.example.com/me",
    });
    expect(resolver.resolve({ locale: "en" })).toMatchObject({ kind: "link", href: "https://cal.example.com/me" });
  });

  it("treats an absent features.booking as intentionally disabled (none)", () => {
    const resolver = createBookingActionResolver(undefined);
    expect(resolver.resolve({ locale: "en" })).toEqual({ kind: "none" });
  });

  it("selects the none adapter for provider none", () => {
    const resolver = createBookingActionResolver({ provider: "none" });
    expect(resolver.resolve({ locale: "en" })).toEqual({ kind: "none" });
  });

  it("throws a booking misconfiguration error for external-url with no url (never silent none)", () => {
    const config: BookingFeatureConfig = { provider: "external-url" };
    expect(() => createBookingActionResolver(config)).toThrow(BookingMisconfigurationError);
    expect(() => createBookingActionResolver(config)).toThrow(/booking url/);
  });
});

describe("BookingAction rendering seam", () => {
  it("renders a link for a link action", () => {
    const action: BookingActionResult = {
      kind: "link",
      provider: BOOKING_PROVIDER,
      href: "https://example.com/book",
    };

    const html = renderToStaticMarkup(
      BookingActionElement({ action, label: "Book now" }),
    );

    expect(html).toContain('href="https://example.com/book"');
    expect(html).toContain("Book now");
  });

  it("renders nothing for a none action", () => {
    const action: BookingActionResult = { kind: "none" };
    const html = renderToStaticMarkup(BookingActionElement({ action, label: "Book now" }));
    expect(html).toBe("");
  });
});

// Helper keeps the test file free of JSX (vitest include is `*.test.ts`).
function BookingActionElement(props: {
  readonly action: BookingActionResult;
  readonly label: string;
}) {
  return BookingAction(props);
}