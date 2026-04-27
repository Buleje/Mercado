#!/usr/bin/env bash
# Launcher robusto para @playwright/mcp.
#
# Por qué existe:
#   - playwright-mcp por defecto invoca Chrome del sistema (`/opt/google/chrome/chrome`)
#     que en WSL/Docker requiere `sudo` para instalar.
#   - Aquí forzamos el chromium local que viene con `npx playwright install chromium`
#     y así NO necesitamos sudo.
#
# Cómo aplicar cambios después de editar este archivo:
#   1. Salir de Claude Code (`/quit` o Ctrl+D)
#   2. Reiniciar Claude Code en este directorio
#   3. El MCP server arrancará leyendo .mcp.json → este launcher
#
# Cómo verificar que está activo:
#   ps aux | grep playwright-mcp
#   (debería ver `node ./node_modules/.bin/playwright-mcp --executable-path …`)

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAYWRIGHT_CACHE="${PLAYWRIGHT_CACHE:-$HOME/.cache/ms-playwright}"

# 1. Localizar el binario de chromium local (instalado por playwright)
#    Preferimos la versión más reciente si hay varias.
CHROMIUM=""
for dir in "$PLAYWRIGHT_CACHE"/chromium-*/; do
  candidate="$dir/chrome-linux64/chrome"
  if [[ -x "$candidate" ]]; then
    CHROMIUM="$candidate"
  fi
done

if [[ -z "$CHROMIUM" ]]; then
  echo "[playwright-mcp-launcher] ERROR: chromium no encontrado en $PLAYWRIGHT_CACHE" >&2
  echo "                            Ejecuta: npx playwright install chromium" >&2
  exit 1
fi

# 2. Inyectar libs locales (cuando no hay sudo para apt-get install)
if [[ -d "$HOME/.local/chrome-libs/usr/lib/x86_64-linux-gnu" ]]; then
  export LD_LIBRARY_PATH="$HOME/.local/chrome-libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
fi

# 3. Auto-detect headless vs headed:
#    - En WSL con WSLg (DISPLAY/WAYLAND_DISPLAY presente) → headed (mejor para QA visual)
#    - Sin display (CI, container minimal) → headless
HEADLESS_FLAG=""
if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  HEADLESS_FLAG="--headless"
fi

# 4. Lanzar
#    --browser chrome → indica al MCP que use el motor Chromium-based
#    --executable-path → fuerza el chromium local (overridea el chrome del sistema)
#    --isolated → perfil temporal (no contamina el navegador del usuario)
exec node "$ROOT_DIR/node_modules/.bin/playwright-mcp" \
  --browser chrome \
  --executable-path "$CHROMIUM" \
  --isolated \
  $HEADLESS_FLAG \
  "$@"
