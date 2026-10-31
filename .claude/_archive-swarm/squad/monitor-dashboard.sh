#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# monitor-dashboard.sh — live squad status dashboard
#
# Prints a color-coded snapshot of orchestrator.json every N seconds.
# No dependency on jq (uses node instead, which is always available in the
# bodega-san-martin dev environment).
#
# Usage:
#   ./monitor-dashboard.sh           # refresh every 3 seconds
#   ./monitor-dashboard.sh 10        # refresh every 10 seconds
#   ./monitor-dashboard.sh --once    # print once and exit
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ORCH="$SCRIPT_DIR/orchestrator.json"
EVENTS="$SCRIPT_DIR/events.log"
LOGS_DIR="$SCRIPT_DIR/logs"

INTERVAL="${1:-3}"
ONCE=0
if [[ "${1:-}" == "--once" ]]; then
  ONCE=1
  INTERVAL=0
fi

# ANSI colors
readonly C_RESET='\033[0m'
readonly C_BOLD='\033[1m'
readonly C_DIM='\033[2m'
readonly C_GRAY='\033[90m'
readonly C_RED='\033[31m'
readonly C_GREEN='\033[32m'
readonly C_YELLOW='\033[33m'
readonly C_BLUE='\033[34m'
readonly C_MAGENTA='\033[35m'
readonly C_CYAN='\033[36m'
readonly C_WHITE='\033[97m'

status_color() {
  case "$1" in
    pending)     printf '%b' "$C_GRAY" ;;
    in_progress) printf '%b' "$C_YELLOW" ;;
    review)      printf '%b' "$C_BLUE" ;;
    done)        printf '%b' "$C_GREEN" ;;
    blocked)     printf '%b' "$C_RED" ;;
    *)           printf '%b' "$C_WHITE" ;;
  esac
}

status_icon() {
  case "$1" in
    pending)     echo "⏳" ;;
    in_progress) echo "🔨" ;;
    review)      echo "🔍" ;;
    done)        echo "✅" ;;
    blocked)     echo "🚫" ;;
    *)           echo "❓" ;;
  esac
}

