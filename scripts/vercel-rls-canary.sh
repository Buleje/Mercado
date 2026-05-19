#!/usr/bin/env bash
# vercel-rls-canary.sh — Aplica DATABASE_URL/DIRECT_URL con roles RLS
# (app_user, prisma_migrator) a Vercel siguiendo canary preview → production.
#
# Pre-requisito: tener a mano docs/security/rls-credentials-2026-05-18.md
# para copiar/pegar las URLs cuando el script lo pida.
#
# Comandos:
#   ./scripts/vercel-rls-canary.sh help
#   ./scripts/vercel-rls-canary.sh backup-only      Solo backupea env vars actuales
#   ./scripts/vercel-rls-canary.sh preview          Backup + apply a preview + redeploy
#   ./scripts/vercel-rls-canary.sh smoke <url>      Smoke test 3 rutas contra URL dada
#   ./scripts/vercel-rls-canary.sh production       Backup + apply a production + redeploy
#   ./scripts/vercel-rls-canary.sh rollback         Guía interactiva de rollback
#
# Flujo recomendado (60-90 min total):
#   1) backup-only
#   2) preview
#   3) abrir preview URL → validar login + /tiendas + carrito + checkout (sin pagar)
#   4) smoke <preview-url>
#   5) production
#   6) smoke https://buleje.pe (o tu dominio prod)
#   7) Aplicar migration RLS via Supabase MCP

set -euo pipefail

BACKUP_DIR="docs/security/vercel-env-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TARGET="${1:-help}"

# ── Colores (solo si TTY) ─────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_RED=$'\033[0;31m'
  C_GREEN=$'\033[0;32m'
  C_YELLOW=$'\033[0;33m'
  C_BLUE=$'\033[0;34m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_BOLD='' C_RESET=''
fi

info()  { echo "${C_BLUE}→${C_RESET} $*"; }
ok()    { echo "${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo "${C_YELLOW}⚠${C_RESET}  $*"; }
err()   { echo "${C_RED}✗${C_RESET} $*" >&2; }
hr()    { echo "${C_BOLD}═════════════════════════════════════════════════════════${C_RESET}"; }

show_help() {
  cat <<EOF
${C_BOLD}vercel-rls-canary.sh — Canary RLS para Vercel${C_RESET}

Uso: $0 <comando> [args]

Comandos:
  ${C_BOLD}backup-only${C_RESET}        Backupea DATABASE_URL/DIRECT_URL actuales (production)
  ${C_BOLD}preview${C_RESET}            Backup + aplicar a preview + redeploy
  ${C_BOLD}smoke${C_RESET} <url>        Smoke test 3 rutas (/, /tiendas, /api/health)
  ${C_BOLD}production${C_RESET}         Backup + aplicar a production + redeploy
  ${C_BOLD}rollback${C_RESET}           Lista backups disponibles + instrucciones manuales

Flujo recomendado:
  $0 backup-only
  $0 preview                          # te muestra preview URL al final
  $0 smoke <preview-url>              # automated check
  # validar manual en browser
  $0 production
  $0 smoke https://buleje.pe          # smoke prod
  # luego aplicar migration RLS via Supabase MCP

Credenciales (NO commitear):
  docs/security/rls-credentials-2026-05-18.md
EOF
}

# ── Pre-flight checks ─────────────────────────────────────────────────────────
verify_vercel() {
  info "Verificando Vercel CLI..."
  if ! command -v vercel >/dev/null 2>&1; then
    err "Vercel CLI no instalado. npm i -g vercel@latest"
    exit 1
  fi
  if ! vercel whoami >/dev/null 2>&1; then
    err "No autenticado. Corré: vercel login"
    exit 1
  fi
  if [ ! -f .vercel/project.json ]; then
    err "Proyecto no linkeado. Corré: vercel link"
    exit 1
  fi
  ok "Vercel CLI OK ($(vercel --version | head -1 2>/dev/null || echo '?'))"
}

verify_credentials_file() {
  local cred_file="docs/security/rls-credentials-2026-05-18.md"
  if [ ! -f "$cred_file" ]; then
    err "Falta archivo de credenciales: $cred_file"
    err "Revisar SESSION_HANDOFF.md y docs/security/rls-credentials-TEMPLATE.md"
    exit 1
  fi
  ok "Archivo de credenciales encontrado"
  warn "Tené el archivo abierto en otra terminal: cat $cred_file"
}

ensure_backup_dir() {
  mkdir -p "$BACKUP_DIR"
  # Asegurar gitignore (idempotente)
  if ! grep -qE "^docs/security/vercel-env-backups/" .gitignore 2>/dev/null; then
    echo "" >> .gitignore
    echo "# Vercel env backups (contienen secrets — NUNCA commitear)" >> .gitignore
    echo "docs/security/vercel-env-backups/" >> .gitignore
    ok "Agregado vercel-env-backups/ a .gitignore"
  fi
}

# ── Backup ────────────────────────────────────────────────────────────────────
backup_env() {
  local env_target="${1:-production}"
  ensure_backup_dir
  local out="$BACKUP_DIR/vercel-env-${env_target}-${TIMESTAMP}.env"
  info "Backupeando env vars de ${env_target}..."
  vercel env pull "$out" --environment="$env_target" --yes >/dev/null 2>&1 || {
    err "vercel env pull falló"
    exit 1
  }
  chmod 600 "$out"
  ok "Backup en: $out (chmod 600, gitignored)"
  # Validar que tenemos DATABASE_URL antes de seguir
  if ! grep -q "^DATABASE_URL=" "$out"; then
    err "El backup no contiene DATABASE_URL — algo raro pasó"
    exit 1
  fi
  echo "    DATABASE_URL actual (masked): $(grep '^DATABASE_URL=' "$out" | sed -E 's/(:)[^@]*(@)/\1***\2/' | cut -c1-80)..."
}

# ── Aplicar canary ────────────────────────────────────────────────────────────
apply_canary() {
  local target="$1"  # preview | production
  hr
  echo "${C_BOLD}  APLICANDO DATABASE_URL + DIRECT_URL a ${target}${C_RESET}"
  hr
  echo ""
  echo "Vas a:"
  echo "  1. Remover DATABASE_URL y DIRECT_URL actuales de ${target}"
  echo "  2. Pegar las nuevas URLs (con app_user y prisma_migrator)"
  echo "  3. Redeployar ${target}"
  echo ""
  read -rp "¿Tenés copiadas las 2 URLs de docs/security/rls-credentials-2026-05-18.md? [y/N] " yn
  [[ "$yn" != "y" && "$yn" != "Y" ]] && { warn "Abort por usuario"; exit 0; }

  info "Removiendo DATABASE_URL/DIRECT_URL actuales de ${target}..."
  # --yes confirma; || true para idempotencia (si no existe)
  vercel env rm DATABASE_URL "$target" --yes 2>&1 | grep -v "^$" || true
  vercel env rm DIRECT_URL "$target" --yes 2>&1 | grep -v "^$" || true

  echo ""
  hr
  warn "Vercel CLI te va a pedir el valor — PEGÁ el DATABASE_URL del pooler:"
  warn "  Formato: postgresql://app_user.sofkgguriggocouiuamx:<PASS>@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
  hr
  vercel env add DATABASE_URL "$target"

  echo ""
  hr
  warn "Ahora pegá el DIRECT_URL (prisma_migrator, port 5432, sin pgbouncer):"
  warn "  Formato: postgresql://prisma_migrator.sofkgguriggocouiuamx:<PASS>@aws-0-us-east-2.pooler.supabase.com:5432/postgres"
  hr
  vercel env add DIRECT_URL "$target"

  ok "Vars aplicadas a ${target}"
  echo ""
  info "Redeployando ${target}..."
  if [ "$target" = "production" ]; then
    vercel --prod
  else
    vercel
  fi
  echo ""
  ok "Deploy ${target} iniciado. Esperá ~1-3 min y corré: $0 smoke <url>"
}

# ── Smoke test ────────────────────────────────────────────────────────────────
smoke_test() {
  local base_url="${1:-}"
  if [ -z "$base_url" ]; then
    err "Falta URL. Uso: $0 smoke https://preview-abc.vercel.app"
    exit 1
  fi
  # Sanitizar trailing slash
  base_url="${base_url%/}"

  hr
  echo "${C_BOLD}  SMOKE TEST → $base_url${C_RESET}"
  hr
  echo ""

  local failed=0
  local routes=("/" "/tiendas" "/api/health")
  local accept_codes='^(200|301|302|307|308)$'

  for path in "${routes[@]}"; do
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "${base_url}${path}" || echo "000")
    if [[ "$code" =~ $accept_codes ]]; then
      ok "$path → HTTP $code"
    else
      err "$path → HTTP $code"
      failed=$((failed + 1))
    fi
  done

  echo ""
  if [ $failed -gt 0 ]; then
    err "$failed/${#routes[@]} rutas fallaron"
    warn "Posibles causas: DATABASE_URL mal, RLS bloqueando query del homepage, build crash"
    warn "Para rollback: $0 rollback"
    return 1
  fi
  ok "Smoke ${#routes[@]}/${#routes[@]} OK"
  echo ""
  info "Próximo paso manual:"
  info "  1. Abrí $base_url en browser"
  info "  2. Login con qaadmin (tenant main) → debe entrar"
  info "  3. Agregá producto al carrito → debe persistir"
  info "  4. Tail logs Sentry 5 min: https://sentry.io/organizations/buleje/issues/"
}

