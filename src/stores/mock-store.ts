import { create } from "zustand";

export interface MockEntry {
  toolName: string;
  response: unknown;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

interface MockState {
  mocks: Record<string, MockEntry>;
  saveMock: (toolName: string, response: unknown) => void;
  deleteMock: (toolName: string) => void;
  toggleMock: (toolName: string) => void;
  updateMockResponse: (toolName: string, response: unknown) => void;
  getActiveMock: (toolName: string) => unknown | null;
  hasActiveMock: (toolName: string) => boolean;
  exportMocks: () => string;
  importMocks: (json: string) => void;
}

export const useMockStore = create<MockState>((set, get) => ({
  mocks: {},

  saveMock: (toolName, response) =>
    set((state) => ({
      mocks: {
        ...state.mocks,
        [toolName]: {
          toolName,
          response,
          active: true,
          createdAt: state.mocks[toolName]?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        },
      },
    })),

  deleteMock: (toolName) =>
    set((state) => {
      const { [toolName]: _, ...rest } = state.mocks;
      return { mocks: rest };
    }),

  toggleMock: (toolName) =>
    set((state) => {
      const entry = state.mocks[toolName];
      if (!entry) return state;
      return {
        mocks: {
          ...state.mocks,
          [toolName]: { ...entry, active: !entry.active, updatedAt: Date.now() },
        },
      };
    }),

  updateMockResponse: (toolName, response) =>
    set((state) => {
      const entry = state.mocks[toolName];
      if (!entry) return state;
      return {
        mocks: {
          ...state.mocks,
          [toolName]: { ...entry, response, updatedAt: Date.now() },
        },
      };
    }),

  getActiveMock: (toolName) => {
    const entry = get().mocks[toolName];
    return entry?.active ? entry.response : null;
  },

  hasActiveMock: (toolName) => {
    const entry = get().mocks[toolName];
    return !!entry?.active;
  },

  exportMocks: () => {
    return JSON.stringify(Object.values(get().mocks), null, 2);
  },

  importMocks: (json) => {
    const entries: MockEntry[] = JSON.parse(json);
    const mocks: Record<string, MockEntry> = {};
    for (const entry of entries) {
      mocks[entry.toolName] = entry;
    }
    set({ mocks });
  },
}));
