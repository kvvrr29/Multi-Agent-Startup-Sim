import React, { useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { Bug, ChevronDown, ChevronRight } from "lucide-react";
import { BLUEPRINT_SECTIONS } from "../config/blueprintSections";

export default function BlueprintHealthInspector() {
  const blueprint = useProjectStore((state) => state.blueprint);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="glass-panel"
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        borderRadius: "10px",
        flex: expanded ? "1 1 0" : "0 0 auto",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <h3
          style={{
            fontSize: "0.9rem",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            margin: 0,
          }}
        >
          <Bug size={16} /> Health Inspector
        </h3>
        {expanded ? (
          <ChevronDown size={14} color="var(--text-muted)" />
        ) : (
          <ChevronRight size={14} color="var(--text-muted)" />
        )}
      </div>

      {expanded && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginTop: "0.5rem",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            paddingRight: "4px",
          }}
        >
          {BLUEPRINT_SECTIONS.map((section) => {
            const data = blueprint[section.id];
            const hasContent =
              data && data.content && data.content.trim().length > 0;
            const length = hasContent ? data.content.length : 0;

            return (
              <div
                key={section.id}
                style={{
                  background: "rgba(0,0,0,0.2)",
                  padding: "8px",
                  borderRadius: "4px",
                  borderLeft: `2px solid ${!hasContent ? "var(--danger)" : data.status === "approved" ? "var(--success)" : "var(--warning)"}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <strong style={{ color: "var(--text-primary)" }}>
                    {section.title}
                  </strong>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.8,
                      textTransform: "uppercase",
                    }}
                  >
                    {section.type}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "4px",
                    fontSize: "0.75rem",
                  }}
                >
                  <span>
                    Status:{" "}
                    <span
                      style={{
                        color:
                          data?.status === "approved"
                            ? "var(--success)"
                            : "var(--warning)",
                      }}
                    >
                      {data?.status || "missing"}
                    </span>
                  </span>
                  <span>
                    Length:{" "}
                    <span
                      style={{
                        color:
                          length === 0
                            ? "var(--danger)"
                            : "var(--text-primary)",
                      }}
                    >
                      {length}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
