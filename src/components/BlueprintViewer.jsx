import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import mermaid from 'mermaid';
import { useProjectStore } from '../store/useProjectStore';
import ErrorBoundary from './ErrorBoundary';
import { CheckCircle, AlertCircle, RefreshCw, Send, Lock } from 'lucide-react';
import { runRevisionSimulation } from '../services/simulationEngine';
import { ConfidenceLabel } from './AIStatusUtils';
import { SECTION_OWNERSHIP } from '../config/sectionOwnership';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'Inter, sans-serif'
});

const Mermaid = ({ chart }) => {
  const ref = useRef(null);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      try {
        if (chart) {
          const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
          const { svg } = await mermaid.render(id, chart);
          if (isMounted) setSvg(svg);
        }
      } catch (e) {
        console.error("Mermaid error:", e);
      }
    };
    renderChart();
    return () => { isMounted = false; };
  }, [chart]);

  return (
    <ErrorBoundary componentName="Mermaid Diagram">
      <div ref={ref} dangerouslySetInnerHTML={{ __html: svg }} className="my-4 p-4 bg-[rgba(0,0,0,0.2)] rounded-md flex justify-center" />
    </ErrorBoundary>
  );
};

const MarkdownRenderer = ({ content }) => {
  return (
    <ErrorBoundary componentName="Markdown Content">
      <div className="markdown-content">
        <ReactMarkdown
          components={{
            code({node, inline, className, children, ...props}) {
              const match = /language-(\w+)/.exec(className || '')
              if (!inline && match && match[1] === 'mermaid') {
                return <Mermaid chart={String(children).replace(/\n$/, '')} />
              }
              return !inline ? (
                <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)', overflowX: 'auto' }}>
                  <code className={className} {...props}>{children}</code>
                </pre>
              ) : (
                <code className={className} {...props}>{children}</code>
              )
            }
          }}
        >
          {content || ''}
        </ReactMarkdown>
      </div>
    </ErrorBoundary>
  );
};

// Section block with approval workflow
const SectionBlock = ({ id, label, sectionData }) => {
  const approveBlueprintSection = useProjectStore(state => state.approveBlueprintSection);
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [feedback, setFeedback] = useState('');
  const agentRole = SECTION_OWNERSHIP[id] || null;

  const handleApprove = () => {
    approveBlueprintSection(id);
  };

  const handleSubmitFeedback = () => {
    if (!feedback.trim()) return;
    
    if (sectionData.status === 'approved') {
      const confirmModify = window.confirm('This section is already approved. Modifying it will remove its approved status. Continue?');
      if (!confirmModify) return;
    }

    runRevisionSimulation(`Update ${label}: ${feedback}`, '', id);
    setFeedback('');
    setIsRequestingChanges(false);
  };

  const getConfidenceColor = (conf) => {
    if (conf === 'High') return 'var(--success)';
    if (conf === 'Medium') return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div style={{ padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: `1px solid ${sectionData.status === 'approved' ? 'var(--success)' : 'var(--border-color)'}`, transition: 'all 0.3s ease' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {sectionData.status === 'approved' && <CheckCircle size={16} color="var(--success)" />}
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: sectionData.status === 'approved' ? 'var(--success)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label}
          </span>
        </div>
        
        {sectionData.confidence && (
          <ConfidenceLabel value={sectionData.confidence} agentRole={agentRole} />
        )}
      </div>

      {/* Content */}
      <MarkdownRenderer content={sectionData.content} />

      {/* Action Buttons */}
      <div className="section-actions" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
        <button onClick={handleApprove} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', background: sectionData.status === 'approved' ? 'transparent' : 'var(--success)', border: sectionData.status === 'approved' ? '1px solid var(--success)' : 'none' }}>
          {sectionData.status === 'approved' ? <><Lock size={14} /> Approved</> : <><CheckCircle size={14} /> Approve</>}
        </button>
        <button onClick={() => setIsRequestingChanges(!isRequestingChanges)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
          <AlertCircle size={14} /> {isRequestingChanges ? 'Cancel Edit' : 'Modify Section'}
        </button>
        <button onClick={() => runRevisionSimulation(`Regenerate ${label}`, '', id)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', opacity: 0.8 }}>
          <RefreshCw size={14} /> Regenerate
        </button>
      </div>

      {/* Helper Text */}
      {isRequestingChanges && (
        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--accent-purple)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={12} /> Changes only this section.
        </div>
      )}

      {/* Feedback Input Dropdown */}
      {isRequestingChanges && (
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={`E.g., Make the ${label.toLowerCase()} target enterprise B2B instead...`} 
            style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
          />
          <button onClick={handleSubmitFeedback} className="btn-primary" style={{ padding: '0 12px' }}>
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

function BlueprintViewerInner() {
  const blueprint = useProjectStore(state => state.blueprint);
  const project = useProjectStore(state => state.project);
  
  // Convert object to array and keep schema order, filtering out empties
  const sections = Object.values(blueprint || {}).filter(s => s && s.content && s.content.trim().length > 0);

  if (!project) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div id="blueprint-export-container" className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>{project.name || 'Untitled Project'}</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Startup Blueprint</p>
        </div>

        {sections.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '4rem' }}>
            <p>The blueprint is currently empty.</p>
            <p>Wait for the AI agents to begin their analysis...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {sections.map(section => (
              <SectionBlock key={section.id} id={section.id} label={section.title} sectionData={section} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BlueprintViewer() {
  return (
    <ErrorBoundary componentName="BlueprintViewer">
      <BlueprintViewerInner />
    </ErrorBoundary>
  );
}
