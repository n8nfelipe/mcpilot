import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

describe("Feature Gate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns enabled=true in dev mode regardless of license", async () => {
    const { useFeature } = await import("../feature-gate");
    const { result } = renderHook(() => useFeature("multi-server"));
    expect(result.current.enabled).toBe(true);
    expect(result.current.label).toBe("Multi-Server Tabs");
  });

  it("returns correct labels for all features", async () => {
    const { useFeature } = await import("../feature-gate");
    for (const [feature, label] of [
      ["multi-server", "Multi-Server Tabs"],
      ["export-docs", "Export Documentation"],
      ["mock-manager", "Mock Manager"],
      ["replay-history", "Unlimited History Replay"],
    ] as [string, string][]) {
      const { result } = renderHook(() => useFeature(feature as never));
      expect(result.current.label).toBe(label);
    }
  });

  it("isPro returns false when tier is free", async () => {
    const { isPro } = await import("../feature-gate");
    expect(isPro()).toBe(false);
  });

  it("isPro returns true after pro activation", async () => {
    const { useLicenseStore } = await import("@/stores/license-store");
    const { isPro } = await import("../feature-gate");
    useLicenseStore.getState().activate("PRO-AAAAX0");
    expect(isPro()).toBe(true);
  });
});
