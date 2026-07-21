import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore } from '../store/useProjectStore';
import { startSync, stopSync, flush, openCloudProject } from '../services/cloudSync';
import { resetAllProjectData } from '../services/simulationEngine';
import { Mail, LogIn, Loader } from 'lucide-react';

export default function AuthGate({ children }) {
  const session = useAuthStore(state => state.session);
  const authMessage = useAuthStore(state => state.authMessage);
  const authError = useAuthStore(state => state.authError);
  const init = useAuthStore(state => state.init);
  const signInWithEmail = useAuthStore(state => state.signInWithEmail);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  console.log('[AuthGate Render] session:', session, 'booted:', booted, 'bootError:', bootError, 'sending:', sending);

  useEffect(() => { init(); }, [init]);

  // Bootstrap after sign-in: open the most recently used project (list is
  // sorted by last_opened_at) so returning users land on the Dashboard;
  // first-time users go to the create screen. An unreachable API must show
  // an error — never be mistaken for "this user has no projects".
  useEffect(() => {
    if (!session) {
      setBooted(false);
      setBootError(null);
      resetAllProjectData();
      return;
    }
    let cancelled = false;
    (async () => {
      console.log('[AuthGate] Calling refreshProjects...');
      const projects = await useAuthStore.getState().refreshProjects();
      console.log('[AuthGate] refreshProjects returned:', projects);
      if (cancelled) return;
      if (projects === null) {
        console.log('[AuthGate] projects is null, setting bootError');
        setBootError('Could not load your projects. Is the API server running?');
        return;
      }
      if (projects.length > 0) {
        console.log('[AuthGate] Opening project:', projects[0].id);
        const opened = await openCloudProject(projects[0].id);
        if (cancelled) return;
        if (!opened) {
          setBootError(`Could not open "${projects[0].name}". Check your connection and retry.`);
          return;
        }
      } else {
        console.log('[AuthGate] No projects, setting view to create');
        useProjectStore.setState({ currentView: 'create' });
      }
      console.log('[AuthGate] Booted successfully');
      setBootError(null);
      setBooted(true);
      startSync();
    })();
    return () => { 
      console.log('[AuthGate] unmounting / cancelling');
      cancelled = true; 
      stopSync(); 
    };
  }, [session, retryKey]);

  // Best effort: push pending changes before the tab closes.
  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  if (session && bootError) {
    return (
      <div className="container flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ padding: '12px', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.85rem' }}>
            ⚠️ {bootError}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setBootError(null); setRetryKey(k => k + 1); }}
            style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (session === undefined || (session && !booted)) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100vh', gap: '10px', color: 'var(--text-secondary)' }}>
        <Loader size={18} style={{ animation: 'spin 2s linear infinite' }} /> {session ? 'Loading your projects…' : 'Connecting…'}
      </div>
    );
  }

  if (!session) {
    const handleSubmit = async (e) => {
      e.preventDefault();
      console.log('[AuthGate] form submitted. email:', email, 'name:', name);
      if (!email.trim() || !name.trim() || sending) return;
      setSending(true);
      const success = await signInWithEmail(email.trim(), name.trim());
      console.log('[AuthGate] signInWithEmail result:', success);
      setSending(false);
    };

    return (
      <div className="container flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(67, 56, 202, 0.2)', color: 'var(--primary-electric)', marginBottom: '1rem' }}>
            <LogIn size={24} />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Welcome to Startup Simulator</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Enter your name and email to get started. Your projects will be saved locally on this device.
          </p>

          {authError && (
            <div style={{ padding: '12px', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.85rem' }}>
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'left' }}>
              <label htmlFor="auth-name" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Full Name</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit'
                }}
              />
            </div>
            
            <div style={{ textAlign: 'left' }}>
              <label htmlFor="auth-email" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Email Address</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit'
                }}
              />
            </div>
            
            <button type="submit" disabled={sending} className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', justifyContent: 'center', marginTop: '8px' }}>
              <LogIn size={16} /> {sending ? 'Signing In…' : 'Enter Simulator'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return children;
}
