import React, { useState } from "react";
import { useProjectMemoryStore } from "../store/projectMemoryStore";
import { Database, ChevronDown, ChevronRight } from "lucide-react";

export default function MemoryInspector() {
  const memory = useProjectMemoryStore((state) => state.memory);
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className="glass-panel"
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        borderRadius: "10px",
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
          <Database size={16} /> Memory Inspector
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
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px",
            }}
          >
            <div>
              <strong>Domain:</strong>{" "}
              <span style={{ color: "var(--text-primary)" }}>
                {memory?.scope?.domain || "N/A"}
              </span>
            </div>
            <div>
              <strong>Industry:</strong>{" "}
              <span style={{ color: "var(--text-primary)" }}>
                {memory?.scope?.industry || "N/A"}
              </span>
            </div>
            <div>
              <strong>Project:</strong>{" "}
              <span style={{ color: "var(--text-primary)" }}>
                {memory?.scope?.project_type || "N/A"}
              </span>
            </div>
            <div>
              <strong>Model:</strong>{" "}
              <span style={{ color: "var(--text-primary)" }}>
                {memory?.scope?.business_model || "N/A"}
              </span>
            </div>
            <div>
              <strong>Complexity:</strong>{" "}
              <span style={{ color: "var(--text-primary)" }}>
                {memory?.scope?.complexity || "N/A"}
              </span>
            </div>
          </div>
          <div>
            <strong>Mandatory:</strong>{" "}
            <span style={{ color: "var(--warning)", fontSize: "0.75rem" }}>
              {memory?.scope?.mandatory_entities || "N/A"}
            </span>
          </div>
          <div
            style={{
              marginTop: "4px",
              background: "rgba(255,255,255,0.05)",
              padding: "6px",
              borderRadius: "4px",
              fontStyle: "italic",
            }}
          >
            <strong>Reasoning:</strong> {memory?.scope?.reasoning || "N/A"}
          </div>

          {Object.entries(memory)
            .filter(([key]) => key !== "domain")
            .map(([category, items]) => {
              const keys = Object.keys(items || {}).filter(
                (k) =>
                  !(
                    category === "scope" &&
                    [
                      "domain",
                      "industry",
                      "project_type",
                      "business_model",
                      "complexity",
                      "mandatory_entities",
                      "confidence",
                      "reasoning",
                    ].includes(k)
                  ),
              );
              if (keys.length === 0) return null;
              return (
                <div
                  key={category}
                  style={{
                    padding: "6px 0px",
                  }}
                >
                  <strong
                    style={{
                      textTransform: "capitalize",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {category}
                  </strong>
                  <ul style={{ margin: "4px 0 0 0", paddingLeft: "16px" }}>
                    {keys.map((k) => (
                      <li key={k}>
                        <span style={{ color: "var(--text-secondary)" }}>
                          {k}:
                        </span>{" "}
                        <span style={{ color: "var(--text-primary)" }}>
                          {items[k]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
