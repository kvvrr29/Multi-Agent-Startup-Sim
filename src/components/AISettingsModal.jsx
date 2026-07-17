import React, { useState } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import { X, Key, Settings, Brain, AlertTriangle, Terminal } from 'lucide-react';

export default function AISettingsModal({ onClose }) {
  const { apiKey, aiProvider, aiModeEnabled, developerMode, setApiKey, setAiProvider, setAiModeEnabled, setDeveloperMode } = useSettingsStore();
  const [localKey, setLocalKey] = useState(apiKey);
  const [localProvider, setLocalProvider] = useState(aiProvider);
  const [localEnabled, setLocalEnabled] = useState(aiModeEnabled);
  const [localDevMode, setLocalDevMode] = useState(developerMode);

  const handleSave = () => {
    setApiKey(localKey);
    setAiProvider(localProvider);
    setAiModeEnabled(localEnabled);
    setDeveloperMode(localDevMode);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-secondary)', width: '450px', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem' }}>
            <Settings size={20} color="var(--primary-electric)" /> AI Settings
          </h2>
          <button aria-label="Close AI Settings" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* AI Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-primary)', borderRadius: '8px', border: `1px solid ${localEnabled ? 'var(--success)' : 'var(--border-color)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Brain size={18} color={localEnabled ? 'var(--success)' : 'var(--text-muted)'} />
              <div>
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>Enable AI Mode</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Use Generative AI for simulation</span>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input aria-label="Enable AI Mode" type="checkbox" checked={localEnabled} onChange={(e) => setLocalEnabled(e.target.checked)} style={{ width: '18px', height: '18px' }} />
            </label>
          </div>

          {localEnabled && (
            <>
              {/* Provider Selection */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>AI Provider</label>
                <select 
                  value={localProvider} 
                  onChange={(e) => setLocalProvider(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                >
                  <option value="gemini">Google Gemini (v2.5 Flash)</option>
                  <option value="openai" disabled>OpenAI (Coming Soon)</option>
                  <option value="claude" disabled>Anthropic Claude (Coming Soon)</option>
                </select>
              </div>

              {/* API Key */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>API Key (optional)</label>
                <div style={{ position: 'relative' }}>
                  <Key size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                  <input 
                    type="password" 
                    value={localKey}
                    onChange={(e) => setLocalKey(e.target.value)}
                    placeholder="Enter your API Key..."
                    style={{ width: '100%', padding: '10px 10px 10px 34px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                  />
                </div>
                {!localKey && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={12} /> Leave empty to use the server-side AI proxy (recommended) — the key stays on the server.
                  </p>
                )}
                <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  If you enter your own key, it is kept only in memory for this tab and is never persisted or logged.
                </p>
              </div>
            </>
          )}

          {/* Developer Tools (doc §11) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-primary)', borderRadius: '8px', border: `1px solid ${localDevMode ? 'var(--accent-purple)' : 'var(--border-color)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={18} color={localDevMode ? 'var(--accent-purple)' : 'var(--text-muted)'} />
              <div>
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>Developer Mode</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Show AI Debug Panel, Prompt Inspector, raw logs & API metrics</span>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input aria-label="Developer Mode" type="checkbox" checked={localDevMode} onChange={(e) => setLocalDevMode(e.target.checked)} style={{ width: '18px', height: '18px' }} />
            </label>
          </div>

          {/* Fallback Notice */}
          {!localEnabled && (
            <div style={{ padding: '1rem', background: 'rgba(255,170,0,0.1)', border: '1px solid var(--warning)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--warning)' }}>
              <strong>AI Mode is Disabled.</strong> The platform will use static template generation (Phase 1.9 Fallback mode).
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1rem' }}>
            <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 16px' }}>Cancel</button>
            <button onClick={handleSave} className="btn-primary" style={{ padding: '8px 16px' }}>Save Settings</button>
          </div>
        </div>

      </div>
    </div>
  );
}
