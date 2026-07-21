import React, { useState } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import { X, Key, Settings, Brain, AlertTriangle } from 'lucide-react';

export default function AISettingsModal({ onClose }) {
  const { apiKey, aiProvider, setApiKey, setAiProvider } = useSettingsStore();
  const [localKey, setLocalKey] = useState(apiKey);
  const [localProvider, setLocalProvider] = useState(aiProvider);

  const handleSave = () => {
    setApiKey(localKey);
    setAiProvider(localProvider);
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
          <div>
            <label style={{ display: 'block', marginBottom: '10px', fontSize: '0.85rem', fontWeight: 600 }}>Default AI Provider</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Built-in AI Option */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', background: 'var(--bg-primary)', border: `1px solid ${localProvider === 'webllm' ? 'var(--primary-electric)' : 'var(--border-color)'}`, borderRadius: '8px', cursor: 'pointer' }}>
                <input type="radio" name="aiProvider" value="webllm" checked={localProvider === 'webllm'} onChange={() => setLocalProvider('webllm')} style={{ marginTop: '4px' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: localProvider === 'webllm' ? 'var(--primary-electric)' : 'inherit' }}>Built-in AI (Recommended)</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Browser-native inference.<br/>No API Key required.</span>
                </div>
              </label>

              {/* Gemini Option */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', background: 'var(--bg-primary)', border: `1px solid ${localProvider === 'gemini' ? 'var(--primary-electric)' : 'var(--border-color)'}`, borderRadius: '8px', cursor: 'pointer' }}>
                <input type="radio" name="aiProvider" value="gemini" checked={localProvider === 'gemini'} onChange={() => setLocalProvider('gemini')} style={{ marginTop: '4px' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: localProvider === 'gemini' ? 'var(--primary-electric)' : 'inherit' }}>Gemini API</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Higher reasoning capability.<br/>Requires your own API Key.</span>
                </div>
              </label>

            </div>
          </div>

          {/* Dynamic Settings based on Provider */}
          {localProvider === 'gemini' && (
            <div style={{ padding: '16px', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Gemini API Key</label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                <input 
                  type="password" 
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  placeholder="Enter your Gemini API Key..."
                  style={{ width: '100%', padding: '10px 10px 10px 34px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                />
              </div>
              {!localKey && (
                <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={12} /> A valid API key is required to use Gemini.
                </p>
              )}
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
