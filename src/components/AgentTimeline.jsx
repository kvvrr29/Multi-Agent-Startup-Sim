import React, { useRef, useEffect } from 'react';
import { useProjectStore, AGENT_STATUS } from '../store/useProjectStore';
import { Bot, User, Briefcase, Code, Megaphone, CheckCircle, XCircle } from 'lucide-react';

const iconMap = {
  'mediator': <Bot size={16} />,
  'ceo': <User size={16} />,
  'pm': <Briefcase size={16} />,
  'developer': <Code size={16} />,
  'marketing': <Megaphone size={16} />
};

export default function AgentTimeline() {
  const events = useProjectStore(state => state.workflowEvents) || [];
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Agent Timeline
      </h3>
      
      <div 
        ref={scrollRef}
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          paddingRight: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {events.map((ev, idx) => {
          const isError = ev.message.toLowerCase().includes('failed') || ev.message.toLowerCase().includes('error');
          return (
            <div key={ev.id || idx} style={{ 
              fontSize: '0.8rem', 
              color: 'var(--text-muted)',
              padding: '10px 12px',
              background: 'rgba(0,0,0,0.15)',
              borderRadius: '6px',
              borderLeft: `2px solid ${isError ? 'var(--danger)' : (ev.agent === 'mediator' ? 'var(--primary-electric)' : 'var(--accent-purple)')}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                  {iconMap[ev.agent]} 
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{ev.agent}</span>
                </div>
                <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>
                  {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : 'Unknown Time'}
                </span>
              </div>
              {ev.type === 'revision' ? (
                <div style={{ marginTop: '6px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.8rem' }}>
                  <div style={{ color: 'var(--text-primary)', marginBottom: '4px' }}><strong>Request:</strong> {ev.request}</div>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}><strong>Agent:</strong> {ev.assignedAgent}</div>
                  <div style={{ color: 'var(--success)', marginBottom: '4px' }}>
                    <strong>Updated Sections:</strong>
                    <ul style={{ margin: 0, paddingLeft: '16px' }}>
                      {ev.updatedSections?.map((sec, i) => <li key={i}>{sec}</li>)}
                    </ul>
                  </div>
                  <div style={{ color: 'var(--accent-cyan)' }}><strong>Version:</strong> {ev.version}</div>
                </div>
              ) : (
                <div style={{ color: isError ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {ev.message || 'Unknown Event'}
                </div>
              )}
              
              {/* If it's a contribution metadata event, render it distinctively */}
              {ev.contribution && (
                <div style={{ marginTop: '6px', padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <ul style={{ margin: 0, paddingLeft: '16px' }}>
                    {ev.contribution.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
