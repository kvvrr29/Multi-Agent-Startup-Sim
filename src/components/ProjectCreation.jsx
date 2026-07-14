import { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { runInitialSimulation } from '../services/simulationEngine';
import { Sparkles, ArrowRight, Settings } from 'lucide-react';
import { AIStatusBanner } from './AIStatusUtils';
import AISettingsModal from './AISettingsModal';

export default function ProjectCreation() {
  const setProject = useProjectStore((state) => state.setProject);
  const [showSettings, setShowSettings] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    idea: '',
    targetAudience: '',
    budget: '',
    timeline: '',
    platform: 'web',
    teamSize: '',
    priorities: '',
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

  const handleSubmit = (e) => {
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
    // Set the project to switch the view to Dashboard
    setProject(formData);
    
    // Kick off the mocked agent simulation
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
          
          <AIStatusBanner />
          <button type="button" title="Settings" onClick={() => setShowSettings(true)} className="btn-secondary" style={{ padding: '7px 12px', marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Settings size={14} /> AI Settings
          </button>

          {error && (
            <div style={{ padding: '12px', marginBottom: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.9rem' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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

          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem', width: '100%', padding: '0.8rem' }}>
            Generate Blueprint <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
