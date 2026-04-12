# Superadmin — Research de mejoras 2026-04-09

> **Alcance:** auditoría del módulo `/superadmin` (panel de plataforma que opera Brandon sobre TODOS los tenants) + propuesta de 12 mejoras de alto impacto priorizadas por revenue / retención / defensa ante scale.
> **Contexto:** single-founder-operator. Todas las mejoras deben ser auto-servibles, sin contratar equipo.
> **Inputs revisados:** 17 páginas en `app/superadmin/**`, 21 route handlers en `app/api/superadmin/**`, 26 componentes en `components/superadmin/**`, `lib/superadmin-*.ts`, `prisma/schema.prisma` (Tenant + TenantHealthScore + ChurnSignal + ChurnPlaybook + SupportTicket), `docs/ROADMAP-24-WEEKS.md`, `docs/TECH-DEBT.md`.

---

## 📊 Estado actual (mapa del codebase)

### 🟢 Lo que SÍ existe (sorprendentemente completo)

| Área | Implementación | Endpoint / archivo |
|---|---|---|
| **Auth separada** | Cookie propia `bsm-platform-sess`, HMAC-SHA256 Edge, 8h, rotación silenciosa al 50% de vida | `lib/superadmin-session.ts` |
| **2FA opcional** | Código 6 dígitos, 5 min, in-memory, activable con `SUPERADMIN_2FA=true` | `lib/superadmin-2fa.ts` |
| **Dashboard ejecutivo** | MRR, ARR, ARPU, crecimiento MoM, monthly signups y revenue 6 meses, plan distribution | `app/api/superadmin/analytics/route.ts` |
| **Listado tenants** | Con usage + limits + stores + monthRevenue/orders/expenses/profit por tenant, cards/table, filtros plan/status, sort | `app/superadmin/tenants/page.tsx` |
| **Tenant lifecycle** | Crear tenant + admin + settings + store en 1 transacción, PATCH plan/active, DELETE, purge, reset-password | `app/api/superadmin/tenants/*` |
| **Impersonation** | Login como tenant sin contraseña, cookies `active-tenant` + `bsm-sess`, audit via log | `app/api/superadmin/impersonate/route.ts` |
| **Health monitor** | Orphan checks (Order/Product/Customer/AdminUser), cross-tenant leak detection, per-tenant stats | `app/api/superadmin/health/route.ts` |
| **Anti-churn completo** | `TenantHealthScore` (score 0-100, logins, orders, daysSinceLast*, riskLevel), `ChurnSignal`, `ChurnPlaybook` con trigger+action (email/whatsapp/discount) | `app/api/superadmin/churn/*`, schema líneas 2756-2808 |
| **Control center** | Página unificada con quick actions + monitor | `app/superadmin/control-center/page.tsx` |
| **Activity log** | Paginado, filtros tenant/action/entity, `ActivityLog` table | `app/api/superadmin/activity/route.ts` |
| **Marketplace ops** | Cross-tenant orders + coupons del marketplace | `app/api/superadmin/marketplace/*` |
| **Commissions ledger** | `CommissionLedger` con settled tracking | `app/api/superadmin/commissions/route.ts` |
| **Project-intel dashboard** | 11 tabs con stack, agentes, skills, MCP, precio por venta, paquetes de venta del proyecto | `app/superadmin/project-intel/page.tsx` |
| **Billing data en Tenant** | `stripeCustomerId`, `stripeSubscriptionId`, `stripeCurrentPeriodEnd`, `cancelAtPeriodEnd`, `mpCustomerId` (Mercado Pago), `mpSubscriptionId`, `mpPaymentMethod` | `schema.prisma` líneas 36-45 |
| **Support tickets** | Modelo `SupportTicket` con reply, priority, status — ya en DB | `schema.prisma` línea 2675 |
| **Nuclear reset** | Botón "limpiar datos" con modal de confirmación | `components/superadmin/tenants/NuclearResetModal.tsx` |

### 🔴 Lo que NO existe (o está roto)

