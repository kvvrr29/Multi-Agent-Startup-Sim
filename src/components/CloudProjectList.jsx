import { useState, useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { FolderOpen, Trash2, CloudDownload } from "lucide-react";

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
  const refreshProjects = useAuthStore((state) => state.refreshProjects);
  const deleteCloudProject = useAuthStore((state) => state.deleteCloudProject);
  const [openingId, setOpeningId] = useState(null);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  if (cloudProjects.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        marginTop: "15px",
      }}
    >
      {cloudProjects.map((p) => {
        const isActive = p.id === activeId;
        return (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 10px",
              borderRadius: "8px",
              background: isActive
                ? "rgba(67, 56, 202, 0.15)"
                : "rgba(0,0,0,0.2)",
              border: `1px solid ${isActive ? "var(--primary-electric)" : "var(--border-color)"}`,
            }}
          >
            <FolderOpen
              size={14}
              color="var(--primary-electric)"
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
                  : `Updated ${new Date(p.updated_at).toLocaleString()}`}
              </div>
            </div>
            {!isActive && (
              <button
                type="button"
                className="btn-secondary"
                disabled={openingId === p.id}
                onClick={async () => {
                  setOpeningId(p.id);
                  try {
                    await onOpen(p.id);
                  } finally {
                    setOpeningId(null);
                  }
                }}
                style={{
                  padding: "5px 10px",
                  fontSize: "0.75rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <CloudDownload size={12} />{" "}
                {openingId === p.id ? "Opening…" : "Open"}
              </button>
            )}
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