render_snapshot() {
  if [[ ! -f "$ORCH" ]]; then
    printf '%borchestrator.json not found at %s%b\n' "$C_RED" "$ORCH" "$C_RESET"
    return
  fi

  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  clear
  printf '%b╔════════════════════════════════════════════════════════════════════╗%b\n' "$C_CYAN" "$C_RESET"
  printf '%b║  BODEGA SAN MARTIN — SQUAD DASHBOARD                               ║%b\n' "$C_CYAN" "$C_RESET"
  printf '%b║  %b%s%b                                       ║%b\n' "$C_CYAN" "$C_DIM" "$now" "$C_CYAN" "$C_RESET"
  printf '%b╚════════════════════════════════════════════════════════════════════╝%b\n' "$C_CYAN" "$C_RESET"
  printf '\n'

  # Parse and render with node (no jq dependency)
  node - <<NODE_EOF
const fs = require('fs');
const path = '$ORCH';
const raw = fs.readFileSync(path, 'utf8');
const data = JSON.parse(raw);

const C_RESET = '\x1b[0m';
const C_BOLD = '\x1b[1m';
const C_DIM = '\x1b[2m';
const C_GRAY = '\x1b[90m';
const C_RED = '\x1b[31m';
const C_GREEN = '\x1b[32m';
const C_YELLOW = '\x1b[33m';
const C_BLUE = '\x1b[34m';
const C_CYAN = '\x1b[36m';
const C_WHITE = '\x1b[97m';

const statusColor = s => ({
  pending: C_GRAY,
  in_progress: C_YELLOW,
  review: C_BLUE,
  done: C_GREEN,
  blocked: C_RED,
}[s] || C_WHITE);

const statusIcon = s => ({
  pending: '[PEND]',
  in_progress: '[WORK]',
  review: '[REVW]',
  done: '[DONE]',
  blocked: '[BLOK]',
}[s] || '[????]');

// Agents
console.log(C_BOLD + 'AGENTS' + C_RESET);
for (const [id, a] of Object.entries(data.agents || {})) {
  const st = a.status || 'offline';
  const color = st === 'offline' ? C_GRAY : C_GREEN;
  console.log(\`  \${color}[\${id.padEnd(5)}]\${C_RESET} \${a.role.padEnd(20)} \${color}\${st}\${C_RESET}\`);
}
console.log('');

// Shared state
const sh = data.shared_state || {};
console.log(C_BOLD + 'SHARED STATE' + C_RESET);
console.log(\`  Sprint:         \${C_CYAN}\${sh.current_sprint || '?'} — \${sh.sprint_name || ''}\${C_RESET}\`);
console.log(\`  Active agents:  \${(sh.active_agents || []).length}\`);
console.log(\`  Locked files:   \${(sh.locked_files || []).length}\`);
if ((sh.locked_files || []).length > 0) {
  for (const lf of sh.locked_files) {
    console.log(\`    \${C_YELLOW}-\${C_RESET} \${lf.path} \${C_DIM}(\${lf.agent})\${C_RESET}\`);
  }
}
console.log('');

// Tasks
console.log(C_BOLD + 'TASKS' + C_RESET);
const counts = { pending: 0, in_progress: 0, review: 0, done: 0, blocked: 0 };
for (const t of data.tasks || []) {
  counts[t.status] = (counts[t.status] || 0) + 1;
  const color = statusColor(t.status);
  const icon = statusIcon(t.status);
  const agent = t.assigned_agent ? \` <- \${t.assigned_agent}\` : '';
  const prio = (t.priority || '').padEnd(6);
  console.log(\`  \${color}\${icon} \${t.task_id}\${C_RESET} \${C_DIM}[\${prio}]\${C_RESET} \${t.title}\${C_DIM}\${agent}\${C_RESET}\`);
}
console.log('');

// Summary line
const summary = [
  \`\${C_GRAY}pending: \${counts.pending}\${C_RESET}\`,
  \`\${C_YELLOW}in_progress: \${counts.in_progress}\${C_RESET}\`,
  \`\${C_BLUE}review: \${counts.review}\${C_RESET}\`,
  \`\${C_GREEN}done: \${counts.done}\${C_RESET}\`,
].join(' | ');
console.log(C_BOLD + 'SUMMARY' + C_RESET + ': ' + summary);
NODE_EOF

  # Tail of events.log
  if [[ -f "$EVENTS" ]]; then
    printf '\n%bRECENT EVENTS%b\n' "$C_BOLD" "$C_RESET"
    tail -n 5 "$EVENTS" | sed "s/^/  /"
  fi

  # Running agent processes
  printf '\n%bLIVE PROCESSES%b\n' "$C_BOLD" "$C_RESET"
  local n_claude
  n_claude=$(tasklist //FI "IMAGENAME eq claude.exe" //FO CSV 2>/dev/null | tail -n +2 | wc -l || echo 0)
  printf '  claude.exe instances: %b%s%b\n' "$C_CYAN" "$n_claude" "$C_RESET"

  # Latest log files
  if [[ -d "$LOGS_DIR" ]]; then
    printf '\n%bAGENT LOGS%b\n' "$C_BOLD" "$C_RESET"
    for f in "$LOGS_DIR"/*.log; do
      [[ -f "$f" ]] || continue
      local size
      size=$(stat -c %s "$f" 2>/dev/null || echo 0)
      local name
      name=$(basename "$f")
      printf '  %s %b(%sB)%b\n' "$name" "$C_DIM" "$size" "$C_RESET"
    done
  fi

  if (( ONCE == 0 )); then
    printf '\n%bPress Ctrl+C to stop. Refreshing in %ss...%b\n' "$C_DIM" "$INTERVAL" "$C_RESET"
  fi
}

if (( ONCE == 1 )); then
  render_snapshot
  exit 0
fi

# Live loop
trap 'printf "\n%bstopped%b\n" "\033[90m" "\033[0m"; exit 0' INT TERM
while true; do
  render_snapshot
  sleep "$INTERVAL"
done
