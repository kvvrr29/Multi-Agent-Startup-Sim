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
  const [sending, setSending] = useState(false);
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  // Key the bootstrap on the stable user id, NOT the session object. Supabase
  // mints a fresh session object on token refresh and tab re-focus; depending
  // on the object would re-run the effect, re-hydrate the stores from the DB
  // over un-synced local edits, and cancel the pending push via stopSync.
  const userId = session?.user?.id ?? null;

  useEffect(() => { init(); }, [init]);

  // Bootstrap after sign-in: open the most recently used project (list is
  // sorted by last_opened_at) so returning users land on the Dashboard;
  // first-time users go to the create screen. An unreachable API must show
  // an error — never be mistaken for "this user has no projects".
  useEffect(() => {
    if (!userId) {
      stopSync();
      setBooted(false);
      setBootError(null);
      resetAllProjectData();
      return;
    }
    let cancelled = false;
    (async () => {
      const projects = await useAuthStore.getState().refreshProjects();
      if (cancelled) return;
      if (projects === null) {
        setBootError('Could not load your projects. Is the API server running?');
        return;
      }
      if (projects.length > 0) {
        const opened = await openCloudProject(projects[0].id);
        if (cancelled) return;
        if (!opened) {
          setBootError(`Could not open "${projects[0].name}". Check your connection and retry.`);
          return;
        }
      } else {
        useProjectStore.setState({ currentView: 'create' });
      }
      setBootError(null);
      setBooted(true);
      startSync();
    })();
    return () => { cancelled = true; };
  }, [userId, retryKey]);

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
      if (!email.trim() || sending) return;
      setSending(true);
      await signInWithEmail(email.trim());
      setSending(false);
    };

    return (
      <div className="container flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-surface)', color: 'var(--accent-primary)', marginBottom: '1rem' }}>
            <LogIn size={24} />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Sign In or Sign Up</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Enter your email and we&apos;ll send you a magic link — new accounts are created automatically.
            Your projects are saved to your account.
          </p>

          {authMessage && (
            <div style={{ padding: '12px', marginBottom: '1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', borderRadius: 'var(--radius-md)', color: 'var(--success)', fontSize: '0.85rem' }}>
              {authMessage}
            </div>
          )}
          {authError && (
            <div style={{ padding: '12px', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.85rem' }}>
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label htmlFor="auth-email" style={{ position: 'absolute', left: '-9999px' }}>Email address</label>
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
            <button type="submit" disabled={sending} className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}>
              <Mail size={16} /> {sending ? 'Sending…' : 'Send Magic Link'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return children;
}
