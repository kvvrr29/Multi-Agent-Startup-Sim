import React, { useState } from 'react';
import { useVersionStore, diffVersionState } from '../store/versionStore';
import { useProjectStore } from '../store/useProjectStore';
import { useProjectMemoryStore } from '../store/projectMemoryStore';
import { restoreVersionWorkflow } from '../services/simulationEngine';
import { SECTION_TITLES } from '../config/blueprintSections';
import { History, RotateCcw, Eye, ChevronRight, ChevronDown, X, GitCompare } from 'lucide-react';

const DiffList = ({ label, keys, color }) => {
  if (keys.length === 0) return null;
  return (
    <div style={{ marginBottom: '10px' }}>
      <strong style={{ color, fontSize: '0.8rem' }}>{label} ({keys.length})</strong>
      <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {keys.map(k => <li key={k}>{SECTION_TITLES[k] || k}</li>)}
      </ul>
    </div>
  );
};

const CompareModal = ({ version, onClose }) => {
  const currentBlueprint = useProjectStore(state => state.blueprint);
  const currentMemory = useProjectMemoryStore(state => state.memory);
  const decisionHistory = useProjectMemoryStore(state => state.decisionHistory);
  const stateDiff = diffVersionState(version, currentBlueprint, { memory: currentMemory, decisionHistory });
  const diff = stateDiff.blueprint;
  const isIdentical = diff.changed.length === 0 && diff.added.length === 0 && diff.removed.length === 0 && !stateDiff.memoryChanged && !stateDiff.provenanceChanged;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-secondary)', width: '440px', maxHeight: '70vh', overflowY: 'auto', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
            <GitCompare size={18} color="var(--primary-electric)" /> {version.id} vs Current
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Snapshot from {new Date(version.timestamp).toLocaleString()} — "{version.summary}"
        </div>

        {isIdentical ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            The current blueprint is identical to {version.id}.
          </div>
        ) : (
          <>
            <DiffList label="Changed since this version" keys={diff.changed} color="var(--warning)" />
            <DiffList label="Added since this version" keys={diff.added} color="var(--success)" />
            <DiffList label="Removed since this version" keys={diff.removed} color="var(--danger)" />
            {stateDiff.memoryChanged && <div style={{ color: 'var(--warning)', fontSize: '0.8rem', marginBottom: '8px' }}>Project memory or decision history changed since this version.</div>}
            {stateDiff.provenanceChanged && <div style={{ color: 'var(--warning)', fontSize: '0.8rem' }}>Section provenance changed since this version.</div>}
          </>
        )}
      </div>
    </div>
  );
};

export default function VersionHistory() {
  const versions = useVersionStore(state => state.versions);
  const currentVersionId = useVersionStore(state => state.currentVersionId);
  const workflowActive = useProjectStore(state => state.workflow.active);

  const [expandedId, setExpandedId] = useState(null);
  const [compareVersion, setCompareVersion] = useState(null);

  const handleRestore = async (versionId) => {
    const confirm = window.confirm(`Restore ${versionId}? All unsaved changes will be lost.`);
    if (!confirm) return;

    await restoreVersionWorkflow(versionId);
  };

  return (
    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
      {compareVersion && <CompareModal version={compareVersion} onClose={() => setCompareVersion(null)} />}

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
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{v.id}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                    {new Date(v.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                    {v.summary}
                  </div>
                </div>
                {expandedId === v.id ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
              </div>

              {expandedId === v.id && (
                <div style={{ padding: '0 12px 12px 12px', fontSize: '0.8rem' }}>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    <strong>Summary:</strong> {v.summary}
                  </div>
                  {v.affectedAgents?.length > 0 && (
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.75rem' }}>
                      <strong>Agents:</strong> {v.affectedAgents.join(', ').toUpperCase()}
                    </div>
                  )}
                  {v.affectedSections?.length > 0 && (
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.75rem' }}>
                      <strong>Sections:</strong>
                      <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                        {v.affectedSections.slice(0, 6).map(s => <li key={s}>{SECTION_TITLES[s] || s}</li>)}
                        {v.affectedSections.length > 6 && <li>…and {v.affectedSections.length - 6} more</li>}
                      </ul>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button disabled={workflowActive} onClick={(e) => { e.stopPropagation(); handleRestore(v.id); }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', flex: 1, display: 'flex', justifyContent: 'center', gap: '4px', opacity: workflowActive ? 0.5 : 1 }}>
                      <RotateCcw size={12} /> Restore
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setCompareVersion(v); }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', flex: 1, display: 'flex', justifyContent: 'center', gap: '4px' }}>
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
