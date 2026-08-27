import type { BusinessHours, BusinessLocation, ExceptionalHours, Weekday } from "./business";

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

function isExceptionalActive(exception: ExceptionalHours, date: Date, timeZone: string): boolean {
  // Compare the exception's YYYY-MM-DD against the wall-clock date in the zone.
  const { year, month, day } = (() => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    const parts = fmt.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
    return { year: get("year"), month: get("month"), day: get("day") };
  })();
  return exception.date === `${year}-${month}-${day}`;
}

/** Open intervals for a weekday (parsed minutes + overnight flag). */
interface ParsedInterval {
  readonly weekday: number;
  readonly open: number;
  readonly close: number;
  readonly overnight: boolean;
}

/** Managed minutes & weekday → open intervals, with the weekday this interval starts on. */
function intervalsForWeekday(hours: BusinessHours, weekday: number): ParsedInterval[] {
  const day = WEEKDAY_ORDER[weekday];
  return hours.intervals
    .filter((i) => i.days.includes(day))
    .flatMap<ParsedInterval>((i) => {
      const open = parseTime(i.open);
      const close = parseTime(i.close);
      const overnight = close <= open;
      return [{ weekday, open, close, overnight }];
    });
}

/** Open-status result: open (with minutes remaining) or closed. */
export type OpenStatus =
  | { open: true; minutesRemaining: number }
  | { open: false };

/**
 * Effective status at a moment. Handles:
 *  - regular intervals (single day, multi-interval, closed days),
 *  - overnight intervals carried into the next day,
 *  - exceptional-date overrides (closure or opening) replacing that day's
 *    regular schedule (while still honoring the prior night's carry-over).
 */
export function openStatusAt(
  location: BusinessLocation,
  date: Date,
  options?: { businessTimezone?: string },
): OpenStatus | "noSchedule" {
  const hours = location.hours;
  if (!hours) return "noSchedule";
  const timeZone = resolveTimezone(location, options?.businessTimezone);
  const { weekday, minutes } = zonedDayMinutes(date, timeZone);

  // Prior-day overnight carry (e.g. an interval 22:00–02:00 begun yesterday).
  const yesterday = (weekday + 6) % 7;
  for (const iv of intervalsForWeekday(hours, yesterday)) {
    if (iv.overnight && minutes < iv.close) {
      return { open: true, minutesRemaining: iv.close - minutes };
    }
  }

  const activeException = hours.exceptional.find((e) => isExceptionalActive(e, date, timeZone));
  if (activeException) {
    if (activeException.closed) return { open: false };
    if (activeException.open && activeException.close) {
      const open = parseTime(activeException.open);
      const close = parseTime(activeException.close);
      if (minutes >= open && minutes < close) {
        return { open: true, minutesRemaining: close - minutes };
      }
      return { open: false };
    }
    return { open: false }; // declared exceptional but ambiguous → closed
  }

  for (const iv of intervalsForWeekday(hours, weekday)) {
    if (iv.overnight) {
      // Covers [open, midnight); the [0, close) part is handled by the
      // "yesterday" loop above.
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