import { useSettingsStore } from '../../store/useSettingsStore';

/** Short names, used as generation-source badges in the debug panel. */
export const PROVIDER_SOURCE_LABELS = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  webllm: 'Built-in AI'
};

/** Sources that mean "no live model produced this". */
export const NON_LIVE_SOURCES = ['Fallback', 'Simulator'];

/** The provider every AI call routes through, from the global setting. */
export const getActiveProviderName = () =>
  useSettingsStore.getState().aiProvider || 'gemini';

export const getProviderSourceLabel = (providerName) =>
  PROVIDER_SOURCE_LABELS[providerName] || providerName;
