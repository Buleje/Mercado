#!/usr/bin/env bash
# Aplicar las 2 migrations Prisma pendientes (EventDeadLetter + DomainEventLog).
#
# Requisitos:
#   - DIRECT_URL seteado en .env (acceso directo a Postgres, NO pgBouncer)
#   - Red con acceso al endpoint directo de Supabase
#
# Uso:
#   bash scripts/migrations-pending.sh

set -euo pipefail

SCHEMA=prisma/schema.prisma
BACKUP=prisma/schema.prisma.backup-$(date +%Y%m%d-%H%M%S)

if [ ! -f "$SCHEMA" ]; then
  echo "ERROR: no se encontró $SCHEMA"
  exit 1
fi

if [ -z "${DIRECT_URL:-}" ]; then
  echo "ERROR: DIRECT_URL no seteado — exportalo primero desde .env"
  echo "  export \$(grep -v '^#' .env | xargs)"
  exit 1
fi

echo "== Backup del schema actual =="
cp "$SCHEMA" "$BACKUP"
echo "  → $BACKUP"

echo ""
echo "== Paso 1: pegar EventDeadLetter en schema =="
echo ""
cat lib/events/dlq/SCHEMA-PROPOSAL.prisma
echo ""
read -rp "¿Copiar al final de schema.prisma? [y/N] " ans1
if [[ "$ans1" == "y" || "$ans1" == "Y" ]]; then
  echo "" >> "$SCHEMA"
  cat lib/events/dlq/SCHEMA-PROPOSAL.prisma >> "$SCHEMA"
  echo "  ✓ Appended"
fi

echo ""
echo "== Paso 2: pegar DomainEventLog en schema =="
echo ""
cat lib/event-sourcing/SCHEMA-PROPOSAL.prisma
echo ""
read -rp "¿Copiar al final de schema.prisma? [y/N] " ans2
if [[ "$ans2" == "y" || "$ans2" == "Y" ]]; then
  echo "" >> "$SCHEMA"
  cat lib/event-sourcing/SCHEMA-PROPOSAL.prisma >> "$SCHEMA"
  echo "  ✓ Appended"
fi

echo ""
echo "== Paso 3: formatear schema =="
npx prisma format

echo ""
echo "== Paso 4: crear migration =="
DATABASE_URL="$DIRECT_URL" npx prisma migrate dev --name add_event_dlq_and_sourcing

echo ""
echo "== Paso 5: generar cliente =="
npx prisma generate

echo ""
echo "✓ Listo. Si algo salió mal, restaurá con:"
echo "  cp $BACKUP $SCHEMA"
