import { useSettingsStore } from '../../store/useSettingsStore';
export const PROVIDER_SOURCE_LABELS = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  webllm: 'Built-in AI'
};
export const NON_LIVE_SOURCES = ['Fallback', 'Simulator'];
export const getActiveProviderName = () =>
  useSettingsStore.getState().aiProvider || 'gemini';

export const getProviderSourceLabel = (providerName) =>
  PROVIDER_SOURCE_LABELS[providerName] || providerName;
