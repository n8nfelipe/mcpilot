import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";

const Bomb = ({ shouldThrow }: { shouldThrow?: boolean }) => {
  if (shouldThrow) throw new Error("Kaboom!");
  return <div>Safe content</div>;
};

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText("Safe content")).toBeDefined();
  });

  it("catches error and shows fallback", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary name="TestPanel">
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("TestPanel crashed")).toBeDefined();
    expect(screen.getByText("Kaboom!")).toBeDefined();
    expect(screen.getByText("Try again")).toBeDefined();
    (console.error as unknown as ReturnType<typeof vi.spyOn>).mockRestore();
  });

  it("renders custom fallback when provided", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom error UI")).toBeDefined();
    expect(() => screen.getByText("Try again")).toThrow();
    (console.error as unknown as ReturnType<typeof vi.spyOn>).mockRestore();
  });

  it("resets error state on Try again click", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const userEvent = (await import("@testing-library/user-event")).default;
    const { rerender } = render(
      <ErrorBoundary name="TestPanel">
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("TestPanel crashed")).toBeDefined();

    rerender(
      <ErrorBoundary name="TestPanel">
        <Bomb />
      </ErrorBoundary>
    );

    const btn = screen.getByText("Try again");
    await userEvent.click(btn);

    expect(await screen.findByText("Safe content")).toBeDefined();
    (console.error as unknown as ReturnType<typeof vi.spyOn>).mockRestore();
  });
});
