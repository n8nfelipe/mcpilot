import { describe, it, expect } from "vitest";

describe("cn", () => {
  it("merges class names", async () => {
    const { cn } = await import("../utils");
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles conditional classes", async () => {
    const { cn } = await import("../utils");
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("handles tailwind conflict resolution", async () => {
    const { cn } = await import("../utils");
    const result = cn("px-4", "px-2");
    expect(result).toBe("px-2");
  });

  it("handles empty inputs", async () => {
    const { cn } = await import("../utils");
    expect(cn()).toBe("");
  });
});
