import { describe, expect, it } from "vitest";

import { createAnalyticsProvider } from "@/adapters/analytics";

describe("createAnalyticsProvider (factory)", () => {
  it("composes an analytics integration for a configured vercel provider", () => {
    expect(createAnalyticsProvider({ provider: "vercel" })).not.toBeNull();
  });

  it("renders nothing when features.analytics is absent (intentionally disabled)", () => {
    expect(createAnalyticsProvider(undefined)).toBeNull();
  });
});