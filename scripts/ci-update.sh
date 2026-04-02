#!/usr/bin/env bash
# ci-update.sh — SigMap CI helper
#
# Regenerates AI context signatures and optionally fails the build if the
# token budget is exceeded. Designed for use in CI pipelines.
#
# Usage:
#   bash scripts/ci-update.sh [OPTIONS]
#
# Options:
#   --fail-over-budget    Exit 1 if output tokens exceed maxTokens budget
#   --track               Append run metrics to .context/usage.ndjson
#   --format cache        Also write Anthropic prompt-cache JSON sidecar
#   --json                Print machine-readable JSON report to stdout
#   --help                Show this message
#
# Examples:
#   # Basic CI run — regenerate and print report
#   bash scripts/ci-update.sh
#
#   # Fail the build if context is over budget (use in required CI checks)
#   bash scripts/ci-update.sh --fail-over-budget
#
#   # Track usage + generate JSON report for dashboards
#   bash scripts/ci-update.sh --track --json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE="${NODE_BINARY:-node}"

FAIL_OVER_BUDGET=false
TRACK=false
FORMAT_CACHE=false
JSON_REPORT=false

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fail-over-budget) FAIL_OVER_BUDGET=true ;;
    --track)            TRACK=true ;;
    --format)           shift; [[ "${1:-}" == "cache" ]] && FORMAT_CACHE=true ;;
    --json)             JSON_REPORT=true ;;
    --help|-h)
      sed -n '/^# Usage:/,/^[^#]/{ /^#/p; /^[^#]/q }' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "[ci-update] Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

# ── Build gen-context.js argument list ───────────────────────────────────────
GEN_ARGS=()
[[ "$TRACK" == true ]]        && GEN_ARGS+=(--track)
[[ "$FORMAT_CACHE" == true ]] && GEN_ARGS+=(--format cache)

# ── Step 1: Regenerate context ───────────────────────────────────────────────
echo "[ci-update] Regenerating context signatures..."
"$NODE" "$REPO_ROOT/gen-context.js" "${GEN_ARGS[@]}"

# ── Step 2: Print token report ───────────────────────────────────────────────
REPORT_ARGS=(--report)
[[ "$JSON_REPORT" == true ]] && REPORT_ARGS+=(--json)

if [[ "$FAIL_OVER_BUDGET" == true ]]; then
  # --report --json exits 1 when over budget — propagate that exit code
  echo "[ci-update] Checking token budget (fails build if exceeded)..."
  "$NODE" "$REPO_ROOT/gen-context.js" "${REPORT_ARGS[@]}" --json
else
  "$NODE" "$REPO_ROOT/gen-context.js" "${REPORT_ARGS[@]}" || true
fi

echo "[ci-update] Done."
