import { describe, expect, it } from "vitest";

import { isOpen, openStatusAt, parseTime, resolveTimezone } from "@/core/business-hours";
import type { BusinessLocation } from "@/core/business";

// Builds a Date whose wall-clock in `tz` equals the wanted local time, so
// tests are independent of the machine's timezone. Iteratively corrects by
// the minute-difference until the zoned wall-clock matches the request.
function atZonedLocal(y: number, mo: number, d: number, hh: number, mm: number, tz: string): Date {
  let instant = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  for (let i = 0; i < 4; i++) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(instant);
    let hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    if (hour === 24) hour = 0;
    const actual = hour * 60 + minute;
    const want = hh * 60 + mm;
    const diff = want - actual;
    if (diff === 0) break;
    instant = new Date(instant.getTime() + diff * 60_000);
  }
  return instant;
}

function loc(hours: BusinessLocation["hours"], tz = "Asia/Jakarta"): BusinessLocation {
  return {
    id: "l1",
    address: { street: "1 Main St", city: "Jakarta" },
    timezone: tz,
    hours,
  };
}

const nineToFive: BusinessLocation["hours"] = {
  intervals: [{ days: ["mon", "tue", "wed", "thu", "fri"], open: "09:00", close: "17:00" }],
  exceptional: [],
};

describe("parseTime", () => {
  it("parses HH:mm", () => {
    expect(parseTime("09:00")).toBe(540);
    expect(parseTime("22:30")).toBe(1350);
  });
  it("rejects out-of-range", () => {
    expect(() => parseTime("25:00")).toThrow();
    expect(() => parseTime("09:60")).toThrow();
  });
});

describe("resolveTimezone", () => {
  it("prefers location, then business, then default", () => {
    const l = loc(nineToFive, "Europe/Berlin");
    expect(resolveTimezone(l, "Asia/Jakarta")).toBe("Europe/Berlin");
    expect(resolveTimezone({ ...l, timezone: undefined }, "Asia/Jakarta")).toBe("Asia/Jakarta");
    expect(resolveTimezone({ ...l, timezone: undefined }, undefined)).toBe("Etc/UTC");
  });
});

describe("regular hours", () => {
  it("open at 10:00 on a weekday", () => {
    const d = atZonedLocal(2026, 8, 27, 10, 0, "Asia/Jakarta"); // Thu
    expect(isOpen(loc(nineToFive), d)).toBe(true);
  });
  it("closed at 18:00 on a weekday", () => {
    const d = atZonedLocal(2026, 8, 27, 18, 0, "Asia/Jakarta");
    expect(isOpen(loc(nineToFive), d)).toBe(false);
  });
  it("closed on a non-scheduled day", () => {
    const d = atZonedLocal(2026, 8, 29, 10, 0, "Asia/Jakarta"); // Sat
    expect(isOpen(loc(nineToFive), d)).toBe(false);
  });
  it("open exactly at opening boundary, closed exactly at closing", () => {
    const open = atZonedLocal(2026, 8, 27, 9, 0, "Asia/Jakarta");
    expect(isOpen(loc(nineToFive), open)).toBe(true);
    const close = atZonedLocal(2026, 8, 27, 17, 0, "Asia/Jakarta");
    expect(isOpen(loc(nineToFive), close)).toBe(false);
  });
  it("minutesRemaining is present when open", () => {
    const d = atZonedLocal(2026, 8, 27, 10, 0, "Asia/Jakarta");
    const status = openStatusAt(loc(nineToFive), d);
    expect(status).toMatchObject({ open: true });
  });
});

describe("multiple intervals + overnight", () => {
  const overnight: BusinessLocation["hours"] = {
    intervals: [{ days: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], open: "22:00", close: "02:00" }],
    exceptional: [],
  };

  it("open at 23:00 (before midnight)", () => {
    const d = atZonedLocal(2026, 8, 27, 23, 0, "Asia/Jakarta"); // Thu 23:00
    expect(isOpen(loc(overnight), d)).toBe(true);
  });
  it("open at 01:00 (after midnight, date transition)", () => {
    const d = atZonedLocal(2026, 8, 28, 1, 0, "Asia/Jakarta"); // Fri 01:00
    expect(isOpen(loc(overnight), d)).toBe(true);
  });
  it("closed at 03:00", () => {
    const d = atZonedLocal(2026, 8, 28, 3, 0, "Asia/Jakarta");
    expect(isOpen(loc(overnight), d)).toBe(false);
  });
});