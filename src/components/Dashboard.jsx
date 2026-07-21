import React from "react";
import AgentVisualizer from "./AgentVisualizer";
import BlueprintViewer from "./BlueprintViewer";
import ProjectEvolution from "./ProjectEvolution";
import MemoryInspector from "./MemoryInspector";
import AgentTimeline from "./AgentTimeline";
import { useProjectStore, isAgentBusy } from "../store/useProjectStore";
import { useSettingsStore } from "../store/useSettingsStore";
import ErrorBoundary from "./ErrorBoundary";
import AISettingsModal from "./AISettingsModal";
import AICostDashboard from "./AICostDashboard";
import PromptInspector from "./PromptInspector";
import AIDebugPanel from "./AIDebugPanel";
import { AIModeBadge, AIStatusBanner } from "./AIStatusUtils";
import { resetAllProjectData } from "../services/simulationEngine";
import { useAuthStore } from "../store/useAuthStore";
import { flush, openCloudProject } from "../services/cloudSync";
import { ensureProjectResources } from "../services/cloudSync";
import { useProjectResourceStore } from "../store/useProjectResourceStore";
import CloudProjectList from "./CloudProjectList";

import {
  Bot,
  Database,
  BarChart2,
  Settings,
  BriefcaseBusiness,
  Plus,
  LogOut,
} from "lucide-react";

import { BLUEPRINT_SECTIONS } from "../config/blueprintSections";
import BlueprintHealthInspector from "./BlueprintHealthInspector";

const ApprovalDashboard = () => {
  const blueprint = useProjectStore((state) => state.blueprint);

  // 1. Math Definitions
  const total = BLUEPRINT_SECTIONS.length;
  const textSections = BLUEPRINT_SECTIONS.filter((s) => s.type === "text");
  const diagramSections = BLUEPRINT_SECTIONS.filter(
    (s) => s.type === "diagram",
  );

  // 2. Calculations
  const textFilled = textSections.filter(
    (s) => blueprint[s.id]?.content?.trim().length > 0,
  ).length;
  const diagramsFilled = diagramSections.filter(
    (s) => blueprint[s.id]?.content?.trim().length > 0,
  ).length;

  const filledSections = BLUEPRINT_SECTIONS.filter(
    (s) => blueprint[s.id]?.content?.trim().length > 0,
  );
  const approved = filledSections.filter(
    (s) => blueprint[s.id]?.status === "approved",
  ).length;
  const pending = filledSections.length - approved;
  const missing = total - filledSections.length;

  // 3. Quality Metrics
  const coveragePercent =
    Math.round((textFilled / textSections.length) * 100) || 0;
  const diagramsPercent =
    Math.round((diagramsFilled / diagramSections.length) * 100) || 0;
  const approvalPercent =
    filledSections.length > 0
      ? Math.round((approved / filledSections.length) * 100)
      : 0;

  // Weighted Quality Score
  // Content (35%), Diagrams (25%), Approvals (40%)
  const qualityScore = Math.round(
    coveragePercent * 0.35 + diagramsPercent * 0.25 + approvalPercent * 0.4,
  );

  return (
    <div
      className="glass-panel"
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        borderRadius: "10px",
        flexShrink: 0,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: "0.9rem",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <BarChart2 size={16} /> Approval & Quality
      </h3>

      {/* Quality Score */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "6px",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "var(--text-primary)" }}>
            Overall Score
          </span>
          <span
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              color:
                qualityScore >= 90
                  ? "var(--success)"
                  : qualityScore >= 50
                    ? "var(--warning)"
                    : "var(--danger)",
            }}
          >
            {qualityScore}%
          </span>
        </div>
        <div
          style={{
            width: "100%",
            height: "6px",
            background: "var(--border-color)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${qualityScore}%`,
              height: "100%",
              background:
                qualityScore >= 90
                  ? "var(--success)"
                  : qualityScore >= 50
                    ? "var(--warning)"
                    : "var(--danger)",
              transition: "width 0.5s ease",
            }}
          ></div>
        </div>
      </div>

      {/* Breakdown */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          fontSize: "0.75rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-muted)" }}>Content Coverage</span>
          <span style={{ color: "var(--text-primary)" }}>
            {coveragePercent}%
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-muted)" }}>
            Diagram Availability
          </span>
          <span style={{ color: "var(--text-primary)" }}>
            {diagramsPercent}%
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-muted)" }}>Approval Progress</span>
          <span style={{ color: "var(--text-primary)" }}>
            {approvalPercent}%
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          fontSize: "0.75rem",
          marginTop: "4px",
        }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "8px",
            borderRadius: "6px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Approved</span>
          <span
            style={{
              fontSize: "1.1rem",
              color: "var(--success)",
              fontWeight: 600,
            }}
          >
            {approved}
          </span>
        </div>
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "8px",
            borderRadius: "6px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Pending Review</span>
          <span
            style={{
              fontSize: "1.1rem",
              color: "var(--warning)",
              fontWeight: 600,
            }}
          >
            {pending}
          </span>
        </div>
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "8px",
            borderRadius: "6px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Missing/Empty</span>
          <span
            style={{
              fontSize: "1.1rem",
              color: "var(--danger)",
              fontWeight: 600,
            }}
          >
            {missing}
          </span>
        </div>
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "8px",
            borderRadius: "6px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Total Sections</span>
          <span
            style={{
              fontSize: "1.1rem",
              color: "var(--accent-primary)",
              fontWeight: 600,
            }}
          >
            {total}
          </span>
        </div>
      </div>
    </div>
  );
};

