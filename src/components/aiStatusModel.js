import { AlertTriangle, Cpu, Zap, Activity, WifiOff, Timer } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAIDebugStore } from '../store/useAIDebugStore';
import { PROVIDER_SOURCE_LABELS, NON_LIVE_SOURCES } from '../services/ai/activeProvider';
const AI_STATUS = {
  GENERATING: { key: 'generating', label: 'AI Generation Active', color: '#e5e5e5', icon: Activity },
  CONNECTED: { key: 'connected', label: 'Connected', color: '#10b981', icon: Zap },
  CONFIGURED: { key: 'configured', label: 'Configured', color: '#b8b8b8', icon: Zap },
  SIMULATOR: { key: 'simulator', label: 'Simulator Mode', color: '#f59e0b', icon: Cpu },
  RATE_LIMITED: { key: 'rate_limited', label: 'Rate Limited', color: '#ef4444', icon: Timer },
  API_ERROR: { key: 'api_error', label: 'API Error', color: '#ef4444', icon: WifiOff },
  FALLBACK: { key: 'fallback', label: 'Fallback Active', color: '#f59e0b', icon: AlertTriangle },
};

export function useAIMode() {
  const { aiModeEnabled, apiKey, openaiApiKey, aiProvider } = useSettingsStore();
  const generationSources = useAIDebugStore(s => s.generationSources);
  const activeGenerations = useAIDebugStore(s => s.activeGenerations);
  const lastError = useAIDebugStore(s => s.lastError);
  const connectionStatus = useAIDebugStore(s => s.connectionStatus);

  const providerLabel = PROVIDER_SOURCE_LABELS[aiProvider] || 'Gemini';
  const isLocalProvider = aiProvider === 'webllm';
  const hasProviderKey = isLocalProvider
    ? true
    : !!(aiProvider === 'openai' ? openaiApiKey?.trim() : apiKey?.trim());
  const isGeminiConfigured = aiModeEnabled && hasProviderKey;
  const hasLiveOutput = Object.values(generationSources).some(s => s && !NON_LIVE_SOURCES.includes(s));
  const hasFallbackOutput = Object.values(generationSources).some(s => s === 'Fallback');
  const reason = !aiModeEnabled
    ? 'AI Mode is disabled in Settings'
    : !hasProviderKey ? `No ${providerLabel} API key — add one in AI Settings`
    : isLocalProvider ? 'Running the built-in model in your browser'
    : null;

  let status;
  if (!isGeminiConfigured) status = AI_STATUS.SIMULATOR;
  else if (activeGenerations > 0 || connectionStatus === 'generating') status = AI_STATUS.GENERATING;
  else if (lastError?.kind === 'rate_limit') status = AI_STATUS.RATE_LIMITED;
  else if (lastError?.kind === 'api_error') status = AI_STATUS.API_ERROR;
  else if (hasFallbackOutput || connectionStatus === 'fallback') status = AI_STATUS.FALLBACK;
  else if (connectionStatus === 'connected' || hasLiveOutput) status = AI_STATUS.CONNECTED;
  else status = AI_STATUS.CONFIGURED;
  if (status === AI_STATUS.CONNECTED || status === AI_STATUS.CONFIGURED) {
    status = { ...status, label: `${providerLabel} ${status.label}` };
  }

  return { reason, status, lastError };
}
