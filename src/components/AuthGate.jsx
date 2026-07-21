import React, { useEffect, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { startSync, stopSync, flush } from "../services/cloudSync";
import { resetAllProjectData } from "../services/simulationEngine";
import { Mail, Loader } from "lucide-react";
import SplitPanelLayout from "./SplitPanelLayout";

const AUTH_BENEFITS = [
  {
    marker: "✦",
    title: "No password to remember",
    description: "We email you a secure magic link to get in.",
  },
  {
    marker: "✦",
    title: "Accounts made instantly",
    description: "New here? Your account is created automatically.",
  },
  {
    marker: "✦",
    title: "Projects stay saved",
    description: "Every blueprint is tied to your account.",
  },
];

export default function AuthGate({ children }) {
  const session = useAuthStore((state) => state.session);
  const authMessage = useAuthStore((state) => state.authMessage);
  const authError = useAuthStore((state) => state.authError);
  const init = useAuthStore((state) => state.init);
  const signInWithEmail = useAuthStore((state) => state.signInWithEmail);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  // Key the bootstrap on the stable user id, NOT the session object. Supabase
  // mints a fresh session object on token refresh and tab re-focus; depending
  // on the object would re-run the effect, re-hydrate the stores from the DB
  // over un-synced local edits, and cancel the pending push via stopSync.
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    init();
  }, [init]);

  // Bootstrap after sign-in: load the registry only. Project data is fetched
  // explicitly when the user selects a project from the Dashboard.
  useEffect(() => {
    if (!userId) {
      stopSync();
      setBooted(false);
      setBootError(null);
      resetAllProjectData({ preserveSectionHistory: true });
      return;
    }
    let cancelled = false;
    (async () => {
      stopSync();
      useAuthStore.getState().detachCloud();
      resetAllProjectData({
        preserveSectionHistory: true,
        currentView: "dashboard",
      });
      setBooted(false);

      const projects = await useAuthStore.getState().refreshProjects();
      if (cancelled) return;
      if (projects === null) {
        setBootError(
          "Could not load your projects. Is the API server running?",
        );
        return;
      }
      setBootError(null);
      setBooted(true);
      // Subscriptions are safe with no active target. Selecting a project
      // establishes its synchronization cursor before edits can be observed.
      startSync();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, retryKey]);

  // Best effort: push pending changes before the tab closes.
  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  if (session && bootError) {
    return (
      <div
        className="container flex items-center justify-center"
        style={{ minHeight: "100vh" }}
      >
        <div
          className="glass-panel"
          style={{
            width: "100%",
            maxWidth: "420px",
            padding: "2.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              padding: "12px",
              marginBottom: "1rem",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius-md)",
              color: "var(--danger)",
              fontSize: "0.85rem",
            }}
          >
            ⚠️ {bootError}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setBootError(null);
              setRetryKey((k) => k + 1);
            }}
            style={{
              width: "100%",
              padding: "0.75rem",
              justifyContent: "center",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (session === undefined || (session && !booted)) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          minHeight: "100vh",
          gap: "10px",
          color: "var(--text-secondary)",
        }}
      >
        <Loader size={18} style={{ animation: "spin 2s linear infinite" }} />{" "}
        {session ? "Loading your projects…" : "Connecting…"}
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
      <SplitPanelLayout
        className="auth-layout"
        title={
          <>
            Turn ideas
            <br />
            into blueprints
          </>
        }
        description="Sign in with your email — our AI agents are ready to plan your next startup."
        items={AUTH_BENEFITS}
      >
        <div className="auth-workspace">
          <div className="auth-form-wrap">
            <h1>Sign in or sign up</h1>
            <p className="auth-form-description">
              Enter your email and we&apos;ll send you a magic link.
            </p>

            {authMessage && (
              <div
                className="auth-feedback auth-feedback-success"
                role="status"
              >
                {authMessage}
              </div>
            )}
            {authError && (
              <div className="auth-feedback auth-feedback-error" role="alert">
                {authError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="project-create-field">
                <label htmlFor="auth-email">Email address</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="project-create-submit auth-submit"
              >
                <Mail size={15} />
                {sending ? "Sending…" : "Send Magic Link"}
              </button>
            </form>

            <p className="auth-legal">
              By continuing you agree to the Terms and Privacy Policy.
            </p>
          </div>
        </div>
      </SplitPanelLayout>
    );
  }

  return children;
}
