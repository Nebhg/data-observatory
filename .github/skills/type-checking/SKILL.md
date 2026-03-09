---
name: type-checking
description: "Use when: a frontend change needs TypeScript validation, props or API types are failing, or the Next.js app needs a compile-time sanity check."
---

# Type Checking

Use this workflow for TypeScript safety before and after frontend edits.

## Commands

```bash
cd /Users/haras-gummer/data-observatory
.github/skills/type-checking/run.sh
```

## Checklist

1. Run the type check
2. Fix any TypeScript or path-resolution errors
3. Re-run until clean
4. If the change affects shared pages, finish with `npm run check`