#!/usr/bin/env bash
# ============================================================================
# pre-commit-lock-check.sh — Valida que los archivos staged esten en el lock
# del frente actual (segun branch name).
#
# FLUJO_PRO Waves: cada frente solo puede tocar archivos declarados en LOCKS.md
# Si un archivo staged no esta en el lock del frente → exit 1.
#
# Deteccion de frente:
#   Branch wt/roadmap-bugs     → frente-back
#   Branch wt/roadmap-features → frente-front
#   Branch wt/roadmap-tier-a   → frente-qa
#   Cualquier otro branch      → skip (no es worktree, no aplica)
#
# Diseño: parsear LOCKS.md buscando la seccion del frente activo,
# extraer los paths declarados, y comparar contra git staged files.
# ============================================================================

set -euo pipefail

LOCKS_FILE=".claude/LOCKS.md"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Determinar frente segun branch
case "$BRANCH" in
  wt/roadmap-bugs)     FRENTE="frente-back" ;;
  wt/roadmap-features) FRENTE="frente-front" ;;
  wt/roadmap-tier-a)   FRENTE="frente-qa" ;;
  *)
    # No es un branch de worktree — skip check
    exit 0
    ;;
esac

# Si no existe LOCKS.md, skip
if [ ! -f "$LOCKS_FILE" ]; then
  echo "[lock-check] LOCKS.md no encontrado — skipping"
  exit 0
fi

# Extraer archivos declarados en la seccion del frente
# Busca lineas con backticks dentro de la seccion del frente
SECTION_START="### $FRENTE"
SECTION_END="^### "

DECLARED_FILES=$(
  awk -v start="$SECTION_START" -v end="$SECTION_END" '
    $0 ~ start { found=1; next }
    found && $0 ~ end { found=0 }
    found && /`[^`]+`/ {
      match($0, /`([^`]+)`/, arr)
      if (arr[1] != "" && arr[1] !~ /^\[/) print arr[1]
    }
  ' "$LOCKS_FILE" 2>/dev/null
)

# Si no hay archivos declarados, permitir todo (locks vacios = ola sin plan)
if [ -z "$DECLARED_FILES" ]; then
  exit 0
fi

# Obtener archivos staged
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Validar cada archivo staged
VIOLATIONS=""
while IFS= read -r staged_file; do
  # Ignorar archivos de coordinacion (.claude/REPORTS/, etc.)
  if [[ "$staged_file" == .claude/REPORTS/* ]] || \
     [[ "$staged_file" == .claude/COORDINATION.md ]] || \
     [[ "$staged_file" == .claude/LOCKS.md ]]; then
    continue
  fi

  # Verificar si el archivo staged esta en la lista declarada
  FOUND=0
  while IFS= read -r declared; do
    # Match exacto o match parcial (declarado puede ser prefijo)
    if [[ "$staged_file" == "$declared" ]] || \
       [[ "$staged_file" == "$declared"* ]] || \
       [[ "$declared" == *"(crear)"* && "$staged_file" == "${declared%% *}" ]]; then
      FOUND=1
      break
    fi
  done <<< "$DECLARED_FILES"

  if [ "$FOUND" -eq 0 ]; then
    VIOLATIONS="$VIOLATIONS\n  - $staged_file"
  fi
done <<< "$STAGED_FILES"

if [ -n "$VIOLATIONS" ]; then
  echo ""
  echo "================================================================"
  echo " LOCK VIOLATION — $FRENTE (branch: $BRANCH)"
  echo "================================================================"
  echo ""
  echo " Estos archivos NO estan declarados en LOCKS.md para $FRENTE:"
  echo -e "$VIOLATIONS"
  echo ""
  echo " Opciones:"
  echo "   1. Agregar el archivo a LOCKS.md en la seccion de $FRENTE"
  echo "   2. Mover el cambio al frente correcto"
  echo "   3. Pedir al orchestrator que reasigne"
  echo ""
  echo "================================================================"
  exit 1
fi

exit 0
