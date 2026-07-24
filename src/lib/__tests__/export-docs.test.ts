import { describe, it, expect } from "vitest";
import type { Tab } from "@/stores/tabs-store";
import type { HistoryEntry } from "@/stores/history-store";

describe("Export Docs", () => {
  describe("generateDocs", () => {
    it("generates docs with tools table and history examples", async () => {
      const { generateDocs } = await import("../export-docs");
      const tab: Tab = {
        id: "t1", name: "S1", mode: "stdio", connectionStatus: "connected", connectionError: null,
        serverInfo: { name: "TestServer", version: "1.0" },
        tools: [{ name: "get_weather", description: "Get weather for a city", inputSchema: { type: "object", properties: { city: { type: "string", description: "City name" } }, required: ["city"] } }],
        resources: [], prompts: [], generation: 0,
      };
      const history: HistoryEntry[] = [
        { tool_name: "get_weather", arguments: '{"city":"NYC"}', response: '{"temp":25}', server_name: "TestServer", connection_id: "t1", is_reference: false, created_at: "2024-01-01", status: "success", duration_ms: 10, error: null, is_mock: false, request_json: "{}", response_json: '{"temp":25}' },
      ];
      const docs = generateDocs(tab, history);
      expect(docs).toContain("# TestServer v1.0");
      expect(docs).toContain("## Tools");
      expect(docs).toContain("### get_weather");
      expect(docs).toContain("Get weather for a city");
      expect(docs).toContain("| `city` | string ✓ — City name |");
      expect(docs).toContain("temp");
      expect(docs).toContain('{"temp":25}');
    });

    it("shows empty state when no tools", async () => {
      const { generateDocs } = await import("../export-docs");
      const tab: Tab = {
        id: "t1", name: "S1", mode: "stdio", connectionStatus: "connected", connectionError: null,
        serverInfo: null, tools: [], resources: [], prompts: [], generation: 0,
      };
      const docs = generateDocs(tab, []);
      expect(docs).toContain("_No tools available._");
    });

    it("renders resources section", async () => {
      const { generateDocs } = await import("../export-docs");
      const tab: Tab = {
        id: "t1", name: "S1", mode: "stdio", connectionStatus: "connected", connectionError: null,
        serverInfo: null,
        tools: [],
        resources: [{ uri: "file:///data", name: "Data", description: "Some data", mimeType: "text/plain" }],
        prompts: [], generation: 0,
      };
      const docs = generateDocs(tab, []);
      expect(docs).toContain("## Resources");
      expect(docs).toContain("file:///data");
      expect(docs).toContain("Some data");
      expect(docs).toContain("text/plain");
    });

    it("shows empty resources when none available", async () => {
      const { generateDocs } = await import("../export-docs");
      const tab: Tab = {
        id: "t1", name: "S1", mode: "stdio", connectionStatus: "connected", connectionError: null,
        serverInfo: null, tools: [], resources: [], prompts: [], generation: 0,
      };
      const docs = generateDocs(tab, []);
      expect(docs).toContain("_No resources available._");
    });

    it("renders prompts section with arguments table", async () => {
      const { generateDocs } = await import("../export-docs");
      const tab: Tab = {
        id: "t1", name: "S1", mode: "stdio", connectionStatus: "connected", connectionError: null,
        serverInfo: null, tools: [],
        resources: [],
        prompts: [{ name: "greet", description: "Greet someone", arguments: [{ name: "name", description: "Person name", required: true }] }], generation: 0,
      };
      const docs = generateDocs(tab, []);
      expect(docs).toContain("## Prompts");
      expect(docs).toContain("### greet");
      expect(docs).toContain("| `name` |  ✓ | Person name |");
    });

    it("shows empty prompts when none available", async () => {
      const { generateDocs } = await import("../export-docs");
      const tab: Tab = {
        id: "t1", name: "S1", mode: "stdio", connectionStatus: "connected", connectionError: null,
        serverInfo: null, tools: [], resources: [], prompts: [], generation: 0,
      };
      const docs = generateDocs(tab, []);
      expect(docs).toContain("_No prompts available._");
    });

    it("handles missing server name gracefully", async () => {
      const { generateDocs } = await import("../export-docs");
      const tab: Tab = {
        id: "t1", name: "S1", mode: "stdio", connectionStatus: "connected", connectionError: null,
        serverInfo: null, tools: [], resources: [], prompts: [], generation: 0,
      };
      const docs = generateDocs(tab, []);
      expect(docs).toContain("# MCP Server");
    });

    it("uses history examples only from the active tab", async () => {
      const { generateDocs } = await import("../export-docs");
      const tab: Tab = {
        id: "t1", name: "S1", mode: "stdio", connectionStatus: "connected", connectionError: null,
        serverInfo: null, tools: [{ name: "tool" }], resources: [], prompts: [], generation: 0,
      };
      const history: HistoryEntry[] = [
        { tool_name: "tool", arguments: "{}", response: '{"wrong":true}', server_name: "Other", connection_id: "t2", is_reference: false, created_at: "2024-01-01", status: "success", duration_ms: 10, error: null, is_mock: false, request_json: "{}", response_json: '{"wrong":true}' },
        { tool_name: "tool", arguments: "{}", response: '{"right":true}', server_name: "Active", connection_id: "t1", is_reference: false, created_at: "2024-01-01", status: "success", duration_ms: 10, error: null, is_mock: false, request_json: "{}", response_json: '{"right":true}' },
      ];

      const docs = generateDocs(tab, history);

      expect(docs).toContain('{"right":true}');
      expect(docs).not.toContain('{"wrong":true}');
    });
  });

  describe("makeSnippet", () => {
    it("creates JSON snippet for tool call", async () => {
      const { makeSnippet } = await import("../export-docs");
      const snippet = makeSnippet("tools/call", { name: "get_weather", arguments: { city: "NYC" } });
      expect(snippet).toContain("tools/call");
      expect(snippet).toContain("get_weather");
      expect(snippet).toContain("NYC");
      expect(() => JSON.parse(snippet)).not.toThrow();
    });
  });

  describe("copyToClipboard", () => {
    it("copies text to clipboard", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      const { copyToClipboard } = await import("../export-docs");
      await copyToClipboard("test content");
      expect(writeText).toHaveBeenCalledWith("test content");
    });
  });
});
