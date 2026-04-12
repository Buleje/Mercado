# ADR 016 — Plan Maestro 24 Semanas: Buleje Enterprise Marketplace

**Status:** Accepted
**Date:** 2026-04-08
**Related:** ADR 003 (BullMQ), ADR 004 (dual tenant), ADR 005 (feature flags), ADR 010 (LLM router), ADR 011 (delivery raw SQL), ADR 014 (middleware split), ADR 015 (step confirmar)

## Context

Tras 3 semanas de refactor agresivo (delivery D1, chat D2, reviews D3, middleware split, step confirmar, TypeScript strict gate, refactor admin/page.tsx) el proyecto llegó a un estado medible:

- 131 modelos Prisma, 485 route handlers, 37 DB classes, 372 componentes admin
- 2,562 tests unitarios verdes, 17 ADRs activos
- 3 bloques marketplace en producción (delivery, chat, reviews)
- Integraciones vivas: WhatsApp Cloud API, SUNAT-Nubefact (boleta/factura), MercadoPago, Stripe, Stripe Connect, RENIEC, Push Web VAPID, Groq, BullMQ
- Sentry + OpenTelemetry + Vercel Speed Insights + Microsoft Clarity

Brandon (founder) paga **Claude Code tier $200/mes** y pidió explícitamente: "modo ambicioso nivel 4, arrancar varias cosas a la vez, multi-agente, máxima paralelización manteniendo calidad".

Brandon necesita llevar Bodega de "1 bodega en producción + 1 demo" a "50-500 bodegas activas con marketplace bilateral, AI nativa, delivery network y expansión nacional preparada" — sin contratar equipo.

## Decision

Ejecutar un **plan maestro de 24 semanas en 8 sprints** basado en el análisis cross-agent de 5 especialistas Opus corriendo en paralelo (solution-architect, performance-engineer, data-analyst, seo-growth-strategist, integration-specialist).

El plan tiene **50 iniciativas priorizadas** en 4 tiers (S/A/B/C) + una **Etapa 0 de Quick Wins** (8 bugs críticos) que se ejecutó antes del Sprint 1.

### Hallazgo clave de la auditoría cross-agent

Los 5 agents coinciden: **el proyecto está 60-70% construido hacia un marketplace enterprise** — el chasis completo existe pero los loops están abiertos. No hay que reescribir, hay que **cerrar loops y activar capacidades latentes**.

Componentes enterprise ya presentes pero desconectados:
- `lib/stripe-connect.ts` + `CommissionLedger` — sin loop de payouts
- `TenantHealthScore` + `ChurnSignal` models — sin runtime
- `lib/check-plan-limit.ts` + `lib/usage.ts` — sin metering real
- `lib/forecasting/demand-predictor.ts` — media móvil básica sin clima
- `lib/churn/health-scorer.ts` — solo tenants B2B, falta buyers B2C
- `app/api/v1/` + `lib/api-keys.ts` + OpenAPI spec — sin publicar como producto
- `lib/whatsapp-bot.ts` + conversation-engine — sin templates ni catálogo
- `pgvector` disponible en Supabase — no activado
- `cacheComponents` Next 16 — disponible, NO activado
- 485 route handlers, **solo 13 con cache** (2.7% cobertura)

### Las 5 iniciativas cross-cutting (multiplicadores transversales)

| # | Iniciativa | Aparece en reportes de | Sprint |
|---|---|---|---|
| CC1 | **Cache Components Next 16 + `use cache` + tag invalidation** | Architect, Performance, SEO | 1 |
| CC2 | **WhatsApp como Canal Universal Multi-uso** (7 aplicaciones distintas) | Architect, Data-analyst, SEO, Integrations | 2 |
| CC3 | **pgvector Embeddings** (RAG + Recommender + Semantic Search) | Architect, Data-analyst | 3 |
| CC4 | **Programmatic SEO + Marketplace × Zona + Catálogo Canónico** | Architect, SEO, Integrations | 4-5 |
| CC5 | **Vercel AI Gateway** (failover + observabilidad + cost cap) | Data-analyst, Integrations | 1 |

### Plan sprint-by-sprint