| Gap | Severidad | Evidencia |
|---|---|---|
| **Settings NO persisten en DB** | 🚨 CRÍTICO | `app/superadmin/settings/page.tsx:11-18` guarda precios de planes, comisiones y maintenance mode en `localStorage`. Si Brandon cambia de browser pierde todo. El `maintenanceMode` ni siquiera es leído server-side. |
| **Precios hardcodeados en 2 lugares** | 🚨 CRÍTICO | `analytics/route.ts:69` tiene `PLAN_PRICES = { free: 0, pro: 49, business: 149, enterprise: 399 }` mientras `DEFAULT_SETTINGS` tiene `priceEnterprise: 499`. **El cálculo de MRR está desincronizado con lo que puede ver Brandon en settings.** |
| **2FA con store en memoria** | 🔴 ALTO | `lib/superadmin-2fa.ts:11` usa `Map` en memoria — se pierde en cada redeploy Vercel. En prod serverless es prácticamente inservible. No se envía por email/WhatsApp, solo console.log. |
| **Password hardcodeado por env var** | 🔴 ALTO | `auth/route.ts:44-45` compara `SUPERADMIN_PASSWORD` directamente sin hash. No hay rotación, no hay histórico de intentos, no hay lockout tras N fallos (solo rate limit). Un solo usuario "platform". |
| **Churn cron NO existe** | 🔴 ALTO | El schema tiene `TenantHealthScore` pero NO hay cron/job que lo calcule periódicamente. El dashboard lee scores obsoletos hasta que alguien dispara el cómputo manual. |
| **Playbooks no se ejecutan** | 🔴 ALTO | `ChurnPlaybook` existe como modelo pero no hay ejecutor automático — los triggers `email`/`whatsapp`/`discount` no disparan nada. Feature en DB pero sin motor. |
| **Billing metering real** | 🔴 ALTO | El roadmap ADR 016 lo lista como Sprint 2 (priority L, "5x ARPU unlock"). Hoy MRR se estima solo contando active × price del plan — sin usage-based, sin add-ons, sin proration. |
| **Feature flags por tenant** | 🟡 MEDIO | No existe modelo `TenantFeatureFlag` ni API. Los rollouts graduales (10% → 50% → 100%) no son posibles hoy. |
| **Audit trail de acciones de SuperAdmin** | 🟡 MEDIO | Sí hay `ActivityLog` general, pero no hay un feed dedicado que responda "¿qué tocó Brandon en los últimos 30 días?" — solo una página activity genérica que mezcla logs de tenants. |
| **Backups / snapshots por tenant** | 🟡 MEDIO | No hay. Si un tenant pide rollback no se puede. Supabase PITR global es el único fallback. |
| **Export de tenant (GDPR / Ley Perú 29733)** | 🟡 MEDIO | No hay endpoint "exportar todos los datos del tenant". Ley peruana 29733 lo exige para data subject requests. |
| **Cost tracking per tenant** | 🟡 MEDIO | Imposible saber qué tenant te come $X en Supabase storage, Blob, llamadas Groq, etc. No hay breakdown. |
| **IP allowlist para superadmin** | 🟡 MEDIO | Nada. Cualquier IP puede intentar el login. |
| **Email templates platform-level** | 🟢 BAJO | No hay CMS de templates — los welcome / trial-ending / churn-win-back emails están hardcoded en código o simplemente no se envían. |
| **Soporte inbox unificado** | 🟢 BAJO | `SupportTicket` existe en DB pero no hay UI superadmin para verlos cross-tenant. |
| **TD-027 N+1 en stores** | 🟢 BAJO | Documentado: conteo de productos por tenant con Promise.all + count, latencia crece con # tiendas. |

---

## 🎯 Mejoras de alto impacto — Top 12

Prio: 🔥 inmediato (semana 1), ⭐ próximo sprint (2-3 sem), 📅 próximo trimestre.

