import React from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { runInitialSimulation } from '../services/simulationEngine';
import { pushNow } from '../services/cloudSync';
import { AlertTriangle, RefreshCw, Cpu, Copy, ArrowLeft } from 'lucide-react';

export default function GenerationErrorPanel() {
  const error = useProjectStore(state => state.generationError);
  const project = useProjectStore(state => state.project);
  const clearGenerationError = useProjectStore(state => state.clearGenerationError);
  const resetAllAgents = useProjectStore(state => state.resetAllAgents);
  const setCurrentView = useProjectStore(state => state.setCurrentView);
  
  const [retrying, setRetrying] = React.useState(false);

  if (!error) return null;

  const handleRetry = async () => {
    setRetrying(true);
    clearGenerationError();
    resetAllAgents();
    await runInitialSimulation(project);
    setRetrying(false);
  };

  const handleSwitchToGemini = async () => {
    setRetrying(true);
    // Update local state and settings
    const updatedProject = { ...project, aiProvider: 'gemini' };
    useProjectStore.getState().setProject(updatedProject);
    useSettingsStore.getState().updateSettings({ aiProvider: 'gemini' });
    
    // Update cloud state
    if (project.id) {
      await pushNow();
    }

    clearGenerationError();
    resetAllAgents();
    await runInitialSimulation(updatedProject);
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
          Built-in AI could not generate a valid startup blueprint.
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
          You can retry the generation, or switch to Gemini for a more reliable, high-performance model.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button 
            onClick={handleSwitchToGemini}
            disabled={retrying}
            className="btn-primary"
            style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1rem' }}
          >
            <Cpu size={18} /> Switch to Gemini (Recommended)
          </button>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={handleRetry}
              disabled={retrying}
              className="btn-secondary"
              style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <RefreshCw size={16} className={retrying ? 'spin-slow' : ''} /> {retrying ? 'Retrying...' : 'Retry WebLLM'}
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
  );
}
