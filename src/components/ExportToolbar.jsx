import React, { useEffect, useRef, useState } from "react";
import { Download, FileText, Code2 } from "lucide-react";
import { useProjectStore } from "../store/useProjectStore";
import { BLUEPRINT_SECTIONS } from "../config/blueprintSections";

export default function ExportToolbar({ compact = false }) {
  const blueprint = useProjectStore((state) => state.blueprint);
  const project = useProjectStore((state) => state.project);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const handleExportMarkdown = () => {
    let md = `# ${project?.name || "Startup Blueprint"}\n\n`;
    BLUEPRINT_SECTIONS.forEach(({ id, title }) => {
      const section = blueprint[id];
      md += `## ${title}\n\n${section?.content || "_No content generated._"}\n\n`;
    });

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name || "project"}_blueprint.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    // Dynamically import to keep bundle small
    const html2pdf = (await import("html2pdf.js")).default;
    const element = document.getElementById("blueprint-export-container");
    if (!element) return;

    // We clone the element to remove action buttons before printing
    const clone = element.cloneNode(true);
    const actions = clone.querySelectorAll(".section-actions");
    actions.forEach((el) => el.remove());

    const opt = {
      margin: 1,
      filename: `${project?.name || "project"}_blueprint.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    };
    html2pdf().set(opt).from(clone).save();
  };

  const handleExportDocx = async () => {
    const { createBlueprintDocx } = await import("../services/docxExport");
    const blob = await createBlueprintDocx(project, blueprint);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name || "project"}_blueprint.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const options = [
    {
      label: "PDF Document",
      menuLabel: "PDF",
      hint: "Print-ready blueprint with diagrams",
      icon: FileText,
      action: handleExportPDF,
    },
    {
      label: "Word Document",
      menuLabel: "Word",
      hint: "Editable .docx with rendered diagrams",
      icon: Download,
      action: handleExportDocx,
    },
    {
      label: "Markdown",
      menuLabel: "Markdown",
      hint: "Plain-text source of every section",
      icon: Code2,
      action: handleExportMarkdown,
    },
  ];

  if (compact) {
    return (
      <div
        ref={menuRef}
        style={{ position: "relative", alignSelf: "flex-start", zIndex: 30 }}
      >
        {menuOpen && (
          <div
            role="menu"
            aria-label="Export formats"
            className="glass-panel"
            style={{
              position: "absolute",
              left: 0,
              bottom: "calc(100% + 10px)",
              width: "170px",
              padding: "6px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              background: "var(--bg-secondary)",
              borderRadius: "10px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
            }}
          >
            {options.map(({ menuLabel, icon: Icon, action }) => (
              <button
                key={menuLabel}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  action();
                }}
                className="btn-secondary"
                style={{
                  justifyContent: "flex-start",
                  gap: "9px",
                  padding: "9px 10px",
                  borderRadius: "7px",
                  fontSize: "0.8rem",
                }}
              >
                <Icon size={15} /> {menuLabel}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="btn-primary"
          aria-label="Download blueprint"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Download blueprint"
          onClick={() => setMenuOpen((value) => !value)}
          style={{
            width: "48px",
            height: "48px",
            padding: 0,
            border: "none",
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Download size={20} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="glass-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.8rem",
        padding: "1.2rem",
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Export Blueprint</h3>
        <p
          style={{
            margin: 0,
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
          }}
        >
          Download your finalized startup blueprint
        </p>
      </div>
      {options.map(({ label, hint, icon: Icon, action }) => (
        <button
          key={label}
          onClick={action}
          className="btn-secondary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "0.85rem",
            padding: "12px",
            textAlign: "left",
            width: "100%",
          }}
        >
          <Icon size={18} style={{ flexShrink: 0 }} />
          <span style={{ display: "flex", flexDirection: "column" }}>
            <strong>{label}</strong>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
