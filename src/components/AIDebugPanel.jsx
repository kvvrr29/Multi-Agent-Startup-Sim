import React, { useState } from 'react';
import { useAIDebugStore } from '../store/useAIDebugStore';
import { Activity, Terminal, X, ChevronDown, ChevronUp, Trash2, CheckCircle, AlertTriangle, Zap } from 'lucide-react';

const TAB = { METRICS: 'metrics', SOURCES: 'sources', LOGS: 'logs' };

const SOURCE_BADGE = ({ source }) => {
  if (!source) return <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Pending</span>;
  const isGemini = source === 'Gemini';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
      background: isGemini ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
      color: isGemini ? '#10b981' : '#ef4444',
      border: `1px solid ${isGemini ? '#10b98140' : '#ef444440'}`
    }}>
      {isGemini ? '✅ Gemini' : '⚠️ Fallback'}
    </span>
  );
};

const LOG_VALIDATION_BADGE = ({ result }) => {
  const colors = { PASSED: '#10b981', FAILED: '#ef4444', FALLBACK: '#f59e0b', LOW_CONFIDENCE: '#8b5cf6' };
  return (
    <span style={{
      padding: '1px 6px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700,
      color: colors[result] || 'var(--text-muted)',
      border: `1px solid ${colors[result] || 'var(--border-color)'}40`,
      background: `${colors[result] || '#888'}15`
    }}>{result}</span>
  );
};

export default function AIDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB.METRICS);
  const [expandedLog, setExpandedLog] = useState(null);

  const { apiStats, generationSources, rawLogs, clearLogs } = useAIDebugStore();

  const agentList = ['domain', 'ceo', 'pm', 'developer', 'marketing'];

  if (!isOpen) {
    const hasFallback = Object.values(generationSources).some(s => s === 'Fallback');
    return (
      <button
        onClick={() => setIsOpen(true)}
        title="Open AI Debug Panel"
        style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 901,
          padding: '8px 14px', fontSize: '0.78rem',
          display: 'flex', alignItems: 'center', gap: '6px',
          background: hasFallback ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${hasFallback ? '#ef4444' : 'var(--border-color)'}`,
          borderRadius: '8px', color: hasFallback ? '#ef4444' : 'var(--text-secondary)',
          cursor: 'pointer', backdropFilter: 'blur(8px)'
        }}
      >
        <Activity size={13} /> AI Debug
        {hasFallback && <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.65rem' }}>!</span>}
      </button>
    );
  }

  const tabStyle = (t) => ({
    padding: '6px 12px', fontSize: '0.78rem', cursor: 'pointer', border: 'none',
    borderRadius: '4px', fontWeight: activeTab === t ? 700 : 400,
    background: activeTab === t ? 'var(--primary-electric)' : 'transparent',
    color: activeTab === t ? '#fff' : 'var(--text-muted)',
  });

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', width: '440px',
      background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
      borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      zIndex: 901, display: 'flex', flexDirection: 'column', maxHeight: '580px'
    }}>

      {/* Header */}
      <div style={{
        padding: '10px 14px', background: 'var(--bg-primary)', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--border-color)',
        borderTopLeftRadius: '10px', borderTopRightRadius: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700 }}>
          <Activity size={16} color="var(--primary-electric)" /> AI Pipeline Debug
        </div>
        <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', padding: '8px 10px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
        <button style={tabStyle(TAB.METRICS)} onClick={() => setActiveTab(TAB.METRICS)}>API Metrics</button>
        <button style={tabStyle(TAB.SOURCES)} onClick={() => setActiveTab(TAB.SOURCES)}>Sources</button>
        <button style={tabStyle(TAB.LOGS)} onClick={() => setActiveTab(TAB.LOGS)}>
          Raw Logs {rawLogs.length > 0 && <span style={{ marginLeft: '4px', fontSize: '0.65rem', background: 'var(--accent-purple)', color: '#fff', borderRadius: '8px', padding: '1px 5px' }}>{rawLogs.length}</span>}
        </button>
      </div>

      {/* Content */}
      <div style={{ overflowY: 'auto', padding: '12px', flex: 1 }}>

        {/* ── TAB 1: API Metrics ── */}
        {activeTab === TAB.METRICS && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { label: 'Sent', value: apiStats.sent, color: '#8b5cf6' },
                { label: 'Successful', value: apiStats.successful, color: '#10b981' },
                { label: 'Failed', value: apiStats.failed, color: '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '12px 8px',
                  border: `1px solid ${color}30`, textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Requests {label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
              Success rate: <strong style={{ color: apiStats.sent > 0 ? '#10b981' : 'var(--text-muted)' }}>
                {apiStats.sent > 0 ? Math.round((apiStats.successful / apiStats.sent) * 100) : 0}%
              </strong>
              {apiStats.failed > 0 && <span style={{ color: '#ef4444', marginLeft: '10px' }}>⚠️ {apiStats.failed} failure(s) detected</span>}
            </div>
          </div>
        )}

        {/* ── TAB 2: Generation Sources ── */}
        {activeTab === TAB.SOURCES && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {agentList.map(agent => (
              <div key={agent} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px',
                border: '1px solid var(--border-color)'
              }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {agent === 'domain' ? '🔍 Domain Classifier' : `🤖 ${agent} Agent`}
                </span>
                <SOURCE_BADGE source={generationSources[agent]} />
              </div>
            ))}
          </div>
        )}

        {/* ── TAB 3: Raw Logs ── */}
        {activeTab === TAB.LOGS && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={clearLogs} style={{
                background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px',
                color: 'var(--text-muted)', fontSize: '0.72rem', padding: '3px 8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}>
                <Trash2 size={11} /> Clear Logs
              </button>
            </div>
            {rawLogs.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '20px' }}>
                No logs yet. Run a simulation to capture AI traffic.
              </div>
            )}
            {rawLogs.map(log => (
              <div key={log.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                <div
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  style={{
                    padding: '8px 10px', background: 'var(--bg-primary)', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{log.agent}</span>
                    <LOG_VALIDATION_BADGE result={log.validationResult} />
                    {log.scores && (
                      <span style={{ fontSize: '0.68rem', color: log.scores.overall >= 70 ? '#10b981' : '#f59e0b' }}>
                        {log.scores.overall}%
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    {expandedLog === log.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </div>
                </div>

                {expandedLog === log.id && (
                  <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {log.scores && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px' }}>
                        {[
                          { label: 'Structure', value: log.scores.structural },
                          { label: 'Agent Relevance', value: log.scores.agentRelevance },
                          { label: 'Domain Relevance', value: log.scores.domainRelevance },
                          { label: 'Overall', value: log.scores.overall },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '4px', padding: '6px 4px', textAlign: 'center', border: `1px solid ${value >= 70 ? '#10b98130' : '#f59e0b30'}` }}>
                            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: value >= 70 ? '#10b981' : '#f59e0b' }}>{value}%</div>
                            <div style={{ fontSize: '0.6rem', marginTop: '1px' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {log.fallbackReason && (
                      <div style={{ padding: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef444440', borderRadius: '4px', color: '#ef4444' }}>
                        <strong>⚠️ Fallback Reason:</strong> {log.fallbackReason}
                      </div>
                    )}
                    <div>
                      <strong style={{ color: 'var(--text-secondary)' }}>Prompt (truncated):</strong>
                      <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.68rem', opacity: 0.8 }}>
                        {log.prompt || 'N/A'}
                      </pre>
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-secondary)' }}>Raw Response (truncated):</strong>
                      <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.68rem', opacity: 0.8 }}>
                        {log.rawResponse || '(no response received)'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
