import { describe, expect, it } from "vitest";

import {
  AnalyticsMisconfigurationError,
  createAnalyticsProvider,
} from "@/adapters/analytics";
import type { AnalyticsConfig } from "@/config";

describe("createAnalyticsProvider (factory)", () => {
  it("composes an analytics integration for a configured vercel provider", () => {
    expect(createAnalyticsProvider({ provider: "vercel" })).not.toBeNull();
  });

  it("renders nothing when features.analytics is absent (intentionally disabled)", () => {
    expect(createAnalyticsProvider(undefined)).toBeNull();
  });

  it("treats an explicit provider none as the intentional off state", () => {
    expect(createAnalyticsProvider({ provider: "none" })).toBeNull();
  });

  it("fails loudly for a provider that reaches the factory with no adapter (never silent nothing)", () => {
    const unhonorable = { provider: "example-analytics" } as unknown as AnalyticsConfig;
    expect(() => createAnalyticsProvider(unhonorable)).toThrow(AnalyticsMisconfigurationError);
    expect(() => createAnalyticsProvider(unhonorable)).toThrow(/example-analytics/);
  });
});