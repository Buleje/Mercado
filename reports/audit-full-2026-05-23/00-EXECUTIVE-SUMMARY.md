# Auditoría Enterprise Completa — Buleje 2026-05-23

**Branch:** `prod` · **Dispatch:** 12 agentes especialistas en paralelo · **Duración:** ~25 min total
**Baseline:** 818K LOC TS/TSX · 1,647 componentes · 880 endpoints · 199 DB classes · 172 modelos · 109 ADRs · 4,801 tests

---

## 🔴 ESTADO GENERAL: NO APTO PARA DEPLOY

| Dimensión | Estado | Razón |
|---|---|---|
| **Producción (buleje.pe)** | 🔴 **CRITICAL** | DNS NXDOMAIN + DEPLOYMENT_DISABLED en alias default |
| **App interna (alias)** | 🟢 OK | `mercado-hazel.vercel.app` 200 OK, DB 30ms |
| **Seguridad** | 🟡 MEDIO-BAJO | 0 P0, 6 P1 sistémicos |
| **Marketplace (dinero)** | 🔴 **CRÍTICO** | 6 P0 financieros — comisión rota + Stripe units bug |
| **Database** | 🟡 RIESGO | 5 P0 (Float en dinero, tenantId nullable, cascadas peligrosas) |
| **Backend** | 🟡 RIESGO | 28 `force-dynamic` reintroducidos (rompe-servidor confirmado) |
| **Performance** | 🟡 ALTO | Chunks 947KB + 910KB, 3 contexts sin memo |
| **Integraciones** | 🟡 RIESGO | MP sin timeout, Resend sin retry |
| **Tests** | 🟡 60/4491 rojos | Cobertura crítica en dinero parcial |
| **SEO** | 🟢 BUENO | Falta LocalBusiness para Knowledge Panel |
| **Data/KPIs** | 🟢 SÓLIDO | AutoReports es shell sin backend |
| **FinOps** | 🟢 SANO | $40/mes 4 tenants · margen 87-88% |

---

## P0 BLOQUEANTES (19 total — ordenados por blast radius)

### A. PRODUCCIÓN CAÍDA (SRE — bloquea cualquier deploy)

| # | Hallazgo | Acción inmediata |
|---|---|---|
| 1 | **`buleje.pe` NXDOMAIN** — DNS público sin A/CNAME | Configurar DNS en registrador o usar `mercado-hazel.vercel.app` temporal |
| 2 | **`mercado.vercel.app` HTTP 451 DEPLOYMENT_DISABLED** | Ticket a Vercel — investigar bloqueo legal |
| 3 | **`UPSTASH_REDIS_REST_URL` con `\n` final** → rate-limit caído | Re-add env var sin newline |
| 4 | **`STRIPE_STARTER_PRICE_ID` + `PRO_PRICE_ID` FALTAN** → checkout SaaS roto | Crear Prices en Stripe + agregar IDs a Vercel |
| 5 | **DR drill nunca ejecutado** (ADR-035 incumplido) | Correr drill con `DR_BACKUP_PATH` |

### B. DINERO (Marketplace — pierde plata real)

| # | Hallazgo | Impacto |
|---|---|---|
| 6 | **Doble motor de comisión incompatible** — checkout usa `store.commission` 5% legacy, `CommissionsDB` reporta tier dinámico 2/3/4/5% sin aplicarse | Vendor tier inservible · cobro inconsistente |
| 7 | **`type:"sale"` vs enum oficial** `marketplace_fee\|delivery_fee\|platform_fee\|refund_reversal` | Filas escapan de `payoutSummaryByVendor` — vendors NO ven sus ventas |
| 8 | **`status:"cleared"` vs enum `settled`** en `changeStatus` | Cron settle nunca las procesa → vendors NO cobran |
| 9 | **`verifyProofToken` lee `_pathHash` sin validarlo** contra storagePath | Bypass de comprobantes |
| 10 | **`ensureTenant` GET público auto-crea filas Tenant** por slug arbitrario | DoS vector |
| 11 | **Stripe Connect bug de unidades**: `application_fee_amount = amount × rate / 100` con `amount` en céntimos | Fee **100× menor** de lo debido |

