---
name: api-contract
description: "Use when: a frontend page breaks because an endpoint changed, query params no longer match, or the API contract between data-observatory and data-agent needs review."
---

# API Contract Review

This is the current lightweight contract workflow until the backend exposes a formal generated OpenAPI contract for the frontend.

## Workflow

1. Inspect the frontend request helpers in `src/lib/api.ts`
2. Compare the relevant calls with the backend API implementation in the sibling `../data-agent/api/` repo
3. Run the local contract check:

```bash
cd /Users/haras-gummer/data-observatory
.github/skills/api-contract/run.sh
```

4. If the API changed, treat the task as cross-repo work and require linked issues plus coordinated release refs

## Notes

- This workflow currently uses type-check and build as the executable gate
- Use `data-eng` when the contract question overlaps with data modelling or backend semantics

## Gate Checklist (must all pass before handing back)

- [ ] `npm run type-check` passes with zero errors
- [ ] `npm run build` succeeds (no compile-time failures)
- [ ] All affected `src/lib/api.ts` types updated to match current backend response shapes
- [ ] All UI components consuming the changed endpoint reviewed and updated
- [ ] No `any` types introduced as workarounds
- [ ] If params changed: query param names in fetch helpers match backend route exactly

When all items checked, return to `orchestrator` with:
```
{
  handoff: "API_CONTRACT_CHANGE",
  gate: "passed",
  files_changed: ["src/lib/api.ts", ...],
  summary: "<what changed and why>"
}
```