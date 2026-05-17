# Audit 08 — Infraestructura, CI/CD y Observabilidad

**Fecha:** 2026-05-17 | **Branch:** feat/checkout-payment-proof | **Auditor:** DevOps Release Engineer

---

## Resumen ejecutivo

| Area | Estado | Hallazgos |
|------|--------|-----------|
| CI/CD (GitHub Actions) | BIEN | 1 P2 (gitleaks non-blocking) |
| Env vars | BIEN | 1 P1 (STRIPE_BUSINESS_PRICE_ID ausente en env.ts) |
| Vercel config | CRITICO | P0: timeout 30s para crons AI; P1: vercel.json vs route.ts gap |
| Crons (62 endpoints) | CRITICO | P0: 57/62 sin `withCronHealth`; 1/62 sin CRON_SECRET |
| Thundering herd | ALTO | 7 crons simultaneos a las 08:00 UTC |
| Observabilidad | BIEN | Sentry OK, OTEL OK, backup diario OK |
| DR Drill | ALTO | Ningun drill ejecutado (carpeta vacia) |
| Deploy canary | PENDIENTE | No implementado en CI |

---

## P0 — Criticos (bloquean SLO en produccion)

### P0-1: Timeout global 30s mata crons con IA y multi-tenant

**Archivo:** `vercel.json:8`
```json
"functions": { "app/api/**": { "maxDuration": 30 } }
```

**Problema:** 33 de 62 crons iteran `tenant.findMany` sobre todos los tenants activos. Crons como `/api/cron/churn-score`, `/api/cron/agent-tasks` y `/api/cron/demand-forecast` llaman a LLMs (Groq/Anthropic) dentro del loop. Con 10+ tenants, 30s es insuficiente — Vercel mata el proceso y el job queda marcado como fallo sin error explícito.

**Fix:** Agregar override por ruta en `vercel.json`:
```json
"functions": {
  "app/api/**": { "maxDuration": 30 },
  "app/api/cron/churn-score/route.ts": { "maxDuration": 300 },
  "app/api/cron/agent-tasks/route.ts": { "maxDuration": 300 },
  "app/api/cron/demand-forecast/route.ts": { "maxDuration": 300 }
}
```
Requiere plan Pro de Vercel (ya activo para crons).

---

### P0-2: 57/62 crons sin `withCronHealth` (sin tracking de salud)

**Archivos:** `app/api/cron/*/route.ts` — 57 archivos

`withCronHealth` es el wrapper que: (a) verifica CRON_SECRET, (b) persiste en `CronHealthLog` duración + status + error. Sin él, un cron que falla silenciosamente no genera traza en DB.

**Muestra de afectados:**
- `app/api/cron/daily-deal-bundle/route.ts`
- `app/api/cron/loyalty-points-reminder/route.ts`
- `app/api/cron/turnos-zombie-close/route.ts`
- `app/api/cron/abandoned-cart/route.ts`
- `app/api/cron/fiados-reminder/route.ts`
- ...52 mas

**Los 5 que SÍ usan `withCronHealth`:** settle-commissions, reminders, trial-expiry, isolation-monitor, stock-alerts-notify.

**Fix:** Migrar masivamente. Patrón:
```ts
// ANTES (withCronAuth)
export const GET = withCronAuth("job-name", async (req) => { ... });

// DESPUES (withCronHealth — drop-in replacement)
export const GET = withCronHealth("job-name", async (req) => { ... });
```
`withCronHealth` ya importa CRON_SECRET internamente — no hay cambio de lógica.

---

## P1 — Altos (degradan confiabilidad)

### P1-1: 1 cron sin validacion CRON_SECRET

**Archivo:** `app/api/cron/first-purchase-coupon/route.ts:1-13`

