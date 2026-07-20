# Testing Plan — Multi-Agent Startup Simulator V2.0

## Latest execution — 15 July 2026

| Gate | Command | Actual result |
|---|---|---|
| Lint | `npm run lint` | Passed — zero errors and zero warnings |
| Unit | `npm run test:unit` | Passed — 9 files, 56 tests |
| Production build | `npm run build` | Passed |
| Simulator E2E | `npm run test:e2e` | Passed — 4 runs across desktop and mobile; desktop includes actual PDF/DOCX/Markdown downloads |
| Live Gemini | `npm run test:live` | Correctly skipped: `RUN_LIVE_AI=1` and `GEMINI_API_KEY` were not supplied |

Unit coverage includes hard validation gates (including 100/100/0), malformed decisions, retry preservation, ownership normalization, multi-intent fallback routing, category hints, structured memory snapshots, cloud sync persistence, all-fail, partial-fail, unchanged, duplicate workflow, and timeout behavior.

Browser coverage includes project creation, all 18 sections, approvals, Project Evolution preview/apply, reload persistence, desktop/mobile layouts, Developer Mode gating, and PDF/DOCX/Markdown download paths. Playwright retains traces and screenshots only on failures in `test-results/`.

**Release status:** deterministic gates are implemented. Do not label Version 2.0 Stable until the opt-in seven-category live Gemini report below has completed successfully.

Per implementation-plan §15. Automated unit tests cover the pure AI-pipeline logic
(`npm test`); this document is the **manual cross-category test matrix** to run
with a real Gemini API key configured in *AI Settings*.

## Test Projects (7 categories)

Use clearly different projects. Suggested inputs:

| # | Category | Project name | Description to enter |
|---|----------|--------------|----------------------|
| 1 | Physical product business | Aurelia | A luxury wristwatch brand selling handmade mechanical watches through boutiques and online |
| 2 | Financial / analytics software | LedgerLens | A financial analytics platform that ingests bank transactions and produces cash-flow forecasts for SMEs |
| 3 | Marketplace platform | SkillDock | A two-sided marketplace connecting freelance industrial designers with hardware startups |
| 4 | Enterprise management system | CrewOps | An enterprise workforce management system for factory shift scheduling and compliance |
| 5 | Healthcare system | MediCore | A hospital management system for patient records, appointments, and billing at regional clinics |
| 6 | Consumer application | PlateMate | A consumer app that plans weekly meals and generates grocery lists from dietary preferences |
| 7 | AI-based platform | Draftly | An AI platform that drafts and reviews commercial contracts for small law firms |

## Verification checklist (run for EVERY project above)

For each project, verify and tick:

- [ ] **Domain classification** — Memory panel shows a sensible domain (physical products must NOT classify as "General Software")
- [ ] **Industry classification** — industry matches the description
- [ ] **Business model detection** — model fits (e.g. product sales for #1, B2B SaaS for #4)
- [ ] **CEO output** — business model/target users/budget/risks are project-specific
- [ ] **Product Manager output** — problem/solution/MVP/features name domain concepts
- [ ] **Developer output** — architecture and stack fit the project type
- [ ] **Marketing output** — channels fit the audience
- [ ] **Architecture relevance** — diagram services reflect the domain
- [ ] **UML relevance** — actors are domain actors (Patient/Doctor, Buyer/Seller, …)
- [ ] **ER diagram relevance** — entities include the classifier's mandatory entities
- [ ] **Project Evolution** — a global change (e.g. "reduce budget and switch backend to Python") splits into per-agent tasks with reasons, preview → apply updates only listed sections
- [ ] **Modify Section** — a section-local change updates only that section
- [ ] **Memory persistence** — an earlier decision (e.g. target audience change) survives a later unrelated revision (check Memory panel)
- [ ] **Approval calculations** — approve a few sections, check the Approval panel percentages
- [ ] **Export** — PDF, DOCX, and Markdown all download with diagrams and without action buttons

Cross-project check: outputs for unrelated categories must be **substantially different**
(compare ER diagrams and business models of #1 vs #5 vs #7).

## Failure/edge cases

- [ ] Wrong/empty API key → status badge shows *Simulator Mode*; sections badge *Fallback*; nothing is labeled AI-generated
- [ ] Kill network mid-generation → agent shows *Failed*, pipeline completes with fallback, no agent stuck in *Working* (90s max)
- [ ] Rapid repeated revisions → UI lock engages while busy, releases afterwards
- [ ] Developer Mode OFF → no debug panels anywhere; ON → Debug Panel shows per-agent sources, validation scores, raw logs

## Bug reporting template

For every bug found record:

```
Input:            (project + action taken)
Expected result:
Actual result:
Screenshot:
Debug log:        (Developer Mode → AI Debug Panel → Raw Logs)
Agent involved:
Severity:         (blocker / major / minor / cosmetic)
```
