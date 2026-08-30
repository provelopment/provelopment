import { getDictionary } from "@/config/i18n";
import type { DirectionLinkResolver, DirectionsAction } from "@/application/direction-link";
import type { DayOfWeek, OperationalRegion } from "@/core/region";
import { DAYS_OF_WEEK, regionToLocation } from "@/core/region";
import { formatAddress } from "@/core/business";
import { RegionCurrentStatus } from "./region-current-status";

/** Localized day names in Monday..Sunday order via `Intl`, locale-derived. */
function localizeWeekdays(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "long" });
  return DAYS_OF_WEEK.map((_, index) =>
    formatter.format(new Date(Date.UTC(1970, 0, 5 + index))), // 1970-01-05 is a Monday
  );
}

/** Renders a day's intervals as "09:00–17:00" or "09:00–12:00, 13:00–17:00". */
function formatDayIntervals(intervals: readonly { open: string; close: string }[]): string {
  return intervals.map((interval) => `${interval.open}–${interval.close}`).join(", ");
}

function describeHoliday(
  holiday: OperationalRegion["hours"]["holidays"][number],
  closedLabel: string,
): string {
  if (holiday.closed === true) return closedLabel;
  if (holiday.intervals && holiday.intervals.length > 0) return formatDayIntervals(holiday.intervals);
  return closedLabel;
}

/** "2026-12-25" -> localized "25 Dec 2026". */
function formatISODate(locale: string, iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric", month: "short", year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
interface RegionBlockProps {
  readonly region: OperationalRegion;
  readonly locale: string;
  /** Provider-resolved directions action (maps seam, composed at app boundary). */
  readonly direction: DirectionsAction;
}

/**
 * Phase K — visible operational identity for a single resolved region.
 *
 * Receives an already-resolved region and the provider-resolved directions
 * action; it never reads the global business block, another region, or the
 * config's timezone. A regional page's address/phone/email/timezone/hours/
 * holidays/status all come from THIS region only.
 */
export function RegionBlock({ region, locale, direction }: RegionBlockProps) {
  const dictionary = getDictionary(locale);
  const dayNames = localizeWeekdays(locale);
  const addressText = formatAddress(region.address);
  const internationalText =
    region.addressMode === "local-international" && region.addressInternational
      ? formatAddress(region.addressInternational)
      : null;
  const hasAddress = Boolean(region.address.street || region.address.city);

  return (
    <section
      aria-labelledby={`region-${region.id}-heading`}
      className="mt-12 border-t border-border pt-8"
    >
      <h2
        id={`region-${region.id}-heading`}
        className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {region.name ?? dictionary.sections.contact}
      </h2>

      <div className="mt-4 grid gap-8 sm:grid-cols-2">
        <div>
          {hasAddress ? (
            <address className="not-italic text-muted-foreground">
              {direction.kind === "link" ? (
                <a
                  href={direction.href}
                  className="hover:text-primary"
                  target="_blank"
                  rel="noreferrer"
                >
                  {addressText}
                </a>
              ) : (
                <span>{addressText}</span>
              )}
              {internationalText && region.addressInternational ? (
                <span className="mt-1 block">{internationalText}</span>
              ) : null}
            </address>
          ) : null}

          {region.phone ? (
            <p className="mt-2">
              <a href={`tel:${region.phone}`} className="hover:text-primary">
                {region.phone}
              </a>
            </p>
          ) : null}
          {region.email ? (
            <p className="mt-2">
              <a href={`mailto:${region.email}`} className="hover:text-primary">
                {region.email}
              </a>
            </p>
          ) : null}

          <p className="mt-2 text-sm text-muted-foreground">{region.timezone}</p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {dictionary.business.hoursLabel}
          </h3>

          <RegionCurrentStatus
            region={region}
            labels={{ open: dictionary.business.open, closed: dictionary.business.closed }}
          />

          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {DAYS_OF_WEEK.map((day: DayOfWeek, index: number) => {
              const intervals = region.hours[day];
              const name = dayNames[index];
              return (
                <li key={day} className="flex items-baseline justify-between gap-4">
                  <span className="text-foreground">{name}</span>
                  <span>
                    {intervals.length > 0
                      ? formatDayIntervals(intervals)
                      : dictionary.business.closed}
                  </span>
                </li>
              );
            })}
          </ul>

          {region.hours.holidays.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {region.hours.holidays.map((holiday) => (
                <li key={holiday.date} className="flex items-baseline justify-between gap-4">
                  <span className="text-foreground">
                    {holiday.name} · {formatISODate(locale, holiday.date)}
                  </span>
                  <span>{describeHoliday(holiday, dictionary.business.closed)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

interface ResolvedRegionBlockProps {
  readonly region: OperationalRegion;
  readonly locale: string;
  readonly directionLinkResolver: DirectionLinkResolver;
}

/**
 * Composes the provider-selected directions action from the maps seam and
 * renders the region block. Kept separate so the block itself stays
 * adapter-agnostic.
 */
export function ResolvedRegionBlock({
  region,
  locale,
  directionLinkResolver,
}: ResolvedRegionBlockProps) {
  const direction = directionLinkResolver.resolve(regionToLocation(region));
  return <RegionBlock region={region} locale={locale} direction={direction} />;
}