**Sprint 1 (sem 1-3): FUNDAMENTOS + QUICK WINS**
- Q1-Q8 quick wins bugs críticos (~2.5h total)
- CC1 Cache Components + `use cache` en layout raíz
- CC5 Vercel AI Gateway (migrar `lib/groq-fetch.ts`)
- P1 Dashboard aggregates (refactor del sangrado #1 de CPU)
- A1 Onboarding self-service parte 1 (wizard + state machine)
- I1 Guía de Remisión SUNAT (extender Nubefact)
- G1 Google Business Profile + Map Pack
- D1 AI Insights Card diario WhatsApp

**Sprint 2 (sem 4-6): AI + CANAL NATURAL**
- A1 Onboarding self-service parte 2 (cierre)
- D2 Hybrid Recommender v2 con pgvector + re-rank por margen
- D3 WhatsApp AI Concierge buyers (tool-use Groq)
- A2 Billing con metering + Stripe Usage Records
- G2 Fix Google Merchant feed + free listings
- G3 JSON-LD enriquecido + FAQPage + Breadcrumb
- I5 WhatsApp templates aprobados + Meta Catalog
- G9 Programmatic SEO kickoff (20-50 landing pages piloto)

**Sprint 3 (sem 7-9): PAGOS + RETENCIÓN**
- I3 Pasarela peruana Culqi/Izipay
- I4 PagoEfectivo cash-in
- D4 Buyer Churn Predictor + WhatsApp win-back
- D5 Smart Replenishment + PO al proveedor
- D7 Demand Forecaster v2 (clima + calendario)
- P2 Marketplace público CDN cache + tags
- P3 Bundle slim (LazyMotion + Recharts lazy + sideEffects)
- A4 Product analytics + telemetría
- G5 Viral loop WhatsApp Share

**Sprint 4 (sem 10-12): MARKETPLACE ECONOMY**
- A6 Marketplace bilateral comisiones parte 1 (KYC + ledger)
- A7 Public API + SDK v1
- G8 llms.txt enriquecido
- I6 OTP por WhatsApp
- I7 Axiom.co logs serverless
- P5 Imágenes blur + priority + Vercel Blob/R2
- G6 Marketplace × distrito (250 páginas)

**Sprint 5 (sem 13-15): CATÁLOGO CANÓNICO + PRICING**
- A3 Catálogo central canónico parte 1
- A6 Marketplace bilateral parte 2 (payouts batch + facturación)
- A8 Public API rate limiting + scopes
- P6 `withCache()` wrapper top 20 endpoints
- A9 Pricing dinámico no-code
- D6 Dynamic Pricing v2 + scraper competidores
- D8 Cohort Retention + LTV BG/NBD
- D9 Anomaly Detection por SKU
- G10 GSC dashboard + alertas

**Sprint 6 (sem 16-18): AFINADO + GROWTH ASIMÉTRICO**
- A3 Catálogo canónico parte 2 (UI admin + ANMAT retiros)
- I8 Olva Courier API (envío inter-ciudades)
- P8 Cron consolidation 47 → ~15
- G11 WhatsApp Status + TikTok feed cron
- D10 Atribución multi-touch UTM

**Sprint 7 (sem 19-21): LOGÍSTICA DE RED**
- A10 Logística inter-tienda (DeliveryNetworkPartner) kickoff
- A11 i18n + multi-currency desde el core
- I9 Yape oficial vía Izipay/Culqi
- P10 Recharts lazy real (13 archivos)

**Sprint 8 (sem 22-24): EXPANSIÓN NACIONAL**
- A10 Logística inter-tienda cierre
- Primer tenant Iquitos/Lima
- Primer tenant Bolivia (si aplica)
- ADR 017/018/019 documentación arquitectónica final

## Alternativas consideradas

1. **Reescritura completa a monorepo Turborepo (next-forge style).** Descartado — el proyecto actual funciona, tiene 2562 tests verdes, y una reescritura a monorepo mata el momentum por 2-3 meses sin desbloquear ninguna feature nueva. La deuda de monorepo se puede pagar después si hace falta.

2. **Contratar equipo de 3 devs y atacar todo en paralelo.** Descartado — Brandon es emprendedor solo, paga Claude Code tier $200/mes para maximizar capacidad sin contratar. Los agent teams + subagentes cubren el rol de 3-5 devs junior sin el costo fijo mensual.

3. **Ir directo al marketplace bilateral (Sprint 4) y saltear quick wins.** Descartado — la etapa 0 identificó bugs que son **riesgo legal** (rating fake en SchemaMarkup = penalización Google) y **sangrado de dinero real** (dashboard aggregates = -80% Active CPU). No hacerlos primero es tirar plata mientras construís lo siguiente.

4. **Hacer 1 sprint a la vez sin paralelizar.** Descartado por mandato explícito: Brandon pidió "máxima paralelización nivel 4, multi-agente, más etapas simultáneas". En cada sprint corren 2-4 agent teams en paralelo sobre iniciativas independientes.

5. **Priorizar SEO/growth antes que AI/datos.** Descartado — los 5 agents coincidieron en que **la feature #4 de data-analyst (Hybrid Recommender v2) tiene el ROI individual más alto** de todo el plan (S/3,600-6,750/mes/tienda). SEO es palanca, Recommender es caja.

## Consequences

### Positivas

- **Escalamiento asimétrico:** el plan convierte al proyecto en plataforma (take rate del marketplace) en vez de software (licencias por tenant), multiplicando el ceiling de ingresos 10x.
- **Network effects activados:** catálogo canónico + delivery inter-tienda + AI Concierge crean efectos de red donde cada nueva bodega mejora a las demás.
- **Moat defensivo:** programmatic SEO por zona + Map Pack + llms.txt es territorio donde Rappi/PedidosYa NO pueden competir (no tienen tiendas físicas en Pucallpa).
- **Compliance preventivo:** Guía de Remisión SUNAT en Sprint 1 elimina riesgo legal antes de escalar.
- **Calidad mantenida:** cada sprint tiene gates bloqueantes (tsc + lint + test + coverage) y cada iniciativa termina con verificación + commit atómico + actualización de TECH-DEBT.

### Negativas

- **Complejidad operativa aumenta:** metering + marketplace bilateral + catálogo canónico + logística inter-tienda implican más sistemas para debuggear. Mitigación: Sprint 4 mete Axiom.co logs serverless para búsqueda histórica.
- **Costo Vercel puede crecer:** más features = más invocaciones. Mitigación: Sprint 1 activa Cache Components + migra a `use cache`, lo que baja invocaciones -60-80% en rutas públicas.
- **Riesgo de quedar "a medias":** 24 semanas es largo. Si Brandon pausa en Sprint 3-4, queda un sistema con billing + pagos peruanos + AI pero sin marketplace bilateral. **Mitigación:** cada sprint es auto-contenido — el proyecto sigue funcionando aunque pares después de cualquier sprint.
- **Complejidad legal en Sprint 5-6:** marketplace bilateral + payouts + comisiones SUNAT entran en territorio regulado (Indecopi, SBS). Mitigación: antes de Sprint 5, 1 asesoría legal externa (no abogado a tiempo completo).

## Implementation notes

### Estado al 2026-04-08 (cierre de este ADR)

**Etapa 0 QUICK WINS — 8/8 ✅ COMPLETADOS en ~1h30:**

| # | Quick win | Estado | Archivos |
|---|---|---|---|
| Q1 | `aggregateRating: "328"` fake eliminado | ✅ | `components/SchemaMarkup.tsx` |
| Q2 | `public/robots.txt` borrado (host conflictivo) | ✅ | — |
| Q3 | Shopping feed URL fix `/tienda/${id}` + `g:shipping` + `g:identifier_exists` + observabilidad | ✅ | `app/api/shopping-feed/route.ts` |
| Q4 | Proxy matcher estricto excluyendo 11 paths más | ✅ | `proxy.ts` |
| Q5 | `cacheComponents: true` activado en `next.config.ts` | ✅ | `next.config.ts` |
| Q6 | `useAdminAlerts` pause on `document.visibilityState === "hidden"` + `visibilitychange` reactivación | ✅ | `app/admin/_hooks/useAdminAlerts.ts` |
| Q7 | `unstable_cache` (deprecado Next 16) → `"use cache" + cacheTag + cacheLife("hours")` en layout raíz | ✅ | `app/layout.tsx` |
| Q8 | `.env.example` extendido con 10 secciones nuevas (AI Gateway, WhatsApp Business, Stripe Connect, MercadoPago, RENIEC, VAPID, Redis, Cron, Analytics, + roadmap note) | ✅ | `.env.example` |

**CC5 Vercel AI Gateway — ✅ MIGRADO:**

- `lib/groq-fetch.ts` refactorizado:
  - Resuelve endpoint dinámicamente: `AI_GATEWAY_API_KEY` > `VERCEL_OIDC_TOKEN` > Groq directo (fallback)
  - Función `resolveEndpointAndAuth()` maneja los 3 paths con log del provider elegido
  - Zero breaking change: Groq API keys existentes siguen funcionando como fallback
  - Logging debug del provider en el primer intento de cada call

**Verificación Sprint 1 Etapa 0 + CC5:**

- `npx tsc --noEmit` → 0 errores en primera pasada
- `npx eslint` sobre 7 archivos tocados → 0 warnings
- `npm run test` sobre checkout + feature-flags + skills-structure → **447/447 verde**

### Agent teams del Sprint 1 (lanzados en background 2026-04-08)

Se lanzaron 3 agentes Opus en paralelo sin esperar que termine ninguno:

1. **`backend-platform-engineer`** — P1 Dashboard aggregates refactor (reporte de diff + métricas)
2. **`solution-architect`** — A1 Onboarding self-service blueprint (wizard + state machine + worker BullMQ)
3. **`integration-specialist`** — I1 Guía de Remisión SUNAT via Nubefact (spike + modelo Prisma + DB class + worker)

Los 3 retornan reportes de diseño (no escriben al repo) para revisión humana antes de la implementación real en Sprint 1 semana 2-3.

### Orden de dependencias técnicas (importante para paralelizar)

```
Quick wins (Q1-Q8) → independientes entre sí → todo en paralelo
CC5 AI Gateway    → independiente → paralelo con Q
CC1 Cache Components → requiere Q5 (`cacheComponents: true` flag)
CC3 pgvector      → requiere habilitar extensión Supabase (sprint 2-3)
A1 Onboarding     → independiente, 2 sprints de desarrollo
A6 Marketplace    → requiere A2 Billing + I3 Pasarela peruana
A3 Catálogo canón → requiere A1 onboarding para que las tiendas nuevas nazcan canónicas
A10 Logística red → requiere masa crítica de 10+ tenants (Sprint 7)
A11 i18n         → requiere A3 catálogo canónico (feature flag por tenant.country)
```

### Métricas de seguimiento del plan

Medir cada 2 semanas:

| Métrica | Baseline (2026-04-08) | Target mes 6 | Target mes 12 |
|---|---|---|---|
| Tenants activos | 1 + 1 demo | 50 | 300 |
| GMV mensual | TBD | S/250k | S/1.5M |
| Time-to-first-sale | Manual (>24h) | < 1h | < 15 min |
| Cache hit rate (public routes) | ~3% | 80% | 90% |
| Active CPU costo/mes Vercel | $X baseline | -50% | -70% |
| Core Web Vitals LCP mobile 3G | 4-7s | 2-3s | < 2s |
| Tests unitarios totales | 2,562 | 3,500 | 5,000 |
| Tests e2e | ~20 | 50 | 150 |
| Route handlers con cache | 13 / 485 (2.7%) | 60 / 550 (11%) | 150 / 700 (21%) |
| Features AI deployed | 5 (bots + snapshot + chat) | 15 | 25+ |
| ADRs activos | 17 | 25 | 35 |

## Related docs

- `docs/ROADMAP-24-WEEKS.md` — vista ejecutiva del plan con calendario visual
- `docs/adr/003-fire-and-forget-to-bullmq.md` — workers base para los nuevos flows
- `docs/adr/010-llm-router-strategy.md` — contexto de por qué migramos al AI Gateway
- `docs/adr/014-middleware-module-split.md` — fundación del proxy.ts modular que permitió Q4 (matcher más estricto)
- `CLAUDE.md` sección "Zona de peligro" — lista de archivos críticos que el plan va a tocar
- `docs/TECH-DEBT.md` — ítems TD-002 a TD-034, varios se cierran en el plan

## Open questions

1. ¿Cuándo activar `pgvector` en Supabase? — requiere SQL DDL que no se puede hacer vía migración Prisma. Owner: Brandon manual, pre-Sprint 3.
2. ¿Culqi vs Izipay como primer provider peruano? — el integration-specialist recomendó Culqi por onboarding online; pendiente confirmación comercial con Brandon.
3. ¿El target de 50 tenants mes 6 es realista? — depende de ejecutar Sprint 1 Onboarding self-service en tiempo y de que el mercado de Pucallpa responda al marketing orgánico (SEO + Google Business + WhatsApp viral). Revisar en Sprint 3.
4. ¿Logística inter-tienda (A10) es defendible legalmente? — romper el aislamiento multi-tenant de forma controlada necesita asesoría legal. Mitigación: diseño explícito con `participatingTenantIds[]` y auditoría obligatoria.

## Supersedes / superseded by

- **Supersedes:** nada formal, pero reemplaza al roadmap informal de memoria `project_sprint_roadmap.md`
- **Superseded by:** TBD — probable ADR 017 (Marketplace Economy v2) al cierre de Sprint 4

---

## Amendment 2026-04-09 — Master Roadmap research wave + 6 bugs críticos

### Context de la enmienda

El 2026-04-09 se corrió una **research wave cross-layer** con 6 agents Opus en paralelo cubriendo marketplace, admin modules, superadmin, store individual, cross-cutting platform y product-UX. Output consolidado en `docs/research/MASTER-ROADMAP-2026-04-09.md` con **84 mejoras priorizadas** (Tier S: 15, Tier A: 16, Tier B: 15, Tier C: 30+).

Durante la auditoría aparecieron **6 bugs críticos** que NO estaban en el plan original y que bloquean el salto de "1 bodega en producción" a "50 tenants activos":

| # | Bug | Archivo | Impacto | Sprint target |
|---|-----|---------|---------|---------------|
| **B1** | PlatformSettings persiste solo en localStorage → superadmin cambia precio y al recargar vuelve al hardcode | `app/superadmin/settings/page.tsx:11-18` | MRR fake, métricas de negocio sin fuente de verdad | **Sprint 1 (hot-fix 2026-04-09)** |
| **B2** | MRR enterprise hardcodeado `399` en analytics vs `499` en superadmin-types | `app/api/superadmin/analytics/route.ts:69` + `lib/superadmin-types.ts:72` | Off-by-100 por cada tenant enterprise en todos los reportes | **Sprint 1 (hot-fix)** (resuelto por B1) |
| **B3** | Tenants fantasma en marketplace apply — tenantId `store-${phone}` que no existe en tabla Tenant | `app/api/marketplace/stores/apply/route.ts:54,65` | Rompe aislamiento multi-tenant, bloquea onboarding post-aprobación | **Sprint 1 (hot-fix)** |
| **B4** | Rate limit en memoria (`new Map()`) → bypassable multiplicando instancias Vercel | `lib/middleware-utils.ts:51-110` | Todo endpoint público es vulnerable a brute-force distribuido | **Sprint 1 (hot-fix)** |
| **B5** | Abandoned cart email va al admin, no al cliente | `app/api/cart/abandoned/route.ts` (UX research) | Se desperdicia el recordatorio — debería mandarse al cliente | **Sprint 2** |
| **B6** | Daily briefing promete WhatsApp pero solo manda email | `lib/notification-generators.ts` (UX research) | Inconsistencia producto-promesa | **Sprint 2** |

### Amendment decision

1. **Añadir Wave 0.5 de hot-fixes** antes de continuar con Sprint 1 regular. Wave 0.5 cubre B1-B4 (los 4 bugs server-side críticos) y se ejecuta con **4 agents en paralelo** en un solo día. B5/B6 quedan para Sprint 2 como parte del bloque UX.
2. **Crear módulo Superadmin → Roadmap** (nuevo item S0) que lea el Master Roadmap y permita marcar completado cada ítem. Sustituye al seguimiento manual via memoria.
3. **Cross-link bidireccional:** este ADR apunta al Master Roadmap, el Master Roadmap apunta al ADR como fuente arquitectónica.
4. **Reafirmar el plan original:** los 50 items tiered (S/A/B/C) siguen siendo válidos. El Master Roadmap **no** reemplaza a este ADR — lo amplía con 34 ítems adicionales descubiertos en la research wave.

### Nuevos ADRs disparados por esta enmienda

| ADR | Tema | Status |
|-----|------|--------|
| 022 | Upstash Redis distributed rate limit (reemplaza `Map()` en memoria) | Draft 2026-04-09 |
| 023 | Marketplace apply con Tenants reales (elimina tenants fantasma) | Draft 2026-04-09 |
| 024 | PlatformSettings persistence + single source of truth de precios | Draft 2026-04-09 |

### Métricas adicionales a trackear post-Wave 0.5

- Rate-limit evictions/min (Upstash) — debe ser > 0 en tráfico real.
- Drift entre `PlatformSettings.value` y `superadmin-types.ts` — debe ser 0 (se elimina el hardcode).
- Stores con `tenantId` matching `/^store-\d+$/` — debe ser 0 tras el cleanup script.
- Superadmin Roadmap items marcados completados / 84 total — KPI de ejecución del plan maestro.

### Referencias a la research wave

Todos bajo `docs/research/`:

- `MASTER-ROADMAP-2026-04-09.md` — consolidación ejecutiva (84 ítems, 3 waves)
- `marketplace-improvements-2026-04-09.md` (14 ítems)
- `admin-modules-improvements-2026-04-09.md` (18 ítems)
- `superadmin-improvements-2026-04-09.md` (12 ítems)
- `store-individual-improvements-2026-04-09.md` (14 ítems)
- `cross-cutting-improvements-2026-04-09.md` (13 ítems)
- `product-ux-improvements-2026-04-09.md` (13 ítems)

Cada archivo conserva el análisis detallado por área (problema → evidencia → fix propuesto → impact score). El Master Roadmap es la vista agregada priorizada.
