import { create } from "zustand";

const STORAGE_KEY = "mcpilot-license-key";

function validateKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed.startsWith("PRO-")) return false;
  const rest = trimmed.slice(4);
  if (rest.length < 4) return false;
  const chars = rest.split("");
  let sum = 0;
  for (const c of chars) {
    sum += c.charCodeAt(0);
  }
  const check = (sum % 36).toString(36).toUpperCase();
  return check === chars[chars.length - 1].toUpperCase();
}

function loadKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveKey(key: string) {
  try {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage unavailable
  }
}

export type LicenseTier = "free" | "pro";

interface LicenseState {
  licenseKey: string;
  tier: LicenseTier;
  isValid: boolean;
  lastValidatedAt: number | null;
  activate: (key: string) => boolean;
  deactivate: () => void;
  revalidate: () => boolean;
}

export const useLicenseStore = create<LicenseState>((set) => {
  const stored = loadKey();
  const valid = stored ? validateKey(stored) : false;
  return {
    licenseKey: stored,
    tier: valid ? "pro" : "free",
    isValid: valid,
    lastValidatedAt: stored ? Date.now() : null,
    activate: (key: string) => {
      const valid = validateKey(key);
      if (valid) {
        saveKey(key.trim());
        set({ licenseKey: key.trim(), tier: "pro", isValid: true, lastValidatedAt: Date.now() });
      }
      return valid;
    },
    deactivate: () => {
      saveKey("");
      set({ licenseKey: "", tier: "free", isValid: false, lastValidatedAt: null });
    },
    revalidate: () => {
      const key = loadKey();
      const valid = key ? validateKey(key) : false;
      if (!valid) saveKey("");
      set({
        licenseKey: valid ? key.trim() : "",
        tier: valid ? "pro" : "free",
        isValid: valid,
        lastValidatedAt: Date.now(),
      });
      return valid;
    },
  };
});
