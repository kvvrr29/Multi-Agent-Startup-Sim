import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`ErrorBoundary caught an error in ${this.props.componentName}:`, error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel" style={{ padding: '1.5rem', margin: '1rem', border: '1px solid var(--danger)', background: 'rgba(239, 68, 68, 0.1)' }}>
          <h3 style={{ color: 'var(--danger)', marginBottom: '0.5rem', fontSize: '1rem' }}>
            ⚠️ Error in {this.props.componentName}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            This module crashed, but the rest of the application is still running.
          </p>
          {this.state.error && (
            <pre style={{ marginTop: '1rem', fontSize: '0.7rem', color: 'var(--text-muted)', overflowX: 'auto', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px' }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
