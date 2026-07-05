import React from 'react';
import ProjectCreation from './components/ProjectCreation';
import Dashboard from './components/Dashboard';
import { useProjectStore } from './store/useProjectStore';

function App() {
  const currentView = useProjectStore(state => state.currentView);

  return (
    <>
      {currentView === 'create' ? <ProjectCreation /> : <Dashboard />}
    </>
  );
}

export default App;
