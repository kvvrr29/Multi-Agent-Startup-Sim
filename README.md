# Multi-Agent Startup Simulator

A React app where a virtual startup team of five AI agents — **Alex** (Mediator), **Sarah** (CEO), **David** (PM), **Elena** (Developer), and **Marcus** (Marketing) — collaboratively turns a startup idea into a complete, versioned **Startup Blueprint** (18 sections: executive summary through final recommendations, including mermaid architecture/UML/ER diagrams).

Powered by **Gemini 2.5 Flash** with a domain classifier, a 3-stage scored validation pipeline, per-agent memory, and a static fallback simulator when AI is unavailable.

## Quick start

```bash
npm install
npm run dev:full   # Express API (8787) + Vite frontend (3000)
```

Open http://localhost:3000 and sign in with your email (magic link). AI generation goes through a **server-side Gemini proxy** by default — no API key needed in the browser. You can still paste a personal [Gemini API key](https://aistudio.google.com/apikey) in **AI Settings** to call Gemini directly; that key is kept only in memory for the current tab and never persisted. With AI Mode off, the app runs in clearly-labeled **Simulator Mode** using fallback templates.

## Backend (Express + Supabase)

All backend traffic routes through an **Express API server** (`server/index.js`, port 8787; the Vite dev server proxies `/api/*` to it). The browser talks to Supabase directly only for the auth handshake — everything else goes `frontend → Express → Supabase/Gemini`:

- **Auth** — email magic-link login gates the app (`AuthGate.jsx`); `supabase-js` in the browser handles the link/session, and its access token authenticates every `/api` request. Express verifies the JWT per request and queries Supabase with a user-scoped client, so Row Level Security still applies end to end. The dev server runs on port 3000 to match the Supabase project's Site URL, so magic links redirect back correctly.
- **Cloud persistence** — `/api/projects` CRUD backed by a `projects` table (jsonb snapshots of blueprint, memory, and version history). The client debounce-syncs on every store change (`services/cloudSync.js`), and the creation screen lists your saved projects for reopening on any device. Local browser storage still works as an offline cache underneath.
- **AI proxy** — `/api/ai/generate` holds the Gemini key in the server's `GEMINI_API_KEY` env variable; the browser never sees a Gemini key. Until it is set the endpoint returns a clean 501 and the app falls back visibly (revisions fail safely without creating versions; initial generation uses the fallback factory). Users can still paste a personal key in AI Settings to bypass the proxy.

Run both together with `npm run dev:full` (or `npm run server` + `npm run dev` separately). To point at your own Supabase project, copy `.env.example` to `.env`, set the URL/key values, and apply `supabase/migrations/` (a deployed `gemini-proxy` Edge Function also exists as a serverless alternative to the Express AI route, but the app does not use it).

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
