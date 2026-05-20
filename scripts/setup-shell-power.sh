#!/usr/bin/env bash
# setup-shell-power.sh — Brandon Buleje
# Aplica tweaks de máxima potencia al shell Ubuntu/WSL para Claude Code + Buleje.
# Idempotente: detecta marker y no duplica entradas. Backupea ~/.bashrc antes.
# Uso: bash scripts/setup-shell-power.sh
set -euo pipefail

BASHRC="${HOME}/.bashrc"
MARKER="# === BSM POWER TWEAKS (managed) ==="
BACKUP="${BASHRC}.bak.$(date +%Y%m%d-%H%M%S)"

if [ ! -f "$BASHRC" ]; then
  echo "[setup] ~/.bashrc no existe — creando."
  : > "$BASHRC"
fi

if grep -qF "$MARKER" "$BASHRC"; then
  echo "[setup] Bloque BSM ya presente en ~/.bashrc — nada que hacer."
  echo "        Para reaplicar: borrá el bloque entre los markers y volvé a correr."
  exit 0
fi

cp "$BASHRC" "$BACKUP"
echo "[setup] Backup guardado en: $BACKUP"

cat >> "$BASHRC" <<'EOF'

# === BSM POWER TWEAKS (managed) ===
# Auto-aplicado por scripts/setup-shell-power.sh — proyecto Buleje
# No editar manualmente entre los markers; re-correr el script regenera.

# Node memory cap (Turbopack/tsc/lint-staged no se mueren por SIGKILL en bulk ops)
export NODE_OPTIONS="--max-old-space-size=8192"

# File descriptors + procesos (Playwright + Turbopack + N workers abren muchos)
ulimit -n 1048576 2>/dev/null || true
ulimit -u 65535 2>/dev/null || true

# Pager sin paginación cuando es output corto (git, less)
export LESS="-FRX"

# Husky / post-commit hooks: NO correr vitest en post-commit local (CI lo cubre)
export HUSKY_SKIP_POSTCOMMIT=1

# Override mem-guard de Claude Code (solo si BSM_POWER=1 explícito)
# Descomentar SOLO si confiás en que no se va a colgar:
# export BSM_AUTOKILL=1

# --- Helpers ---
alias bsm-mem='free -h && echo --- && ps aux --sort=-%mem | head -10'
alias bsm-cpu='top -bn1 | head -20'
alias bsm-clean='pkill -9 -f "tsc --noEmit" 2>/dev/null; pkill -9 -f "chrome.*--headless" 2>/dev/null; echo "tsc + chromium huerfanos limpiados"'
alias bsm-zombies='ps -eo pid,ppid,cmd | awk "\$2==1 && (/chrome|chromium|tsc/)" | head -20'
alias bsm-port3000='lsof -i :3000 2>/dev/null || ss -ltnp | grep :3000'

# Auto-cargar nvm si existe (para que .nvmrc funcione)
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"

# cd-hook: auto-nvm-use al entrar al proyecto Buleje
bsm_cd_hook() {
  if [ -f .nvmrc ] && command -v nvm >/dev/null 2>&1; then
    local want
    want=$(cat .nvmrc 2>/dev/null | tr -d '[:space:]')
    if [ -n "$want" ] && [ "$(node -v 2>/dev/null)" != "v${want}" ]; then
      nvm use "$want" >/dev/null 2>&1 || true
    fi
  fi
}
if [[ "$PROMPT_COMMAND" != *bsm_cd_hook* ]]; then
  PROMPT_COMMAND="bsm_cd_hook;${PROMPT_COMMAND:-}"
fi
# === BSM POWER TWEAKS END ===
EOF

echo "[setup] Bloque BSM agregado a ~/.bashrc."
echo "[setup] Para activarlo en esta terminal: source ~/.bashrc"
echo "[setup] Para revertir: cp $BACKUP $BASHRC"
echo ""
echo "Comandos nuevos disponibles tras 'source ~/.bashrc':"
echo "  bsm-mem      → RAM + top 10 procesos por memoria"
echo "  bsm-cpu      → load + top procesos por CPU"
echo "  bsm-clean    → mata tsc + chromium huerfanos"
echo "  bsm-zombies  → lista procesos huerfanos (ppid=1)"
echo "  bsm-port3000 → quién está en puerto 3000"
