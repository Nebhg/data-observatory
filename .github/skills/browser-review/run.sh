#!/usr/bin/env bash
set -euo pipefail

label="${1:-review}"
shift || true

REVIEW_LABEL="$label" npm run browser-review:capture -- "$@"