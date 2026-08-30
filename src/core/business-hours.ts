import type { BusinessHours, BusinessLocation, Weekday } from "./business";

/**
 * Business-hours evaluation. All times are evaluated in the location's IANA
 * timezone; exceptional dates override regular intervals; overnight intervals
 * (close < open) are supported; DST is handled via `Intl` wall-clock resolution
 * rather than naive UTC arithmetic.
 */

/** Default timezone used when no timezone resolves (deterministic, documented). */
export const DEFAULT_TIMEZONE = "Etc/UTC";

const WEEKDAY_ORDER: readonly Weekday[] = [
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
];

/**
 * Returns whether `value` is a real IANA timezone identifier. Uses the
 * runtime's `Intl` timezone resolver — the single authoritative, cross-platform
 * timezone table — rather than a hand-maintained zone list; Node/ICU throws for
 * unknown zones, which we treat as invalid.
 */
export function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** `HH:mm` → minutes past midnight (0..1439). */
export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((part) => Number(part));
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`invalid time "${hhmm}" (expected HH:mm)`);
  }
  return h * 60 + m;
}

/** Resolve a location's IANA timezone per precedence: location → business → default. */
export function resolveTimezone(location: BusinessLocation, businessTimezone?: string): string {
  return location.timezone ?? businessTimezone ?? DEFAULT_TIMEZONE;
}

/**
 * Wall-clock parts of `date` in `timeZone`, computed via Intl so DST and
 * non-integral offsets are handled correctly.
 */
export function zonedDayMinutes(date: Date, timeZone: string): { weekday: number; minutes: number } {
  // YYYY-MM-DD parts + HH:mm in the target zone.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  const minute = Number(get("minute"));
  // en-CA with hour12:false can render 24:00 for midnight in some engines.
  if (hour === 24) hour = 0;
  // Weekday from the derived Y-M-D (avoids ambiguity of Date.getDay across zones).
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { weekday, minutes: hour * 60 + minute };
}