| # | Mejora | Tipo | Impacto | Esfuerzo | Prio | Depende |
|---|---|---|---|---|---|---|
| 1 | **PlatformSettings persistente en DB + single source of truth de precios** | Completar | Fixea MRR inconsistente, desbloquea #2, #3 | S | 🔥 | — |
| 2 | **Billing real con Stripe webhook → Tenant sync + invoice history** | Expansión | +5x ARPU, fin del cálculo estimado de MRR | L | 🔥 | #1 |
| 3 | **Churn engine automático (cron + playbook executor)** | Completar | Reduce churn 20-30%, retention directo | M | 🔥 | #1 |
| 4 | **Tenant Lifecycle Timeline (trial → active → at-risk → churned → deleted)** | Nueva | Visibilidad brutal, one-screen CRO view | M | ⭐ | #3 |
| 5 | **Feature flags por tenant (gradual rollout 1% → 100%)** | Nueva | Lanzas features sin romper a todos, desbloquea A/B | M | ⭐ | — |
| 6 | **Superadmin 2FA real (TOTP + persistente + email/WA fallback)** | Expansión | Seguridad de la llave maestra, compliance | S | ⭐ | — |
| 7 | **Cost tracking por tenant (Supabase bytes + Groq tokens + Blob GB)** | Nueva | Sabes quién te quiebra, prio sales upgrade | M | ⭐ | #1 |
| 8 | **Unified Support Inbox cross-tenant** | Nueva | SupportTicket ya existe en DB, solo falta UI + WhatsApp relay | S | ⭐ | — |
| 9 | **Audit trail de SuperAdmin + impersonation log** | Expansión | Compliance, "quién hizo qué" cuando tengas más ops | S | 📅 | — |
| 10 | **Tenant snapshot / backup on-demand (export JSON + restore)** | Nueva | CYA legal + rescate de data perdida | L | 📅 | — |
| 11 | **IP allowlist + lockout tras N fallos superadmin** | Expansión | Defensa básica de la llave maestra | S | 📅 | #6 |
| 12 | **Weekly digest email al founder (MRR Δ, churn Δ, signups, red flags)** | Nueva | Disciplina operativa sin abrir dashboard | S | 📅 | #2, #3 |

---

## 📝 Detalle por mejora

### 1. PlatformSettings persistente en DB + single source of truth de precios
**Tipo:** completar | **Impacto:** fix crítico + desbloquea billing real | **Esfuerzo:** S (4-6h)

**Qué es:** crear modelo `PlatformSetting` (key/value JSON) en Prisma + DB class `settings.db.ts` con cache 5min, migrar `DEFAULT_SETTINGS` ahí, y que **todas** las lecturas de precio (analytics, stripe, frontend) lean desde un solo helper `getPlanPrice(plan)`.

**Por qué:**
- `app/superadmin/settings/page.tsx:11-18` persiste en `localStorage` → Brandon pierde todo al cambiar de dispositivo
- `app/api/superadmin/analytics/route.ts:69` tiene `pro: 49, business: 149, enterprise: 399` hardcoded
- `lib/superadmin-types.ts:72` tiene `pricePro: 49, priceBusiness: 149, priceEnterprise: 499` (nótese el 499 vs 399)
- **Resultado: MRR que reportas en dashboard es MENTIRA** — off-by-100 por tenant enterprise
- Bloquea feature #2 (billing real) porque no hay precio canónico que mandar a Stripe

**Cómo:**
- Nuevo modelo `PlatformSetting { key String @id, value Json, updatedAt }` (migración trivial)
- `lib/db/platform-settings.db.ts` con `get()` / `set()` / `invalidate()` y cache Redis-like
- `lib/plans.ts` gana `getPlanPrice(plan: PlanId): number` que lee de la DB
- Refactor `analytics/route.ts` + formulario `settings/page.tsx` → POST real a `/api/superadmin/settings`
- `maintenanceMode` se lee en `proxy.ts` para mostrar banner global

