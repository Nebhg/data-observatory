# Copilot Instructions for Data Observatory

## Agent Delegation

All 6 agents are defined in `../data-agent/.github/agents/` and are available workspace-wide.
For agent routing, handoff chains, and MCP tool routing, see the workspace orchestrator:
`../data-agent/.github/copilot-instructions.md`

| Agent | When to delegate |
|-------|-----------------|
| `frontend-developer` | React, Next.js, styling, layout, browser review, and component behaviour. |
| `product-lead` | Cross-repo planning, linked issues, release coordination, and API/UI handshake decisions. |
| `data-eng` | Data modelling, API contract review, product architecture, and cross-repo correctness. |
| `sql-specialist` | Query debugging, backend data investigation for UI issues, and SQL-heavy analysis. |
| `data-pipeline` | Backend-primary ingestion, bronze cache, source onboarding, and MCP-powered pipeline tasks in the sibling repo. |
| `dbt-engineer` | Backend-primary dbt modelling, tests, and lineage tasks in the sibling repo. |

Always prefer delegating to the specialist agent rather than handling complex domain tasks yourself.

## Dual-Repo Guidance

- **Control plane**: `../data-agent` owns shared workflow policy, deployment orchestration, pipeline operations, MCP tools, and backend API implementation.
- **Cross-repo tasks**: if work changes API fields, query params, release behaviour, or UI assumptions, search both repos and require linked issues plus a shared GitHub Project item.
- **Browser review**: UI-impacting tasks should use the local Playwright capture flow on localhost before and after edits, then gather user feedback before treating the work as done.

## Frontend Skills (in `.github/skills/`)

| User says... | Load skill |
|---|---|
| "review the layout", "before and after", "take a screenshot", "browser review" | `browser-review` |
| "type error", "typescript", "compile error", "props mismatch" | `type-checking` |
| "API mismatch", "endpoint changed", "contract broke", "query param issue" | `api-contract` |
| "test this page", "smoke test", "visual regression", "frontend test" | `frontend-testing` |

## Project Map

```
src/
├── app/                   — Next.js app-router pages
│   ├── markets/           — prediction markets list + detail + events
│   ├── sources/           — data sources browser
│   ├── runs/              — pipeline run history
│   ├── bronze/            — bronze cache viewer
│   ├── dbt/               — dbt model browser
│   └── query/             — ad-hoc SQL query UI
├── components/            — shared UI (Sidebar, SidebarContext, ui)
├── lib/api.ts             — API types + fetch helpers (source of truth for contract)
└── hooks/usePolling.ts    — live data polling hook
```

Backend API: FastAPI at `http://localhost:8000`, proxied via `/api/*`.

## Local Commands

```bash
cd /Users/haras-gummer/data-observatory
npm run dev              # dev server at http://localhost:3000
npm run type-check       # TypeScript validation
npm run build            # production build check
npm run check            # lint + type-check + build (pre-commit gate)
npm run browser-review:before
npm run browser-review:after
```

## References

- `../data-agent/.github/copilot-instructions.md` — workspace orchestrator + handoff chains
- `../data-agent/docs/MULTI_REPO_WORKFLOW.md` — shared cross-repo workflow policy
- `../data-agent/api/` — FastAPI backend source
