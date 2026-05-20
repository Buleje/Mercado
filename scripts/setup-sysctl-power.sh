#!/usr/bin/env bash
# setup-sysctl-power.sh — kernel tweaks para vibe-coding obsesivo en WSL.
# REQUIERE SUDO. Idempotente — sobrescribe /etc/sysctl.d/99-buleje-power.conf.
# Brandon corre una vez: sudo bash scripts/setup-sysctl-power.sh
set -euo pipefail

CONF=/etc/sysctl.d/99-buleje-power.conf

if [ "$(id -u)" -ne 0 ]; then
  echo "Requiere sudo. Correr: sudo bash $0"
  exit 1
fi

cat > "$CONF" <<'EOF'
# /etc/sysctl.d/99-buleje-power.conf — managed
# Brandon Buleje · vibe-coding obsesivo para proyecto Mercado

# === inotify (file watchers — Next HMR, Playwright, watch tasks) ===
# Default: 128 instances — agotado en 5min con Next + Storybook + nodemon
fs.inotify.max_user_watches    = 524288
fs.inotify.max_user_instances  = 8192
fs.inotify.max_queued_events   = 32768

# === Memoria — no swapear si hay RAM ===
# Default 60 = swapeo agresivo (SSD lo aguanta pero quema escrituras)
vm.swappiness          = 10
# Default 100 = balanceado; 50 = retener metadata FS (git/find más rápidos)
vm.vfs_cache_pressure  = 50
# Default dirty_ratio=20 = hasta 20% RAM en dirty pages antes de forzar flush
vm.dirty_background_ratio = 5
vm.dirty_ratio            = 15

# === Network — para Vercel deploys, Supabase, npm registry ===
net.core.somaxconn          = 65535
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_fastopen       = 3
net.ipv4.tcp_slow_start_after_idle = 0

# === Descriptores de archivo — Playwright + Turbopack + workers ===
fs.file-max = 2097152

# === Permite procesos grandes (Turbopack, tsc en bulk) ===
kernel.pid_max = 4194304
EOF

echo "Escrito: $CONF"
echo
echo "Aplicando ahora (sin reboot):"
sysctl --system 2>&1 | grep -E "(99-buleje|fs.inotify|vm.swap|net.core.soma)" | head -20
echo
echo "Verificación rápida:"
for k in fs.inotify.max_user_watches fs.inotify.max_user_instances vm.swappiness vm.vfs_cache_pressure net.core.somaxconn; do
  printf "  %-40s = %s\n" "$k" "$(sysctl -n $k)"
done
echo
echo "✓ done. Cambios permanentes — sobreviven a wsl --shutdown."
