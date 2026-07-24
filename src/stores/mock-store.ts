import { create } from "zustand";

export interface MockEntry {
  connectionId: string;
  toolName: string;
  response: unknown;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

type SaveMock = {
  (connectionId: string, toolName: string, response: unknown): void;
  (toolName: string, response: unknown): void;
};

type MockLookup = {
  (connectionId: string, toolName: string): unknown | null;
  (toolName: string): unknown | null;
};

type MockPredicate = {
  (connectionId: string, toolName: string): boolean;
  (toolName: string): boolean;
};

type MockMutation = {
  (connectionId: string, toolName: string): void;
  (toolName: string): void;
};

type UpdateMock = {
  (connectionId: string, toolName: string, response: unknown): void;
  (toolName: string, response: unknown): void;
};

interface MockState {
  mocks: Record<string, MockEntry>;
  activeConnectionId: string;
  setActiveConnectionId: (connectionId: string) => void;
  saveMock: SaveMock;
  deleteMock: MockMutation;
  toggleMock: MockMutation;
  updateMockResponse: UpdateMock;
  getActiveMock: MockLookup;
  hasActiveMock: MockPredicate;
  exportMocks: () => string;
  importMocks: (json: string) => void;
}

function mockKey(connectionId: string, toolName: string): string {
  return JSON.stringify([connectionId, toolName]);
}

function assertName(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function validateEntry(value: unknown): MockEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Each mock must be an object");
  }
  const entry = value as Record<string, unknown>;
  assertName(entry.connectionId, "connectionId");
  assertName(entry.toolName, "toolName");
  if (typeof entry.active !== "boolean") {
    throw new TypeError("active must be a boolean");
  }
  if (typeof entry.createdAt !== "number" || !Number.isFinite(entry.createdAt) || entry.createdAt < 0) {
    throw new TypeError("createdAt must be a non-negative number");
  }
  if (typeof entry.updatedAt !== "number" || !Number.isFinite(entry.updatedAt) || entry.updatedAt < 0) {
    throw new TypeError("updatedAt must be a non-negative number");
  }
  if (!("response" in entry)) {
    throw new TypeError("response is required");
  }
  return {
    connectionId: entry.connectionId,
    toolName: entry.toolName,
    response: entry.response,
    active: entry.active,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export const useMockStore = create<MockState>((set, get) => {
  const resolveNames = (first: string, second?: string) =>
    second === undefined
      ? { connectionId: get().activeConnectionId, toolName: first }
      : { connectionId: first, toolName: second };

  return {
    mocks: {},
    activeConnectionId: "",

    setActiveConnectionId: (activeConnectionId) => set({ activeConnectionId }),

    saveMock: ((...args: [string, unknown] | [string, string, unknown]) => {
      const [first, second, third] = args;
      const hasConnectionId = args.length === 3;
      const connectionId = hasConnectionId ? first : get().activeConnectionId;
      const toolName = hasConnectionId ? second as string : first;
      const response = hasConnectionId ? third : second;
      assertName(connectionId, "connectionId");
      assertName(toolName, "toolName");
      set((state) => {
        const key = mockKey(connectionId, toolName);
        const now = Date.now();
        return {
          mocks: {
            ...state.mocks,
            [key]: {
              connectionId,
              toolName,
              response,
              active: true,
              createdAt: state.mocks[key]?.createdAt ?? now,
              updatedAt: now,
            },
          },
        };
      });
    }) as SaveMock,

    deleteMock: ((first: string, second?: string) => {
      const { connectionId, toolName } = resolveNames(first, second);
      set((state) => {
        const key = mockKey(connectionId, toolName);
        const { [key]: _, ...rest } = state.mocks;
        return { mocks: rest };
      });
    }) as MockMutation,

    toggleMock: ((first: string, second?: string) => {
      const { connectionId, toolName } = resolveNames(first, second);
      set((state) => {
        const key = mockKey(connectionId, toolName);
        const entry = state.mocks[key];
        if (!entry) return state;
        return {
          mocks: {
            ...state.mocks,
            [key]: { ...entry, active: !entry.active, updatedAt: Date.now() },
          },
        };
      });
    }) as MockMutation,

    updateMockResponse: ((...args: [string, unknown] | [string, string, unknown]) => {
      const [first, second, third] = args;
      const hasConnectionId = args.length === 3;
      const connectionId = hasConnectionId ? first : get().activeConnectionId;
      const toolName = hasConnectionId ? second as string : first;
      const response = hasConnectionId ? third : second;
      set((state) => {
        const key = mockKey(connectionId, toolName);
        const entry = state.mocks[key];
        if (!entry) return state;
        return {
          mocks: {
            ...state.mocks,
            [key]: { ...entry, response, updatedAt: Date.now() },
          },
        };
      });
    }) as UpdateMock,

    getActiveMock: ((first: string, second?: string) => {
      const { connectionId, toolName } = resolveNames(first, second);
      const entry = get().mocks[mockKey(connectionId, toolName)];
      return entry?.active ? entry.response : null;
    }) as MockLookup,

    hasActiveMock: ((first: string, second?: string) => {
      const { connectionId, toolName } = resolveNames(first, second);
      return !!get().mocks[mockKey(connectionId, toolName)]?.active;
    }) as MockPredicate,

    exportMocks: () => JSON.stringify(Object.values(get().mocks), null, 2),

    importMocks: (json) => {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        throw new TypeError("Imported mocks must be an array");
      }
      const mocks: Record<string, MockEntry> = {};
      for (const value of parsed) {
        const entry = validateEntry(value);
        const key = mockKey(entry.connectionId, entry.toolName);
        if (mocks[key]) {
          throw new TypeError(`Duplicate mock for ${entry.connectionId}/${entry.toolName}`);
        }
        mocks[key] = entry;
      }
      set({ mocks });
    },
  };
});
