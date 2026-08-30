"use client";

import { useSyncExternalStore } from "react";

import type { OperationalRegion } from "@/core/region";
import { regionStatusAt } from "@/core/region-hours";

export interface RegionStatusLabels {
  /** "Open now" */
  readonly open: string;
  /** "Closed" */
  readonly closed: string;
}

interface RegionCurrentStatusProps {
  readonly region: OperationalRegion;
  readonly labels: RegionStatusLabels;
}

/** Refresh cadence for the "now" value (matches typical minute-grained hours). */
const TICK_MS = 60_000;

/** Cached current time; invalidated by the subscription (see CurrentStatus). */
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
 * Live open/closed indicator for a REGION (Phase K), analogous to the legacy
 * `CurrentStatus`: the browser clock is the external system, and the status is
 * computed client-side in the region's configured IANA timezone via the shared
 * region-hours evaluator (which reuses the single DST-safe time engine).
 */
export function RegionCurrentStatus({ region, labels }: RegionCurrentStatusProps) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (now === null) return null;

  const result = regionStatusAt(region, now);
  const isOpen = result.open === true;

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