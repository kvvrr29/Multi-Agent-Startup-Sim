import { useSettingsStore } from '../../store/useSettingsStore';
import { useProjectStore } from '../../store/useProjectStore';

/** Long-form names, used in settings and status copy. */
export const PROVIDER_LABELS = {
  gemini: 'Gemini',
  openai: 'OpenAI (GPT-4o-mini)',
  webllm: 'Built-in AI (WebLLM)'
};

/** Short names, used as generation-source badges in the debug panel. */
export const PROVIDER_SOURCE_LABELS = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  webllm: 'Built-in AI'
};

/** Sources that mean "no live model produced this". */
export const NON_LIVE_SOURCES = ['Fallback', 'Simulator'];

/**
 * A project can pin its own provider — the quota fallback sets this so a
 * mid-run switch to the local model sticks for the remaining sections.
 * Otherwise the global setting wins.
 */
export const getActiveProviderName = () => {
  const { aiProvider } = useSettingsStore.getState();
  const projectProvider = useProjectStore.getState().project?.aiProvider;
  return projectProvider || aiProvider || 'gemini';
};

export const getActiveProviderLabel = () => {
  const name = getActiveProviderName();
  return PROVIDER_LABELS[name] || name;
};

export const getProviderSourceLabel = (providerName) =>
  PROVIDER_SOURCE_LABELS[providerName] || providerName;
