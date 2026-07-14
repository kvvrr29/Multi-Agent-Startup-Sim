import { create } from 'zustand';

export const useSettingsStore = create((set) => ({
  aiProvider: 'gemini', // 'gemini', 'openai', 'claude'
  apiKey: localStorage.getItem('mass_api_key') || '',
  aiModeEnabled: localStorage.getItem('mass_ai_mode') !== 'false',
  developerMode: localStorage.getItem('mass_dev_mode') === 'true', // debug tools hidden by default (doc §11)

  setApiKey: (key) => {
    localStorage.setItem('mass_api_key', key);
    set({ apiKey: key });
  },

  setAiProvider: (provider) => {
    set({ aiProvider: provider });
  },

  setAiModeEnabled: (enabled) => {
    localStorage.setItem('mass_ai_mode', enabled);
    set({ aiModeEnabled: enabled });
  },

  setDeveloperMode: (enabled) => {
    localStorage.setItem('mass_dev_mode', enabled);
    set({ developerMode: enabled });
  }
}));
