// Local UI fixture: fake extension storage, no API key or network requests.
import React from "react";
import { createRoot } from "react-dom/client";
import { SettingsPanel } from "../../src/shared/components/SettingsPanel";

const storageKey = "youtube-summary-settings-preview";
const local = {
  get: async () => ({ summaryPrompt: localStorage.getItem(storageKey) }),
  set: async (values: { summaryPrompt: string }) => {
    localStorage.setItem(storageKey, values.summaryPrompt);
  },
  remove: async () => { localStorage.removeItem(storageKey); },
};

globalThis.chrome = {
  storage: {
    local,
    sync: {
      get: (_keys: unknown, callback: (values: object) => void) => { callback({}); },
      set: () => {},
    },
  },
} as unknown as typeof chrome;

createRoot(document.getElementById("root")!).render(<SettingsPanel />);
