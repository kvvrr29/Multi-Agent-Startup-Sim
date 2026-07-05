import { useState } from 'react';
import { runRevisionSimulation } from '../services/simulationEngine';
import { useProjectStore, AGENT_STATUS } from '../store/useProjectStore';
import { Send, Sparkles } from 'lucide-react';

const SUGGESTIONS = [
  "Reduce Budget",
  "Use Python",
  "Add Mobile App",
  "Improve Scalability",
  "Target Students",
  "Make MVP Smaller"
];

export default function RevisionActions() {
  const [customRequest, setCustomRequest] = useState('');
  const mediatorStatus = useProjectStore(state => state.agents.mediator.status);
  
  const isBusy = mediatorStatus !== AGENT_STATUS.IDLE;

  const handleSuggestionClick = (suggestion) => {
    if (isBusy) return;
    runRevisionSimulation(suggestion);
  };

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (!customRequest.trim() || isBusy) return;
    runRevisionSimulation(customRequest);
    setCustomRequest('');
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
        <Sparkles size={16} color="var(--accent-purple)" />
        <h3 style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-primary)' }}>AI Revisions</h3>
      </div>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '1.5rem' }}>
        {SUGGESTIONS.map(suggestion => (
          <button 
            key={suggestion}
            onClick={() => handleSuggestionClick(suggestion)}
            disabled={isBusy}
            className="btn btn-outline"
            style={{ 
              padding: '0.4rem 0.8rem', 
              fontSize: '0.8rem', 
              borderRadius: 'var(--radius-full)',
              opacity: isBusy ? 0.5 : 1,
              cursor: isBusy ? 'not-allowed' : 'pointer'
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form onSubmit={handleCustomSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input 
          type="text" 
          value={customRequest}
          onChange={(e) => setCustomRequest(e.target.value)}
          placeholder="Type a custom revision request..."
          disabled={isBusy}
          style={{
            flex: 1, padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)',
            background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
            color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.2s',
            fontFamily: 'inherit', fontSize: '0.85rem'
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--primary-electric)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
        />
        <button 
          type="submit" 
          disabled={isBusy || !customRequest.trim()}
          className="btn btn-primary"
          style={{ padding: '0 1rem', opacity: (isBusy || !customRequest.trim()) ? 0.5 : 1 }}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
