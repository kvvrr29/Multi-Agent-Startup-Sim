import { AlertTriangle, Cpu, Zap, Activity, WifiOff, Timer } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAIDebugStore } from '../store/useAIDebugStore';

export const AI_STATUS = {
  GENERATING: { key: 'generating', label: 'AI Generation Active', color: '#e5e5e5', icon: Activity },
  CONNECTED: { key: 'connected', label: 'Gemini Connected', color: '#10b981', icon: Zap },
  CONFIGURED: { key: 'configured', label: 'Gemini Configured', color: '#b8b8b8', icon: Zap },
  SIMULATOR: { key: 'simulator', label: 'Simulator Mode', color: '#f59e0b', icon: Cpu },
  RATE_LIMITED: { key: 'rate_limited', label: 'Rate Limited', color: '#ef4444', icon: Timer },
  API_ERROR: { key: 'api_error', label: 'API Error', color: '#ef4444', icon: WifiOff },
  FALLBACK: { key: 'fallback', label: 'Fallback Active', color: '#f59e0b', icon: AlertTriangle },
};

export function useAIMode() {
  const { aiModeEnabled, apiKey } = useSettingsStore();
  const generationSources = useAIDebugStore(s => s.generationSources);
  const activeGenerations = useAIDebugStore(s => s.activeGenerations);
  const lastError = useAIDebugStore(s => s.lastError);
  const connectionStatus = useAIDebugStore(s => s.connectionStatus);
  // AI is "configured" when AI Mode is on: a personal key uses Gemini directly,
  // otherwise requests go through the server-side proxy (key never in browser).
  const isGeminiConfigured = aiModeEnabled;
  const usingServerProxy = aiModeEnabled && !apiKey?.trim();
  const hasLiveOutput = Object.values(generationSources).some(s => s === 'Gemini');
  const hasFallbackOutput = Object.values(generationSources).some(s => s === 'Fallback');
  const mode = isGeminiConfigured ? 'Gemini' : 'Simulator';
  const reason = !aiModeEnabled
    ? 'AI Mode is disabled in Settings'
    : usingServerProxy ? 'Using server-side AI proxy' : null;

  let status;
  if (!isGeminiConfigured) status = AI_STATUS.SIMULATOR;
  else if (activeGenerations > 0 || connectionStatus === 'generating') status = AI_STATUS.GENERATING;
  else if (lastError?.kind === 'rate_limit') status = AI_STATUS.RATE_LIMITED;
  else if (lastError?.kind === 'api_error') status = AI_STATUS.API_ERROR;
  else if (hasFallbackOutput || connectionStatus === 'fallback') status = AI_STATUS.FALLBACK;
  else if (connectionStatus === 'connected' || hasLiveOutput) status = AI_STATUS.CONNECTED;
  else status = AI_STATUS.CONFIGURED;

  return { mode, reason, status, lastError, isGeminiConfigured, usingServerProxy, hasLiveOutput, hasFallbackOutput };
}
