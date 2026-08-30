/**
 * Region schedule evaluation (Phase K).
 *
 * Regions use the SAME DST-safe wall-clock machinery as legacy locations —
 * there is exactly one time engine in the Foundation (`business-hours.ts`).
 * This module supplies the region's seven-day schedule + holiday overrides to
 * that engine; it contains no new time/interval/DST logic.
 *
 * Holiday precedence (documented, tested):
 *   normal weekly schedule → holiday/special-date override → resolved hours
 */

import {
  openStatusFromIntervalsStartingOnDay,
  parseIntervals,
  weekdayOfISODate,
  type ParsedInterval,
} from "./business-hours";
import { DAYS_OF_WEEK, type OperationalRegion, type RegionSchedule } from "./region";

/** Region open-status result: open (with minutes remaining) or closed. */
export type RegionOpenStatus =
  | { open: true; minutesRemaining: number }
  | { open: false };

/**
 * Effective intervals that START on a given wall-clock date for a region,
 * honoring any holiday override for that exact date.
 *
 * A holiday with `closed: true` yields no intervals. A holiday carrying
 * `intervals` uses ONLY those (single or multiple; overnight via `close < open`
 * spans into the next day, as with regular hours). A listed holiday with no
 * intervals and no explicit `closed` is treated as closed by default — a
 * holiday exception is an override, never a partial merge.
 */
function regionIntervalsStartingOnDay(
  schedule: RegionSchedule,
  isoDate: string,
): readonly ParsedInterval[] {
  const holiday = schedule.holidays.find((entry) => entry.date === isoDate);
  if (holiday) {
    if (holiday.closed === true) return [];
    if (holiday.intervals && holiday.intervals.length > 0) {
      return parseIntervals(holiday.intervals);
    }
    return [];
  }

  const weekday = DAYS_OF_WEEK[weekdayOfISODate(isoDate)];
  return parseIntervals(schedule[weekday]);
}

/** Returns the holiday entry for `isoDate`, or null. */
export function holidayOn(
  schedule: RegionSchedule,
  isoDate: string,
): RegionSchedule["holidays"][number] | null {
  return schedule.holidays.find((entry) => entry.date === isoDate) ?? null;
}

/**
 * Open/closed status for a region at a moment in the region's timezone.
 * Reuses the shared DST-safe algorithm; the region's configured timezone is
 * the sole wall-clock authority (never inferred/merged).
 */
export function regionStatusAt(region: OperationalRegion, date: Date): RegionOpenStatus {
  // A region's schedule is always present (schema-required and normalized),
  // so the shared engine's "noSchedule" marker is impossible; an empty
  // seven-day schedule is simply "closed".
  const status = openStatusFromIntervalsStartingOnDay(
    {
      timeZone: region.timezone,
      intervalsStartingOnDay: (isoDate) => regionIntervalsStartingOnDay(region.hours, isoDate),
    },
    date,
  );
  return status === "noSchedule" ? { open: false } : status;
}

/** Convenience: whether the region is currently open at `date`. */
export function isRegionOpen(region: OperationalRegion, date: Date): boolean {
  const status = regionStatusAt(region, date);
  return status.open === true;
}