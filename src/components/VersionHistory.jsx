import React, { useState } from 'react';
import { useVersionStore } from '../store/versionStore';
import { useProjectStore } from '../store/useProjectStore';
import { History, RotateCcw, Eye, ChevronRight, ChevronDown } from 'lucide-react';

export default function VersionHistory() {
  const versions = useVersionStore(state => state.versions);
  const currentVersionId = useVersionStore(state => state.currentVersionId);
  const restoreVersion = useVersionStore(state => state.restoreVersion);
  const updateBlueprintSection = useProjectStore(state => state.updateBlueprintSection);
  
  const [expandedId, setExpandedId] = useState(null);

  const handleRestore = (versionId) => {
    const confirm = window.confirm(`Restore ${versionId}? All unsaved changes will be lost.`);
    if (!confirm) return;
    
    const snapshot = restoreVersion(versionId);
    if (snapshot) {
      // Re-apply snapshot to zustand
      Object.keys(snapshot).forEach(key => {
        const sect = snapshot[key];
        if (sect && sect.content) {
          updateBlueprintSection(key, sect.content, sect.status, sect.confidence);
        }
      });
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
      <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <History size={16} /> Version History
      </h3>
      
      {versions.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No versions saved yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.5rem' }}>
          {versions.slice().reverse().map(v => (
            <div key={v.id} style={{ 
              background: 'rgba(0,0,0,0.2)', 
              borderRadius: '6px', 
              borderLeft: `2px solid ${v.id === currentVersionId ? 'var(--success)' : 'var(--border-color)'}`
            }}>
              <div 
                style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
              >
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{v.id}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                    {new Date(v.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
                {expandedId === v.id ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
              </div>
              
              {expandedId === v.id && (
                <div style={{ padding: '0 12px 12px 12px', fontSize: '0.8rem' }}>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    <strong>Changes:</strong>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                      {v.summary.split('\n').map((line, i) => (
                        <li key={i}>{line.replace(/^[*-]\s+/, '')}</li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={(e) => { e.stopPropagation(); handleRestore(v.id); }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', flex: 1, display: 'flex', justifyContent: 'center', gap: '4px' }}>
                      <RotateCcw size={12} /> Restore
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); alert('Side-by-side comparison would open here in full version'); }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', flex: 1, display: 'flex', justifyContent: 'center', gap: '4px' }}>
                      <Eye size={12} /> Compare
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
