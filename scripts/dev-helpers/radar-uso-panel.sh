#!/usr/bin/env bash
# radar-uso-panel.sh — qué usa de verdad un negocio en el panel, en UNA llamada
# (04-11: elegir «la siguiente mejora del panel» costó ~25 consultas sueltas).
# Uso: scripts/dev-helpers/radar-uso-panel.sh [tenantId] [días]
#   tenantId por defecto = Blas (id exacto, memoria `blas-tenant-id-exacto`).
# Solo lectura (scripts/sql-lectura.mjs: BEGIN READ ONLY … ROLLBACK).
set -euo pipefail
cd "$(dirname "$0")/../.."
T="${1:-cmpxiv6p4000bohvzwl6bnfpv}"
D="${2:-30}"
echo "── 1. Acciones del panel, últimos $D días (lo más usado arriba)"
node scripts/sql-lectura.mjs --max 25 "select action, count(*)::int n, count(distinct \"user\")::int usuarios, max(\"createdAt\")::date ultimo from \"ActivityLog\" where \"tenantId\"=\$1 and \"createdAt\" > now() - (\$2 || ' days')::interval and action not in ('auto-backup','CREATE') group by 1 order by 2 desc limit 25" "$T" "$D" | tail -n +1
echo "── 2. Pantallas que se cayeron (sin marcar resueltas, últimos 14 días)"
node scripts/sql-lectura.mjs --max 10 "select left(message,90) msg, count::int, \"lastSeenAt\"::date ultimo from \"ClientErrorLog\" where \"tenantId\"=\$1 and \"resolvedAt\" is null and \"lastSeenAt\" > now() - interval '14 days' order by \"lastSeenAt\" desc limit 10" "$T"
echo "── 3. Módulos con datos y su último movimiento"
node scripts/sql-lectura.mjs --max 20 "select 'trabajadores enlazados a adelantos' que, (select count(*) filter (where \"beneficiarioId\" is not null)||' de '||count(*) from \"Colaborador\" where \"tenantId\"=\$1 and \"deletedAt\" is null and estado='ACTIVO') valor union all select 'pagos de semana (planilla)', (select count(*)::text from \"Expense\" where \"tenantId\"=\$1 and \"documentNumber\" ~* '^RRHH-') union all select 'última marca de asistencia', (select max(fecha)::text from \"Asistencia\" where \"tenantId\"=\$1 and \"deletedAt\" is null) union all select 'papeles emitidos', (select count(*)::text from \"PapelEmitido\" where \"tenantId\"=\$1) union all select 'líneas del Libro TH vivas / borradas', (select count(*) filter (where \"deletedAt\" is null)||' / '||count(*) filter (where \"deletedAt\" is not null) from \"ForestLothEntry\" where \"tenantId\"=\$1)" "$T"
echo "Medidas ya hechas y descartadas: memorias hub-rrhh, hub-superadmin-observabilidad (04-11)."