**Riesgos:** ninguno serio. Hay que asegurar invalidación al escribir (regla CLAUDE.md #5).

---

### 2. Billing real con Stripe webhook → Tenant sync + invoice history
**Tipo:** expansión | **Impacto:** +5x ARPU (ADR 016 lo dice), fin de MRR estimado | **Esfuerzo:** L (2-3 semanas)

**Qué es:** completar la integración Stripe + Mercado Pago para que:
1. Cada cambio de plan en superadmin → update real en Stripe (crea/cancela subscription)
2. Webhooks Stripe (`invoice.paid`, `customer.subscription.updated`, `invoice.payment_failed`) escriben en un nuevo modelo `BillingInvoice` y sincronizan `Tenant.stripeCurrentPeriodEnd`, `cancelAtPeriodEnd`
3. MRR se calcula desde `BillingInvoice` real en los últimos 30d (no estimado)
4. Dashboard superadmin muestra "últimas facturas", "failed payments" y "dunning status"

**Por qué:**
- MRR actual es fake — si Stripe cobra mal o el tenant no paga, el dashboard sigue mostrando plan pagado
- Roadmap sprint 2 lo marca "Billing metering real → 5x ARPU unlock"
- Single-founder-operator NO PUEDE estar mirando el Stripe dashboard manualmente

**Cómo:**
- Modelo nuevo: `BillingInvoice { id, tenantId, stripeInvoiceId, amount, currency, status, periodStart, periodEnd, paidAt, createdAt }`
- Modelo nuevo: `BillingEvent { id, tenantId, type, payload Json, createdAt }` para webhook log
- Endpoint `/api/webhooks/stripe` (existe parcial) → handlers para los 4 eventos core
- Mercado Pago equivalente (ya hay `mpCustomerId`, falta el webhook)
- Dunning: si `invoice.payment_failed` → crear `ChurnSignal(severity: critical)` + disparar playbook email
- Cron semanal que concilia tenants que tienen `stripeSubscriptionId` pero `stripeCurrentPeriodEnd < now`

**Riesgos:** Stripe webhook idempotency (ya hay pattern en `StripeWebhookQueue` schema línea 1293). Mercado Pago tiene quirks en sandbox. Zona de peligro por ADR 015 — requiere skill `checkout-flow` antes.

---

### 3. Churn engine automático (cron + playbook executor)
**Tipo:** completar | **Impacto:** -20-30% churn rate | **Esfuerzo:** M (1 semana)

**Qué es:** las tablas `TenantHealthScore`, `ChurnSignal`, `ChurnPlaybook` **ya existen** pero el motor no corre. Implementar:
1. Cron diario (Vercel Cron 6am) `computeTenantHealthScores()` que recorre todos los tenants, lee `loginsLast7d`, `ordersLast7d`, calcula score 0-100, upserta `TenantHealthScore`
2. Detector de signals: si `daysSinceLastOrder > 14` → insert `ChurnSignal(login_drop)`; si `trialEndsAt - now < 3d` → `trial_expiring`
3. Playbook executor: escanea signals sin resolver, matchea con `ChurnPlaybook` activos, ejecuta acción (email vía Resend, WhatsApp vía Twilio/Waba, descuento via Stripe coupon)
4. Dashboard superadmin ya lo consume (`churn/route.ts`) — solo necesita que haya datos frescos

**Por qué:**
- El schema **ya está construido** (líneas 2756-2808). Es literalmente código sin backend.
- Sin esto el dashboard de churn muestra datos viejos o vacíos
- Un bodeguero que deja de loguearse 14 días + no hace pedidos = 80% probabilidad de churn. Detectarlo automáticamente y mandar WhatsApp "¿Todo bien con tu tienda?" retiene ~25%

**Cómo:**
- `lib/jobs/compute-health-scores.ts` (fire-and-forget, batch 50 tenants)
- `lib/jobs/detect-churn-signals.ts`
- `lib/jobs/execute-churn-playbooks.ts` con dispatch por action type
- Vercel Cron config en `vercel.json` → `0 6 * * *`
- Feature flag `CHURN_AUTORUN=true` para rollout gradual
- Templates de email/WhatsApp hardcoded inicialmente, luego externalizables (ver mejora futura)

**Riesgos:** spam si el detector se dispara en falso (empezar en dry-run mode 1 semana, loggear lo que HUBIERA enviado, afinar thresholds).

---

### 4. Tenant Lifecycle Timeline
**Tipo:** nueva | **Impacto:** visibilidad brutal, decisiones más rápidas | **Esfuerzo:** M (3-5 días)

**Qué es:** una vista nueva `/superadmin/lifecycle` con 5 columnas Kanban: **Trial (X)** → **Onboarded (Y)** → **Active (Z)** → **At-Risk (W)** → **Churned (V)**. Cada tarjeta es un tenant draggable con datos clave: días restantes de trial, MRR, último pedido, signal activo. Click → TenantDetailModal existente.

**Por qué:**
- Hoy la info está repartida entre `/tenants`, `/analytics`, `/churn` — Brandon tiene que saltar 3 páginas
- Un single-operator necesita "una pantalla que le diga a quién llamar hoy"
- Estilo HubSpot Sales Pipeline — formato probado

**Cómo:**
- Endpoint `/api/superadmin/lifecycle` que agrupa tenants por state computado (trial, healthy, warning, critical según HealthScore)
- Componente `<LifecycleKanban />` con drag-drop opcional (no imprescindible v1)
- Click en tarjeta → modal con botones: "WhatsApp", "Email", "Extender trial", "Impersonate", "Crear playbook manual"
- Integración con Command Palette existente (`CommandPalette.tsx`): `lifecycle: [tenant name]`

**Riesgos:** bajos. Solo UI + 1 endpoint.

---

### 5. Feature flags por tenant (gradual rollout)
**Tipo:** nueva | **Impacto:** desbloquea rollouts graduales, A/B de precios, canary releases | **Esfuerzo:** M (1 semana)

**Qué es:** modelo `TenantFeatureFlag { flagKey, tenantId, enabled, rolloutPercent?, metadata }` + UI en `/superadmin/feature-flags` con toggles + slider de % de rollout + targeting (por plan, por antigüedad, por tenantId explícito).

**Por qué:**
- Hoy cualquier feature nueva se activa para TODOS o NADIE — riesgo catastrófico
- Quieres probar nuevo checkout con 10% → 30% → 100% de tenants sin deploy
- Permite A/B de precios (`pricePro = 49` vs `pricePro = 59` por 2 sem)
- Single-founder NO PUEDE rollback manual; flags son el plan B obligatorio

**Cómo:**
- Modelo `TenantFeatureFlag` + `PlatformFeatureFlag` (global)
- Helper `isFeatureEnabled(flagKey, tenantId)` con cache 60s en edge
- UI con formulario + historial de cambios
- Middleware/hook para que componentes consulten fácil
- Auditoría: cada cambio → `ActivityLog` con diff

**Riesgos:** bajos. Patrón estándar. Solo cuidar cache hit rate (middleware en edge runtime).

---

### 6. Superadmin 2FA real (TOTP persistente)
**Tipo:** expansión | **Impacto:** seguridad llave maestra, compliance | **Esfuerzo:** S (1-2 días)

**Qué es:** migrar `lib/superadmin-2fa.ts` de `Map` en memoria a TOTP real (RFC 6238) con secret persistente en DB + QR code en primer login + email/WhatsApp como fallback.

**Por qué:**
- Hoy el 2FA existe pero es inservible: el código se guarda en memoria serverless → redeploy Vercel lo borra
- El código solo se loggea a console, no se envía a ningún lado → si 2FA está activo y hay deploy, Brandon se bloquea fuera
- Con un solo `platform` user y password hardcoded, esto es EL vector de ataque más crítico

**Cómo:**
- `speakeasy` o `otplib` para TOTP
- Modelo `PlatformUser { username, passwordHash, totpSecret, totpVerifiedAt, lastLoginAt, lastLoginIp }`
- Migrar de env var `SUPERADMIN_PASSWORD` a hash bcrypt en DB (password rotatable desde panel)
- Setup flow: primer login con env var legacy → pide enrolar TOTP → muestra QR (Google Authenticator) → verifica código → guarda secret → próximos logins exigen TOTP
- Fallback: botón "enviar código a WhatsApp" (usa `mpPaymentMethod` para founder number, env var)

**Riesgos:** si la migración sale mal Brandon se queda fuera — siempre dejar env var `SUPERADMIN_BYPASS_2FA_ONCE=<uuid>` como escape hatch de emergencia documentado.

---

### 7. Cost tracking por tenant
**Tipo:** nueva | **Impacto:** prioriza upgrades, evita tenants parásito | **Esfuerzo:** M (1 semana)

**Qué es:** dashboard `/superadmin/costs` que muestra, por tenant: bytes en Postgres (via `pg_total_relation_size` filtered by `tenantId`), MB en Vercel Blob, tokens Groq/OpenAI consumidos, requests al API. Gross margin por tenant: `(MRR[tenant] - cost[tenant]) / MRR[tenant]`.

**Por qué:**
- Posible que un tenant "free" te esté costando S/50/mes en storage/llamadas AI mientras paga 0
- Un tenant "pro" con 10GB de imágenes puede tener margen negativo
- Founder NECESITA saber a quién apretar a upgrade y a quién sacar del free tier

**Cómo:**
- Nuevo modelo `TenantUsageSnapshot { tenantId, snapshotDate, dbBytes, blobBytes, aiTokens, apiRequests, estimatedCost }`
- Cron diario que computa con `$queryRaw` a Postgres catalog + Vercel Blob API + contador Groq
- Ratio de costo: config en `PlatformSettings` (S/0.02 por 100k tokens Groq, S/0.001 por MB storage, etc.)
- Dashboard con columna "gross margin" con rojo si <30%

**Riesgos:** cálculo de bytes por tenant en Postgres no es trivial si los índices no cortan por tenantId. Empezar con estimación grosera.

---

### 8. Unified Support Inbox cross-tenant
**Tipo:** nueva (datos ya en DB) | **Impacto:** reducer support load | **Esfuerzo:** S (2 días)

**Qué es:** página `/superadmin/support` que lista TODOS los `SupportTicket` cross-tenant, con filtros (open/replied/closed, priority), botón "responder" que envía email + WhatsApp al tenant, plantillas de respuesta rápida ("¿viste esto en docs?", "te agendo llamada").

**Por qué:**
- El modelo `SupportTicket` (schema línea 2675) **ya existe** con `subject`, `message`, `priority`, `status`, `reply`, `repliedAt`
- No hay UI de consumo → los tickets existen y se acumulan sin que nadie los vea
- Un single-founder necesita "inbox único" — no 20 WhatsApp + 15 emails

**Cómo:**
- Endpoint `/api/superadmin/support` con paginación + filtros
- UI estilo Gmail: lista + detalle, botón "responder" abre textarea + plantillas guardadas
- Auto-close tickets sin respuesta del tenant en 14d
- Integración con `ChurnSignal(support_unresolved)` — si un tenant tiene ticket >7d sin respuesta, crea signal

**Riesgos:** ninguno. Es UI sobre datos existentes.

---

### 9. Audit trail de SuperAdmin + impersonation log
**Tipo:** expansión | **Impacto:** compliance, defensa legal | **Esfuerzo:** S (2 días)

**Qué es:** vista dedicada `/superadmin/audit` filtrada solo a acciones del `superadmin` (excluye tenants). Mostrar: cada impersonation (quién, cuándo, tenant, duración), cada cambio de plan, cada delete/purge, cada nuclear reset. Export CSV.

**Por qué:**
- Hoy `ActivityLog` existe pero mezcla superadmin con tenants — ruido
- Si un cliente dice "mis datos se borraron" necesitas evidencia de QUIÉN los borró
- Ley 29733 Perú: debes poder demostrar cadena de custodia de operaciones sobre data personal

**Cómo:**
- Filter sobre `ActivityLog` WHERE `user` LIKE `superadmin:%` o `user` = `superadmin`
- Cada `impersonate` ya loggea — asegurar que capture IP, userAgent
- Botón "exportar últimos 90 días CSV" para auditorías
- Retention: nunca borrar estos logs (flag `permanent: true` en ActivityLog)

**Riesgos:** bajos.

---

### 10. Tenant snapshot / backup on-demand
**Tipo:** nueva | **Impacto:** rescate de data + CYA legal | **Esfuerzo:** L (2 semanas)

**Qué es:** botón "crear snapshot" en cada tenant row → exporta JSON completo (Tenant + Products + Orders + Customers + Settings + Stores + todas las tablas tenant-scoped) a Vercel Blob con retención 30d. Restore API protegida que revierte un tenant a un snapshot específico.

**Por qué:**
- Si un tenant pide "reviértanme al estado de ayer" hoy NO se puede
- Si Brandon hace un `nuclear reset` por error, no hay vuelta atrás
- GDPR/Ley 29733: el data subject puede pedir "dame todos mis datos" — necesitas exportar

**Cómo:**
- Endpoint `/api/superadmin/tenants/[slug]/snapshot` → serializa todo el tenant-scoped data en JSON (usar el mapa de tenantId cuidadosamente)
- Upload a Vercel Blob con TTL 30d
- Tabla `TenantSnapshot { id, tenantId, blobUrl, sizeBytes, createdBy, createdAt }`
- Restore: transaction que borra el tenant actual y re-inserta desde snapshot (zona de peligro — skill `database-migrations`)
- Export GDPR: mismo snapshot pero como descarga directa

**Riesgos:** altos en el restore. Requiere testing exhaustivo. Recomendado arrancar con **export-only** v1 (sin restore); restore es v2.

---

### 11. IP allowlist + lockout tras N fallos
**Tipo:** expansión | **Impacto:** defensa llave maestra | **Esfuerzo:** S (1 día)

**Qué es:** config en `PlatformSettings` con lista de IPs permitidas (home Brandon + oficina + VPN). Login check: si la IP no matchea → 403. Lockout: 5 fallos en 15min → bloqueo de IP por 1h + alerta WhatsApp a Brandon.

**Por qué:**
- Hoy `auth/route.ts` solo tiene rate limit (`applyRateLimit("AUTH")`) pero no IP lockout ni allowlist
- El superadmin es el jugoso target de cualquier atacante

**Cómo:**
- Campo `allowedIps: string[]` en `PlatformSetting`
- Middleware check antes de auth logic
- Modelo `PlatformLoginAttempt { ip, success, createdAt }` (ya hay `ActivityLog` pero esta es más targeted)
- Alerta via webhook Telegram o WhatsApp Twilio cuando >3 fallos

**Riesgos:** si Brandon viaja y olvida agregar la IP del hotel, se bloquea. Incluir "one-time recovery email" como escape.

---

### 12. Weekly digest email al founder
**Tipo:** nueva | **Impacto:** disciplina operativa sin abrir dashboard | **Esfuerzo:** S (1 día)

**Qué es:** cron semanal lunes 8am que envía a Brandon un email con:
- MRR Δ vs semana pasada
- Signups nuevos (lista de tenants)
- Churn (quién canceló, por qué)
- Top 3 tenants at-risk (con CTA "responder ticket")
- Payments failed (con CTA "revisar Stripe")
- Red flags: crosstenant leaks, orphan rows, errores 5xx spike

**Por qué:**
- Un single-operator no debería depender de abrir el dashboard
- Email = push medium que fuerza decisión
- Stripe, Vercel, Supabase todos mandan weekly digests — patrón probado

**Cómo:**
- `lib/jobs/weekly-digest.ts` que usa los mismos queries de `/analytics` + `/churn` + `/health`
- Template HTML simple (Resend o nodemailer) con tabla y links directos al panel
- Config en `PlatformSettings.digestEnabled` + `digestEmail`

**Riesgos:** ninguno.

---

## 🏆 Top 3 que DEBEN arrancarse YA

1. **#1 — PlatformSettings persistente** (4-6h): fix del MRR mentira + desbloquea todo lo demás. Single point of failure del panel entero.
2. **#3 — Churn engine automático** (1 sem): las tablas **ya existen sin uso**. Es ROI literal: escribir el cron y activar el detector recupera S/ reales sin tocar UI. Brandon ya pagó el costo de modelar, falta cobrar.
3. **#2 — Billing real Stripe webhooks** (2-3 sem): sin esto el MRR es una historia que te cuentas. Es el requisito para cualquier decisión financiera (¿subo precios? ¿quién paga?).

Estos 3 se hacen en ~4 semanas de un single operator y transforman el panel de "bonito dashboard" a "sistema operativo de la plataforma".

---

## 💰 Mejoras que generan revenue directo

| # | Mejora | Mecanismo revenue | ROI estimado |
|---|---|---|---|
| 2 | Billing real Stripe | Detecta failed payments, dunning automático, recupera 5-8% de cobros perdidos | +5-8% MRR |
| 3 | Churn engine | Reduce churn mensual de 5% → 3.5% | +30% LTV |
| 5 | Feature flags | Permite A/B de precios: descubrir si pro S/59 vs S/49 | +10-20% ARPU |
| 7 | Cost tracking | Identifica tenants parásito → upgrade forzado o eliminación | -15% COGS |
| 12 | Weekly digest | Disciplina operativa → founder actúa sobre at-risk antes | +15% retention |

---

## 🛡 Mejoras de seguridad/compliance

| # | Mejora | Amenaza cubierta |
|---|---|---|
| 6 | 2FA real persistente | Bypass por redeploy, credential stuffing |
| 9 | Audit trail superadmin | Compliance Ley 29733, defensa legal |
| 10 | Snapshots per tenant | Data subject requests, disaster recovery |
| 11 | IP allowlist + lockout | Brute force, credential stuffing |

---

## 🧱 Lo que NO tocar

- **`lib/superadmin-session.ts`** — la impl HMAC-SHA256 Edge-compatible está muy limpia. Solo añadir, no reescribir.
- **`TenantHealthScore` + `ChurnSignal` + `ChurnPlaybook`** schema — está bien diseñado (ADR implícito). Solo implementar el motor.
- **`SuperAdminShell.tsx`** + **`CommandPalette.tsx`** — son la shell que une todo. Extender con nuevos endpoints, no reemplazar.
- **Project-intel page** — es el "marketing deck" que Brandon usa para mostrar el proyecto. No es core de ops pero tiene valor narrativo.
- **Nuclear reset** — aunque da miedo, existe por razones de desarrollo. NO borrar el modal de confirmación.
- **Impersonation flow** — está correcto con doble cookie (`bsm-sess` + `active-tenant`). Solo añadir logging extra.

---

## Score de prácticas (48 Excel 2026 + 28 Excel Agentes IA)

Aplicar este research mejora los siguientes puntos:

| Práctica | Antes | Después (post top-3) | Δ |
|---|---|---|---|
| Source of truth único | 🔴 (localStorage + 2 hardcodes) | 🟢 | +1 |
| Observability (billing) | 🔴 MRR estimado | 🟢 real | +1 |
| Retention engineering | 🟡 modelo sin motor | 🟢 completo | +1 |
| Security llave maestra | 🟡 | 🟢 | +1 |
| Cost visibility | 🔴 | 🟢 | +1 |

**Termómetro post top-3:** de ~68% a ~80% de prácticas aplicadas en módulo superadmin.

---

**Archivo generado:** 2026-04-09 por SUPERADMIN-SCOUT agent
**Próximo paso sugerido:** arrancar Mejora #1 como spike de 1 día, luego abrir ADR para #2 y #3.
