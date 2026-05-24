# 12 · SRE & Observability — Auditoría 2026-05-23

> **Auditor:** SRE & Observability (Buleje v2)
> **Alcance:** estado producción `buleje.pe`, deploys Vercel, crons, logs runtime, health endpoints, SLOs, DR drill, alertas.
> **Fuente datos:** Vercel CLI (auth `buleje`), DoH Cloudflare, repo local, ADR-034/035, runbooks.
> **Metodología:** read-only. Sin auto-fix (regla v2: no fix sin eval harness por zona).

---

## 0. Resumen ejecutivo

**Estado general producción: 🔴 CRITICAL** (degradado público, app interna OK).

| Métrica | Valor | Estado |
|---|---|---|
| **`buleje.pe` accesible públicamente** | NXDOMAIN (DNS no resuelve) | 🔴 |
| `www.buleje.pe` | NXDOMAIN | 🔴 |
| `mercado.vercel.app` (alias default) | HTTP 451 `DEPLOYMENT_DISABLED` | 🔴 |
| `mercado-hazel.vercel.app` (alias funcional) | HTTP 200, `/api/health` ok, DB 30-577ms | 🟢 |
| Último deploy production status | 14d antiguo, `● Ready` (uno previo `● Error`) | 🟠 |
| 19/19 últimos deploys preview (11d) | TODOS `● Error` | 🔴 |
| Errores runtime 5xx últimas 24h | 0 logs 5xx | 🟢 |
| Errores runtime nivel `error` últimas 7d | Recurrentes: env vars + Upstash | 🟠 |
| DR drill ejecutado | **Nunca** (solo `TEMPLATE.md`) | 🔴 |
| Sentry alerting | Configurado en código (3 fails/min); DSN sin set en Vercel | 🟠 |
| Uptime monitor externo | No detectado | 🔴 |

### Top 5 acciones inmediatas (orden estricto)

1. **P0 — Restaurar dominio `buleje.pe`.** Está registrado en Vercel hace 15d pero el DNS de `.pe` (RCP) no tiene A/CNAME. Sin esto la marca pública está caída y los 4 clientes free trial (cierre 2026-06-12) no acceden por el dominio prometido. Workaround inmediato: usar `mercado-hazel.vercel.app` como dominio temporal y avisar a los 4 clientes. Fix definitivo: agregar registros A/CNAME en RCP/registrar apuntando a Vercel y completar verification.
2. **P0 — Reemplazar `mercado.vercel.app` (DEPLOYMENT_DISABLED 451).** Vercel bloqueó el dominio default por "razones legales" (probable abuse report o disputa). Abrir ticket Vercel Support con id de deployment para entender la razón.
3. **P0 — Fix Upstash Redis URL.** `UPSTASH_REDIS_REST_URL` tiene un `\n` final → rate-limiting **caído** en producción → in-memory fallback sin protección cross-instance (riesgo brute-force login + scraping). Re-add la env var sin trailing newline.
4. **P0 — Configurar Stripe Price IDs.** `STRIPE_STARTER_PRICE_ID` y `STRIPE_PRO_PRICE_ID` faltan → checkout/upgrade roto en producción (impacto directo trial→pago de los 4 clientes que vencen el 2026-06-12).
5. **P1 — Ejecutar primer DR drill real.** ADR-035 promete drill mensual; nunca corrió. Script existe (`scripts/dr-drill.mjs`) pero solo modo stub. Reserva 2h: dump Supabase → restore en DB temporal → 10 validations → `reports/dr-drills/2026-05-23.md`.

---

## 1. Estado producción — buleje.pe

### 1.1 DNS público

| Hostname | Status DoH Cloudflare | Authority |
|---|---|---|
| `buleje.pe` | `Status:3` (NXDOMAIN) | `quipu.rcp.net.pe` (RCP) |
| `www.buleje.pe` | `Status:3` (NXDOMAIN) | `quipu.rcp.net.pe` |
| `mercado.vercel.app` | A `216.198.79.67` (Vercel) | ok |

