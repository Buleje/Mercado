# PR: prod → master — 2026-05-08

> **LECTURA PREVIA** — No hacer merge hasta completar el Pre-Deploy Checklist al final.

---

## Header

| Metrica | Valor |
|---|---|
| Commits ahead (prod vs master) | **706** |
| Archivos cambiados | **3,520** |
| Inserciones | +290,572 |
| Eliminaciones | -52,593 |
| Conflictos detectados (merge-tree) | **43 markers** — requiere resolucion manual |
| Commits en master no en prod | **0** (master diverge desde mismo ancestro, sin commits propios nuevos) |

---

## Highlights — Top 10 cambios de impacto

| # | Commit | Impacto |
|---|---|---|
| 1 | `d8b5aa1a` fix(compliance): Ley 29733 — complianceAuditExtension conectada a Prisma | Cumplimiento legal PE. Audit chain activa en produccion. |
| 2 | `89216e69` fix(security,db): 5 CVEs cerrados + safeFetch SSRF + wave-1 indexes | SSRF bloqueado, 13 indices DB sin lock de tabla. |
| 3 | `74da5394` + `354eab1a` feat: bulk dark mode 144 archivos + round4 visual | Panel admin coherente en dark mode — 100% tokens DS. |
| 4 | `c88b553b` + `39ee115e` fix(security): pentest 8/8 vulns cerradas | TOTP replay, cross-tenant, jti blacklist, timing attack. |
| 5 | `77a26143` feat(billing): bloqueo write suscripcion suspendida (12 endpoints) | Anti-fraude SaaS — impide uso tras suspension. |
| 6 | `5fd9dc1b` fix(marketplace): Mercado Pago multi-vendor preferences (M1) | Checkout multi-tienda con split de pagos real. |
| 7 | `da669657` fix(marketplace): liquidar commissionLedger pending → cleared | Comisiones de vendors se cierran al entregar. |
| 8 | `e2151ca6` + `a16124f6` fix: cart fetch fantasma + SSE TransformStream | P0 #4 y #5 — UX sin loops, streaming sin crash Node 22. |
| 9 | `adc8cb70` fix(infra): DLQ persistente en Postgres (P0-2) | Webhooks fallidos sobreviven reinicios del servidor. |
| 10 | `503707a4` feat(metas): persistencia backend + 4 medallas + audit weeklycard | Logros y metas conectados a APIs reales (antes eran hardcoded en 0). |

---

## Score Impact

| Capa | Antes | Despues | Evidencia |
|---|---|---|---|
| Multi-tenant aislamiento | ~80% | **97%** | cross-tenant customers + plan-gating + cart filter |
| Auth / sesiones | ~75% | **97%** | jti blacklist + login scope + TOTP replay |
| 2FA (TOTP) | ~60% | **95%** | replay protection column + ±1 step window |
| Refresh tokens | ~70% | **95%** | jti rotation + blacklist |
| Sentry / observabilidad | ~40% | **85%** | critical-alerts.ts + on-call scripts |
| PII / compliance PE | ~50% | **88%** | customer-lookup sin name + Ley 29733 extension |
| **Score global blindaje** | **70%** | **92%** | Auditoria 2026-05-06 |

---

## Rollout Plan

### Canary — Vercel Traffic Split

```
Fase 1 — Canary 5%   (hora 0-1):
  - Observar: error rate, p99 latency, Sentry alerts
  - SLO check: error_rate < 0.1%, p99 < 800ms

Fase 2 — Canary 25%  (hora 1-3):
  - Observar: DB connections (pgBouncer pool), cron executions
  - SLO check: DB pool < 80%, zero 5xx en endpoints criticos

Fase 3 — 100%        (hora 3+):
  - Confirmar: audit chain sin degradacion, DLQ = 0, comisiones OK
```

### SLO Check Post-Deploy

```bash
# Ejecutar inmediatamente despues de deploy completo
node scripts/check-prod-health.mjs

# Endpoints criticos a verificar manualmente:
# GET  /api/health                     → 200
# GET  /api/cron/dlq-retry             → 200 (nuevo cron cada 5min)
# POST /api/checkout                   → testear con pedido real
# GET  /t/[slug]/tienda                → storefront carga sin error boundary
```

### DR Drill Programado

Proxima sesion de drill: **antes del 2026-06-12** (35 dias desde hoy).

