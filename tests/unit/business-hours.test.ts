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

// Same idea as `atZonedLocal`, but also pins the desired wall-clock CALENDAR
// DATE (the time-only helper above can converge onto the next day for
// late-night instants, which is wrong for date-keyed exceptional hours).
function atZonedWallClock(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  tz: string,
): Date {
  const wantDate = new Date(Date.UTC(y, mo - 1, d));
  const wantMinutes = hh * 60 + mm;
  let instant = new Date(Date.UTC(y, mo - 1, d, hh, mm));

  for (let i = 0; i < 8; i++) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(instant);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    let hour = get("hour");
    if (hour === 24) hour = 0;
    const actualDate = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
    const actualMinutes = hour * 60 + get("minute");

    const correction =
      Math.round((wantDate.getTime() - actualDate.getTime()) / 86_400_000) *
        86_400_000 +
      (wantMinutes - actualMinutes) * 60_000;
    if (correction === 0) return instant;
    instant = new Date(instant.getTime() + correction);
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

describe("multiple intervals on one day", () => {
  const splitDay: BusinessLocation["hours"] = {
    intervals: [
      { days: ["mon", "tue"], open: "09:00", close: "12:00" },
      { days: ["mon", "tue"], open: "14:00", close: "17:00" },
    ],
    exceptional: [],
  };

  it("is open during the first slot", () => {
    const tue = atZonedWallClock(2026, 8, 25, 10, 0, "Asia/Jakarta"); // Tue
    expect(isOpen(loc(splitDay), tue)).toBe(true);
  });

  it("is closed between the two slots", () => {
    const tue = atZonedWallClock(2026, 8, 25, 13, 0, "Asia/Jakarta");
    expect(isOpen(loc(splitDay), tue)).toBe(false);
  });

  it("is open during the second slot", () => {
    const tue = atZonedWallClock(2026, 8, 25, 15, 0, "Asia/Jakarta");
    expect(isOpen(loc(splitDay), tue)).toBe(true);
  });

  it("is closed after the last slot", () => {
    const tue = atZonedWallClock(2026, 8, 25, 18, 0, "Asia/Jakarta");
    expect(isOpen(loc(splitDay), tue)).toBe(false);
  });
});

describe("exceptional closure overrides a regular opening", () => {
  const holidayClosure: BusinessLocation["hours"] = {
    intervals: [{ days: ["mon", "tue", "wed", "thu", "fri"], open: "09:00", close: "17:00" }],
    exceptional: [{ date: "2026-08-27", closed: true }], // Thu 2026-08-27
  };

  it("is open on a normal Thursday", () => {
    const normalThursday = atZonedWallClock(2026, 8, 20, 10, 0, "Asia/Jakarta");
    expect(isOpen(loc(holidayClosure), normalThursday)).toBe(true);
  });

  it("is closed on the exceptional (holiday) Thursday", () => {
    const holidayThursday = atZonedWallClock(2026, 8, 27, 10, 0, "Asia/Jakarta");
    expect(isOpen(loc(holidayClosure), holidayThursday)).toBe(false);
  });
});

describe("exceptional opening overrides a regular closure", () => {
  const saturdayOpening: BusinessLocation["hours"] = {
    intervals: [{ days: ["mon", "tue", "wed", "thu", "fri"], open: "09:00", close: "17:00" }],
    exceptional: [{ date: "2026-08-29", open: "10:00", close: "14:00" }], // Sat 2026-08-29
  };

  it("is closed on a regular Saturday", () => {
    const normalSaturday = atZonedWallClock(2026, 9, 5, 11, 0, "Asia/Jakarta");
    expect(isOpen(loc(saturdayOpening), normalSaturday)).toBe(false);
  });

  it("is open on the exceptional Saturday", () => {
    const openSaturday = atZonedWallClock(2026, 8, 29, 11, 0, "Asia/Jakarta");
    expect(isOpen(loc(saturdayOpening), openSaturday)).toBe(true);
  });

  it("is closed after the exceptional opening ends", () => {
    const lateSaturday = atZonedWallClock(2026, 8, 29, 15, 0, "Asia/Jakarta");
    expect(isOpen(loc(saturdayOpening), lateSaturday)).toBe(false);
  });
});

describe("exceptional overnight hours (22:00–02:00)", () => {
  const holidayOvernight: BusinessLocation["hours"] = {
    intervals: [{ days: ["mon", "tue", "wed", "thu", "fri"], open: "09:00", close: "17:00" }],
    exceptional: [{ date: "2026-08-25", open: "22:00", close: "02:00" }], // Tue 2026-08-25
  };

  it("is open late on the exceptional day", () => {
    const late = atZonedWallClock(2026, 8, 25, 23, 0, "Asia/Jakarta");
    expect(isOpen(loc(holidayOvernight), late)).toBe(true);
  });

  it("carries over into the next morning (after midnight)", () => {
    const nextMorning = atZonedWallClock(2026, 8, 26, 1, 0, "Asia/Jakarta");
    expect(isOpen(loc(holidayOvernight), nextMorning)).toBe(true);
  });

  it("is closed after the carry-over ends", () => {
    const after = atZonedWallClock(2026, 8, 26, 3, 0, "Asia/Jakarta");
    expect(isOpen(loc(holidayOvernight), after)).toBe(false);
  });

  it("replaces the regular daytime schedule on the exceptional day", () => {
    const afternoon = atZonedWallClock(2026, 8, 25, 16, 0, "Asia/Jakarta");
    expect(isOpen(loc(holidayOvernight), afternoon)).toBe(false);
  });
});