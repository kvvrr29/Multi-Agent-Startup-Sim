import React, { useEffect, useState } from "react";
import { useSettingsStore } from "../store/useSettingsStore";
import { modelManager } from "../services/ai/ModelManager";
import {
  X,
  Key,
  Settings,
  Brain,
  AlertTriangle,
  Terminal,
  ChevronDown,
  Cpu,
  Download,
  Trash2,
} from "lucide-react";
function useLocalModelState(enabled) {
  const [state, setState] = useState(() => modelManager.getState());
  const [cached, setCached] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    return modelManager.subscribe(setState);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    modelManager
      .isInstalled()
      .then((result) => active && setCached(result))
      .catch(() => active && setCached(false));
    return () => {
      active = false;
    };
  }, [enabled, state.status, state.cacheEpoch]);

  const webgpuSupported = typeof navigator !== "undefined" && !!navigator.gpu;
  return {
    ...state,
    cached,
    webgpuSupported,
    downloading: state.status === "downloading",
    ready: state.status === "ready",
    checking: cached === null,
    usable: state.status === "ready" || cached === true,
  };
}
function LocalModelPanel({ model }) {
  const { cached, webgpuSupported, downloading, ready } = model;
  const state = model;
  const percent = Math.round((state.progress?.progress || 0) * 100);

  return (
    <div
      style={{
        padding: "1rem",
        background: "var(--bg-primary)",
        borderRadius: "10px",
        border: `1px solid ${ready ? "var(--success)" : "var(--border-color)"}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "10px",
        }}
      >
        <Cpu size={20} color={ready ? "var(--success)" : "var(--text-muted)"} />
        <div style={{ lineHeight: 1.1 }}>
          <strong style={{ display: "block", fontSize: "0.9rem" }}>
            Built-in AI
          </strong>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {state.modelId}
          </span>
        </div>
      </div>

      {!webgpuSupported && (
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: "0.75rem",
            color: "var(--warning)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <AlertTriangle size={12} /> This browser has no WebGPU support, so the
          built-in AI cannot run here. Use Chrome or Edge, or pick a cloud
          provider.
        </p>
      )}

      {downloading && (
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              height: "6px",
              width: "100%",
              background: "var(--bg-secondary)",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${percent}%`,
                background: "var(--accent-primary)",
                transition: "width 0.2s ease",
              }}
            />
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              display: "block",
              marginTop: "4px",
            }}
          >
            {percent}% — {state.progress?.text || "Preparing…"}
          </span>
        </div>
      )}

      {state.status === "error" && (
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: "0.75rem",
            color: "var(--danger, var(--warning))",
          }}
        >
          {state.progress?.text || "The local model failed to load."}
        </p>
      )}

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <button
          onClick={() => modelManager.initialize().catch(() => {})}
          disabled={downloading || ready || !webgpuSupported}
          className="btn-secondary"
          style={{
            padding: "8px 10px",
            fontSize: "0.75rem",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            opacity: downloading || ready || !webgpuSupported ? 0.5 : 1,
          }}
        >
          <Download size={13} />
          {ready
            ? "Model ready"
            : downloading
              ? "Downloading…"
              : cached
                ? "Load model"
                : "Download model"}
        </button>
        {(ready || cached) && (
          <button
            onClick={() => modelManager.removeModel().catch(() => {})}
            disabled={downloading}
            className="btn-secondary"
            style={{
              padding: "8px 10px",
              fontSize: "0.75rem",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Trash2 size={13} /> Remove from cache
          </button>
        )}
      </div>

      <p
        style={{
          margin: "8px 0 0 0",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        Downloaded once into your browser cache, then runs offline.
      </p>
    </div>
  );
}

export default function AISettingsModal({ onClose }) {
  const {
    apiKey,
    openaiApiKey,
    aiProvider,
    aiModeEnabled,
    developerMode,
    setApiKey,
    setOpenaiApiKey,
    setAiProvider,
    setAiModeEnabled,
    setDeveloperMode,
  } = useSettingsStore();
  const [localKey, setLocalKey] = useState(apiKey);
  const [localOpenaiKey, setLocalOpenaiKey] = useState(openaiApiKey);
  const [localProvider, setLocalProvider] = useState(aiProvider);
  const [localEnabled, setLocalEnabled] = useState(aiModeEnabled);
  const [localDevMode, setLocalDevMode] = useState(developerMode);

  const usingLocal = localEnabled && localProvider === "webllm";
  const localModel = useLocalModelState(usingLocal);
  const missingCloudKey =
    localEnabled &&
    (localProvider === "openai"
      ? !localOpenaiKey.trim()
      : localProvider === "gemini" && !localKey.trim());
  const blockedReason = missingCloudKey
    ? `Enter your ${localProvider === "openai" ? "OpenAI" : "Gemini"} API key to use this provider.`
    : !usingLocal
      ? null
      : !localModel.webgpuSupported
        ? "This browser has no WebGPU support, so the built-in AI cannot run here."
        : localModel.downloading
          ? "Wait for the model download to finish."
          : localModel.checking
            ? "Checking for the downloaded model…"
            : !localModel.usable
              ? "Download the model first."
              : null;

  const handleSave = () => {
    if (blockedReason) return;
    setApiKey(localKey);
    setOpenaiApiKey(localOpenaiKey);
    setAiProvider(localProvider);
    setAiModeEnabled(localEnabled);
    setDeveloperMode(localDevMode);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "var(--bg-secondary)",
          width: "450px",
          borderRadius: "15px",
          padding: "1.5rem",
          border: "1px solid var(--border-color)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h2
            style={{
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "1.2rem",
            }}
          >
            <Settings size={20} color="var(--accent-primary)" /> AI Settings
          </h2>
          <button
            aria-label="Close AI Settings"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* AI Mode Toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem",
              background: "var(--bg-primary)",
              borderRadius: "10px",
              border: `1px solid ${localEnabled ? "var(--success)" : "var(--border-color)"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Brain
                size={20}
                color={localEnabled ? "var(--success)" : "var(--text-muted)"}
              />
              <div>
                <strong style={{ display: "block", fontSize: "0.9rem" }}>
                  Enable AI Mode
                </strong>
                <span
                  style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                >
                  Use Generative AI for simulation
                </span>
              </div>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                aria-label="Enable AI Mode"
                type="checkbox"
                checked={localEnabled}
                onChange={(e) => setLocalEnabled(e.target.checked)}
                style={{ width: "18px", height: "18px" }}
              />
            </label>
          </div>

          {localEnabled && (
            <>
              {/* Provider Selection */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  AI Provider
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    value={localProvider}
                    onChange={(e) => setLocalProvider(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 36px 12px 12px",
                      appearance: "none",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                    }}
                  >
                    <option value="gemini">
                      Google Gemini (Flash, latest)
                    </option>
                    <option value="openai">OpenAI (GPT-4o-mini)</option>
                    <option value="webllm">
                      Built-in AI — runs locally, no key
                    </option>
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    size={16}
                    style={{
                      position: "absolute",
                      top: "50%",
                      right: "10px",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--text-muted)",
                    }}
                  />
                </div>
              </div>

              {/* The local model needs no key — it gets a download panel instead. */}
              {localProvider === "webllm" ? (
                <LocalModelPanel model={localModel} />
              ) : (
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    {localProvider === "openai" ? "OpenAI API Key" : "API Key"}
                  </label>
                  <div style={{ position: "relative" }}>
                    <Key
                      size={16}
                      style={{
                        position: "absolute",
                        left: "10px",
                        top: "12px",
                        color: "var(--text-muted)",
                      }}
                    />
                    <input
                      type="password"
                      value={
                        localProvider === "openai" ? localOpenaiKey : localKey
                      }
                      onChange={(e) =>
                        localProvider === "openai"
                          ? setLocalOpenaiKey(e.target.value)
                          : setLocalKey(e.target.value)
                      }
                      placeholder={
                        localProvider === "openai"
                          ? "sk-..."
                          : "Enter your API Key..."
                      }
                      style={{
                        width: "100%",
                        padding: "12px 12px 12px 34px",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                      }}
                    />
                  </div>
                  {missingCloudKey && (
                    <p
                      style={{
                        margin: "6px 0 0 0",
                        fontSize: "0.75rem",
                        color: "var(--warning)",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <AlertTriangle size={12} /> A{" "}
                      {localProvider === "openai" ? "OpenAI" : "Gemini"} API key
                      is required.
                    </p>
                  )}
                  <p
                    style={{
                      margin: "6px 0 0 0",
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Your personal key is stored only in this browser so it
                    survives reloads. It is never synced to your account or
                    logged; avoid saving it on a shared device.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Developer Tools (doc §11) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem",
              background: "var(--bg-primary)",
              borderRadius: "10px",
              border: `1px solid ${localDevMode ? "var(--accent-secondary)" : "var(--border-color)"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Terminal
                size={20}
                color={
                  localDevMode ? "var(--accent-primary)" : "var(--text-muted)"
                }
              />
              <div style={{ lineHeight: 1.1 }}>
                <strong
                  style={{
                    display: "block",
                    fontSize: "0.9rem",
                    marginBottom: "5px",
                  }}
                >
                  Developer Mode
                </strong>
                <span
                  style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                >
                  Show AI Debug Panel, Prompt Inspector, raw logs & API metrics
                </span>
              </div>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                aria-label="Developer Mode"
                type="checkbox"
                checked={localDevMode}
                onChange={(e) => setLocalDevMode(e.target.checked)}
                style={{ width: "18px", height: "18px" }}
              />
            </label>
          </div>

          {/* Fallback Notice */}
          {!localEnabled && (
            <div
              style={{
                padding: "1rem",
                background: "rgba(255,170,0,0.1)",
                border: "1px solid var(--warning)",
                borderRadius: "8px",
                fontSize: "0.8rem",
                color: "var(--warning)",
              }}
            >
              <strong>AI Mode is Disabled.</strong> The platform will use static
              template generation (Phase 1.9 Fallback mode).
            </div>
          )}

          {blockedReason && (
            <p
              style={{
                margin: 0,
                fontSize: "0.75rem",
                color: "var(--warning)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <AlertTriangle size={12} /> {blockedReason}
            </p>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "6px",
              marginTop: "0.5rem",
            }}
          >
            <button
              onClick={onClose}
              className="btn-secondary"
              style={{
                padding: "10px 12px",
                fontSize: "0.8rem",
                borderRadius: "8px",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!!blockedReason}
              title={blockedReason || undefined}
              className="btn-accent"
              style={{
                padding: "10px 12px",
                fontSize: "0.8rem",
                borderRadius: "8px",
                opacity: blockedReason ? 0.5 : 1,
                cursor: blockedReason ? "not-allowed" : "pointer",
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
