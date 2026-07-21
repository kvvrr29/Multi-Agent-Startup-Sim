import { Sparkles } from "lucide-react";

/**
 * Shared shell for focused flows that pair explanatory content with a primary
 * workspace, such as authentication and project creation.
 */
export default function SplitPanelLayout({
  eyebrow,
  title,
  description,
  items = [],
  footer,
  className = "",
  children,
}) {
  return (
    <main className={`project-create-page ${className}`.trim()}>
      <section className="project-create-shell">
        <aside className="project-create-sidebar">
          <div>
            <div className="project-create-brand">
              <span className="project-create-brand-mark">
                <Sparkles size={18} strokeWidth={2.2} />
              </span>
              <span>Blueprint</span>
            </div>

            <div className="project-create-intro">
              {eyebrow && (
                <span className="project-create-kicker">{eyebrow}</span>
              )}
              <h1>{title}</h1>
              <p>{description}</p>
            </div>

            {items.length > 0 && (
              <ol className="project-create-steps">
                {items.map((item, index) => (
                  <li key={item.title}>
                    <span className="project-create-step-number">
                      {item.marker ?? index + 1}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>

        {children}
      </section>
    </main>
  );
}
