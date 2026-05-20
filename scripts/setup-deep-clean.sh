#!/usr/bin/env bash
# setup-deep-clean.sh — limpieza profunda segura del proyecto.
# Idempotente. DRY RUN por default. Pasar --execute para borrar de verdad.
# Brandon corre: bash scripts/setup-deep-clean.sh           (preview)
#                 bash scripts/setup-deep-clean.sh --execute  (borra)
set -euo pipefail

DRY=true
[ "${1:-}" = "--execute" ] && DRY=false

cd "$(dirname "$0")/.." || exit 1
PROJECT_ROOT="$PWD"

print_action() {
  if [ "$DRY" = true ]; then
    echo "  [DRY] $1"
  else
    echo "  [EXEC] $1"
  fi
}

echo "═══════════════════════════════════════════════════════════"
echo " setup-deep-clean.sh — $([ "$DRY" = true ] && echo "PREVIEW" || echo "EXECUTING")"
echo "═══════════════════════════════════════════════════════════"

# ─── 1. Worktrees auto-generados (Agent({isolation:'worktree'})) ─────────
echo
echo "▸ Worktrees auto-generados (>14 días, branch 'worktree-agent-*'):"
TO_PRUNE=$(git worktree list --porcelain | awk '/^worktree/{p=$2} /^branch/{b=$2} /^$/{if(p ~ /worktrees/ && b ~ /worktree-agent-/){print p}}' | while read p; do
  age=$(find "$p" -maxdepth 0 -printf "%T@\n" 2>/dev/null)
  age_days=$(( ( $(date +%s) - ${age%.*} ) / 86400 ))
  [ "$age_days" -ge 7 ] && echo "$p"
done)

if [ -n "$TO_PRUNE" ]; then
  COUNT=$(echo "$TO_PRUNE" | wc -l)
  echo "  Encontrados: $COUNT worktrees viejos"
  echo "$TO_PRUNE" | while read p; do
    size=$(du -sh "$p" 2>/dev/null | cut -f1)
    print_action "git worktree remove --force $p  ($size)"
    if [ "$DRY" = false ]; then
      git worktree remove --force "$p" 2>/dev/null || rm -rf "$p"
    fi
  done
else
  echo "  (ninguno — limpio)"
fi

# ─── 2. NPX caches huérfanos ─────────────────────────────────────────────
echo
echo "▸ NPX caches huérfanos (no asociados a procesos vivos):"
RUNNING_HASHES=$(pgrep -af "_npx" 2>/dev/null | grep -oE "_npx/[a-f0-9]+" | sed 's|_npx/||' | sort -u)
ALL_HASHES=$(ls /home/usuario/.npm/_npx/ 2>/dev/null)
ORPHANED=$(comm -23 <(echo "$ALL_HASHES" | sort) <(echo "$RUNNING_HASHES" | sort))

if [ -n "$ORPHANED" ]; then
  COUNT=$(echo "$ORPHANED" | wc -l)
  TOTAL_SIZE=$(echo "$ORPHANED" | xargs -I{} du -sh "/home/usuario/.npm/_npx/{}" 2>/dev/null | awk '{print $1}' | head -c 100)
  echo "  Encontrados: $COUNT caches huérfanos"
  echo "$ORPHANED" | while read h; do
    size=$(du -sh "/home/usuario/.npm/_npx/$h" 2>/dev/null | cut -f1)
    print_action "rm -rf /home/usuario/.npm/_npx/$h  ($size)"
    if [ "$DRY" = false ]; then
      rm -rf "/home/usuario/.npm/_npx/$h"
    fi
  done
else
  echo "  (ninguno)"
fi

# ─── 3. .next/cache (regenerable) ────────────────────────────────────────
echo
echo "▸ .next/cache:"
if [ -d .next/cache ]; then
  size=$(du -sh .next/cache 2>/dev/null | cut -f1)
  print_action "rm -rf .next/cache  ($size)"
  if [ "$DRY" = false ]; then
    rm -rf .next/cache
  fi
else
  echo "  (no existe)"
fi

# ─── 4. /tmp logs viejos (>7 días) ───────────────────────────────────────
echo
echo "▸ /tmp logs viejos (>7 días):"
COUNT=$(find /tmp -maxdepth 1 -name "*.log" -mtime +7 2>/dev/null | wc -l)
if [ "$COUNT" -gt 0 ]; then
  print_action "find /tmp -maxdepth 1 -name '*.log' -mtime +7 -delete  ($COUNT files)"
  if [ "$DRY" = false ]; then
    find /tmp -maxdepth 1 -name "*.log" -mtime +7 -delete 2>/dev/null
  fi
else
  echo "  (ninguno)"
fi

echo
echo "═══════════════════════════════════════════════════════════"
if [ "$DRY" = true ]; then
  echo " DRY RUN completo. Re-correr con --execute para aplicar."
else
  echo " ✓ Limpieza ejecutada."
  echo "   Verificá: du -sh .claude/worktrees ~/.npm/_npx"
fi
echo "═══════════════════════════════════════════════════════════"
