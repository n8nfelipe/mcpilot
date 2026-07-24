import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { parseStdioCommand } from "../ConnectionPanel";

describe("parseStdioCommand", () => {
  it("parses quotes and basic escapes", () => {
    expect(parseStdioCommand(`node "dist/my server.js" --name 'Jane Doe' escaped\\ value "\\"quoted\\""`)).toEqual({
      command: "node",
      args: ["dist/my server.js", "--name", "Jane Doe", "escaped value", '"quoted"'],
    });
  });

  it("rejects empty input and unclosed quotes", () => {
    expect(() => parseStdioCommand("   ")).toThrow("Enter a command");
    expect(() => parseStdioCommand(`node "server.js`)).toThrow("Unclosed quote in command");
  });
});

describe("ConnectionPanel", () => {
  beforeEach(async () => {
    const { useTabsStore } = await import("@/stores/tabs-store");
    useTabsStore.setState((s) => ({ tabs: [], activeTabId: "" }));
    useTabsStore.getState().addTab();
  });

  it("renders connect button and status indicator", async () => {
    const { ConnectionPanel } = await import("../ConnectionPanel");
    render(<ConnectionPanel />);
    expect(screen.getByText("Connect")).toBeDefined();
    expect(screen.getByText("disconnected")).toBeDefined();
  });

  it("shows command input by default (stdio mode)", async () => {
    const { ConnectionPanel } = await import("../ConnectionPanel");
    render(<ConnectionPanel />);
    const input = screen.getByPlaceholderText("node dist/server.js");
    expect(input).toBeDefined();
  });

  it("shows validation errors for invalid stdio commands", async () => {
    const { ConnectionPanel } = await import("../ConnectionPanel");
    render(<ConnectionPanel />);

    fireEvent.click(screen.getByText("Connect"));
    expect(screen.getByText("Enter a command")).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("node dist/server.js"), { target: { value: `node "server.js` } });
    fireEvent.click(screen.getByText("Connect"));
    expect(screen.getByText("Unclosed quote in command")).toBeDefined();
  });

  it("switches to SSE mode via store", async () => {
    const { useTabsStore } = await import("@/stores/tabs-store");
    const { ConnectionPanel } = await import("../ConnectionPanel");
    const id = useTabsStore.getState().tabs[0].id;
    act(() => {
      useTabsStore.getState().setTabMode(id, "sse");
    });
    render(<ConnectionPanel />);
    expect(screen.getByPlaceholderText("http://localhost:3000/mcp")).toBeDefined();
  });

  it("shows disconnect button when connected", async () => {
    const { useTabsStore } = await import("@/stores/tabs-store");
    const { ConnectionPanel } = await import("../ConnectionPanel");
    const id = useTabsStore.getState().tabs[0].id;
    act(() => {
      useTabsStore.getState().updateTabAfterConnect(id, {
        serverInfo: { name: "test" }, tools: [], resources: [], prompts: [],
      });
    });
    render(<ConnectionPanel />);
    expect(screen.getByText("Disconnect")).toBeDefined();
  });

  it("shows error status indicator", async () => {
    const { useTabsStore } = await import("@/stores/tabs-store");
    const { ConnectionPanel } = await import("../ConnectionPanel");
    const id = useTabsStore.getState().tabs[0].id;
    act(() => {
      useTabsStore.getState().setTabError(id, "Failed");
    });
    render(<ConnectionPanel />);
    expect(screen.getByText("error")).toBeDefined();
  });

  it("renders without crashing with no tabs", async () => {
    const { useTabsStore } = await import("@/stores/tabs-store");
    act(() => { useTabsStore.setState({ tabs: [], activeTabId: "" }); });
    const { ConnectionPanel } = await import("../ConnectionPanel");
    render(<ConnectionPanel />);
    expect(screen.getByText("Connect")).toBeDefined();
  });
});
