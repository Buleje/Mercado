#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# start_squad.sh — launch the Alpha / Beta / Gamma autonomous squad
#
# Boots three Claude Code instances, each with a role-specific system prompt,
# pointed at the shared orchestrator.json. Works on Warp (if warp-cli exists),
# Windows Terminal (wt), or plain new shells as a fallback.
#
# Usage:
#   ./start_squad.sh              # launch all three agents
#   ./start_squad.sh alpha        # launch only Alpha
#   ./start_squad.sh --dry-run    # print the commands without executing
#
# The three shells will each open `claude` with:
#   - an append-system-prompt derived from agent_roles.md
#   - the working directory set to bodega-san-martin/
#   - permission mode acceptEdits (autonomous)
# ---------------------------------------------------------------------------

set -euo pipefail

# -------- resolve paths --------
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SQUAD_DIR="$SCRIPT_DIR"
PROJECT_ROOT="$( cd "$SQUAD_DIR/../.." && pwd )"   # -> bodega-san-martin/
ORCHESTRATOR="$SQUAD_DIR/orchestrator.json"
ROLES_FILE="$SQUAD_DIR/agent_roles.md"
EVENTS_LOG="$SQUAD_DIR/events.log"

# Windows-friendly absolute path (Git Bash reports /c/... but `claude` on
# Windows prefers C:\...). Convert if cygpath exists.
if command -v cygpath >/dev/null 2>&1; then
  PROJECT_ROOT_NATIVE="$(cygpath -w "$PROJECT_ROOT")"
else
  PROJECT_ROOT_NATIVE="$PROJECT_ROOT"
fi

# -------- sanity checks --------
if [[ ! -f "$ORCHESTRATOR" ]]; then
  echo "ERROR: orchestrator.json not found at $ORCHESTRATOR" >&2
  exit 1
fi
if [[ ! -f "$ROLES_FILE" ]]; then
  echo "ERROR: agent_roles.md not found at $ROLES_FILE" >&2
  exit 1
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: 'claude' CLI not in PATH. Install with: npm i -g @anthropic-ai/claude-code" >&2
  exit 1
fi

# -------- parse flags --------
DRY_RUN=0
WHICH="${1:-all}"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  WHICH="${2:-all}"
fi

