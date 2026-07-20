import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { FolderOpen, Trash2 } from "lucide-react";

/**
 * The user's cloud projects. Used on the create screen (full) and in the
 * Dashboard's Project panel (compact) to switch between projects.
 */
export default function CloudProjectList({
  compact = false,
  activeId = null,
  onOpen,
}) {
  const cloudProjects = useAuthStore((state) => state.cloudProjects);
  const deleteCloudProject = useAuthStore((state) => state.deleteCloudProject);
  const [openingId, setOpeningId] = useState(null);

  if (cloudProjects.length === 0) {
    return (
      <div
        role="status"
        style={{
          marginTop: "15px",
          padding: "14px",
          border: "1px dashed var(--border-color)",
          borderRadius: "8px",
          color: "var(--text-muted)",
          fontSize: "0.82rem",
          textAlign: "center",
        }}
      >
        No projects yet. Create one to start building a blueprint.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        marginTop: compact ? 0 : "15px",
      }}
    >
      {cloudProjects.map((p) => {
        const isActive = p.id === activeId;
        const isOpening = openingId === p.id;
        return (
          <div
            key={p.id}
            style={{
              position: "relative",
            }}
          >
            <button
              type="button"
              aria-label={
                isActive ? `${p.name} currently open` : `Open ${p.name}`
              }
              aria-current={isActive ? "true" : undefined}
              disabled={isActive || openingId !== null}
              onClick={async () => {
                setOpeningId(p.id);
                try {
                  await onOpen(p.id);
                } finally {
                  setOpeningId(null);
                }
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 42px 10px 15px",
                borderRadius: "8px",
                background: isActive
                  ? "var(--accent-surface)"
                  : "rgba(0,0,0,0.2)",
                border: `1px solid ${isActive ? "var(--accent-primary)" : "var(--border-color)"}`,
                color: "inherit",
                fontFamily: "inherit",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <FolderOpen
                size={14}
                color="var(--accent-primary)"
                style={{ flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.name}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {isActive
                    ? "Currently open"
                    : isOpening
                      ? "Opening…"
                      : `Updated ${new Date(p.updated_at).toLocaleString()}`}
                </div>
              </div>
            </button>
            <button
              type="button"
              title={`Delete ${p.name}`}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${p.name}" from the cloud? This cannot be undone.`,
                  )
                )
                  deleteCloudProject(p.id);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--danger)",
                padding: "4px",
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