// One contextual panel at a time (doc §8)
const PANELS = [
  { id: "project", label: "Your Projects", icon: BriefcaseBusiness },
  { id: "agents", label: "Agent Team", icon: Bot },
  { id: "memory", label: "Project Memory", icon: Database },
  { id: "approval", label: "Approval", icon: BarChart2 },
];

const NavButton = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "5px",
      padding: "12px 4px",
      width: "100%",
      cursor: "pointer",
      background: active ? "var(--accent-surface)" : "transparent",
      border: "none",
      borderLeft: `2px solid ${active ? "var(--accent-primary)" : "transparent"}`,
      color: active ? "var(--text-primary)" : "var(--text-muted)",
      fontSize: "0.65rem",
      fontFamily: "inherit",
      transition: "all ease",
    }}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

const EmptyProjectState = ({
  children = "Open a project from Your Projects to view this panel.",
}) => (
  <div
    role="status"
    style={{
      padding: "1.25rem",
      border: "1px dashed var(--border-color)",
      borderRadius: "10px",
      color: "var(--text-muted)",
      fontSize: "0.85rem",
      lineHeight: 1.5,
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

const ResourceState = ({ label, state, onRetry }) => {
  if (state?.status === "loading" || state?.status === "idle") {
    return <EmptyProjectState>Loading {label}…</EmptyProjectState>;
  }
  if (state?.status === "error") {
    return (
      <div
        role="alert"
        style={{
          padding: "1rem",
          border: "1px solid var(--danger)",
          borderRadius: "10px",
          color: "var(--danger)",
          fontSize: "0.82rem",
        }}
      >
        <div>
          Could not load {label}: {state.error}
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={onRetry}
          style={{ marginTop: "10px", padding: "6px 10px" }}
        >
          Retry
        </button>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [showSettings, setShowSettings] = React.useState(false);
  const [activePanel, setActivePanel] = React.useState("project");

  const developerMode = useSettingsStore((state) => state.developerMode);
  const agents = useProjectStore((state) => state.agents);
  const activeCloudId = useAuthStore((state) => state.activeCloudId);
  const metaState = useProjectResourceStore((state) => state.resources.meta);
  const eventsState = useProjectResourceStore(
    (state) => state.resources.events,
  );
  const memoryState = useProjectResourceStore(
    (state) => state.resources.memory,
  );
  const decisionsState = useProjectResourceStore(
    (state) => state.resources.decisions,
  );
  const anyBusy = Object.values(agents).some(isAgentBusy);

  // Auto-switch to Agent Activity when a simulation starts so the user
  // always sees what the AI team is doing (doc §8).
  const wasBusy = React.useRef(false);
  React.useEffect(() => {
    if (anyBusy && !wasBusy.current) setActivePanel("agents");
    wasBusy.current = anyBusy;
  }, [anyBusy]);

  React.useEffect(() => {
    if (!activeCloudId) return;
    if (activePanel === "memory") {
      ensureProjectResources(["memory"]).catch(() => {});
    } else if (activePanel === "agents") {
      ensureProjectResources(["meta", "events", "memory", "decisions"]).catch(
        () => {},
      );
    }
  }, [activePanel, activeCloudId]);

  const evolutionStates = [metaState, memoryState, decisionsState];
  const evolutionReady = evolutionStates.every(
    (state) => state.status === "ready",
  );
  const evolutionErrors = evolutionStates.filter(
    (state) => state.status === "error",
  );

  return (
    <div
      className="dashboard-shell"
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      {showSettings && (
        <AISettingsModal onClose={() => setShowSettings(false)} />
      )}

      {/* Debug tools are developer-only (doc §11) */}
      {developerMode && (
        <>
          <AICostDashboard />
          <PromptInspector />
          <AIDebugPanel />
        </>
      )}

      {/* 1. Left Navigation Rail */}
      <div
        className="dashboard-nav"
        style={{
          width: "76px",
          borderRight: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          display: "flex",
          flexDirection: "column",
          paddingTop: "0.8rem",
          zIndex: 20,
        }}
      >
        {PANELS.map((p) => (
          <NavButton
            key={p.id}
            icon={p.icon}
            label={p.label}
            active={activePanel === p.id}
            onClick={() => setActivePanel(p.id)}
          />
        ))}
        <div style={{ flex: 1 }} />
        <NavButton
          icon={Settings}
          label="Settings"
          active={showSettings}
          onClick={() => setShowSettings(true)}
        />
        <NavButton
          icon={LogOut}
          label="Sign Out"
          active={false}
          onClick={() => useAuthStore.getState().signOut()}
        />
      </div>

      {/* 2. Context Panel — only one at a time */}
      <div
        className="dashboard-context-panel"
        style={{
          width: "400px",
          borderRight: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-secondary)",
          padding: "1.2rem",
          gap: "1.2rem",
          zIndex: 10,
          minHeight: 0,
          overflowY: activePanel === "approval" ? "hidden" : "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2
            style={{
              fontSize: "1rem",
              margin: 0,
              color: "var(--text-primary)",
            }}
          >
            {PANELS.find((p) => p.id === activePanel)?.label}
          </h2>
          <AIModeBadge />
        </div>

        {activePanel === "agents" &&
          (!activeCloudId ? (
            <EmptyProjectState />
          ) : (
            <>
              <div
                style={{
                  flex: "0 0 320px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <ErrorBoundary componentName="AgentVisualizer">
                  <AgentVisualizer />
                </ErrorBoundary>
              </div>
              {eventsState.status === "ready" ? (
                <ErrorBoundary componentName="Agent Timeline">
                  <AgentTimeline />
                </ErrorBoundary>
              ) : (
                <ResourceState
                  label="agent timeline"
                  state={eventsState}
                  onRetry={() =>
                    ensureProjectResources(["events"]).catch(() => {})
                  }
                />
              )}
              <ErrorBoundary componentName="ProjectEvolution">
                <ProjectEvolution
                  contextReady={evolutionReady}
                  contextError={evolutionErrors
                    .map((state) => state.error)
                    .join(" ")}
                  onRetryContext={() =>
                    ensureProjectResources([
                      "meta",
                      "memory",
                      "decisions",
                    ]).catch(() => {})
                  }
                />
              </ErrorBoundary>
            </>
          ))}

        {activePanel === "project" && (
          <>
            <CloudProjectList
              compact
              activeId={activeCloudId}
              onOpen={async (id) => {
                if (anyBusy) {
                  window.alert(
                    "Agents are still working — wait for the current run to finish before switching projects.",
                  );
                  return;
                }
                await openCloudProject(id);
              }}
            />
            <button
              className="btn-secondary section-actions"
              onClick={async () => {
                if (!activeCloudId) {
                  useProjectStore.getState().setCurrentView("create");
                  return;
                }
                await flush();
                // Detach from the cloud row before clearing the render stores.
                // Keep this project's browser-local drafts so reopening it can
                // restore every unapproved section.
                useAuthStore.getState().detachCloud();
                resetAllProjectData({ preserveSectionHistory: true });
              }}
              style={{
                padding: "12px",
                borderRadius: "10px",
                fontSize: "0.9rem",
                display: "flex",
                width: "100%",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Plus size={16} /> New Project
            </button>
          </>
        )}

        {activePanel === "memory" &&
          (!activeCloudId ? (
            <EmptyProjectState />
          ) : memoryState.status === "ready" ? (
            <ErrorBoundary componentName="Memory Inspector">
              <MemoryInspector />
            </ErrorBoundary>
          ) : (
            <ResourceState
              label="project memory"
              state={memoryState}
              onRetry={() => ensureProjectResources(["memory"]).catch(() => {})}
            />
          ))}

        {activePanel === "approval" &&
          (!activeCloudId ? (
            <EmptyProjectState />
          ) : (
            <>
              <ErrorBoundary componentName="Approval Dashboard">
                <ApprovalDashboard />
              </ErrorBoundary>
              <ErrorBoundary componentName="Blueprint Health Inspector">
                <BlueprintHealthInspector />
              </ErrorBoundary>
            </>
          ))}
      </div>

      {/* 3. Main Content: Blueprint gets most of the screen */}
      <div
        className="dashboard-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-primary)",
        }}
      >
        <AIStatusBanner floating dismissible />
        {activeCloudId ? (
          <BlueprintViewer />
        ) : (
          <div
            role="status"
            className="glass-panel"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Select a project to load its blueprint.
          </div>
        )}
      </div>
    </div>
  );
}