/** `YYYY-MM-DD` (wall-clock, location timezone) of `date`. */
export function zonedISODate(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Shifts a `YYYY-MM-DD` by a number of calendar days (UTC-safe wall-clock arithmetic). */
function shiftISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Weekday index implied by a `YYYY-MM-DD` wall-clock date, in WEEKDAY_ORDER
 * space (0=Mon..6=Sun). JS `getUTCDay()` is 0=Sun..6=Sat, so convert.
 */
export function weekdayOfISODate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Parsed open interval (minutes past midnight + overnight flag). */
export interface ParsedInterval {
  readonly open: number;
  readonly close: number;
  readonly overnight: boolean;
}

/** Parses `HH:mm` interval strings into minute-based `ParsedInterval`s. */
export function parseIntervals(
  intervals: readonly { open: string; close: string }[],
): ParsedInterval[] {
  return intervals.map((i) => {
    const open = parseTime(i.open);
    const close = parseTime(i.close);
    return { open, close, overnight: close <= open };
  });
}

/** Effective intervals anchored to a regular weekday (0=Sun..6=Sat). */
function intervalsForWeekday(hours: BusinessHours, weekday: number): ParsedInterval[] {
  const day = WEEKDAY_ORDER[weekday];
  return parseIntervals(hours.intervals.filter((i) => i.days.includes(day)));
}

/**
 * Effective intervals that START on a given wall-clock date, honoring any
 * exceptional override for that exact date.
 *
 * Exceptional hours follow the SAME model as regular hours: an interval with
 * `close < open` is overnight and spans into the following day (e.g. an
 * exceptional `22:00–02:00` opens 22:00 that day and runs until 02:00 the
 * next). An exceptional `closed` yields no intervals for the date. An
 * exceptional entry with neither `closed` nor a valid interval is closed.
 */
function intervalsStartingOnDay(hours: BusinessHours, isoDate: string): ParsedInterval[] {
  const exceptional = hours.exceptional.find((e) => e.date === isoDate);
  if (exceptional) {
    if (exceptional.closed) return [];
    if (exceptional.open && exceptional.close) {
      const open = parseTime(exceptional.open);
      const close = parseTime(exceptional.close);
      return [{ open, close, overnight: close <= open }];
    }
    return [];
  }
  return intervalsForWeekday(hours, weekdayOfISODate(isoDate));
}

/** Open-status result: open (with minutes remaining) or closed. */
export type OpenStatus =
  | { open: true; minutesRemaining: number }
  | { open: false };

/** Feeds the shared status algorithm with a timezone and a date-keyed schedule. */
export interface ScheduleIntervalsSource {
  /** IANA timezone the wall-clock is resolved in (authority, never inferred). */
  readonly timeZone: string;
  /** Effective intervals that START on the given wall-clock `YYYY-MM-DD`. */
  readonly intervalsStartingOnDay: (isoDate: string) => readonly ParsedInterval[];
}

/**
 * The shared open/closed algorithm (locations and regions both use it). Handles:
 *  - regular intervals (single-day, multi-interval, days without hours),
 *  - overnight intervals — regular or exceptional — carried into the next day,
 *  - date overrides (closure or opening) for that day, while still honoring an
 *    overnight interval that began the day before.
 * There is exactly ONE implementation of this status logic in the codebase;
 * `openStatusAt` and the region evaluator are thin wrappers over it.
 */
export function openStatusFromIntervalsStartingOnDay(
  source: ScheduleIntervalsSource,
  date: Date,
): OpenStatus | "noSchedule" {
  const { minutes } = zonedDayMinutes(date, source.timeZone);
  const today = zonedISODate(date, source.timeZone);

  // An overnight interval begun yesterday (e.g. 22:00 on the prior day) that
  // is still running today. Never revoked by today's schedule.
  const yesterday = shiftISODate(today, -1);
  for (const iv of source.intervalsStartingOnDay(yesterday)) {
    if (iv.overnight && minutes < iv.close) {
      return { open: true, minutesRemaining: iv.close - minutes };
    }
  }

  for (const iv of source.intervalsStartingOnDay(today)) {
    if (iv.overnight) {
      // Covers [open, midnight); the [00:00, close) part of the same interval
      // is handled by the next day's carry-over loop above.
      if (minutes >= iv.open) {
        return { open: true, minutesRemaining: 1440 - minutes + iv.close };
      }
    } else if (minutes >= iv.open && minutes < iv.close) {
      return { open: true, minutesRemaining: iv.close - minutes };
    }
  }

  return { open: false };
}

/**
 * Status at a moment in the location's timezone. Delegates to the shared
 * schedule algorithm (`openStatusFromIntervalsStartingOnDay`) with the
 * location's resolved timezone and schedule.
 */
export function openStatusAt(
  location: BusinessLocation,
  date: Date,
  options?: { businessTimezone?: string },
): OpenStatus | "noSchedule" {
  const hours = location.hours;
  if (!hours) return "noSchedule";

  return openStatusFromIntervalsStartingOnDay(
    {
      timeZone: resolveTimezone(location, options?.businessTimezone),
      intervalsStartingOnDay: (isoDate) => intervalsStartingOnDay(hours, isoDate),
    },
    date,
  );
}

/** True when `date` falls on an exceptional (overridden) date for the location. */
export function isExceptionalToday(
  location: BusinessLocation,
  date: Date,
  options?: { businessTimezone?: string },
): boolean {
  const hours = location.hours;
  if (!hours) return false;
  const timeZone = resolveTimezone(location, options?.businessTimezone);
  return hours.exceptional.some((e) => e.date === zonedISODate(date, timeZone));
}

/**
 * Convenience: `isOpen(location, now, businessTimezone)`.
 */
export function isOpen(
  location: BusinessLocation,
  date: Date,
  options?: { businessTimezone?: string },
): boolean {
  const status = openStatusAt(location, date, options);
  return status !== "noSchedule" && status.open === true;
}