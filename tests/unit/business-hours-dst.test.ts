import { describe, expect, it } from "vitest";

import type { BusinessLocation } from "@/core/business";
import { isOpen, openStatusAt } from "@/core/business-hours";

// 2026 US DST: spring-forward on Sunday 2026-03-08 (02:00 EST → 03:00 EDT).
const NY = "America/New_York";

function withTimeZone(hours: BusinessLocation["hours"]): BusinessLocation {
  return { id: "ny", address: { street: "1 Main St", city: "New York" }, timezone: NY, hours };
}

const weekdaysNineToFive: BusinessLocation["hours"] = {
  intervals: [{ days: ["mon", "tue", "wed", "thu", "fri"], open: "09:00", close: "17:00" }],
  exceptional: [],
};

describe("DST-observing timezone (America/New_York)", () => {
  it("is open at 09:00 EDT on the Monday after the transition", () => {
    const instant = new Date(Date.UTC(2026, 2, 9, 13, 0)); // 09:00 EDT on Mon 2026-03-09
    expect(isOpen(withTimeZone(weekdaysNineToFive), instant)).toBe(true);
  });

  it("is closed at 18:00 EDT", () => {
    const instant = new Date(Date.UTC(2026, 2, 9, 22, 0)); // 18:00 EDT
    expect(isOpen(withTimeZone(weekdaysNineToFive), instant)).toBe(false);
  });

  it("resolves the wall-clock minutes correctly right after the spring-forward jump", () => {
    // 07:00Z on 2026-03-08 is already 03:00 EDT (the 02:00–03:00 hour vanished).
    const afterJump = new Date(Date.UTC(2026, 2, 8, 7, 0));
    const status = openStatusAt(withTimeZone(weekdaysNineToFive), afterJump);
    expect(status).toEqual({ open: false }); // 03:00 local, outside 09:00–17:00
  });
});

describe("overnight interval crossing a DST transition", () => {
  const overnight: BusinessLocation["hours"] = {
    intervals: [{ days: ["sat", "sun"], open: "22:00", close: "03:00" }],
    exceptional: [],
  };

  it("is open at 23:00 EST on the Saturday before the transition", () => {
    const instant = new Date(Date.UTC(2026, 2, 8, 4, 0)); // 23:00 EST Sat 2026-03-07
    expect(isOpen(withTimeZone(overnight), instant)).toBe(true);
  });

  it("is open at 01:00 EST (carry-over, still before the jump)", () => {
    const instant = new Date(Date.UTC(2026, 2, 8, 6, 0)); // 01:00 EST Sun
    expect(isOpen(withTimeZone(overnight), instant)).toBe(true);
  });

  it("is closed at the exact close moment after the jump (03:00 EDT)", () => {
    const instant = new Date(Date.UTC(2026, 2, 8, 7, 0)); // 03:00 EDT Sun
    expect(isOpen(withTimeZone(overnight), instant)).toBe(false);
  });

  it("is closed after the close (03:30 EDT)", () => {
    const instant = new Date(Date.UTC(2026, 2, 8, 7, 30)); // 03:30 EDT Sun
    expect(isOpen(withTimeZone(overnight), instant)).toBe(false);
  });
});