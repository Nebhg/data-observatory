---
name: browser-review
description: "Use when: reviewing a UI before and after a change, capturing localhost screenshots, checking layouts visually, or validating a frontend redesign."
---

# Browser Review

Use this workflow for UI-impacting changes only.

## Setup

Start the product locally before running captures:

```bash
cd /Users/haras-gummer/data-agent
docker-compose up
```

Or run the frontend directly if the backend is already running:

```bash
cd /Users/haras-gummer/data-observatory
npm run dev
```

## Workflow

1. Capture the current state:

```bash
.github/skills/browser-review/run.sh before
```

2. Make the UI change.

3. Capture the updated state:

```bash
.github/skills/browser-review/run.sh after
```

4. Review the outputs in `test-results/browser-review/`.

5. If you need the interactive Playwright report:

```bash
npm run browser-review:report
```

## Notes

- Keep review artifacts local by default.
- Use the same route and viewport for before/after capture.
- Pair visual review with `npm run type-check` before closing the task.