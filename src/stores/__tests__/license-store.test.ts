import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const VALID_KEY = "PRO-AAAAX0";

describe("License Store", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    localStorage.clear();
    const { useLicenseStore } = await import("../license-store");
    useLicenseStore.getState().deactivate();
  });

  afterEach(() => vi.useRealTimers());

  it("starts as free with no key", async () => {
    const { useLicenseStore } = await import("../license-store");
    expect(useLicenseStore.getState().tier).toBe("free");
    expect(useLicenseStore.getState().isValid).toBe(false);
    expect(useLicenseStore.getState().licenseKey).toBe("");
    expect(useLicenseStore.getState().lastValidatedAt).toBeNull();
  });

  it("rejects invalid key format", async () => {
    const { useLicenseStore } = await import("../license-store");
    expect(useLicenseStore.getState().activate("invalid")).toBe(false);
    expect(useLicenseStore.getState().tier).toBe("free");
  });

  it("rejects key without PRO- prefix", async () => {
    const { useLicenseStore } = await import("../license-store");
    expect(useLicenseStore.getState().activate("TEST-1234")).toBe(false);
  });

  it("rejects short key (<4 chars after PRO-)", async () => {
    const { useLicenseStore } = await import("../license-store");
    expect(useLicenseStore.getState().activate("PRO-AB")).toBe(false);
  });

  it("rejects key with wrong checksum", async () => {
    const { useLicenseStore } = await import("../license-store");
    expect(useLicenseStore.getState().activate("PRO-TEST1234")).toBe(false);
  });

  it("accepts a valid PRO key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { useLicenseStore } = await import("../license-store");
    const result = useLicenseStore.getState().activate(VALID_KEY);
    expect(result).toBe(true);
    expect(useLicenseStore.getState().tier).toBe("pro");
    expect(useLicenseStore.getState().isValid).toBe(true);
    expect(useLicenseStore.getState().licenseKey).toBe(VALID_KEY);
    expect(useLicenseStore.getState().lastValidatedAt).toBe(1_000);
  });

  it("persists valid key to localStorage", async () => {
    const { useLicenseStore } = await import("../license-store");
    useLicenseStore.getState().activate(VALID_KEY);
    expect(localStorage.getItem("mcpilot-license-key")).toBe(VALID_KEY);
  });

  it("deactivates license and clears storage", async () => {
    const { useLicenseStore } = await import("../license-store");
    useLicenseStore.getState().activate(VALID_KEY);
    expect(useLicenseStore.getState().tier).toBe("pro");

    useLicenseStore.getState().deactivate();
    expect(useLicenseStore.getState().tier).toBe("free");
    expect(useLicenseStore.getState().isValid).toBe(false);
    expect(useLicenseStore.getState().licenseKey).toBe("");
    expect(useLicenseStore.getState().lastValidatedAt).toBeNull();
    expect(localStorage.getItem("mcpilot-license-key")).toBeNull();
  });

  it("revalidates the stored key and updates the timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const { useLicenseStore } = await import("../license-store");
    localStorage.setItem("mcpilot-license-key", VALID_KEY);

    expect(useLicenseStore.getState().revalidate()).toBe(true);
    expect(useLicenseStore.getState().tier).toBe("pro");
    expect(useLicenseStore.getState().isValid).toBe(true);
    expect(useLicenseStore.getState().licenseKey).toBe(VALID_KEY);
    expect(useLicenseStore.getState().lastValidatedAt).toBe(2_000);
  });

  it("clears an invalid stored key and immediately returns to free", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(3_000);
    const { useLicenseStore } = await import("../license-store");
    useLicenseStore.getState().activate(VALID_KEY);
    localStorage.setItem("mcpilot-license-key", "PRO-INVALID");

    expect(useLicenseStore.getState().revalidate()).toBe(false);
    expect(useLicenseStore.getState().tier).toBe("free");
    expect(useLicenseStore.getState().isValid).toBe(false);
    expect(useLicenseStore.getState().licenseKey).toBe("");
    expect(useLicenseStore.getState().lastValidatedAt).toBe(3_000);
    expect(localStorage.getItem("mcpilot-license-key")).toBeNull();
  });
});
