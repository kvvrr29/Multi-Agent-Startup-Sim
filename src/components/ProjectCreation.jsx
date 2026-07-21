import { useState, useEffect } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { runInitialSimulation } from '../services/simulationEngine';
import { Sparkles, ArrowRight, Settings, LogOut, ArrowLeft } from 'lucide-react';
import AISettingsModal from './AISettingsModal';
import { useAuthStore } from '../store/useAuthStore';
import { createCloudProject, openCloudProject } from '../services/cloudSync';
import CloudProjectList from './CloudProjectList';
import { useSettingsStore } from '../store/useSettingsStore';
import { modelManager } from '../services/ai/ModelManager';

export default function ProjectCreation() {
  const setProject = useProjectStore((state) => state.setProject);
  const currentProject = useProjectStore((state) => state.project);
  const setCurrentView = useProjectStore((state) => state.setCurrentView);
  const user = useAuthStore(state => state.user);
  const signOut = useAuthStore(state => state.signOut);
  const { aiProvider: defaultAiProvider } = useSettingsStore();
  const [showSettings, setShowSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [webllmState, setWebllmState] = useState(modelManager.getState());
  
  useEffect(() => {
    return modelManager.subscribe(setWebllmState);
  }, []);
  
  // Check if installed on mount to allow eager initialization if cached
  useEffect(() => {
    modelManager.isInstalled().then(installed => {
      if (installed && webllmState.status === 'uninitialized') {
        modelManager.initialize().catch(() => {});
      }
    });
  }, []);
  
  const [formData, setFormData] = useState({
    name: '',
    idea: '',
    targetAudience: '',
    budget: '',
    timeline: '',
    platform: 'web',
    teamSize: '',
    priorities: '',
    aiProvider: defaultAiProvider || 'webllm',
  });

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
    color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.2s',
    fontFamily: 'inherit'
  };
  const focusHandlers = {
    onFocus: (e) => e.target.style.borderColor = 'var(--primary-electric)',
    onBlur: (e) => e.target.style.borderColor = 'var(--border-color)'
  };
  const labelStyle = { fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 };
  
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation Engine
    if (formData.name.trim().length < 3) {
      setError('Project name must be at least 3 characters long.');
      return;
    }
    if (formData.idea.trim().length < 15) {
      setError('Startup idea is too short. Please provide a detailed description (min 15 chars).');
      return;
    }
    if (!formData.targetAudience.trim() || !formData.budget.trim()) {
      setError('Please fill out all required fields (Audience, Budget).');
      return;
    }

    setError('');

    if (formData.aiProvider === 'webllm' && webllmState.status !== 'ready') {
      if (webllmState.status === 'error') {
        setError('Built-in AI is unavailable on this browser. Switch to Gemini.');
        return;
      }
      modelManager.initialize().catch(err => {
        setError('Failed to initialize Built-in AI: ' + err.message);
      });
      return; // Stop here, the UI will show downloading progress. They must click again after.
    }

    setCreating(true);

    // The database is the source of truth: without a cloud row there is
    // nowhere to store the project, so creation failure blocks the flow.
    const cloudId = await createCloudProject(formData);
    setCreating(false);
    if (!cloudId) {
      setError('Could not save the project to your account. Check your connection and try again.');
      return;
    }

    // Set the project to switch the view to Dashboard, injecting the database ID
    setProject({ ...formData, id: cloudId });

    // Kick off the agent simulation
    runInitialSimulation(formData);
  };

  return (
    <div className="container flex items-center justify-center" style={{ minHeight: '100vh', padding: '4rem 0' }}>
      {showSettings && <AISettingsModal onClose={() => setShowSettings(false)} />}
      <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(67, 56, 202, 0.2)', color: 'var(--primary-electric)', marginBottom: '1rem' }}>
            <Sparkles size={24} />
          </div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Start a New Project</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Define your startup vision, and our AI agents will build the blueprint.</p>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1rem' }}>
            <button type="button" title="Settings" onClick={() => setShowSettings(true)} className="btn-secondary" style={{ padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Settings size={14} /> AI Settings
            </button>
            <button type="button" title={`Sign out ${user?.email || ''}`} onClick={signOut} className="btn-secondary" style={{ padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>

          {error && (
            <div style={{ padding: '12px', marginBottom: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.9rem' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {currentProject && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setCurrentView('dashboard')}
            style={{ marginBottom: '1.5rem', padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
        )}

        <CloudProjectList onOpen={openCloudProject} />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* AI Engine Selection */}
          <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontSize: '1rem', fontWeight: 600 }}>AI Engine</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', background: 'var(--bg-primary)', border: `1px solid ${formData.aiProvider === 'gemini' ? 'var(--primary-electric)' : 'var(--border-color)'}`, borderRadius: '8px', cursor: 'pointer' }}>
                <input type="radio" name="aiProvider" value="gemini" checked={formData.aiProvider === 'gemini'} onChange={handleChange} style={{ marginTop: '4px' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: formData.aiProvider === 'gemini' ? 'var(--primary-electric)' : 'inherit' }}>Gemini API (Recommended)</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Highest quality responses.<br/>Requires API Key.</span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', background: 'var(--bg-primary)', border: `1px solid ${formData.aiProvider === 'webllm' ? 'var(--primary-electric)' : 'var(--border-color)'}`, borderRadius: '8px', cursor: 'pointer' }}>
                <input type="radio" name="aiProvider" value="webllm" checked={formData.aiProvider === 'webllm'} onChange={handleChange} style={{ marginTop: '4px' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: formData.aiProvider === 'webllm' ? 'var(--primary-electric)' : 'inherit' }}>Built-in AI</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Browser-native inference. No API key required.</span>
                </div>
              </label>

              {formData.aiProvider === 'webllm' && (
                <div style={{ marginTop: '8px', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', background: webllmState.status === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: `1px solid ${webllmState.status === 'error' ? 'var(--danger)' : 'var(--success)'}` }}>
                  {webllmState.status === 'uninitialized' ? (
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <span style={{ color: 'var(--text-primary)' }}>Model not cached. A one-time download (~400MB) is required.</span>
                       <button type="button" className="btn-secondary" onClick={() => modelManager.initialize()} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Download Model</button>
                     </div>
                  ) : webllmState.status === 'downloading' ? (
                     <div>
                       <strong style={{ display: 'block', marginBottom: '4px' }}>Downloading Built-in AI...</strong>
                       <span style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>{webllmState.progress.text}</span>
                       <span style={{ display: 'block', color: 'var(--text-muted)' }}>This download only happens once.</span>
                     </div>
                  ) : webllmState.status === 'ready' ? (
                     <span style={{ color: 'var(--success)' }}>Built-in AI is ready.</span>
                  ) : (
                     <span style={{ color: 'var(--danger)' }}>Built-in AI is unavailable on this browser.</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="name" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Project Name *</label>
            <input 
              type="text" 
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Acora"
              required
              style={{
                width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
                background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.2s',
                fontFamily: 'inherit'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--primary-electric)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="idea" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Startup Idea *</label>
            <textarea 
              id="idea"
              name="idea"
              value={formData.idea}
              onChange={handleChange}
              placeholder="Describe what you want to build..."
              required
              rows={4}
              style={{
                width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
                background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.2s',
                fontFamily: 'inherit', resize: 'vertical'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--primary-electric)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-1" style={{ flex: 1 }}>
              <label htmlFor="targetAudience" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Target Audience</label>
              <input 
                type="text" 
                id="targetAudience"
                name="targetAudience"
                value={formData.targetAudience}
                onChange={handleChange}
                placeholder="e.g., College students"
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.2s',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary-electric)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>
            
            <div className="flex flex-col gap-1" style={{ flex: 1 }}>
              <label htmlFor="budget" style={labelStyle}>Budget</label>
              <input
                type="text"
                id="budget"
                name="budget"
                value={formData.budget}
                onChange={handleChange}
                placeholder="e.g., $10k"
                style={inputStyle}
                {...focusHandlers}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-1" style={{ flex: 1 }}>
              <label htmlFor="timeline" style={labelStyle}>Timeline</label>
              <input
                type="text"
                id="timeline"
                name="timeline"
                value={formData.timeline}
                onChange={handleChange}
                placeholder="e.g., 6 months"
                style={inputStyle}
                {...focusHandlers}
              />
            </div>

            <div className="flex flex-col gap-1" style={{ flex: 1 }}>
              <label htmlFor="platform" style={labelStyle}>Platform Preference</label>
              <select
                id="platform"
                name="platform"
                value={formData.platform}
                onChange={handleChange}
                style={inputStyle}
                {...focusHandlers}
              >
                <option value="web">Web</option>
                <option value="mobile">Mobile</option>
                <option value="web + mobile">Web + Mobile</option>
                <option value="desktop">Desktop</option>
              </select>
            </div>

            <div className="flex flex-col gap-1" style={{ flex: 1 }}>
              <label htmlFor="teamSize" style={labelStyle}>Team Size</label>
              <input
                type="text"
                id="teamSize"
                name="teamSize"
                value={formData.teamSize}
                onChange={handleChange}
                placeholder="e.g., 4"
                style={inputStyle}
                {...focusHandlers}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="priorities" style={labelStyle}>Project Priorities</label>
            <input
              type="text"
              id="priorities"
              name="priorities"
              value={formData.priorities}
              onChange={handleChange}
              placeholder="e.g., Fast launch over feature completeness, low running costs"
              style={inputStyle}
              {...focusHandlers}
            />
          </div>

          <button 
            type="submit" 
            disabled={creating || (formData.aiProvider === 'webllm' && webllmState.status === 'downloading')} 
            className="btn-primary" 
            style={{ marginTop: '1rem', width: '100%', padding: '0.8rem' }}
          >
            {creating ? 'Creating…' : 'Generate Blueprint'} <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
