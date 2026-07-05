import React from 'react';
import AgentVisualizer from './AgentVisualizer';
import BlueprintViewer from './BlueprintViewer';
import ProjectEvolution from './ProjectEvolution';
import VersionHistory from './VersionHistory';
import MemoryInspector from './MemoryInspector';
import AgentTimeline from './AgentTimeline';
import { useProjectStore } from '../store/useProjectStore';
import ErrorBoundary from './ErrorBoundary';
import AISettingsModal from './AISettingsModal';
import AICostDashboard from './AICostDashboard';
import PromptInspector from './PromptInspector';
import AIDebugPanel from './AIDebugPanel';
import { AIModeBadge, AIStatusBanner } from './AIStatusUtils';

import { CheckCircle, AlertCircle, RefreshCw, Send, Lock, BarChart2, Settings } from 'lucide-react';

import { BLUEPRINT_SECTIONS } from '../config/blueprintSections';
import BlueprintHealthInspector from './BlueprintHealthInspector';

const ApprovalDashboard = () => {
  const blueprint = useProjectStore(state => state.blueprint);
  
  // 1. Math Definitions
  const total = BLUEPRINT_SECTIONS.length;
  const textSections = BLUEPRINT_SECTIONS.filter(s => s.type === 'text');
  const diagramSections = BLUEPRINT_SECTIONS.filter(s => s.type === 'diagram');
  
  // 2. Calculations
  const textFilled = textSections.filter(s => blueprint[s.id]?.content?.trim().length > 0).length;
  const diagramsFilled = diagramSections.filter(s => blueprint[s.id]?.content?.trim().length > 0).length;
  
  const filledSections = BLUEPRINT_SECTIONS.filter(s => blueprint[s.id]?.content?.trim().length > 0);
  const approved = filledSections.filter(s => blueprint[s.id]?.status === 'approved').length;
  const pending = filledSections.length - approved;
  const missing = total - filledSections.length;

  // 3. Quality Metrics
  const coveragePercent = Math.round((textFilled / textSections.length) * 100) || 0;
  const diagramsPercent = Math.round((diagramsFilled / diagramSections.length) * 100) || 0;
  const approvalPercent = filledSections.length > 0 ? Math.round((approved / filledSections.length) * 100) : 0;
  
  // Weighted Quality Score
  // Content (35%), Diagrams (25%), Approvals (40%)
  const qualityScore = Math.round((coveragePercent * 0.35) + (diagramsPercent * 0.25) + (approvalPercent * 0.40));

  return (
    <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <BarChart2 size={16} /> Approval & Quality
      </h3>
      
      {/* Quality Score */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Overall Score</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: qualityScore >= 90 ? 'var(--success)' : (qualityScore >= 50 ? 'var(--warning)' : 'var(--danger)') }}>
            {qualityScore}%
          </span>
        </div>
        <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${qualityScore}%`, height: '100%', background: qualityScore >= 90 ? 'var(--success)' : (qualityScore >= 50 ? 'var(--warning)' : 'var(--danger)'), transition: 'width 0.5s ease' }}></div>
        </div>
      </div>

      {/* Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Content Coverage</span>
          <span style={{ color: 'var(--text-primary)' }}>{coveragePercent}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Diagram Availability</span>
          <span style={{ color: 'var(--text-primary)' }}>{diagramsPercent}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Approval Progress</span>
          <span style={{ color: 'var(--text-primary)' }}>{approvalPercent}%</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', marginTop: '4px' }}>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'var(--text-muted)' }}>Approved</span>
          <span style={{ fontSize: '1.1rem', color: 'var(--success)', fontWeight: 600 }}>{approved}</span>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'var(--text-muted)' }}>Pending Review</span>
          <span style={{ fontSize: '1.1rem', color: 'var(--warning)', fontWeight: 600 }}>{pending}</span>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'var(--text-muted)' }}>Missing/Empty</span>
          <span style={{ fontSize: '1.1rem', color: 'var(--danger)', fontWeight: 600 }}>{missing}</span>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'var(--text-muted)' }}>Total Sections</span>
          <span style={{ fontSize: '1.1rem', color: 'var(--primary-electric)', fontWeight: 600 }}>{total}</span>
        </div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [showSettings, setShowSettings] = React.useState(false);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {showSettings && <AISettingsModal onClose={() => setShowSettings(false)} />}
      <AICostDashboard />
      <PromptInspector />
      <AIDebugPanel />

      {/* Left Sidebar: Version & Memory */}
      <div style={{ 
        width: '320px', 
        borderRight: '1px solid var(--border-color)', 
        display: 'flex', 
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        padding: '1.2rem',
        gap: '1.2rem',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <AIModeBadge />
          <button onClick={() => setShowSettings(true)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Settings size={14} /> AI Settings
          </button>
        </div>
        <ErrorBoundary componentName="Version History">
          <VersionHistory />
        </ErrorBoundary>
        <ErrorBoundary componentName="Memory Inspector">
          <MemoryInspector />
        </ErrorBoundary>
        <ErrorBoundary componentName="Approval Dashboard">
          <ApprovalDashboard />
        </ErrorBoundary>
        <ErrorBoundary componentName="Blueprint Health Inspector">
          <BlueprintHealthInspector />
        </ErrorBoundary>
      </div>

      {/* Middle Sidebar: Agents & Workflow */}
      <div style={{ 
        width: '420px', 
        borderRight: '1px solid var(--border-color)', 
        display: 'flex', 
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        padding: '1.2rem',
        gap: '1.2rem'
      }}>
        {/* Agent Visualizer (Top) */}
        <div style={{ flex: '0 0 350px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }}></span>
            Startup AI Team
          </h2>
          <ErrorBoundary componentName="AgentVisualizer">
            <AgentVisualizer />
          </ErrorBoundary>
        </div>

        {/* Workflow Timeline (Middle) */}
        <ErrorBoundary componentName="Agent Timeline">
          <AgentTimeline />
        </ErrorBoundary>

        {/* Project Evolution (Bottom) */}
        <ErrorBoundary componentName="ProjectEvolution">
          <ProjectEvolution />
        </ErrorBoundary>
      </div>

      {/* Right Content: Blueprint Viewer */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
        <div style={{ padding: '1rem 1.5rem 0' }}>
          <AIStatusBanner />
        </div>
        <BlueprintViewer />
      </div>
    </div>
  );
}