Usa `withCronAuth` (de `lib/cron-auth.ts`) en lugar de `withCronHealth`. `withCronAuth` SÍ valida CRON_SECRET — no es un agujero de seguridad. Pero es inconsistente y no genera `CronHealthLog`. Incluir en la migración P0-2.

---

### P1-2: vercel.json declara 55 crons, existen 62 route.ts

**Archivo:** `vercel.json:29-250`

7 crons con `route.ts` NO están en `vercel.json` — nunca se ejecutaran en produccion:

| Ruta sin registrar | Observacion |
|--------------------|-------------|
| `app/api/cron/birthday-greetings` | Duplica logica de `/api/birthday-coupons`? |
| `app/api/cron/credit-overdue` | Critico para cobranza |
| `app/api/cron/daily-report` | Posible duplicado de `daily-summary` |
| `app/api/cron/loyalty-points-reminder` | Marketing activo |
| `app/api/cron/market-alerts` | |
| `app/api/cron/meter-to-stripe` | Billing — CRITICO si SaaS activo |
| `app/api/cron/metering-rollup` | Billing — CRITICO |
| `app/api/cron/midday-push` | |
| `app/api/cron/notifications` | |
| `app/api/cron/recompra-coupon` | |
| `app/api/cron/sunat-retry` | CRITICO para cumplimiento tributario |
| `app/api/cron/tier-discount-reconciliation` | |
| `app/api/cron/weekly-email-report` | |

**Fix inmediato:** auditar cada uno y agregar a `vercel.json` los que son necesarios.

---

### P1-3: STRIPE_BUSINESS_PRICE_ID ausente en lib/env.ts

**Archivo:** `lib/env.ts:60-70`

`lib/env.ts` valida `STRIPE_STARTER_PRICE_ID` y `STRIPE_PRO_PRICE_ID` pero no `STRIPE_BUSINESS_PRICE_ID`. El plan Business (S/349/mes) fue agregado en sesion 2026-05-11 pero no se actualizó la validación de startup.

**Fix:**
```ts
{
  key: "STRIPE_BUSINESS_PRICE_ID",
  description: "Stripe Price ID para el plan Business (price_*) — S/349.00/mes",
  productionOnly: true,
},
```

---

### P1-4: Thundering herd — 7 crons a las 08:00 UTC

**Archivo:** `vercel.json` — schedule `0 8 * * *`

7 crons disparan simultáneamente:
- `/api/stock-alerts`, `/api/cron/superadmin-alerts`, `/api/cron/marketplace-sla-watchdog`, `/api/cron/batch-expiry-alerts`, `/api/cron/stock-alerts-notify`, `/api/cron/expiry-discounts`, `/api/prestamos/cron/recordatorios`

Cada uno itera todos los tenants. Con pgBouncer en modo transaction pooling, 7 procesos compitiendo por el pool generan latencia elevada y posibles timeouts en cascade.

**Fix:** Escalonar en 5-10 minutos:
```
0 8 * * *   → /api/stock-alerts
5 8 * * *   → /api/cron/batch-expiry-alerts
10 8 * * *  → /api/cron/expiry-discounts
15 8 * * *  → /api/cron/stock-alerts-notify
20 8 * * *  → /api/cron/marketplace-sla-watchdog
25 8 * * *  → /api/cron/superadmin-alerts
30 8 * * *  → /api/prestamos/cron/recordatorios
```

---

### P1-5: DR Drill sin ejecutar (carpeta vacia)

**Archivo:** `reports/dr-drills/.gitkeep`

CLAUDE.md regla 14 exige DR drill cada 35 dias. La carpeta `reports/dr-drills/` solo tiene `.gitkeep` — ningun drill ejecutado desde el setup (2026-04-26). Hoy es 2026-05-17: 21 dias sin drill.

**Fix:** Ejecutar `node scripts/dr-drill.mjs` esta semana. El proximo drill vence 2026-06-21.

---

## P2 — Medios (deuda tecnica controlada)

### P2-1: gitleaks non-blocking en CI