# -------- extract each agent's system prompt from agent_roles.md --------
# Each prompt is inside a fenced ``` block immediately under its heading.
extract_prompt() {
  local role_tag="$1"
  awk -v tag="$role_tag" '
    $0 ~ "## Agent " tag { found=1; next }
    found && /^## / { exit }
    found && /^```$/ { inside=!inside; next }
    found && inside { print }
  ' "$ROLES_FILE"
}

ALPHA_PROMPT="$(extract_prompt Alpha)"
BETA_PROMPT="$(extract_prompt Beta)"
GAMMA_PROMPT="$(extract_prompt Gamma)"

if [[ -z "$ALPHA_PROMPT" || -z "$BETA_PROMPT" || -z "$GAMMA_PROMPT" ]]; then
  echo "ERROR: could not extract one or more prompts from $ROLES_FILE" >&2
  exit 1
fi

# Cache the prompts to small files so we can pass them safely on the CLI.
ALPHA_FILE="$SQUAD_DIR/.alpha.prompt"
BETA_FILE="$SQUAD_DIR/.beta.prompt"
GAMMA_FILE="$SQUAD_DIR/.gamma.prompt"
printf '%s\n' "$ALPHA_PROMPT" > "$ALPHA_FILE"
printf '%s\n' "$BETA_PROMPT"  > "$BETA_FILE"
printf '%s\n' "$GAMMA_PROMPT" > "$GAMMA_FILE"

# -------- detect terminal launcher --------
LAUNCHER="fallback"
if command -v warp-cli >/dev/null 2>&1; then
  LAUNCHER="warp"
elif command -v wt >/dev/null 2>&1 || command -v wt.exe >/dev/null 2>&1; then
  LAUNCHER="wt"
elif command -v gnome-terminal >/dev/null 2>&1; then
  LAUNCHER="gnome"
elif command -v osascript >/dev/null 2>&1; then
  LAUNCHER="osascript"
fi

echo "Launcher detected: $LAUNCHER"
echo "Project root:      $PROJECT_ROOT_NATIVE"
echo "Orchestrator:      $ORCHESTRATOR"
echo ""

# -------- per-agent launcher scripts --------
# Each agent has its own stand-alone launcher under .claude/squad/launch-<role>.sh.
# We call those directly from wt/warp/etc — no nested quoting, no string mangling.
ALPHA_LAUNCHER="$SQUAD_DIR/launch-alpha.sh"
BETA_LAUNCHER="$SQUAD_DIR/launch-beta.sh"
GAMMA_LAUNCHER="$SQUAD_DIR/launch-gamma.sh"

for f in "$ALPHA_LAUNCHER" "$BETA_LAUNCHER" "$GAMMA_LAUNCHER"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: launcher missing: $f" >&2
    exit 1
  fi
  chmod +x "$f" 2>/dev/null || true
done

# For wt on Windows we need the launcher as a native path so bash-from-wt can
# find it without depending on cwd tricks.
if command -v cygpath >/dev/null 2>&1; then
  ALPHA_LAUNCHER_NATIVE="$(cygpath -w "$ALPHA_LAUNCHER")"
  BETA_LAUNCHER_NATIVE="$(cygpath -w "$BETA_LAUNCHER")"
  GAMMA_LAUNCHER_NATIVE="$(cygpath -w "$GAMMA_LAUNCHER")"
else
  ALPHA_LAUNCHER_NATIVE="$ALPHA_LAUNCHER"
  BETA_LAUNCHER_NATIVE="$BETA_LAUNCHER"
  GAMMA_LAUNCHER_NATIVE="$GAMMA_LAUNCHER"
fi

ALPHA_CMD="$ALPHA_LAUNCHER"
BETA_CMD="$BETA_LAUNCHER"
GAMMA_CMD="$GAMMA_LAUNCHER"

# -------- launch a single tab/window for one agent --------
# cmd is the absolute path to launch-<role>.sh (a standalone bash script).
launch_agent() {
  local name="$1" launcher="$2"
  local title="Squad-${name^}"

  echo ">> Launching $title"
  if (( DRY_RUN )); then
    echo "   [dry-run] bash $launcher"
    return
  fi

  case "$LAUNCHER" in
    warp)
      warp-cli run --new-tab --title "$title" -- bash "$launcher"
      ;;
    wt)
      # Windows Terminal: open a new tab in the focused window, run bash against
      # the stand-alone launcher. No nested quoting. The `-d` flag sets the
      # starting directory. We also pass --title for the tab label.
      wt -w 0 nt -d "$PROJECT_ROOT_NATIVE" --title "$title" \
        bash -lc "$launcher; exec bash" 2>/dev/null \
      || wt.exe -w 0 nt -d "$PROJECT_ROOT_NATIVE" --title "$title" \
        bash -lc "$launcher; exec bash"
      ;;
    gnome)
      gnome-terminal --tab --title="$title" -- bash -lc "$launcher; exec bash"
      ;;
    osascript)
      osascript -e "tell app \"Terminal\" to do script \"bash '$launcher'\""
      ;;
    fallback)
      if command -v start >/dev/null 2>&1; then
        start "$title" bash -lc "$launcher; exec bash"
      else
        ( bash -lc "$launcher" & )
      fi
      ;;
  esac

  printf '[%s] launched %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$name" >> "$EVENTS_LOG"
  sleep 1
}

# -------- dispatch --------
case "$WHICH" in
  alpha) launch_agent alpha "$ALPHA_CMD" ;;
  beta)  launch_agent beta  "$BETA_CMD"  ;;
  gamma) launch_agent gamma "$GAMMA_CMD" ;;
  all)
    launch_agent alpha "$ALPHA_CMD"
    launch_agent beta  "$BETA_CMD"
    launch_agent gamma "$GAMMA_CMD"
    ;;
  *)
    echo "Unknown target: $WHICH" >&2
    echo "Usage: $0 [alpha|beta|gamma|all] [--dry-run]" >&2
    exit 2
    ;;
esac

echo ""
echo "Squad dispatched."
echo "Watch shared state:"
echo "  tail -f \"$EVENTS_LOG\""
echo "  watch -n 2 \"jq '.tasks[] | {task_id, status, assigned_agent}' \\\"$ORCHESTRATOR\\\"\""
