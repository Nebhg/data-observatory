---
name: frontend-testing
description: "Use when: running a frontend smoke test, validating key routes with Playwright, or checking whether a UI change caused a browser-level regression."
---

# Frontend Testing

Use this workflow for repeatable browser-level checks against localhost.

## Setup

Make sure the frontend is running and the backend API is reachable.

## Commands

```bash
cd /Users/haras-gummer/data-observatory
.github/skills/frontend-testing/run.sh
```

## Notes

- The default smoke coverage focuses on key routes used during product development
- Keep visual-review captures separate from smoke-test verification when iterating on layouts