#!/usr/bin/env bash
# Stand-alone launcher for Agent Alpha. Called by start_squad.sh via wt.
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"
PROMPT_FILE="$SCRIPT_DIR/.alpha.prompt"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: prompt file missing at $PROMPT_FILE" >&2
  echo "Run start_squad.sh once to generate it." >&2
  read -p "Press Enter to close..."
  exit 1
fi

cd "$PROJECT_ROOT"
echo "================================================================"
echo "  AGENT ALPHA — Architect Lead"
echo "  Project: $PROJECT_ROOT"
echo "  Prompt:  $PROMPT_FILE"
echo "================================================================"
echo ""
echo "First move: read .claude/squad/orchestrator.json and claim a task"
echo "where allowed_agents contains 'alpha'."
echo ""

PROMPT_CONTENT="$(cat "$PROMPT_FILE")"
exec claude --append-system-prompt "$PROMPT_CONTENT" --permission-mode acceptEdits
