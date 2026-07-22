import React, { useState } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import { X, Key, Settings, Brain, AlertTriangle } from 'lucide-react';

export default function AISettingsModal({ onClose }) {
  const { apiKey, openaiApiKey, aiProvider, setApiKey, setOpenaiApiKey, setAiProvider } = useSettingsStore();
  const [localGeminiKey, setLocalGeminiKey] = useState(apiKey);
  const [localOpenAIKey, setLocalOpenAIKey] = useState(openaiApiKey);
  const [localProvider, setLocalProvider] = useState(aiProvider);

  const handleSave = () => {
    setApiKey(localGeminiKey);
    setOpenaiApiKey(localOpenAIKey);
    setAiProvider(localProvider);
    onClose();
  };

  const radioStyle = (active) => ({
    display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px',
    background: 'var(--bg-primary)',
    border: `1px solid ${active ? 'var(--primary-electric)' : 'var(--border-color)'}`,
    borderRadius: '8px', cursor: 'pointer',
    transition: 'border-color 0.2s',
  });

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-secondary)', width: '480px', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem' }}>
            <Settings size={20} color="var(--primary-electric)" /> AI Settings
          </h2>
          <button aria-label="Close AI Settings" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Provider Selection */}
          <div>
            <label style={{ display: 'block', marginBottom: '10px', fontSize: '0.85rem', fontWeight: 600 }}>Default AI Provider</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Built-in AI */}
              <label style={radioStyle(localProvider === 'webllm')}>
                <input type="radio" name="aiProvider" value="webllm" checked={localProvider === 'webllm'} onChange={() => setLocalProvider('webllm')} style={{ marginTop: '4px' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: localProvider === 'webllm' ? 'var(--primary-electric)' : 'inherit' }}>
                    🖥️ Built-in AI (Recommended)
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Runs fully in your browser via WebGPU.<br />No API key required. Private &amp; offline.</span>
                </div>
              </label>

              {/* Gemini */}
              <label style={radioStyle(localProvider === 'gemini')}>
                <input type="radio" name="aiProvider" value="gemini" checked={localProvider === 'gemini'} onChange={() => setLocalProvider('gemini')} style={{ marginTop: '4px' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: localProvider === 'gemini' ? 'var(--primary-electric)' : 'inherit' }}>
                    ✨ Gemini API
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Google's Gemini 2.0 Flash. Fast &amp; capable.<br />Free tier available. Requires API key.</span>
                </div>
              </label>

              {/* OpenAI */}
              <label style={radioStyle(localProvider === 'openai')}>
                <input type="radio" name="aiProvider" value="openai" checked={localProvider === 'openai'} onChange={() => setLocalProvider('openai')} style={{ marginTop: '4px' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: localProvider === 'openai' ? 'var(--primary-electric)' : 'inherit' }}>
                    🤖 OpenAI — GPT-4o mini
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OpenAI's GPT-4o mini. Excellent quality.<br />Higher rate limits. Requires API key.</span>
                </div>
              </label>

            </div>
          </div>

          {/* Gemini Key */}
          {localProvider === 'gemini' && (
            <div style={{ padding: '16px', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Gemini API Key</label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  value={localGeminiKey}
                  onChange={(e) => setLocalGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  style={{ width: '100%', padding: '10px 10px 10px 34px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                />
              </div>
              {!localGeminiKey && (
                <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={12} /> Leave empty to use server-side proxy (key stays on the server).
                </p>
              )}
              <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Stored only in this browser. Never synced to your account.
              </p>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '6px', fontSize: '0.75rem', color: 'var(--primary-electric)' }}>
                Get a Gemini API key →
              </a>
            </div>
          )}

          {/* OpenAI Key */}
          {localProvider === 'openai' && (
            <div style={{ padding: '16px', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>OpenAI API Key</label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  value={localOpenAIKey}
                  onChange={(e) => setLocalOpenAIKey(e.target.value)}
                  placeholder="sk-..."
                  style={{ width: '100%', padding: '10px 10px 10px 34px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                />
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Uses GPT-4o mini (~$0.0002/run). Stored only in this browser.
              </p>
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '6px', fontSize: '0.75rem', color: 'var(--primary-electric)' }}>
                Get an OpenAI API key →
              </a>
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
