import React, { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { runInitialSimulation } from '../services/simulationEngine';
import { pushNow } from '../services/cloudSync';
import { AlertTriangle, RefreshCw, Settings, Copy, ArrowLeft } from 'lucide-react';
import AISettingsModal from './AISettingsModal';

export default function GenerationErrorPanel() {
  const error = useProjectStore(state => state.generationError);
  const project = useProjectStore(state => state.project);
  const clearGenerationError = useProjectStore(state => state.clearGenerationError);
  const resetAllAgents = useProjectStore(state => state.resetAllAgents);
  const setCurrentView = useProjectStore(state => state.setCurrentView);
  
  const [retrying, setRetrying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (!error) return null;

  const provider = project?.aiProvider || useSettingsStore.getState().aiProvider || 'webllm';
  const providerName = provider === 'webllm' ? 'Built-in AI' : provider === 'openai' ? 'OpenAI' : 'Gemini API';

  const handleRetry = async () => {
    setRetrying(true);
    clearGenerationError();
    resetAllAgents();
    // If the provider was changed in the modal, make sure the project uses it
    const currentGlobalProvider = useSettingsStore.getState().aiProvider;
    if (project && project.aiProvider !== currentGlobalProvider) {
      const updatedProject = { ...project, aiProvider: currentGlobalProvider };
      useProjectStore.getState().setProject(updatedProject);
      if (updatedProject.id) await pushNow();
      await runInitialSimulation(updatedProject);
    } else {
      await runInitialSimulation(project);
    }
    setRetrying(false);
  };

  const handleCopyDiagnostics = () => {
    const diag = `Error: ${error.message}\nStack: ${error.stack}\nProject: ${JSON.stringify(project, null, 2)}`;
    navigator.clipboard.writeText(diag);
    alert('Diagnostics copied to clipboard!');
  };

  const handleBack = () => {
    clearGenerationError();
    resetAllAgents();
    setCurrentView('create');
  };

  return (
    <>
      {showSettings && <AISettingsModal onClose={() => setShowSettings(false)} />}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '2rem', background: 'var(--bg-primary)'
      }}>
        <div className="glass-panel" style={{
          maxWidth: '600px', width: '100%', padding: '2rem', border: '1px solid var(--danger)',
          background: 'rgba(239, 68, 68, 0.05)', textAlign: 'center'
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.2)',
            color: 'var(--danger)', marginBottom: '1.5rem'
          }}>
            <AlertTriangle size={32} />
          </div>
          
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
            Blueprint Generation Failed
          </h2>
          
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {providerName} could not generate a valid startup blueprint.
            <br/>
            <strong style={{ color: 'var(--danger)' }}>Reason: {error.message}</strong>
          </p>
          
          {error.isDev && (
            <div style={{
              background: '#000', padding: '1rem', borderRadius: '8px',
              textAlign: 'left', overflowX: 'auto', marginBottom: '1.5rem',
              fontSize: '0.8rem', color: '#ff8a8a', border: '1px solid #440000'
            }}>
              <pre style={{ margin: 0, fontFamily: 'monospace' }}>{error.stack}</pre>
            </div>
          )}

          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>
            {provider === 'webllm' 
              ? 'You can retry the generation, or switch to a cloud AI model (Gemini or OpenAI) for more reliable generation.'
              : 'Check your API key and network connection, or switch to Built-in AI to run locally.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button 
              onClick={() => setShowSettings(true)}
              disabled={retrying}
              className="btn-primary"
              style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1rem' }}
            >
              <Settings size={18} /> Open AI Settings
            </button>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={handleRetry}
                disabled={retrying}
                className="btn-secondary"
                style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <RefreshCw size={16} className={retrying ? 'spin-slow' : ''} /> {retrying ? 'Retrying...' : 'Retry Generation'}
              </button>
              <button 
                onClick={handleCopyDiagnostics}
                disabled={retrying}
                className="btn-secondary"
                style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Copy size={16} /> Copy Diagnostics
              </button>
            </div>
            <button 
              onClick={handleBack}
              disabled={retrying}
              style={{ 
                marginTop: '1rem', padding: '0.5rem', background: 'transparent', border: 'none', 
                color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <ArrowLeft size={14} /> Back to Setup
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
