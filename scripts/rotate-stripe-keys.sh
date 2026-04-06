#!/usr/bin/env bash
# Rotar las claves Stripe placeholder en Vercel + .env.local con valores reales.
#
# USO:
#   1. Saca tus keys del Dashboard de Stripe:
#      - Secret key:    https://dashboard.stripe.com/apikeys
#      - Webhook secret: https://dashboard.stripe.com/webhooks → click endpoint → Reveal
#   2. Ejecuta este script desde bodega-san-martin/:
#      bash scripts/rotate-stripe-keys.sh
#   3. El script te pedirá las dos keys de forma segura (no echo) y las pondrá
#      en Vercel (production + preview + development) y en .env.local.
#
# Seguridad:
#   - Las keys NUNCA se imprimen en pantalla
#   - Las keys NUNCA se commitean (.env.local está gitignored)
#   - Si una key parece inválida (no empieza con sk_ / whsec_) el script aborta

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.local ]]; then
  echo "ERROR: .env.local no existe en $(pwd). Aborto." >&2
  exit 1
fi

# Cargar VERCEL_TOKEN sin filtrarlo a la consola
VERCEL_TOKEN=$(grep -E '^VERCEL_TOKEN=' .env.local | head -1 | cut -d= -f2- | tr -d '"')
if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "ERROR: VERCEL_TOKEN no encontrado en .env.local. Aborto." >&2
  exit 1
fi

echo "============================================"
echo " Rotación de claves Stripe — Bodega San Martín"
echo "============================================"
echo
echo "Pega tu Stripe SECRET KEY (empieza con sk_live_ o sk_test_):"
read -rs STRIPE_SECRET_KEY
echo
if [[ ! "$STRIPE_SECRET_KEY" =~ ^sk_(live|test)_ ]]; then
  echo "ERROR: La key no parece válida (no empieza con sk_live_ o sk_test_). Aborto." >&2
  exit 1
fi

echo "Pega tu Stripe WEBHOOK SECRET (empieza con whsec_):"
read -rs STRIPE_WEBHOOK_SECRET
echo
if [[ ! "$STRIPE_WEBHOOK_SECRET" =~ ^whsec_ ]]; then
  echo "ERROR: El webhook secret no parece válido (no empieza con whsec_). Aborto." >&2
  exit 1
fi

echo
echo ">> Actualizando Vercel (production + preview + development)..."
PROJECT=prj_J3LW8EWUie3GLvqSdYGVBvcqu7V5
TEAM=team_tZ6dsZ6AVoAQ9enqpd4kVRPK
API="https://api.vercel.com/v10/projects/$PROJECT/env?teamId=$TEAM"

vercel_replace() {
  local key="$1" value="$2" env="$3"
  # Find existing var id (if any) and delete
  local id
  id=$(curl -sS "https://api.vercel.com/v10/projects/$PROJECT/env?teamId=$TEAM" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    | node -e "
      let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
        const j=JSON.parse(s);
        const m=(j.envs||[]).find(e=>e.key==='$key' && e.target.includes('$env'));
        if(m)console.log(m.id);
      });
    ")
  if [[ -n "$id" ]]; then
    curl -sS -X DELETE "https://api.vercel.com/v9/projects/$PROJECT/env/$id?teamId=$TEAM" \
      -H "Authorization: Bearer $VERCEL_TOKEN" > /dev/null
  fi
  # Add new
  curl -sS -X POST "$API" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"$key\",\"value\":\"$value\",\"type\":\"encrypted\",\"target\":[\"$env\"]}" \
    > /dev/null
  echo "  ✓ $key ($env)"
}

for env in production preview development; do
  vercel_replace STRIPE_SECRET_KEY "$STRIPE_SECRET_KEY" "$env"
  vercel_replace STRIPE_WEBHOOK_SECRET "$STRIPE_WEBHOOK_SECRET" "$env"
done

echo
echo ">> Actualizando .env.local..."
# Sed-replace en lugar (con backup) usando un delimitador exótico para evitar conflictos con /
sed -i.bak \
  -e "s|^STRIPE_SECRET_KEY=.*|STRIPE_SECRET_KEY=\"$STRIPE_SECRET_KEY\"|" \
  -e "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=\"$STRIPE_WEBHOOK_SECRET\"|" \
  .env.local
rm .env.local.bak 2>/dev/null || true
echo "  ✓ .env.local"

echo
echo "============================================"
echo " ✅ Stripe keys rotadas correctamente"
echo "============================================"
echo "Próximo paso: trigger un deploy para que el build use las nuevas keys"
echo "  npx vercel deploy --prod --token=\"\$VERCEL_TOKEN\""