### C. SCHEMA DB (Database — corrupción potencial)

| # | Hallazgo | Impacto |
|---|---|---|
| 12 | **`WholesaleOrder.tenantId` es `String?` nullable** (línea 2929) | Aislamiento multi-tenant ROTO |
| 13 | **`CommissionRule.rate` + `Store.commission` son `Float`** (líneas 1929, 2610) | Redondeo en dinero real |
| 14 | **`DeliverySOSAlert` sin `tenantId`** (línea 2756) | Alertas SOS cross-tenant visibles |
| 15 | **`NotaCredito → Order` con `Cascade`** (línea 2437) | Documento SUNAT borrado en cascada |
| 16 | **`Payment → Payable` con `Cascade`** (línea 912) | Evidencia contable destruible |

### D. TD-058 INCOMPLETO (memory contradicha)

| # | Hallazgo | Impacto |
|---|---|---|
| 17 | **`/api/cron/vendor-reverify` NO EXISTE** en `app/api/cron/` | TD-058 capas 4, 6, 7 INERTES — dashboard `/superadmin/vendor-health` muestra `neverRun=true` |

### E. PERFORMANCE (afecta UX en 3G Pucallpa)

| # | Hallazgo | Impacto |
|---|---|---|
| 18 | **Chunks 947KB + 910KB sin gzip** | TTI +4-6s en 3G |
| 19 | **2 RSC importan recharts sin `"use client"`** (DemandForecast, InventoryMetricsTab) | +120KB SSR bundle |

---

## P1 ALTOS (30+ total, agrupados)