> El dominio aparece como "registrado" en Vercel domains (creado por user `buleje` hace 15d, registrar = Third Party) pero **sin Expiration Date y sin Nameservers**: Vercel no controla el registro y los DNS no apuntan a Vercel.

### 1.2 HTTP responses (curl --max-time 10)

| URL | HTTP | Tiempo | Diagnóstico |
|---|:-:|:-:|---|
| `https://buleje.pe/` | 000 (ECONNREFUSED por DNS) | 0.02s | NXDOMAIN |
| `https://www.buleje.pe/` | 000 | 0.02s | NXDOMAIN |
| `https://mercado.vercel.app/` | **451** | 0.52s | `DEPLOYMENT_DISABLED` (gru1) |
| `https://mercado.vercel.app/api/health` | 451 | 0.34s | `DEPLOYMENT_DISABLED` |
| `https://mercado-hazel.vercel.app/` | 200 | 0.36s | OK |
| `https://mercado-hazel.vercel.app/api/health` | 200 | 1.21s | `{"status":"ok"}` |
| `https://mercado-hazel.vercel.app/admin/login` | 200 | 0.66s | OK |
| `https://mercado-hazel.vercel.app/tienda` | 200 | 0.72s | OK |
| `https://mercado-hazel.vercel.app/marketplace` | 200 | 0.73s | OK |
| `https://mercado-brandon-luis-projects-9cf56555.vercel.app` | 401 | 0.88s | Vercel SSO bloqueado |
| `https://mercado-ay5vv5be1-...vercel.app` (último Ready) | 401 | 0.38s | Vercel SSO |
| `https://mercado-git-master-...vercel.app` | 401 | — | Vercel SSO |

**`/api/health` body (mercado-hazel)**:
```json
{"status":"ok","version":"unknown","timestamp":"2026-05-24T04:10:54.663Z","uptime":25,
 "checks":{"database":{"status":"ok","latencyMs":30,"circuitBreaker":"closed"}},"responseTimeMs":30}
```

> DB latency variable 30-577ms entre requests (cold start lambda). `version:"unknown"` → falta `NEXT_PUBLIC_APP_VERSION`.

---

## 2. Deploys Vercel

### 2.1 Production deploys (últimos 19)

| Edad | Status | URL (alias) |
|:-:|:-:|---|
| 14d | ● Error | `mercado-fu7hto2tq` |
| **14d** | **● Ready** | **`mercado-ay5vv5be1` (current production, alias buleje.pe + www.buleje.pe + hazel)** |
| 15d | ● Ready | `mercado-lz2ux3e91` |
| 15d | ● Ready | `mercado-rckiuugro` |
| 15d | ● Error | `mercado-77mzq8veg` |
| 35d | ● Error ×6 | varios |
| 41d | ● Error ×7 | varios |

### 2.2 Preview deploys

19/19 últimos preview (hace 11-12d) **TODOS en `● Error`** con `Duration` 4-5min. Indica build/lint/tsc reventando en master en cada push reciente. Probable causa: env vars faltantes en Preview environment.

### 2.3 Production deploy actual (alias activos)

| Alias | Status |
|---|---|
| `https://buleje.pe` (en Vercel records) | sin DNS público |
| `https://www.buleje.pe` (en Vercel records) | sin DNS público |
| `https://mercado-hazel.vercel.app` | 🟢 200 OK |
| `https://mercado-brandon-luis-projects-9cf56555.vercel.app` | 401 SSO |
| `https://mercado-git-master-...vercel.app` | 401 SSO |

---

## 3. Cron jobs

### 3.1 Configuración

- `vercel.json` declara **66 crons**.
- 7 con `maxDuration: 300s` (churn-score, agent-tasks, demand-forecast, marketplace-stockout/anomaly, credit-score-recalc, vendor-identity-recheck).
- `app/api/cron/**` cuenta 66 route files (1:1 con vercel.json).

### 3.2 Ejecución reciente (Vercel runtime logs)

Confirmados ejecutándose en últimas horas con `responseStatusCode:200`:

