import { create } from 'zustand';

export const API_KEY_STORAGE_KEY = 'mass_gemini_api_key';
const OPENAI_KEY_STORAGE_KEY = 'mass_openai_api_key';
const AI_PROVIDER_STORAGE_KEY = 'mass_ai_provider';

const readLocalSetting = (key, fallback = '') => {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeLocalSetting = (key, value) => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
  }
};

export const useSettingsStore = create((set) => ({
  aiProvider: readLocalSetting(AI_PROVIDER_STORAGE_KEY, 'gemini'),
  apiKey: readLocalSetting(API_KEY_STORAGE_KEY),
  openaiApiKey: readLocalSetting(OPENAI_KEY_STORAGE_KEY),
  aiModeEnabled: typeof localStorage === 'undefined' ? true : localStorage.getItem('mass_ai_mode') !== 'false',
  developerMode: typeof localStorage === 'undefined' ? false : localStorage.getItem('mass_dev_mode') === 'true',

  setApiKey: (key) => {
    const normalizedKey = typeof key === 'string' ? key.trim() : '';
    writeLocalSetting(API_KEY_STORAGE_KEY, normalizedKey);
    set({ apiKey: normalizedKey });
  },

  setOpenaiApiKey: (key) => {
    const normalizedKey = typeof key === 'string' ? key.trim() : '';
    writeLocalSetting(OPENAI_KEY_STORAGE_KEY, normalizedKey);
    set({ openaiApiKey: normalizedKey });
  },

  setAiProvider: (provider) => {
    writeLocalSetting(AI_PROVIDER_STORAGE_KEY, provider);
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
