import { create } from 'zustand';

export const useSettingsStore = create((set) => ({
  aiProvider: 'gemini', // 'gemini', 'openai', 'claude'
  // API keys deliberately live only in memory. They are never persisted.
  apiKey: '',
  aiModeEnabled: typeof localStorage === 'undefined' ? true : localStorage.getItem('mass_ai_mode') !== 'false',
  developerMode: typeof localStorage === 'undefined' ? false : localStorage.getItem('mass_dev_mode') === 'true',

  setApiKey: (key) => {
    set({ apiKey: key });
  },

  setAiProvider: (provider) => {
    set({ aiProvider: provider });
  },

  setAiModeEnabled: (enabled) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('mass_ai_mode', String(enabled));
    set({ aiModeEnabled: enabled });
  },

  setDeveloperMode: (enabled) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('mass_dev_mode', String(enabled));
    set({ developerMode: enabled });
  }
}));