| Cron | Última corrida | Resultado |
|---|---|---|
| `/api/cron/socio/renew-cycles` | 2026-05-23T23:03Z | 200 |
| `/api/cron/trial-expiry` | 2026-05-23T22:54Z | 200 + log `[cron/trial-expiry] OK durationMs:1363` |
| `/api/cron/ai-history-cleanup` | 2026-05-23T22:19Z | 200 + log `conversationsDeleted:0` |

> Marcados `level:error` por logger por env vars faltantes (Stripe/LLM/Upstash) pero el handler retorna 200. Falso positivo de severidad en dashboards.

### 3.3 `lib/cron/`

| Archivo | Propósito |
|---|---|
| `health-tracker.ts` | tracker interno cron health |
| `with-cron-health.ts` | wrapper que registra success/failure por cron |

---

## 4. Logs runtime Vercel — análisis 7d

**0 logs con `status-code:500` últimos 7d** (filtrado `--status-code 500 --since 7d`). 🟢

**Errores recurrentes detectados (todos en boot/middleware, request retorna 200):**

| # | Fingerprint | Frecuencia | Severidad | Causa raíz |
|:-:|---|:-:|:-:|---|
| 1 | `[rate-limit] Failed to initialize Upstash Redis client` — `\n` en URL | Cada cold start | 🔴 P0 | Env var `UPSTASH_REDIS_REST_URL` = `"https://fine-cardinal-95141.upstash.io\n"` |
| 2 | `🚨 Missing required environment variables ... STRIPE_STARTER_PRICE_ID / STRIPE_PRO_PRICE_ID` | Cada cold start (×2-3 por request) | 🔴 P0 | Falta env Stripe billing |
| 3 | `[env] Ningún LLM provider configurado` | Cada cold start | 🟠 P1 | Falta GROQ/ANTHROPIC/XAI/AI_GATEWAY → features IA inactivas |
| 4 | `[rate-limit] Upstash Redis env vars missing — in-memory fallback` | Cada cold start | 🔴 P0 | Consecuencia de #1 — rate-limit cross-instance DISABLED |

---

## 5. Env vars en producción (Vercel project)

Definidas (16): `NEXT_PUBLIC_BASE_URL · RESEND_API_KEY · UPSTASH_REDIS_REST_TOKEN · UPSTASH_REDIS_REST_URL · NUBEFACT_TOKEN/URL/RUC · SENTRY_AUTH_TOKEN · DATABASE_URL · DIRECT_URL · STRIPE_WEBHOOK_SECRET · STRIPE_SECRET_KEY · AUTH_SECRET · CRON_SECRET · NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

### Faltantes confirmadas (logs + grep .env.example)

| Categoría | Faltante | Impacto |
|---|---|:-:|
| Billing | `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID` | 🔴 checkout SaaS roto |
| Observability | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_APP_VERSION` | 🔴 Sentry no recibe eventos del cliente; `/api/health` muestra `version:"unknown"` |
| AI | `GROQ_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` / `AI_GATEWAY_*` | 🟠 features IA inactivas |
| Notifs | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `TWILIO_*`, `MP_*` | 🟠 web push + WA + Mercado Pago no operativos |
| Mailer | `SUPERADMIN_ALERT_EMAIL` | 🟠 alerta health DB no llega por email |

---

## 6. Health endpoints

### 6.1 Endpoints presentes

| Path | Propósito |
|---|---|
| `/api/health` | DB ping + circuit breaker + Sentry alert si 3+ fails/min |
| `/api/admin/health` | health admin (auth) |
| `/api/superadmin/health` | health superadmin |
| `/api/superadmin/stores/health` + 2 sub-paths | health por tenant |
| `/api/agents/health` | health agentes IA |
| `/api/ai-assistant/health` | health asistente IA |
| `/api/customers/health-scores` | métricas customers (no es probe) |

### 6.2 `/api/healthcheck` ❌

No existe. Si UptimeRobot/Better Stack se contrata, apuntar a `/api/health`.

---

## 7. SLOs (ADR-034)

### 7.1 SLOs declarados (`slo/slo.yaml`)

