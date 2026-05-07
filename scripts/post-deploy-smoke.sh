#!/bin/bash
set -euo pipefail

# ─── post-deploy-smoke.sh ─────────────────────────────────────────────────────
#
# Verifica 10 endpoints criticos tras un deploy.
# Uso:
#   BASE_URL=https://buleje.pe bash scripts/post-deploy-smoke.sh
#   bash scripts/post-deploy-smoke.sh          # default: http://localhost:3000
#
# Exit 0 → todos los checks OK
# Exit 1 → al menos un FAIL
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL="${BASE_URL:-http://localhost:3000}"
TIMEOUT=15  # segundos por request

# Colores (desactivar si no hay TTY)
if [ -t 1 ]; then
  GREEN="\033[0;32m"
  RED="\033[0;31m"
  YELLOW="\033[1;33m"
  RESET="\033[0m"
  BOLD="\033[1m"
else
  GREEN=""; RED=""; YELLOW=""; RESET=""; BOLD=""
fi

PASS_COUNT=0
FAIL_COUNT=0
RESULTS=()

# ─── Helper ───────────────────────────────────────────────────────────────────

# check <label> <method> <path> <expected_codes> [body]
# expected_codes: "200" o "200,401" (cualquiera de ellos es OK)
check() {
  local label="$1"
  local method="$2"
  local path="$3"
  local expected="$4"
  local body="${5:-}"
  local url="${BASE_URL}${path}"

  local curl_args=(-s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -X "$method")

  if [ -n "$body" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi

  local got
  got=$(curl "${curl_args[@]}" "$url" 2>/dev/null || echo "000")

  # Verificar si el status obtenido esta en la lista de esperados
  local ok=false
  IFS=',' read -ra codes <<< "$expected"
  for code in "${codes[@]}"; do
    if [ "$got" = "$code" ]; then
      ok=true
      break
    fi
  done

  local display_expected
  display_expected=$(echo "$expected" | tr ',' '/')

  if $ok; then
    PASS_COUNT=$((PASS_COUNT + 1))
    RESULTS+=("$(printf "%-50s | %-10s | %-6s | %s" "$label" "$display_expected" "$got" "OK")")
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    RESULTS+=("$(printf "%-50s | %-10s | %-6s | %s" "$label" "$display_expected" "$got" "FAIL")")
  fi
}

# ─── Checks ───────────────────────────────────────────────────────────────────

echo ""
echo "${BOLD}post-deploy-smoke — ${BASE_URL}${RESET}"
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# 1. Health basico
check "GET /api/health" \
  GET "/api/health" \
  "200"

# 2. Marketplace feed (publico)
check "GET /api/marketplace/feed" \
  GET "/api/marketplace/feed" \
  "200"

# 3. Products (requiere tenantId, puede ser 200 o 401)
check "GET /api/products?tenantId=main" \
  GET "/api/products?tenantId=main" \
  "200,401"

# 4. Webhook MercadoPago sin firma → NO debe ser 500
check "POST /api/billing/mp-webhook (sin firma)" \
  POST "/api/billing/mp-webhook" \
  "400,503" \
  '{}'

# 5. WhatsApp webhook sin firma → NO debe ser 500
check "POST /api/whatsapp/webhook (sin firma)" \
  POST "/api/whatsapp/webhook" \
  "401,503" \
  '{}'

# 6. Yape capture sin auth → 401 o 503
check "POST /api/whatsapp/yape-capture (sin auth)" \
  POST "/api/whatsapp/yape-capture" \
  "401,503" \
  '{}'

# 7. Sales sin auth → 401
check "POST /api/sales (sin auth)" \
  POST "/api/sales" \
  "401" \
  '{}'

# 8. Delivery notify sin auth → 401
check "POST /api/delivery/notify (sin auth)" \
  POST "/api/delivery/notify" \
  "401" \
  '{}'

# 9. SUNAT emit sin auth → 401
check "POST /api/sunat/emit (sin auth)" \
  POST "/api/sunat/emit" \
  "401" \
  '{}'

# 10. Health secrets sin auth → 401 (protegido por superadmin)
check "GET /api/health/secrets (sin auth)" \
  GET "/api/health/secrets" \
  "401"

# ─── Reporte ──────────────────────────────────────────────────────────────────

echo "${BOLD}$(printf "%-50s | %-10s | %-6s | %s" "ENDPOINT" "EXPECTED" "GOT" "RESULT")${RESET}"
echo "$(printf '%0.s-' {1..85})"

for result in "${RESULTS[@]}"; do
  if [[ "$result" == *"FAIL"* ]]; then
    echo "${RED}${result}${RESET}"
  else
    echo "${GREEN}${result}${RESET}"
  fi
done

echo "$(printf '%0.s-' {1..85})"
echo ""
echo "${BOLD}Total: $((PASS_COUNT + FAIL_COUNT)) | ${GREEN}OK: ${PASS_COUNT}${RESET}${BOLD} | ${RED}FAIL: ${FAIL_COUNT}${RESET}"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "${RED}SMOKE TEST FAILED — ${FAIL_COUNT} endpoint(s) con respuesta inesperada.${RESET}"
  exit 1
else
  echo "${GREEN}SMOKE TEST PASSED — todos los endpoints responden correctamente.${RESET}"
  exit 0
fi
