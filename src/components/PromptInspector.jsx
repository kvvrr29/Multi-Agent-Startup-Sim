import React, { useState } from 'react';
import { AGENT_SYSTEM_PROMPTS, DOMAIN_CLASSIFIER_PROMPT } from '../services/ai/agentPrompts';
import { Terminal, X, ChevronDown, ChevronUp } from 'lucide-react';

export default function PromptInspector() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState(null);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="btn-secondary"
        style={{ position: 'fixed', bottom: '20px', left: '20px', zIndex: 900, padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <Terminal size={14} /> Debug Prompts
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', bottom: '20px', left: '20px', width: '400px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
      
      {/* Header */}
      <div style={{ padding: '10px 15px', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
          <Terminal size={16} color="var(--accent-primary)" /> System Prompts Inspector
        </div>
        <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div style={{ overflowY: 'auto', padding: '10px' }}>
        
        {/* Domain Classifier */}
        <div style={{ marginBottom: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
          <div 
            onClick={() => setExpandedAgent(expandedAgent === 'domain' ? null : 'domain')}
            style={{ padding: '8px 12px', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}
          >
            Domain Classifier
            {expandedAgent === 'domain' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
          {expandedAgent === 'domain' && (
            <div style={{ padding: '12px', background: 'var(--bg-secondary)', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {DOMAIN_CLASSIFIER_PROMPT}
            </div>
          )}
        </div>

        {/* Regular Agents */}
        {Object.entries(AGENT_SYSTEM_PROMPTS).map(([role, prompt]) => {
          const isExpanded = expandedAgent === role;
          return (
            <div key={role} style={{ marginBottom: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
              <div 
                onClick={() => setExpandedAgent(isExpanded ? null : role)}
                style={{ padding: '8px 12px', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}
              >
                {role} Agent
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
              {isExpanded && (
                <div style={{ padding: '12px', background: 'var(--bg-secondary)', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {prompt}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
