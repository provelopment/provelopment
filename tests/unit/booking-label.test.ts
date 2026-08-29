import { describe, expect, it } from "vitest";

import { assertBookingLabelPresent, getDictionary } from "@/config/i18n";
import type { Dictionary } from "@/config/i18n/dictionary";
import type { BookingFeatureConfig } from "@/core/booking";

/** Deep copy of a real dictionary with the booking section set or removed. */
function withBooking(dict: Dictionary, label: string | undefined): Dictionary {
  const copy: Dictionary = JSON.parse(JSON.stringify(dict));
  if (label === undefined) {
    delete (copy as Record<string, unknown>).booking;
  } else {
    (copy as { booking?: { book: string } }).booking = { book: label };
  }
  return copy;
}

describe("assertBookingLabelPresent (F1)", () => {
  it("passes when booking is enabled and every locale has a non-empty booking.book", () => {
    const dict = getDictionary("en");
    const dictionaries = new Map<string, Dictionary>([
      ["en", dict],
      ["de", withBooking(dict, "Jetzt buchen")],
    ]);
    const feature: BookingFeatureConfig = {
      provider: "external-url",
      url: "https://example.com/book",
    };
    expect(() => assertBookingLabelPresent(dictionaries, feature, ["en", "de"])).not.toThrow();
  });

  it("throws a descriptive error naming the offending locale when a label is missing", () => {
    const dict = getDictionary("en");
    const dictionaries = new Map<string, Dictionary>([
      ["en", withBooking(dict, "Book now")],
      ["de", withBooking(dict, undefined)], // missing booking section
    ]);
    const feature: BookingFeatureConfig = {
      provider: "external-url",
      url: "https://example.com/book",
    };
    expect(() => assertBookingLabelPresent(dictionaries, feature, ["en", "de"])).toThrow(/de/);
    expect(() => assertBookingLabelPresent(dictionaries, feature, ["en", "de"])).toThrow(
      /booking\.book/,
    );
  });

  it("treats a blank label as missing", () => {
    const dict = getDictionary("en");
    const dictionaries = new Map<string, Dictionary>([["en", withBooking(dict, "   ")]]);
    const feature: BookingFeatureConfig = {
      provider: "external-url",
      url: "https://example.com/book",
    };
    expect(() => assertBookingLabelPresent(dictionaries, feature, ["en"])).toThrow();
  });

  it("is a no-op when booking is absent", () => {
    const dict = getDictionary("en");
    const dictionaries = new Map<string, Dictionary>([["en", dict]]);
    expect(() => assertBookingLabelPresent(dictionaries, undefined, ["en"])).not.toThrow();
  });

  it("is a no-op when booking is disabled (provider none)", () => {
    const dict = getDictionary("en");
    const dictionaries = new Map<string, Dictionary>([["en", dict]]);
    const feature: BookingFeatureConfig = { provider: "none" };
    expect(() => assertBookingLabelPresent(dictionaries, feature, ["en"])).not.toThrow();
  });
});
