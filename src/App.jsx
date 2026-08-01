import React, { Suspense } from 'react';
import AuthGate from './components/AuthGate';
import { useProjectStore } from './store/useProjectStore';

// Split per view: the create screen should not pay for the dashboard's
// ReactFlow/mermaid dependencies before the user has a project.
const ProjectCreation = React.lazy(() => import('./components/ProjectCreation'));
const Dashboard = React.lazy(() => import('./components/Dashboard'));

const ViewFallback = () => (
  <div
    style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      fontSize: '0.85rem',
    }}
  >
    Loading…
  </div>
);

function App() {
  const currentView = useProjectStore(state => state.currentView);

  return (
    <AuthGate>
      <Suspense fallback={<ViewFallback />}>
        {currentView === 'create' ? <ProjectCreation /> : <Dashboard />}
      </Suspense>
    </AuthGate>
  );
}

export default App;