# ── Rollback (guiado, no automático) ─────────────────────────────────────────
rollback() {
  hr
  echo "${C_BOLD}  ROLLBACK — Backups disponibles${C_RESET}"
  hr
  echo ""
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
    err "No hay backups en $BACKUP_DIR"
    exit 1
  fi
  ls -lt "$BACKUP_DIR"/vercel-env-production-*.env 2>/dev/null | head -10 || {
    err "No hay backups de production"
    exit 1
  }
  echo ""
  warn "Rollback manual (Vercel CLI no tiene 'env restore'):"
  echo ""
  echo "  1. Elegí el backup más reciente válido:"
  echo "     less $BACKUP_DIR/vercel-env-production-<TIMESTAMP>.env"
  echo ""
  echo "  2. Para CADA var modificada (DATABASE_URL, DIRECT_URL):"
  echo "     vercel env rm DATABASE_URL production --yes"
  echo "     vercel env add DATABASE_URL production"
  echo "     # pegá el valor del backup cuando Vercel pregunte"
  echo ""
  echo "  3. Redeploy:"
  echo "     vercel --prod"
  echo ""
  echo "  4. Smoke:"
  echo "     $0 smoke https://buleje.pe"
}

# ── Main dispatch ─────────────────────────────────────────────────────────────
case "$TARGET" in
  help|--help|-h|"")
    show_help
    ;;
  backup-only)
    verify_vercel
    backup_env production
    ;;
  preview)
    verify_vercel
    verify_credentials_file
    backup_env production
    apply_canary preview
    ;;
  production)
    verify_vercel
    verify_credentials_file
    backup_env production
    apply_canary production
    ;;
  smoke)
    shift
    smoke_test "${1:-}"
    ;;
  rollback)
    verify_vercel
    rollback
    ;;
  *)
    err "Comando desconocido: $TARGET"
    echo ""
    show_help
    exit 1
    ;;
esac