| SLO | Target | Ventana | Estado actual |
|---|:-:|:-:|---|
| `checkout_success_rate` | 99.5% | 30d | sin medición real (Sentry DSN no configurado) |
| `api_p99_latency` | <500ms / 99.9% | 7d | sin medición |
| `boleta_sunat_success` | 99.9% | 30d | sin medición |
| `whatsapp_delivery` | 98% | 30d | sin medición (Twilio no configurado) |

### 7.2 Componentes funcionales

- ✅ `slo/slo.yaml` declarativo
- ✅ `lib/slo/budget-calculator.ts` + 8 tests
- ✅ Skill `/slo-status`
- ✅ Hook `.claude/hooks/pre-deploy-slo-gate.mjs` (gate ≥90% budget consumido)
- 🔴 **Sin métricas reales** (Sentry DSN faltante → todos los queries del skill devuelven mocked/empty)

---

## 8. Disaster Recovery (ADR-035)

| Item | Estado |
|---|---|
| `scripts/dr-drill.mjs` | ✅ existe |
| Workflow GH Actions `dr-drill.yml` | ❌ no existe |
| Workflow `backup-offsite.yml` | ✅ existe |
| `reports/dr-drills/` | solo `TEMPLATE.md` — **0 drills ejecutados** |
| Runbook `docs/security/dr-drill-runbook-2026-05-19.md` | ✅ creado el 2026-05-19; "Última ejecución: Pendiente (primer drill)" |
| Próximo drill obligatorio | 2026-06-22 (regla #14: <35d) |
| RTO target | <2h |
| RPO target | <15min |
| Backup actual Supabase | Free plan = 1 día retención |
| Backup offsite a S3/Vercel Blob | ❌ no implementado (script existe sin secrets) |

Runbooks adicionales (`docs/runbooks/`): `db-down.md` (147 líneas), `deploy-rollback.md` (172), `redis-down.md` (163), `stripe-webhook-lost.md` (197). 🟢

---

## 9. Alertas Sentry

### Configuración detectada en código

| Mecanismo | Ubicación | Estado runtime |
|---|---|:-:|
| `Sentry.init` server/client/edge configs | `sentry.*.config.ts` con `enabled: NODE_ENV==='production'` y `tracesSampleRate: 0.25` | ⚠️ `enabled=true` pero **DSN ausente** en Vercel env |
| Alerta DB degradada | `/api/health` → `Sentry.captureMessage` si 3+ fails/min | ⚠️ misma |
| Email alerta superadmin | `sendSuperAdminAlert` con cooldown 15min | ⚠️ requiere `SUPERADMIN_ALERT_EMAIL` |
| Sentry alert rules en dashboard | (no consultado — sin Sentry MCP en `.mcp.json` local) | ❓ no verificado |
| Hook sentry-loop | `logs/sentry-loop/dedup-registry.json` | ✅ vacío (no se ha disparado nada) |

> Sentry MCP no está en `/home/usuario/proyectos/Mercado/.mcp.json` (solo `playwright` y `memory`). Las "claude.ai Sentry/Figma/PostHog/Supabase" del entorno son MCPs del usuario, no del proyecto. Para auditar issues Sentry necesitás agregar el server al `.mcp.json` del proyecto o ejecutar `/mcp` connection.

---

## 10. Uptime monitor externo

No detectado. Búsqueda en `docs/` y `.github/workflows/` retorna solo `docs/security/public-endpoints.md` (lista de endpoints, no monitor activo).

**Recomendación:** UptimeRobot free tier (50 monitors, 5min) o Better Stack free (10 monitors, 30s) apuntando a:
- `https://buleje.pe/api/health` (cuando DNS funcione)
- `https://mercado-hazel.vercel.app/api/health` (fallback)
- Cron heartbeat: cualquier `GET /api/cron/<name>` con `CRON_SECRET`

---

## 11. Tabla de hallazgos consolidada

| # | Severidad | Hallazgo | Acción |
|:-:|:-:|---|---|
| 1 | **P0** | DNS `buleje.pe` NXDOMAIN en RCP | Configurar A/CNAME al endpoint Vercel + completar domain verification |
| 2 | **P0** | `mercado.vercel.app` HTTP 451 `DEPLOYMENT_DISABLED` | Ticket Vercel Support con deployment id |
| 3 | **P0** | `UPSTASH_REDIS_REST_URL` con `\n` final → rate-limit DISABLED en prod | Re-add env sin newline; redeploy |
| 4 | **P0** | `STRIPE_STARTER_PRICE_ID` + `STRIPE_PRO_PRICE_ID` faltan | Crear prices en Stripe Dashboard, agregar a Vercel env |
| 5 | **P0** | DR drill nunca ejecutado en real | Correr `scripts/dr-drill.mjs` con `DR_BACKUP_PATH` + `DR_TEMP_DB_URL` |
| 6 | **P1** | 19/19 últimos Preview deploys en `● Error` | `vercel inspect` uno; arreglar build (likely env Preview missing) |
| 7 | **P1** | Sentry DSN/ORG/PROJECT faltan → SDK no envía eventos | Crear proyecto Sentry, agregar `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` |
| 8 | **P1** | `NEXT_PUBLIC_APP_VERSION` faltante → `/api/health` muestra `version:"unknown"` | Setear en Vercel desde `$VERCEL_GIT_COMMIT_SHA` |
| 9 | **P1** | Sin uptime monitor externo | UptimeRobot/Better Stack apuntando a `/api/health` |
| 10 | **P1** | Workflow `.github/workflows/dr-drill.yml` no existe (ADR-035 incumplido) | Crear workflow cron mensual con secrets `DR_BACKUP_PATH` + `DR_TEMP_DB_URL` |
| 11 | **P1** | SLO budget calculator sin métricas reales | Conectar a Sentry/OTEL una vez DSN esté |
| 12 | **P2** | Logger marca crons como `level:error` por env warnings (200 OK) | Reducir severidad de boot-time env warnings de `error` a `warn` para no contaminar dashboards |
| 13 | **P2** | LLM providers no configurados → features IA inactivas | Agregar `GROQ_API_KEY` o `AI_GATEWAY_*` |
| 14 | **P2** | `/api/healthcheck` no existe (algunos LBs lo esperan) | Alias trivial a `/api/health` o documentar `/api/health` como único probe |
| 15 | **P2** | `SUPERADMIN_ALERT_EMAIL` faltante | Email del owner para alertas DB degradada |
| 16 | **P2** | `backup-offsite.yml` workflow existe pero sin secrets configurados | Agregar `BACKUP_S3_*` o `VERCEL_BLOB_*` a GH Secrets |

---

## 12. Métricas de la auditoría

| Metric | Valor |
|---|---|
| Endpoints probados con curl | 12 |
| URLs Vercel inspeccionadas | 6 |
| Logs runtime parseados | ~50 entries (7d) |
| Crons declarados en `vercel.json` | 66 |
| Crons verificados ejecutándose | 3 (sample del log window) |
| Health endpoints presentes en código | 9 |
| ADRs SRE relevantes | 029, 034, 035, 049 |
| Runbooks documentados | 4 (db, deploy, redis, stripe-webhook) |
| Drills DR ejecutados (real) | **0** |
| Eval harness disponible para auto-fix | ❌ no detectado por zona |
| Dedup-registry sentry-loop | vacío (0 errores trackeados) |

---

## 13. Reglas v2 — gates respetados

| Regla | Aplicación en este reporte |
|---|---|
| No auto-fix sin eval | ✅ ningún cambio aplicado. Solo lectura. |
| Dedup 3-strikes | ✅ no aplica (no se invocó bug-hunter). |
| Logs estructurados | ✅ findings catalogados con fingerprint conceptual en tabla #4. |
| Solo lectura | ✅ ningún archivo del proyecto modificado. |
| Eval score check | N/A (no se aplicó fix). |

---

> **Próximo paso recomendado al equipo:** abrir 4 issues con labels `sre-p0` para hallazgos #1-#4 y bloquear cualquier deploy production hasta resolver #3 y #4. Sin Stripe Price IDs y con rate-limit caído, un trial-end + un script de brute-force pueden tumbar la base de clientes en horas.

> **Owner:** Brandon (Buleje). **Fecha de revisión sugerida:** 2026-05-30.
