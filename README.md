# Data Observatory

`data-observatory` is the Next.js frontend for the shared data product built with the sibling `data-agent` backend repository.

## What This Repo Owns

- UI pages and layouts in `src/app/`
- Shared components in `src/components/`
- Frontend API helpers and types in `src/lib/api.ts`
- Local browser-review and smoke-test flows in `tests/browser-review/`

## Backend Dependency

This repo expects the FastAPI backend from `data-agent` to be available.

- Local browser traffic calls `/api/*`
- `next.config.ts` rewrites those calls to `INTERNAL_API_URL`
- Default local backend URL: `http://localhost:8000`

## Local Development

### Full product

```bash
cd /Users/haras-gummer/data-agent
docker-compose up
```

### Frontend only

```bash
cd /Users/haras-gummer/data-observatory
npm install
npm run dev
```

Useful URLs:

- Frontend: `http://localhost:3000`
- Backend API via proxy: `http://localhost:3000/api/*`
- Direct backend health check: `http://localhost:8000/api/health`

## Validation Commands

```bash
npm run lint
npm run type-check
npm run build
npm run check
```

## Browser Review Workflow

Use browser review for UI-impacting changes.

```bash
npm run browser-review:before
# make the UI change
npm run browser-review:after
```

Outputs are written to `test-results/browser-review/`.

If you want the Playwright HTML report:

```bash
npm run browser-review:report
```

## Playwright Setup

Install the local browser dependency once:

```bash
npm run playwright:install
```

Run the smoke test flow:

```bash
npm run frontend-test
```

## Cross-Repo Workflow

This repo participates in a shared workflow with `data-agent`.

- `data-agent` remains the control plane for deployment orchestration and shared workflow policy
- Cross-repo features should use linked issues in both repos plus a shared GitHub Project item
- API-contract changes should not be considered done until both repos are aligned

See `data-agent/docs/MULTI_REPO_WORKFLOW.md` in the backend repo for the canonical shared workflow policy.