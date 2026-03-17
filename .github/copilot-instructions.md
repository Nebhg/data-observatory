# Copilot Instructions for Data Observatory

## Agent Delegation

All agents are defined in `../data-agent/.github/agents/`. See the workspace orchestrator for full routing:
`../data-agent/.github/copilot-instructions.md`

Use `orchestrator` as your single entry point. For frontend-only work, select `frontend-developer` directly.

| Agent | When to use |
|---|---|
| `frontend-developer` | React, Next.js, styling, layout, browser review, component behaviour |
| `orchestrator` | Cross-repo planning, linked issues, release coordination, API/UI decisions |
| `data-eng` | API contract review, data modelling, cross-repo correctness |
| `data-pipeline` | Backend ingestion, bronze cache, source onboarding (sibling repo) |

---

## Frontend Skills

| User says... | Skill |
|---|---|
| "review the layout", "before/after screenshot", "browser review" | `browser-review` |
| "API mismatch", "endpoint changed", "contract broke", "query param issue" | `api-contract` |

For TypeScript errors: `npm run type-check`. For smoke tests: `npm run frontend-test`.

---

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

---

## Local Commands

```bash
cd /Users/haras-gummer/data-observatory
npm run dev              # dev server at http://localhost:3000
npm run type-check       # TypeScript validation
npm run build            # production build check
npm run check            # lint + type-check + build (pre-commit gate)
npm run frontend-test    # Playwright smoke tests
npm run browser-review:before
npm run browser-review:after
```

---

## References

- `../data-agent/.github/copilot-instructions.md` — workspace orchestrator + handoff chains
- `../data-agent/api/` — FastAPI backend source
