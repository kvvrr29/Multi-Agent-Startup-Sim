import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map();

const localStorageMock = {
  getItem: vi.fn(key => storage.get(key) ?? null),
  setItem: vi.fn((key, value) => storage.set(key, String(value))),
  removeItem: vi.fn(key => storage.delete(key))
};

describe('useSettingsStore API key persistence', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  it('hydrates a saved personal API key when the store loads', async () => {
    storage.set('mass_gemini_api_key', 'saved-key');

    const { useSettingsStore } = await import('./useSettingsStore');

    expect(useSettingsStore.getState().apiKey).toBe('saved-key');
  });

  it('persists a normalized key and removes it when cleared', async () => {
    const { API_KEY_STORAGE_KEY, useSettingsStore } = await import('./useSettingsStore');

    useSettingsStore.getState().setApiKey('  new-key  ');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(API_KEY_STORAGE_KEY, 'new-key');
    expect(useSettingsStore.getState().apiKey).toBe('new-key');

    useSettingsStore.getState().setApiKey('');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(API_KEY_STORAGE_KEY);
    expect(useSettingsStore.getState().apiKey).toBe('');
  });
});
