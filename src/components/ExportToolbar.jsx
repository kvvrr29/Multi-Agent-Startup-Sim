import React from 'react';
import { Download, FileText, Code2 } from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';

export default function ExportToolbar() {
  const blueprint = useProjectStore(state => state.blueprint);
  const project = useProjectStore(state => state.project);

  const handleExportMarkdown = () => {
    let md = `# ${project?.name || 'Startup Blueprint'}\n\n`;
    Object.keys(blueprint).forEach(key => {
      const section = blueprint[key];
      if (section && section.content) {
        md += `${section.content}\n\n`;
      }
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'project'}_blueprint.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    // Dynamically import to keep bundle small
    const html2pdf = (await import('html2pdf.js')).default;
    const element = document.getElementById('blueprint-export-container');
    if (!element) return;
    
    // We clone the element to remove action buttons before printing
    const clone = element.cloneNode(true);
    const actions = clone.querySelectorAll('.section-actions');
    actions.forEach(el => el.remove());

    const opt = {
      margin: 1,
      filename: `${project?.name || 'project'}_blueprint.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(clone).save();
  };

  const handleExportDocx = () => {
    // Simple naive DOCX export by saving as a doc file (HTML format)
    // For a real app, docx.js or a backend is preferred.
    const element = document.getElementById('blueprint-export-container');
    if (!element) return;
    
    const clone = element.cloneNode(true);
    const actions = clone.querySelectorAll('.section-actions');
    actions.forEach(el => el.remove());

    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export</title></head><body>";
    const footer = "</body></html>";
    const html = header + clone.innerHTML + footer;
    
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'project'}_blueprint.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const options = [
    { label: 'PDF Document', hint: 'Print-ready blueprint with diagrams', icon: FileText, action: handleExportPDF },
    { label: 'Word Document', hint: 'Editable .doc for further work', icon: Download, action: handleExportDocx },
    { label: 'Markdown', hint: 'Plain-text source of every section', icon: Code2, action: handleExportMarkdown },
  ];

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '1.2rem' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Export Blueprint</h3>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Download your finalized startup blueprint</p>
      </div>
      {options.map(({ label, hint, icon: Icon, action }) => (
        <button key={label} onClick={action} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', padding: '12px', textAlign: 'left', width: '100%' }}>
          <Icon size={18} style={{ flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <strong>{label}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
