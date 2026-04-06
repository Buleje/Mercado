#!/usr/bin/env bash
# scripts/cli-env.sh
#
# Setea el PATH para que gh, vercel y doppler estén disponibles en bash.
# Source este archivo antes de cualquier comando que use estos CLIs:
#
#   source scripts/cli-env.sh
#
# O ejecuta los comandos así:
#
#   bash -c 'source scripts/cli-env.sh && gh repo list Buleje'

export PATH="$PATH:/c/Program Files/GitHub CLI"
export PATH="$PATH:/c/Users/Usuario/AppData/Local/Microsoft/WinGet/Packages/Doppler.doppler_Microsoft.Winget.Source_8wekyb3d8bbwe"

# Vercel CLI vive en npm global (ya está en PATH via /c/Users/Usuario/AppData/Roaming/npm)

# Verificar instalación
if [ "$1" = "--check" ]; then
  echo "=== CLIs disponibles ==="
  command -v gh && gh --version | head -1 || echo "❌ gh no encontrado"
  command -v vercel && vercel --version || echo "❌ vercel no encontrado"
  command -v doppler && doppler --version | head -1 || echo "❌ doppler no encontrado"
fi