### Seguridad (6)
- 295 routes con `prisma` directo (viola regla #1)
- 28 `force-dynamic` reintroducidos (regla #4 — rompe servidor)
- `Math.random()` en cupones/gift cards (RNG predecible)
- Demo password fijo `demo1234`
- `PaymentProofsDB` sin tenantId obligatorio
- `OrdersDB.getByCustomerPhone(phone)` shape legacy

### Backend (5)
- 12% endpoints con Zod `.parse()` (debe ser `safeParse`)
- TD-116: 880 endpoints sin `withRlsTenant()`
- ~40 endpoints write sin rate-limit explícito
- Cron sin idempotency robusta en sunat-retry
- Webhook MP sin validar firma antes de procesar

### Frontend (varios)
- **432 hex hardcodeados** en UI (TesoreriaModule × 14 con `#2563EB`)
- **557 `gray-*` sin `dark:`** equivalente
- **`MarketplaceModule.tsx` = 4,153 líneas** (14× límite)
- 26 definiciones locales de KPICard/StatCard/StatusBadge (shadow primitives)
- `text-xs` en body storefront (viola bsm-typography-rules)
- Emojis 🥉🥈🥇 activos en `MarketplaceModule:3838` (pendiente sprint anterior)

### Database (4)
- Wave-1 y Wave-2 de **27 índices** en `proposed-*.sql` sin aplicar (semanas de delay)
- 8 FKs sin índice (SavedCart, PurchaseItem, SaleItem, StockoutPrediction×2, DocumentShare)
- 5 migraciones MANUAL marketplace fuera del historial Prisma
- `Customer.phone` aún `@unique` global (TD-040 Phase 3 pendiente)

### Performance (6)
- 3 contexts sin useMemo en value (tenant, settings, promotions)
- 26 `<img>` raw en components/
- 5 CSS bg-image sin next/image
- Sin `/api/warmup`
- 10 setIntervals delivery sin `document.hidden` guard
- ratio cache 41% (281 getOrSet vs 681 writes)

### Integraciones (3)
- **Mercado Pago Preapproval sin timeout** ni circuit breaker → 504
- **Resend emails sin retry** → se pierden en 429/5xx
- **AI providers** circuit breaker mide tokens pero no red

### SEO (3)
- LocalBusiness schema falta (bloquea Knowledge Panel)
- NAP genérico
- INP mobile >200ms

### Data (3)
- AutoReportsTab es shell sin backend (UI promete reportes programados)
- MarketplaceDashboard usa datos mock
- Costo de merma S/ no calculado (mayor ROI para conversión trials)

### SRE (10 más)
- Sentry alert rules no configuradas
- Sin uptime monitor externo
- Faltan health endpoints en algunos crons
- SLO calculator sin baseline
- 4 runbooks documentados, ninguno con drill reciente

---

## P2 — DEUDA TÉCNICA (40+)

Detalle en cada reporte individual. Highlights:
- Storybook snapshots obsoletos
- Size-limit no configurado en CI
- HSTS explícito faltante (Vercel lo agrega por default)
- `dangerouslySetInnerHTML` con `JSON.stringify` sin escape `<` en 22 sitios

---

## ✅ VERIFICACIONES POSITIVAS (lo que SÍ funciona)

| Área | Estado |
|---|---|
| `npm audit` | 0 vulns (info/low/moderate/high/critical) |
| Bcrypt hashing + HMAC sessions CSPRNG | ✅ |
| CSRF double-submit + CSP + nonce | ✅ |
| RBAC matrix 26 recursos × 6 roles completa | ✅ |
| Raw SQL siempre parametrizada (`$1 $2`) | ✅ |
| Stripe webhook patrón modelo (HMAC + freshness + idempotency + dead-letter + cron replay) | ✅ |
| WhatsApp salida con circuit breaker + 3 retries + BullMQ | ✅ |
| SUNAT retry exponential + cron sunat-retry + estado "retrying" | ✅ |
| Multi-tenant guard (lib/middleware/tenant.ts con HMAC fallback) | ✅ |
| Cron auth `CRON_SECRET` con `timingSafeEqual` | ✅ |
| Cart context memoizado | ✅ |
| next/font/google + sin @import externos | ✅ |
| PostHog lazy con requestIdleCallback | ✅ |
| 35 `"use cache"` + 69 cacheLife/Tag en `app/` (pages, no API) | ✅ |
| Sitemap 8k URLs + robots.txt + hreflang | ✅ |
| Health endpoint con circuit breaker + Sentry + email superadmin | ✅ |
| Stack IA bien tiered (Haiku alto volumen, Sonnet smart, Opus nunca prod) | ✅ |
| Idempotency en orders + metering | ✅ |
| 0 logs 5xx en producción últimas 7d | ✅ |

---

## 🎯 PLAN DE ACCIÓN PRIORIZADO

### **FASE 0 — DESBLOQUEAR PRODUCCIÓN** (HOY, 1-2h)

1. Configurar DNS `buleje.pe` (A/CNAME a Vercel) — bloquea acceso de 4 clientes trial
2. Re-add `UPSTASH_REDIS_REST_URL` sin `\n` final
3. Crear Stripe Prices Starter + Pro + agregar IDs a Vercel env
4. Ticket a Vercel por `DEPLOYMENT_DISABLED` (no bloquea si usamos dominio principal)

### **FASE 1 — FIXES P0 DINERO** (esta semana, 1-2 días)

5. Unificar motor de comisión (eliminar legacy `store.commission`, usar `CommissionsDB.computeVendorTier`)
6. Fix enum `type` y `status` en ledger marketplace
7. Fix Stripe Connect unidades (céntimos vs unidades)
8. Crear `/api/cron/vendor-reverify` (TD-058 capa 4 — 8h)
9. Migration: `WholesaleOrder.tenantId` NOT NULL (backfill primero)
10. Migration: Float → Decimal en CommissionRule.rate + Store.commission
11. Revertir 28 `force-dynamic` (riesgo rompe-servidor, memory persistente)

### **FASE 2 — HARDENING** (esta semana, 1 día)

12. `Math.random()` → CSPRNG en 4 archivos (cupones, gift cards, delivery, image-bank)
13. `verifyProofToken` validar `_pathHash` contra storagePath
14. `ensureTenant` bloquear auto-create por slug arbitrario
15. Mercado Pago: agregar timeout + circuit breaker
16. Resend: wrapper `send-with-retry.ts`
17. Aplicar wave-1 de 27 índices proposed (`CREATE INDEX CONCURRENTLY`)

### **FASE 3 — PERFORMANCE** (1 día)

18. `"use client"` en DemandForecast + InventoryMetricsTab
19. useMemo en 3 contexts (tenant, settings, promotions)
20. Visibility guard en 10 setIntervals delivery
21. `npm run analyze` para diagnosticar chunks 947KB + 910KB

### **FASE 4 — TESTS REGRESIÓN** (1 día)

22. Triaje 60 tests fallando (memory) — skip + ticket o fix
23. Spec E2E checkout completo con Stripe test mode
24. Tests unit `lib/commissions.ts` (4 tiers)
25. Visual regression baseline 9 tabs

### **FASE 5 — DEPLOY** (después de Fases 0-4 verdes)

26. Build local OK + tsc clean + npm test verde
27. PR a master con resumen consolidado
28. Deploy preview Vercel
29. Smoke tests preview
30. Promoción a prod con canary 5% → 25% → 100%
31. DR drill post-deploy
32. Monitoreo activo 24h post-deploy

---

## ESTIMACIÓN DE ESFUERZO

| Fase | Trabajo | Tiempo (1 dev senior) | Crítico |
|---|---|---|---|
| Fase 0 — Desbloquear prod | DNS + env vars | 1-2h | 🔴 SÍ |
| Fase 1 — P0 dinero | 7 fixes + 2 migrations | 1-2 días | 🔴 SÍ |
| Fase 2 — Hardening | 6 fixes seguridad/infra | 1 día | 🟡 RECOMENDADO |
| Fase 3 — Performance | 4 quick wins | 1 día | 🟡 RECOMENDADO |
| Fase 4 — Tests | 4 áreas críticas | 1 día | 🟡 RECOMENDADO |
| Fase 5 — Deploy | Build + canary + monitor | 0.5 día | 🟢 SOLO post 0-4 |
| **TOTAL** | | **5-7 días** | |

---

## RECOMENDACIÓN EJECUTIVA

**NO DESPLEGAR HOY.** El audit revela:

- **Producción está CAÍDA** para los 4 clientes trial (buleje.pe NXDOMAIN, Stripe IDs faltantes)
- **6 P0 financieros** en marketplace que pueden corromper comisiones/pagos a vendors
- **5 P0 schema DB** que ponen en riesgo aislamiento multi-tenant y dinero (Float)
- **28 `force-dynamic`** que ya rompieron el servidor antes (hotfix bdb6f5f2)

**SECUENCIA RECOMENDADA:**

1. **Fase 0** (1-2h) → desbloquear acceso de los 4 clientes trial
2. **Fase 1-2** (2-3 días) → cerrar P0 dinero + hardening
3. **Fase 3-4** (2 días) → performance + tests regresión
4. **Fase 5** (0.5 día) → deploy con canary

**Si el trial cierra el 2026-06-12** (memory `project_4_clientes_free_trial.md`), tenés **20 días** hábiles. La auditoría confirma que con 5-7 días de trabajo focalizado el sistema está listo para go-live profesional.

---

## ARCHIVOS DETALLADOS

| # | Reporte | Tamaño |
|---|---|---|
| 01 | [Security OWASP](01-security.md) | 17 hallazgos |
| 02 | [Backend endpoints](02-backend.md) | 20 endpoints problemáticos |
| 03 | [Frontend DS + a11y](03-frontend.md) | 432 hex, 557 dark, monolitos |
| 04 | [Database schema + N+1](04-database.md) | 5 P0, 27 índices pendientes |
| 05 | [Performance CWV](05-performance.md) | 3 P0, 6 P1 |
| 06 | [QA tests](06-qa.md) | 60 rojos + 10 áreas sin cobertura |
| 07 | [Marketplace](07-marketplace.md) | 6 P0 dinero + TD-058 incompleto |
| 08 | [Integraciones](08-integrations.md) | 3 P0 + Stripe modelo |
| 09 | [Data Analytics](09-data-analytics.md) | 19/20 KPIs OK + 3 gaps |
| 10 | [SEO storefront](10-seo.md) | LocalBusiness falta |
| 11 | [FinOps costos](11-finops.md) | $40/mes · margen 87% |
| 12 | [SRE prod](12-sre-prod.md) | 🔴 CRITICAL — buleje.pe NXDOMAIN |
