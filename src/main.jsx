import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
['mass-project-v2', 'mass-memory-v2', 'mass-versions-v2'].forEach(key => {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