Escenario a testear: rollback de `d8b5aa1a` (compliance extension) sin downtime.

---

## Risks

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Audit chain extension — latencia bajo carga alta | Media | Alto | Kill switch `AUDIT_CHAIN_ENABLED=false` en Vercel env |
| 43 conflict markers en merge-tree | Alta | Medio | Resolver manualmente antes de merge; no forzar |
| Bulk dark mode 144+ archivos — re-renders CSS | Baja | Bajo | Tokens son CSS vars, no re-render JS; riesgo visual solamente |
| Tests con mocks de rate-limit (6 skipped) | Media | Bajo | No bloquean build; monitear si llegan a `fail` en CI |
| 3 crons de alta frecuencia nuevos (*/1, */5, */10 min) | Media | Medio | Verificar plan Pro Vercel soporta frecuencia; no degradar budget |

---

## Backout Plan

### Rollback rapido (codigo)

```bash
# Si Ley 29733 / audit chain bloquea operacion:
git revert d8b5aa1a --no-edit

# Si compliance extension rompe Prisma client:
# En Vercel Dashboard → Environment Variables
AUDIT_CHAIN_ENABLED=false   # kill switch — redeployar
```

### Rollback de crons nuevos

Eliminar de `vercel.json` los 4 crons agregados si degradan performance:
- `/api/cron/delivery-offer-cascade` (cada 1 min — el mas agresivo)
- `/api/cron/dlq-retry` (cada 5 min)
- `/api/cron/marketplace-sla-watchdog` (cada 10 min)

### Rollback DB

Los indices de wave-1 y wave-2 son `CONCURRENTLY IF NOT EXISTS` — no tienen rollback urgente.
Si un indice causa problema: `DROP INDEX CONCURRENTLY IF EXISTS <nombre>;` (sin lock).

---

## Migraciones DB Aplicadas

### Prisma Migrate (via DIRECT_URL)

| Migration | Descripcion |
|---|---|
| `20260505000000_add_preparando_status_and_delivery_proof` | Estado "preparando" + campos proof en delivery |
| `20260507000000_add_sale_idempotency_key` | Clave idempotencia en ventas (anti-duplicados POS) |
| `20260507000100_add_turno_cash_register_id` | Multi-caja real — cashRegisterId en Turno |
| `20260507084348_add_indexes_return_cashmovement` | Indices en Return + CashMovement |
| `20260507085127_add_event_dead_letter` | Tabla DLQ persistente en Postgres |

### Indices Manuales (DIRECT_URL, CONCURRENTLY)

- `proposed-db-indexes-wave-1.sql` — **13 indices** (Orders, Products, Customers, WhatsApp, Sales, etc.)
- `proposed-db-indexes-wave-2.sql` — **11 indices** (WhatsAppConversation, OrderItem, Notification, CashMovement, etc.)

**TOTAL: 5 migraciones Prisma + 24 indices CONCURRENTLY**

Aplicar indices antes del deploy:
```bash
psql "$DIRECT_URL" -f prisma/migrations/proposed-db-indexes-wave-1.sql
psql "$DIRECT_URL" -f prisma/migrations/proposed-db-indexes-wave-2.sql
```

---

## Pre-Deploy Checklist

| # | Item | Estado |
|---|---|---|
| 1 | `npm run lint` sin errores | Verificar localmente |
| 2 | `npx tsc --noEmit` limpio | Verificar localmente |
| 3 | `npm run test` — suite critica pasa (52 pass, 6 skip aceptados) | Verificar localmente |
| 4 | 43 conflict markers resueltos antes del merge | **PENDIENTE — bloqueo** |
| 5 | ENV vars en Vercel: `AUDIT_CHAIN_ENABLED`, `CRON_SECRET`, `DIRECT_URL` presentes | Verificar Dashboard |
| 6 | Indices wave-1 + wave-2 aplicados en Supabase (DIRECT_URL) | **PENDIENTE** |
| 7 | 3 nuevos crons (delivery-offer-cascade, dlq-retry, marketplace-sla-watchdog) — endpoints existen | Verificar rutas |
| 8 | Plan Pro Vercel activo (crons de alta frecuencia requieren Pro) | Verificar billing |
| 9 | Rollback documentado y testeado (`revert d8b5aa1a` probado en rama local) | Pendiente |
| 10 | DR drill calendarizado antes de 2026-06-12 | Pendiente |
