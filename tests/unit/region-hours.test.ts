import { describe, expect, it } from "vitest";

import type { OperationalRegion, RegionSchedule, TimeInterval } from "@/core/region";
import { holidayOn, isRegionOpen, regionStatusAt } from "@/core/region-hours";

// Builds a Date whose wall-clock in `tz` equals the wanted local calendar date
// and time (independent of the machine's timezone), pinning the DATE as well.
function atZonedWallClock(
  year: number,
  month: number,
  day: number,
  hh: number,
  mm: number,
  tz: string,
): Date {
  const wantDate = new Date(Date.UTC(year, month - 1, day));
  const wantMinutes = hh * 60 + mm;
  let instant = new Date(Date.UTC(year, month - 1, day, hh, mm));

  for (let i = 0; i < 8; i++) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(instant);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    let hour = get("hour");
    if (hour === 24) hour = 0;
    const actualDate = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
    const actualMinutes = hour * 60 + get("minute");

    const correction =
      Math.round((wantDate.getTime() - actualDate.getTime()) / 86_400_000) * 86_400_000 +
      (wantMinutes - actualMinutes) * 60_000;
    if (correction === 0) return instant;
    instant = new Date(instant.getTime() + correction);
  }
  return instant;
}

const CLOSED: TimeInterval[] = [];

function makeRegion(schedule: Partial<RegionSchedule> & { timezone?: string }): OperationalRegion {
  return {
    id: "fixture",
    timezone: schedule.timezone ?? "America/Toronto",
    address: { street: "1 Demo St", city: "Toronto", country: "Canada" },
    hours: {
      monday: [], tuesday: [], wednesday: [], thursday: [], friday: [],
      saturday: [], sunday: [], holidays: [],
      ...schedule,
    },
  };
}

// Reference week: 2026-08-27 is a Thursday; 2026-08-31 is a Monday.
// Monday 08-31 · Tue 09-01 · Wed 09-02 · Thu 09-03 · Fri 09-04 · Sat 09-05 · Sun 09-06
const nineToFive: TimeInterval = { open: "09:00", close: "17:00" };

describe("Phase K — region schedule: seven independent days", () => {
  it("each weekday is independently configured and evaluated", () => {
    const region = makeRegion({
      timezone: "America/Toronto",
      monday: [{ open: "09:00", close: "17:00" }],
      tuesday: [{ open: "10:00", close: "12:00" }],
      wednesday: CLOSED,
      thursday: [{ open: "08:00", close: "20:00" }],
      friday: [{ open: "09:00", close: "17:00" }],
      saturday: [{ open: "10:00", close: "14:00" }],
      sunday: [{ open: "11:00", close: "15:00" }],
    });

    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 12, 0, "America/Toronto"))).toBe(true); // Mon
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 1, 11, 0, "America/Toronto"))).toBe(true); // Tue
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 2, 12, 0, "America/Toronto"))).toBe(false); // Wed closed
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 3, 19, 0, "America/Toronto"))).toBe(true); // Thu
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 4, 12, 0, "America/Toronto"))).toBe(true); // Fri
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 5, 12, 0, "America/Toronto"))).toBe(true); // Sat
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 6, 14, 0, "America/Toronto"))).toBe(true); // Sun
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 6, 16, 0, "America/Toronto"))).toBe(false); // Sun closed 15:00+
  });

  it("a day with no intervals is closed (structurally, no fake times)", () => {
    const region = makeRegion({ monday: [nineToFive], sunday: CLOSED });
    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 12, 0, "America/Toronto"))).toBe(true);
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 6, 12, 0, "America/Toronto"))).toBe(false);
    expect(regionStatusAt(region, atZonedWallClock(2026, 9, 6, 12, 0, "America/Toronto"))).toEqual({ open: false });
  });

  it("single interval boundaries are exact (open at open, closed at close)", () => {
    const region = makeRegion({ monday: [nineToFive] });
    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 8, 59, "America/Toronto"))).toBe(false);
    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 9, 0, "America/Toronto"))).toBe(true);
    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 16, 59, "America/Toronto"))).toBe(true);
    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 17, 0, "America/Toronto"))).toBe(false);
  });

  it("multiple intervals per day (split hours) evaluate independently", () => {
    const region = makeRegion({
      monday: [
        { open: "09:00", close: "12:00" },
        { open: "13:00", close: "17:00" },
      ],
    });
    const mon = (hh: number, mm: number) => atZonedWallClock(2026, 8, 31, hh, mm, "America/Toronto");
    expect(isRegionOpen(region, mon(10, 0))).toBe(true); // slot 1
    expect(isRegionOpen(region, mon(12, 0))).toBe(false); // lunch gap
    expect(isRegionOpen(region, mon(13, 30))).toBe(true); // slot 2
    expect(isRegionOpen(region, mon(18, 0))).toBe(false); // after last slot
  });
});
describe("Phase K — overnight intervals", () => {
  const region = makeRegion({
    friday: [{ open: "18:00", close: "02:00" }],
    saturday: [],
  });

  it("open late on the opening day", () => {
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 4, 23, 0, "America/Toronto"))).toBe(true); // Fri
  });

  it("carries over into Saturday morning", () => {
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 5, 1, 0, "America/Toronto"))).toBe(true); // Sat
  });

  it("closed after the overnight interval ends", () => {
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 5, 3, 0, "America/Toronto"))).toBe(false);
  });
});

