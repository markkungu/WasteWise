#!/usr/bin/env bash
# run-tests.sh — Run the test suite for every WasteWise module and report results.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

PASS=0
FAIL=0
ERRORS=()

run_module() {
  local name="$1"
  local cmd="$2"
  local dir="$3"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  MODULE: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if (cd "$dir" && eval "$cmd"); then
    PASS=$((PASS + 1))
    echo ""
    echo "  ✅  $name — PASSED"
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("$name")
    echo ""
    echo "  ❌  $name — FAILED"
  fi
}

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          WasteWise — Full Test Suite             ║"
echo "╚══════════════════════════════════════════════════╝"

run_module "blockchain"       "npm test"                       "$ROOT/blockchain"
run_module "server"           "npm test"                       "$ROOT/server"
run_module "web-client"       "npm test"                       "$ROOT/web-client"
run_module "optimization"     "python3 -m pytest tests/ -v"    "$ROOT/optimization"
run_module "ai-verification"  "python3 -m pytest tests/ -v"    "$ROOT/ai-verification"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  RESULTS:  ✅ $PASS passed   ❌ $FAIL failed"
if [ ${#ERRORS[@]} -gt 0 ]; then
  echo "  FAILED:   ${ERRORS[*]}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
