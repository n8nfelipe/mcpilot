import { useLicenseStore } from "@/stores/license-store";

export type ProFeature =
  | "multi-server"
  | "export-docs"
  | "mock-manager"
  | "replay-history";

const ALL_FEATURES: Record<ProFeature, string> = {
  "multi-server": "Multi-Server Tabs",
  "export-docs": "Export Documentation",
  "mock-manager": "Mock Manager",
  "replay-history": "Unlimited History Replay",
};

export function useFeature(feature: ProFeature): { enabled: boolean; label: string } {
  const tier = useLicenseStore((s) => s.tier);
  const enabled = import.meta.env.DEV || tier === "pro";
  return { enabled, label: ALL_FEATURES[feature] };
}

export function isFeatureEnabled(): boolean {
  return import.meta.env.DEV || useLicenseStore.getState().tier === "pro";
}

export function isPro(): boolean {
  return useLicenseStore.getState().tier === "pro";
}
