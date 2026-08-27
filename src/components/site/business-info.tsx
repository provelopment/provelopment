import { siteConfig, getDictionary } from "@/config";
import type { BusinessLocation } from "@/core/business";

interface BusinessInfoProps {
    readonly locale: string;
}

function formatClock(time: string): string {
    return time;
}

function LocationBlock({ location, locale }: { location: BusinessLocation; locale: string }) {
    const dictionary = getDictionary(locale);
    const address = location.address;
    const hasAddress = Boolean(address.street || address.city);
    const hasHours = Boolean(location.hours && location.hours.intervals.length);

    return (
        <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground">
                {location.name ?? siteConfig.name}
            </h3>

            {hasAddress ? (
                <address className="mt-2 not-italic text-muted-foreground">
                    <a
                        href={
                            location.geo
                                ? `https://www.google.com/maps?q=${location.geo.lat},${location.geo.lng}`
                                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                      [address.street, address.city, address.region, address.postalCode, address.country]
                                          .filter(Boolean)
                                          .join(", "),
                                  )}`
                        }
                        className="hover:text-primary"
                        target="_blank"
                        rel="noreferrer"
                    >
                        {[address.street, address.city, address.region, address.postalCode, address.country]
                            .filter(Boolean)
                            .join(", ")}
                    </a>
                </address>
            ) : null}

            {location.phone ? (
                <p className="mt-2">
                    <a href={`tel:${location.phone}`} className="hover:text-primary">
                        {location.phone}
                    </a>
                </p>
            ) : null}

            {hasHours ? (
                <div className="mt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {dictionary.business.hoursLabel}
                    </h4>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {location.hours!.intervals.map((interval, i) => (
                            <li key={i}>
                                <span className="capitalize">{interval.days.join("/")}:</span>{" "}
                                {formatClock(interval.open)}–{formatClock(interval.close)}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

export function BusinessInfo({ locale }: BusinessInfoProps) {
    const dictionary = getDictionary(locale);
    const business = siteConfig.business;
    const primaryEmail = business.contact.email ?? siteConfig.contact.email ?? "";
    const primaryPhone = business.contact.phone ?? siteConfig.contact.phone ?? "";

    if (!business.locations.length && !primaryEmail && !primaryPhone) return null;

    return (
        <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {dictionary.sections.contact}
            </h2>

            {primaryEmail ? (
                <p className="mt-3">
                    <a href={`mailto:${primaryEmail}`} className="hover:text-primary">
                        {primaryEmail}
                    </a>
                </p>
            ) : null}
            {primaryPhone ? (
                <p className="mt-3">
                    <a href={`tel:${primaryPhone}`} className="hover:text-primary">
                        {primaryPhone}
                    </a>
                </p>
            ) : null}

            {business.locations.map((location) => (
                <LocationBlock key={location.id} location={location} locale={locale} />
            ))}
        </div>
    );
}