describe("Phase K — holidays", () => {
  it("a normal open day stays open (no holiday that day)", () => {
    const region = makeRegion({
      monday: [nineToFive],
      holidays: [{ date: "2026-12-25", name: "Christmas Day", closed: true }],
    });
    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 12, 0, "America/Toronto"))).toBe(true);
  });

  it("holiday closure overrides a normally open weekday", () => {
    const region = makeRegion({
      friday: [nineToFive],
      holidays: [{ date: "2026-09-04", name: "Holiday Friday", closed: true }],
    });
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 4, 12, 0, "America/Toronto"))).toBe(false);
  });

  it("special holiday hours override normal hours for that date", () => {
    const region = makeRegion({
      monday: [nineToFive],
      holidays: [
        { date: "2026-08-31", name: "Special Monday", intervals: [{ open: "13:00", close: "15:00" }] },
      ],
    });
    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 9, 30, "America/Toronto"))).toBe(false); // normal 09-17 overridden
    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 13, 30, "America/Toronto"))).toBe(true);
    expect(isRegionOpen(region, atZonedWallClock(2026, 8, 31, 16, 0, "America/Toronto"))).toBe(false);
  });

  it("a holiday can open a normally closed day", () => {
    const region = makeRegion({
      saturday: [],
      holidays: [{ date: "2026-09-05", name: "Open Saturday", intervals: [{ open: "10:00", close: "14:00" }] }],
    });
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 5, 11, 0, "America/Toronto"))).toBe(true);
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 5, 15, 0, "America/Toronto"))).toBe(false);
  });

  it("multiple holiday intervals are evaluated independently", () => {
    const region = makeRegion({
      monday: [nineToFive],
      holidays: [
        {
          date: "2026-08-31",
          name: "Split Holiday",
          intervals: [
            { open: "09:00", close: "11:00" },
            { open: "14:00", close: "16:00" },
          ],
        },
      ],
    });
    const mon = (hh: number) => atZonedWallClock(2026, 8, 31, hh, 0, "America/Toronto");
    expect(isRegionOpen(region, mon(10))).toBe(true);
    expect(isRegionOpen(region, mon(12))).toBe(false);
    expect(isRegionOpen(region, mon(15))).toBe(true);
    expect(isRegionOpen(region, mon(17))).toBe(false);
  });

  it("a listed holiday with no intervals is closed by default", () => {
    const region = makeRegion({
      wednesday: [nineToFive],
      holidays: [{ date: "2026-09-02", name: "Closure Day" }],
    });
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 2, 12, 0, "America/Toronto"))).toBe(false);
    expect(holidayOn(region.hours, "2026-09-02")?.name).toBe("Closure Day");
    expect(holidayOn(region.hours, "2026-09-03")).toBeNull();
  });

  it("a holiday override cancels an overnight carry-over begun the day before", () => {
    const region = makeRegion({
      friday: [{ open: "18:00", close: "02:00" }],
      saturday: [],
      holidays: [{ date: "2026-09-04", name: "Friday Holiday", closed: true }],
    });
    // Friday late is closed (holiday) and Saturday early has no carry-over.
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 4, 23, 0, "America/Toronto"))).toBe(false);
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 5, 1, 0, "America/Toronto"))).toBe(false);
  });

  it("special holiday overnight hours carry into the next day", () => {
    const region = makeRegion({
      saturday: [],
      holidays: [
        { date: "2026-09-05", name: "Overnight Day", intervals: [{ open: "22:00", close: "02:00" }] },
      ],
    });
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 5, 23, 0, "America/Toronto"))).toBe(true);
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 6, 1, 0, "America/Toronto"))).toBe(true);
    expect(isRegionOpen(region, atZonedWallClock(2026, 9, 6, 3, 0, "America/Toronto"))).toBe(false);
  });
});

describe("Phase K — DST interaction", () => {
  it("region hours are evaluated in the region timezone across a spring-forward", () => {
    const region = makeRegion({
      timezone: "America/New_York",
      sunday: [nineToFive],
    });
    // 2026-03-08 is the US spring-forward (02:00 EST → 03:00 EDT).
    const noon = atZonedWallClock(2026, 3, 8, 12, 0, "America/New_York");
    expect(isRegionOpen(region, noon)).toBe(true);
    const early = atZonedWallClock(2026, 3, 8, 8, 0, "America/New_York");
    expect(isRegionOpen(region, early)).toBe(false);
  });

  it("an overnight interval is honored on the day the clocks jump", () => {
    const region = makeRegion({
      timezone: "America/New_York",
      saturday: [{ open: "22:00", close: "02:00" }],
      sunday: [],
    });
    expect(isRegionOpen(region, atZonedWallClock(2026, 3, 7, 23, 0, "America/New_York"))).toBe(true);
    expect(isRegionOpen(region, atZonedWallClock(2026, 3, 8, 1, 0, "America/New_York"))).toBe(true);
  });
});