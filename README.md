# Multi-Agent Startup Simulator

A React app where a virtual startup team of five AI agents — **Alex** (Mediator), **Sarah** (CEO), **David** (PM), **Elena** (Developer), and **Marcus** (Marketing) — collaboratively turns a startup idea into a complete, versioned **Startup Blueprint** (18 sections: executive summary through final recommendations, including mermaid architecture/UML/ER diagrams).

Powered by **Gemini 2.5 Flash** with a domain classifier, a 3-stage scored validation pipeline, per-agent memory, and a static fallback simulator when AI is unavailable.

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL, click **AI Settings** and paste a [Gemini API key](https://aistudio.google.com/apikey). The key is kept only in memory for the current tab; it is never persisted. Without a key the app runs in clearly-labeled **Simulator Mode** using fallback templates.

## How it works

1. **Create a project** — name, description, audience, budget, timeline, platform, team size, priorities.
2. **Domain classification** — the Mediator asks Gemini to classify domain/industry/business model and the *mandatory entities* every later output must respect.
3. **Agent pipeline** — CEO → PM → Developer → Marketing each generate their owned sections with role-scoped context and memory. Every response passes 3-stage validation (structural / agent relevance / domain relevance, scored 0–100) with one feedback-driven retry before falling back.
4. **Iterate** — approve sections, *Modify Section* for local changes, or *Project Evolution* for project-wide changes (the Mediator splits multi-part requests into per-agent tasks with routing reasons and a confirmation preview).
5. **Version & export** — real changes and approvals snapshot enriched versions; restore appends a new version rather than rewinding history. Export as PDF, real DOCX, or Markdown.

Project, blueprint provenance, structured memory/decision history, approvals, and versions persist in browser storage under versioned V2 keys. **New Project** clears them together after confirmation. API keys, busy state, errors, and raw debug traffic are excluded.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run test:unit` | Deterministic Vitest unit tests |
| `npm run test:e2e` | Playwright simulator workflows at desktop and mobile widths |
| `npm run test:live` | Opt-in seven-category Gemini regression (`RUN_LIVE_AI=1` and `GEMINI_API_KEY`) |
| `npm run check` | Lint, unit tests, production build, and simulator E2E |
| `npm run lint` | Oxlint |

## Project structure

```
src/
  components/       UI (Dashboard shell, BlueprintViewer, AgentVisualizer, panels)
  config/           Blueprint section list + agent ownership
  services/
    simulationEngine.js   Orchestrates the agent pipeline & revisions
    blueprintFactory.js   Static fallback content (4 sample domains)
    ai/                   Gemini provider, prompts, classifier, router,
                          context builder, 3-stage validation layer
  store/            Zustand stores (project/blueprint, memory, versions,
                    settings, AI cost + debug)
```

## Developer Mode

Debug tooling (AI Debug Panel with validation scores and raw logs, Prompt Inspector, cost dashboard) is hidden by default. Enable **Developer Mode** in AI Settings to show it.

## Testing

Automated and live test results plus the manual cross-category matrix are tracked in [TESTING.md](TESTING.md).