**Archivo:** `.github/workflows/ci.yml:45`
```yaml
continue-on-error: true  # non-blocking inicial
```

El comentario dice "convertir a blocking tras 1 semana de baseline limpio" — eso fue en Round 28. Ahora deberia ser blocking.

**Fix:** Quitar `continue-on-error: true` de ese paso.

---

### P2-2: npm audit non-blocking en CI

**Archivo:** `.github/workflows/ci.yml:35`
```yaml
continue-on-error: true  # upstream CVEs tracked in TECH-DEBT
```

Razonable como deuda tecnica explicita, pero requiere que alguien revise `TECH-DEBT` periodicamente.

---

### P2-3: Deploy canary no implementado

**Archivo:** CI/CD — no existe

CLAUDE.md regla 14 especifica canary 5%→25%→100%. Vercel no tiene canary nativo (eso es Vercel Enterprise o implementacion manual via feature flags). Actualmente todos los deploys van al 100% inmediatamente. Documentar como decision consciente en ADR o implementar con feature flags de PostHog.

---

### P2-4: backup-offsite.yml apunta a `bodega-san-martin/` (path obsoleto)

**Archivo:** `.github/workflows/backup-offsite.yml:20-21`
```yaml
working-directory: bodega-san-martin
cache-dependency-path: bodega-san-martin/package-lock.json
```

El repo se renombro a `Mercado/` (root). El workflow usaria rutas incorrectas en GitHub Actions.

**Fix:** Cambiar `bodega-san-martin` a `.` (root) en ese workflow.

---

## Lo que funciona bien

| Item | Estado |
|------|--------|
| `buildCommand` con `prisma generate` | `vercel.json:4` — correcto |
| `validateEnv()` en instrumentation.ts | Llamada en NEXT_RUNTIME=nodejs |
| OTEL solo en produccion | `instrumentation.ts` — evita bug Turbopack dev |
| Sentry: DSN, sampling, source-map correlation | `sentry.*.config.ts` — correcto |
| Pre-commit: tsc + lint-staged + vitest --changed | `.husky/pre-commit` — solido |
| Empty-file gate | `.husky/pre-commit:16` — previene commits vacios |
| Empty `.catch()` gate | `.husky/pre-commit:85` — previene fire-and-forget silencioso |
| Design tokens gate | `.husky/pre-commit:100` — ADR-068 activo |
| Backup diario encriptado a S3 | `backup-offsite.yml` — con verificacion local |
| `withCronHealth` wrapper existe y es correcto | `lib/cron/with-cron-health.ts` — listo para adopcion masiva |
| `allowedDevOrigins` para tunnels | `next.config.ts:31` — cloudflare + ngrok |
| CI E2E ahora bloqueante | `ci.yml:81-84` (Round 28) |
| Evals job separado en CI | `ci.yml:86-113` — checkout + fiado + sunat + multi-tenant |

---

## Plan de accion priorizado

| # | Hallazgo | Archivo | Esfuerzo | Impacto |
|---|----------|---------|----------|---------|
| 1 | Migrar 57 crons a `withCronHealth` | `app/api/cron/**/route.ts` | M (script bulk) | P0 |
| 2 | Override maxDuration crons AI | `vercel.json` | S | P0 |
| 3 | Auditar 13 crons sin registrar en vercel.json | `vercel.json` | S | P1 |
| 4 | Agregar STRIPE_BUSINESS_PRICE_ID a env.ts | `lib/env.ts` | XS | P1 |
| 5 | Escalonar 7 crons de las 08:00 | `vercel.json` | S | P1 |
| 6 | Ejecutar DR drill | `scripts/dr-drill.mjs` | XS | P1 |
| 7 | Hacer gitleaks blocking | `ci.yml:45` | XS | P2 |
| 8 | Fix working-directory backup-offsite.yml | `backup-offsite.yml:20` | XS | P2 |
