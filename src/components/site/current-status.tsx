"use client";

import { useSyncExternalStore } from "react";

import type { BusinessLocation } from "@/core/business";
import { openStatusAt } from "@/core/business-hours";

export interface CurrentStatusLabels {
  /** "Open now" */
  readonly open: string;
  /** "Closed" */
  readonly closed: string;
}

interface CurrentStatusProps {
  readonly location: BusinessLocation;
  /** Resolved IANA timezone for the location (see `resolveTimezone`). */
  readonly timeZone: string;
  readonly labels: CurrentStatusLabels;
}

/** Refresh cadence for the "now" value (matches typical minute-grained hours). */
const TICK_MS = 60_000;

/**
 * Cached current time; invalidated by the subscription so the snapshot only
 * changes when a tick fires (avoids re-render loops from a fresh Date on every
 * read).
 */
let cachedNow: Date | null = null;

function getSnapshot(): Date {
  if (cachedNow === null) cachedNow = new Date();
  return cachedNow;
}

function subscribe(callback: () => void): () => void {
  const id = window.setInterval(() => {
    cachedNow = new Date();
    callback();
  }, TICK_MS);
  return () => window.clearInterval(id);
}

/** During SSR/hydration render nothing; the live status appears post-hydration. */
function getServerSnapshot(): null {
  return null;
}

/**
 * Live open/closed indicator driven by the visitor's clock.
 *
 * `useSyncExternalStore` treats the browser clock as the external system: the
 * server (and the first hydrated paint) renders nothing — so a statically
 * generated page never bakes a build-time timestamp — and the current status
 * is computed client-side in the location's IANA timezone.
 */
export function CurrentStatus({ location, timeZone, labels }: CurrentStatusProps) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (now === null) return null;

  const result = openStatusAt(location, now, { businessTimezone: timeZone });
  const isOpen = result !== "noSchedule" && result.open === true;

  return (
    <p className="mt-2 text-sm" data-open={isOpen ? "true" : "false"}>
      <span
        className={
          isOpen ? "font-medium text-emerald-600" : "text-muted-foreground"
        }
      >
        {isOpen ? labels.open : labels.closed}
      </span>
    </p>
  );
}