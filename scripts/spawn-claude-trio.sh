#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# spawn-claude-trio.sh — Ejecuta 3 sesiones Claude Code en worktrees paralelos
#
# Uso:
#   ./scripts/spawn-claude-trio.sh "tarea-A" "tarea-B" "tarea-C"
#   ./scripts/spawn-claude-trio.sh  (usa tareas predeterminadas)
#
# Cada worktree tiene su propio branch, su propia sesión Claude, y su
# propio contexto. El coordinador en main mergea cuando todos terminan.
#
# Referencia: ADR-032 (Worktrees paralelos para output 3x)
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREE_BASE="$REPO_ROOT/.worktrees"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
MAX_TOKENS=500000
LOG_DIR="$REPO_ROOT/logs/worktree-runs"

# Tareas predeterminadas (si no se pasan argumentos)
TASK_A="${1:-Auditar y mejorar los 5 endpoints más críticos de app/api/}"
TASK_B="${2:-Escribir tests faltantes para lib/db/ (coverage > 80%)}"
TASK_C="${3:-Optimizar bundle size de las 3 páginas más pesadas}"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Funciones ─────────────────────────────────────────────────────────────

log() {
  echo -e "${BLUE}[trio]${NC} $1"
}

create_worktree() {
  local name="$1"
  local branch="wt-${name}-${TIMESTAMP}"
  local path="${WORKTREE_BASE}/${name}"

  log "Creando worktree ${YELLOW}${name}${NC} en branch ${branch}..."

  # Limpiar worktree anterior si existe
  if [ -d "$path" ]; then
    git -C "$REPO_ROOT" worktree remove "$path" --force 2>/dev/null || rm -rf "$path"
  fi

  # Crear branch y worktree
  git -C "$REPO_ROOT" branch -D "$branch" 2>/dev/null || true
  git -C "$REPO_ROOT" worktree add "$path" -b "$branch" 2>/dev/null

  echo "$branch"
}

run_claude_in_worktree() {
  local name="$1"
  local task="$2"
  local path="${WORKTREE_BASE}/${name}"
  local log_file="${LOG_DIR}/${name}-${TIMESTAMP}.log"

  log "Lanzando Claude en ${YELLOW}${name}${NC}..."

  mkdir -p "$LOG_DIR"

  # Ejecutar Claude Code en el worktree
  (
    cd "$path"
    claude -p "
    Estás en el worktree '${name}' del proyecto Bodega San Martín.
    Directorio: $(pwd)
    Branch: $(git branch --show-current)

    Tu tarea:
    ${task}

    Reglas:
    - Sigue CLAUDE.md del proyecto
    - Commitea con Conventional Commits cuando termines
    - Corre npm run lint && npx tsc --noEmit && npm run test al final
    - Si algo falla, usa /self-heal (máx 3 intentos)
    - Sé conciso en el output
    " --dangerously-skip-permissions --max-tokens "$MAX_TOKENS" 2>&1
  ) > "$log_file" 2>&1 &

  echo $!
}

cleanup_worktree() {
  local name="$1"
  local path="${WORKTREE_BASE}/${name}"

  if [ -d "$path" ]; then
    git -C "$REPO_ROOT" worktree remove "$path" --force 2>/dev/null || true
  fi
}

merge_worktree() {
  local name="$1"
  local branch="$2"

  log "Mergeando ${YELLOW}${name}${NC} (${branch}) a $(git -C "$REPO_ROOT" branch --show-current)..."

  cd "$REPO_ROOT"
  git merge "$branch" --no-edit 2>/dev/null || {
    log "${RED}Conflicto en merge de ${name}. Resolver manualmente.${NC}"
    return 1
  }

  log "${GREEN}✅ ${name} mergeado exitosamente${NC}"
}

# ── Main ──────────────────────────────────────────────────────────────────

log "═══════════════════════════════════════════"
log "  🚀 Claude Trio — 3 worktrees paralelos"
log "═══════════════════════════════════════════"
log ""
log "Tarea A: ${TASK_A}"
log "Tarea B: ${TASK_B}"
log "Tarea C: ${TASK_C}"
log ""

# Crear worktrees
BRANCH_A=$(create_worktree "alpha")
BRANCH_B=$(create_worktree "bravo")
BRANCH_C=$(create_worktree "charlie")

log ""
log "Worktrees creados. Lanzando 3 sesiones Claude..."
log ""

# Lanzar las 3 sesiones en paralelo
PID_A=$(run_claude_in_worktree "alpha" "$TASK_A")
PID_B=$(run_claude_in_worktree "bravo" "$TASK_B")
PID_C=$(run_claude_in_worktree "charlie" "$TASK_C")

log "PIDs: alpha=$PID_A bravo=$PID_B charlie=$PID_C"
log ""
log "Esperando a que terminen... (puede tomar 10-30 min)"
log "Logs en: $LOG_DIR/"
log ""

# Esperar a que terminen
FAIL=0
wait $PID_A || { log "${RED}❌ Alpha falló${NC}"; FAIL=$((FAIL+1)); }
log "${GREEN}✅ Alpha terminó${NC}"

wait $PID_B || { log "${RED}❌ Bravo falló${NC}"; FAIL=$((FAIL+1)); }
log "${GREEN}✅ Bravo terminó${NC}"

wait $PID_C || { log "${RED}❌ Charlie falló${NC}"; FAIL=$((FAIL+1)); }
log "${GREEN}✅ Charlie terminó${NC}"

log ""
log "═══════════════════════════════════════════"
log "  Resultados: $((3-FAIL))/3 exitosos"
log "═══════════════════════════════════════════"
log ""

# Mergear resultados
if [ $FAIL -lt 3 ]; then
  log "Mergeando resultados a branch principal..."
  [ $PID_A ] && merge_worktree "alpha" "$BRANCH_A"
  [ $PID_B ] && merge_worktree "bravo" "$BRANCH_B"
  [ $PID_C ] && merge_worktree "charlie" "$BRANCH_C"
fi

# Limpiar worktrees
log "Limpiando worktrees..."
cleanup_worktree "alpha"
cleanup_worktree "bravo"
cleanup_worktree "charlie"

log ""
log "${GREEN}🏁 Claude Trio completado. Revisa logs en ${LOG_DIR}/${NC}"
