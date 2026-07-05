import React, { useMemo, useEffect } from 'react';
import ReactFlow, { Background, MarkerType, useNodesState, useEdgesState, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import { useProjectStore, AGENT_STATUS } from '../store/useProjectStore';
import { Bot, User, Briefcase, Code, Megaphone, CheckCircle, Loader, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ErrorBoundary from './ErrorBoundary';

const iconMap = {
  'mediator': <Bot size={20} />,
  'ceo': <User size={20} />,
  'pm': <Briefcase size={20} />,
  'developer': <Code size={20} />,
  'marketing': <Megaphone size={20} />
};

const statusColors = {
  [AGENT_STATUS.IDLE]: 'var(--text-muted)',
  [AGENT_STATUS.ASSIGNED]: 'var(--accent-purple)',
  [AGENT_STATUS.THINKING]: 'var(--accent-cyan)',
  [AGENT_STATUS.WORKING]: 'var(--primary-electric)',
  [AGENT_STATUS.COMPLETED]: 'var(--success)'
};

// Custom Node for Agent
const AgentNode = ({ data }) => {
  if (!data) return null; // Safe guard
  
  const isWorking = data.status === AGENT_STATUS.THINKING || data.status === AGENT_STATUS.WORKING;
  
  return (
    <div className="glass-panel" style={{ 
      width: 220, 
      padding: '12px',
      borderColor: isWorking ? 'var(--primary-electric)' : 'var(--border-color)',
      boxShadow: isWorking ? 'var(--glow-primary)' : 'var(--shadow-panel)',
      transition: 'all 0.3s ease'
    }}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--border-color)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--border-color)' }} />
      
      <div className="flex items-center gap-3">
        <div style={{
          width: 40, height: 40, borderRadius: '8px',
          background: `rgba(255,255,255,0.05)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: statusColors[data.status] || statusColors[AGENT_STATUS.IDLE]
        }}>
          {iconMap[data.id]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{data.name}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{data.role}</div>
        </div>
      </div>
      
      <div style={{ marginTop: '12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {data.status === AGENT_STATUS.IDLE && <span style={{ color: statusColors[data.status] }}>Idle</span>}
        {data.status === AGENT_STATUS.COMPLETED && <><CheckCircle size={12} color="var(--success)"/> <span style={{ color: 'var(--success)'}}>Done</span></>}
        {data.status === AGENT_STATUS.THINKING && <><Brain size={12} color="var(--accent-cyan)" /> <span style={{ color: 'var(--accent-cyan)'}}>Thinking...</span></>}
        {data.status === AGENT_STATUS.WORKING && <><Loader size={12} color="var(--primary-electric)" style={{ animation: 'spin 2s linear infinite' }} /> <span style={{ color: 'var(--primary-electric)'}}>Working...</span></>}
        {data.status === AGENT_STATUS.ASSIGNED && <span style={{ color: 'var(--accent-purple)' }}>Assigned</span>}
      </div>

      <AnimatePresence>
        {data.currentTask && (
           <motion.div 
             key="task-label"
             initial={{ opacity: 0, height: 0 }}
             animate={{ opacity: 1, height: 'auto' }}
             exit={{ opacity: 0, height: 0 }}
             style={{ marginTop: '8px', fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '4px' }}
           >
             {data.currentTask}
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const nodeTypes = { agentNode: AgentNode };

function AgentVisualizerInner() {
  const agents = useProjectStore(state => state.agents);
  
  // Define layout
  const initialNodes = [
    { id: 'mediator', type: 'agentNode', position: { x: 50, y: 200 }, data: agents.mediator },
    { id: 'ceo', type: 'agentNode', position: { x: 400, y: 50 }, data: agents.ceo },
    { id: 'pm', type: 'agentNode', position: { x: 400, y: 150 }, data: agents.pm },
    { id: 'developer', type: 'agentNode', position: { x: 400, y: 250 }, data: agents.developer },
    { id: 'marketing', type: 'agentNode', position: { x: 400, y: 350 }, data: agents.marketing },
  ];

  const initialEdges = [
    { id: 'e-m-ceo', source: 'mediator', target: 'ceo', animated: agents.ceo.status !== AGENT_STATUS.IDLE && agents.ceo.status !== AGENT_STATUS.COMPLETED },
    { id: 'e-m-pm', source: 'mediator', target: 'pm', animated: agents.pm.status !== AGENT_STATUS.IDLE && agents.pm.status !== AGENT_STATUS.COMPLETED },
    { id: 'e-m-dev', source: 'mediator', target: 'developer', animated: agents.developer.status !== AGENT_STATUS.IDLE && agents.developer.status !== AGENT_STATUS.COMPLETED },
    { id: 'e-m-mkt', source: 'mediator', target: 'marketing', animated: agents.marketing.status !== AGENT_STATUS.IDLE && agents.marketing.status !== AGENT_STATUS.COMPLETED },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when agent state changes
  useEffect(() => {
    setNodes(nds => nds.map(node => {
      const updatedData = agents[node.id];
      return { ...node, data: updatedData || node.data };
    }));
    
    setEdges(eds => eds.map(edge => {
      const targetAgent = agents[edge.target];
      if (!targetAgent) return edge;
      
      const isActive = targetAgent.status === AGENT_STATUS.THINKING || targetAgent.status === AGENT_STATUS.WORKING;
      return { 
        ...edge, 
        animated: isActive,
        style: { stroke: isActive ? 'var(--primary-electric)' : 'var(--border-color)', strokeWidth: isActive ? 2 : 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isActive ? 'var(--primary-electric)' : 'var(--border-color)' }
      };
    }));
  }, [agents, setNodes, setEdges]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        onNodesChange={onNodesChange} 
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(255,255,255,0.05)" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

export default function AgentVisualizer() {
  return (
    <ErrorBoundary componentName="AgentVisualizer">
      <AgentVisualizerInner />
    </ErrorBoundary>
  );
}
