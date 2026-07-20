import React, { useState } from "react";
import {
  previewRevision,
  applyRevisionSimulation,
} from "../services/simulationEngine";
import { useProjectStore, isAgentBusy } from "../store/useProjectStore";
import {
  ArrowUp,
  Activity,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";

const CATEGORIES = ["Business", "Product", "Technical", "Marketing", "Scope"];

export default function ProjectEvolution() {
  const [customRequest, setCustomRequest] = useState("");
  const [category, setCategory] = useState("");

  const [preview, setPreview] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const agents = useProjectStore((state) => state.agents);
  const workflowActive = useProjectStore((state) => state.workflow.active);
  const activeRevision = useProjectStore((state) => state.activeRevision);
  const recentRevisionResult = useProjectStore(
    (state) => state.recentRevisionResult,
  );
  const clearRevisionState = useProjectStore(
    (state) => state.clearRevisionState,
  );

  // Global Lock: True if ANY agent is actively occupied (Completed/Failed don't block)
  const isBusy =
    workflowActive || Object.values(agents).some(isAgentBusy) || isPreviewing;

  const handleCustomSubmit = async (e) => {
    e.preventDefault();
    if (!customRequest.trim() || isBusy) return;
    clearRevisionState();
    setIsPreviewing(true);
    const result = await previewRevision(customRequest, null, category);
    setPreview(result);
    setIsPreviewing(false);
    setCustomRequest("");
  };

  const executePreview = () => {
    if (!preview) return;
    applyRevisionSimulation(preview);
    setPreview(null);
  };

  const cancelPreview = () => {
    setPreview(null);
  };

  return (
    <div
      className="glass-panel"
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        borderRadius: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <h3
          style={{
            fontSize: "1.05rem",
            margin: 0,
            color: "var(--text-primary)",
          }}
        >
          Project Evolution
        </h3>
      </div>
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--primary-electric)",
          fontStyle: "italic",
          marginTop: "-1.2rem",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <AlertTriangle size={12} /> Project-wide changes affecting multiple
        sections.
      </div>

      {/* 1. Active Revision Banner */}
      {isBusy && activeRevision && !isPreviewing && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "8px",
            background: "rgba(67, 56, 202, 0.1)",
            border: "1px solid var(--primary-electric)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
              color: "var(--primary-electric)",
              fontWeight: "bold",
              fontSize: "0.85rem",
            }}
          >
            <Activity size={16} className="spin-slow" /> Processing Change...
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              color: "var(--text-secondary)",
            }}
          >
            <div>
              <strong>Request:</strong> {activeRevision.request}
            </div>
            <div>
              <strong>Category:</strong>{" "}
              {activeRevision.category || "AI Routed"}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "4px",
              }}
            >
              <strong>Routing:</strong>
              <span
                style={{
                  padding: "2px 6px",
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: "4px",
                }}
              >
                Mediator
              </span>
              <ArrowRight size={12} />
              <span
                style={{
                  padding: "2px 6px",
                  background: "var(--accent-purple)",
                  color: "#fff",
                  borderRadius: "4px",
                  textTransform: "uppercase",
                }}
              >
                {activeRevision.targetAgent}
              </span>
            </div>
          </div>
        </div>
      )}

      {isPreviewing && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "8px",
            background: "rgba(0, 0, 0, 0.2)",
            border: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Activity
            size={16}
            className="spin-slow"
            color="var(--primary-electric)"
          />
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Mediator is analyzing routing...
          </span>
        </div>
      )}

      {/* 1.5 Preview Approval Banner */}
      {preview && !isBusy && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "8px",
            background: "rgba(255, 170, 0, 0.1)",
            border: "1px solid var(--warning)",
          }}
        >
          <h4
            style={{
              margin: "0 0 10px 0",
              fontSize: "0.9rem",
              color: "var(--warning)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Activity size={16} /> Revision Preview
          </h4>
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div>
              <strong>Instruction:</strong> {preview.instruction}
            </div>
            <div>
              <strong>Detected Tasks ({preview.tasks?.length || 0}):</strong>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  marginTop: "6px",
                }}
              >
                {(preview.tasks || []).map((task, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "8px",
                      background: "rgba(0,0,0,0.25)",
                      borderRadius: "6px",
                      borderLeft: "2px solid var(--accent-purple)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "4px",
                      }}
                    >
                      <span
                        style={{
                          padding: "2px 6px",
                          background: "var(--accent-purple)",
                          color: "#fff",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          fontSize: "0.7rem",
                        }}
                      >
                        {task.agent}
                      </span>
                      <span style={{ color: "var(--text-primary)" }}>
                        {task.taskDescription}
                      </span>
                    </div>
                    {task.reason && (
                      <div
                        style={{
                          fontSize: "0.72rem",
                          fontStyle: "italic",
                          color: "var(--text-muted)",
                        }}
                      >
                        Why: {task.reason}
                      </div>
                    )}
                    <div style={{ fontSize: "0.72rem", marginTop: "2px" }}>
                      Sections: {task.sections.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button
              onClick={cancelPreview}
              className="btn-secondary"
              style={{ flex: 1, padding: "6px" }}
            >
              Cancel
            </button>
            <button
              onClick={executePreview}
              className="btn-primary"
              style={{ flex: 1, padding: "6px" }}
            >
              Apply Revision
            </button>
          </div>
        </div>
      )}

      {/* 2. Completion Notification */}
      {!isBusy && recentRevisionResult && !recentRevisionResult.isError && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "8px",
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid var(--success)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
              color: "var(--success)",
              fontWeight: "bold",
              fontSize: "0.85rem",
            }}
          >
            <CheckCircle size={16} /> {recentRevisionResult.message}
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.2rem",
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
            }}
          >
            {recentRevisionResult.changes?.map((c, i) => (
              <li key={i} style={{ marginBottom: "2px" }}>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. Error Notification */}
      {!isBusy && recentRevisionResult?.isError && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "8px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertTriangle size={16} /> {recentRevisionResult.message}
        </div>
      )}

      {/* Custom project-wide change */}
      <div
        style={{
          opacity: isBusy ? 0.5 : 1,
          pointerEvents: isBusy ? "none" : "auto",
        }}
      >
        <form onSubmit={handleCustomSubmit} style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              padding: "4px",
              borderRadius: "8px",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div
              style={{
                width: "fit-content",
                flexShrink: 0,
                position: "relative",
                background: "rgba(255, 255, 255, 0.07)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "6px",
              }}
            >
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: "auto",
                  fieldSizing: "content",
                  padding: "0.4rem 1.35rem 0.4rem 0.5rem",
                  appearance: "none",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  outline: "none",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                <option value="" style={{ background: "var(--bg-primary)" }}>
                  Auto
                </option>
                {CATEGORIES.map((c) => (
                  <option
                    key={c}
                    value={c}
                    style={{ background: "var(--bg-primary)" }}
                  >
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                size={14}
                style={{
                  position: "absolute",
                  right: "6px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                  pointerEvents: "none",
                }}
              />
            </div>

            <input
              type="text"
              value={customRequest}
              onChange={(e) => setCustomRequest(e.target.value)}
              placeholder="Describe the change..."
              style={{
                flex: 1,
                minWidth: 0,
                padding: "0.5rem 0.75rem",
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                outline: "none",
                fontSize: "0.85rem",
              }}
            />
            <button
              type="submit"
              disabled={!customRequest.trim()}
              className="btn-secondary"
              aria-label="Apply change"
              title="Apply change"
              style={{
                flexShrink: 0,
                padding: "6px 8px",
                borderRadius: "6px",
                opacity: customRequest.trim() ? 1 : 0.5,
              }}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
