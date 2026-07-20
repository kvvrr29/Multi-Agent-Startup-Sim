import React, { useState } from 'react';
import { useAICostStore } from '../store/useAICostStore';
import { DollarSign, Cpu, Activity, ChevronDown, ChevronUp } from 'lucide-react';

export default function AICostDashboard() {
  const { totalRequests, totalInputTokens, totalOutputTokens, totalCost } = useAICostStore();
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-hide if no requests made
  if (totalRequests === 0 && !isExpanded) return null;

  return (
    <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 900 }}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', overflow: 'hidden', width: '280px', transition: 'all 0.3s ease' }}>
        
        {/* Header Toggle */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ padding: '10px 15px', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
            <Activity size={14} color="var(--accent-primary)" /> AI Usage Monitor
          </div>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>

        {/* Content */}
        {isExpanded && (
          <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Requests</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Activity size={12} color="var(--accent-primary)" /> {totalRequests}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Input Tokens</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={12} color="var(--accent-secondary)" /> {(totalInputTokens / 1000).toFixed(1)}k
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Output Tokens</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={12} color="var(--success)" /> {(totalOutputTokens / 1000).toFixed(1)}k
              </span>
            </div>

            <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Est. Cost (Gemini 2.5)</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                <DollarSign size={14} /> {totalCost.toFixed(4)}
              </span>
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}
