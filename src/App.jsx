import React from 'react';
import ProjectCreation from './components/ProjectCreation';
import Dashboard from './components/Dashboard';
import AuthGate from './components/AuthGate';
import { useProjectStore } from './store/useProjectStore';

function App() {
  const currentView = useProjectStore(state => state.currentView);

  return (
    <AuthGate>
      {currentView === 'create' ? <ProjectCreation /> : <Dashboard />}
    </AuthGate>
  );
}

export default App;
