# Roadmap 24 Semanas — Buleje Enterprise Marketplace

> Vista ejecutiva del Plan Maestro. Detalle arquitectónico completo en [ADR 016](./adr/016-plan-maestro-24-weeks.md).

**Objetivo:** Llevar Bodega de "1 bodega en producción + 1 demo" a "50-500 bodegas activas con marketplace bilateral, AI nativa, delivery network y expansión nacional preparada".

**Modelo de ejecución:** Brandon (founder solo) + Claude Code tier $200/mes + agent teams en paralelo (nivel 4 ambición).

---

## 🗺️ Línea de tiempo maestra

```
Sem:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23  24
      │───Sprint 1───│───Sprint 2───│───Sprint 3───│───Sprint 4───│───Sprint 5───│───Sprint 6───│───Sprint 7───│───Sprint 8───│
      │ FUNDAMENTOS  │ AI + WHATSAPP│ PAGOS + RETEN│ MARKETPLACE  │ CANON + PRIC │ AFINADO + SEO│ LOGÍSTICA RED│ EXPANSIÓN NAC│
      │              │              │              │              │              │              │              │              │
🎯    Cache + AI GW   Onboarding+AI  Culqi+PEfect.  Stripe Connect  Canon+Pricing  Olva+TikTok   DeliveryNet    Iquitos+Lima
      Dashboard agg.  Recommender    Churn+Forecast  KYC+Payouts    RAG+UI admin  cron consol   i18n+currency  Bolivia(?)
```

---

## 🎯 Hitos por sprint (lo que cambia al final de cada uno)

| Sprint | Duración | Estado al cierre | Deliverables clave |
|---|---|---|---|
| **0** (Quick Wins) | 2.5h | ✅ **Completado 2026-04-08** | 8 bugs críticos + Vercel AI Gateway migrado |
| **1** Fundamentos | sem 1-3 | ✅ **Completado 2026-04-10** | `cacheComponents` activo, Dashboard aggregates, Onboarding wizard 5 pasos, SUNAT Nubefact real, AI Insights daily-summary |
| **2** AI + WhatsApp | sem 4-6 | 🟡 en progreso (#6 + #4 cerrados 2026-04-17) | ✅ Hybrid Recommender v2 con pgvector (ADR-042 codigo + tests 24/24 verde, solo falta `psql` manual), ✅ WhatsApp Concierge AI-first activado en webhook real (ADR-058 + bug hoisting fixed), Billing metering, Programmatic SEO piloto |
| **3** Pagos + Retención | sem 7-9 | ⬜ pending | Culqi+Izipay, PagoEfectivo, Buyer Churn, Smart Replenishment, Bundle slim |
| **4** Marketplace Economy | sem 10-12 | ⬜ pending | Marketplace bilateral KYC + ledger, Public API v1, Axiom logs |
| **5** Catálogo + Pricing | sem 13-15 | ⬜ pending | Catálogo canónico, Pricing dinámico no-code, Dynamic Pricing v2, LTV BG/NBD |
| **6** Afinado + Growth | sem 16-18 | ⬜ pending | Olva Courier, cron consolidation, WhatsApp Status cron, Marketplace × distrito |
| **7** Logística de Red | sem 19-21 | ⬜ pending | DeliveryNetworkPartner, i18n + multi-currency, Yape oficial |
| **8** Expansión Nacional | sem 22-24 | ⬜ pending | Primer tenant Iquitos/Lima, Bolivia si aplica, ADRs finales |

---

## 🟥 Tier S — Multiplicadores transversales (no negociables)

Las 10 iniciativas de máximo ROI. Si por cualquier razón el plan se acorta, estas **no se pueden saltear**.

| # | Iniciativa | Sprint | Esfuerzo | ROI estimado |
|---|---|---|---|---|
| 1 | Cache Components Next 16 + `use cache` | 1 | M | -60-80% invocaciones Vercel |
| 2 | Onboarding self-service end-to-end | 1-2 | L | Time-to-first-sale < 1h |
| 3 | Dashboard admin aggregates | 1 | M | -80-99% bytes, -80-90% CPU |
| 4 | Hybrid Recommender v2 con pgvector | 2 | L | **S/3,600-6,750/mes/tienda** |
| 5 | AI Insights Card diario WhatsApp | 1-2 | M | Anti-churn B2B (reduce logout) |
| 6 | WhatsApp AI Concierge buyers | 2 | L | **Doblar GMV teórico** |
| 7 | Vercel AI Gateway | 1 | XS | Failover + observability gratis |
| 8 | Billing con metering real | 2 | L | 5x ARPU unlock |
| 9 | Programmatic SEO por zona × producto | 2 | M | 5k-12k visitas orgánicas/mes |
| 10 | Guía de Remisión SUNAT | 1 | M | Compliance legal + multi-local |

---

## 🔁 Cross-cutting analysis

Estas **5 palancas** resuelven múltiples iniciativas a la vez:

| Palanca | Resuelve | Estado |
|---|---|---|
| **Cache Components + `use cache`** | Iniciativas 1, 3, 9, 18, 27, 28, 31 (7 ítems) | ✅ Flag activado 2026-04-08 |
| **Vercel AI Gateway** | Iniciativas 4, 5, 6, 15, 17, 30, 35, 36 (8 ítems) | ✅ Migrado 2026-04-08 |
| **pgvector en Supabase** | Iniciativas 4, 12, 45 (3 ítems) | ⬜ Sprint 2-3 (SQL DDL manual) |
| **WhatsApp templates + Meta Cloud upgrade** | Iniciativas 5, 6, 10, 15, 20, 23, 37, 44 (8 ítems) | ⬜ Sprint 2 (templates a Meta día 1) |
| **Programmatic SEO foundation** | Iniciativas 9, 22, 28, 32, 40 (5 ítems) | ⬜ Sprint 2 piloto |

---

## 📊 KPIs de seguimiento quincenal

Tracking cada 2 semanas. Alertas si alguno se estanca:

| KPI | Baseline 2026-04-08 | Mes 3 | Mes 6 | Mes 12 |
|---|---|---|---|---|
| Tenants activos | 1 + 1 demo | 10 | 50 | 300 |
| GMV mensual agregado | TBD | TBD | S/250k | S/1.5M |
| Time-to-first-sale | manual (>24h) | <6h | <1h | <15 min |
| Cache hit rate rutas públicas | ~3% | 40% | 80% | 90% |
| Core Web Vitals LCP móvil 3G | 4-7s | 3s | 2-3s | <2s |
| Active CPU cost/mes Vercel | $X baseline | -30% | -50% | -70% |
| Tests unitarios totales | 2,562 | 2,900 | 3,500 | 5,000 |
| Tests e2e | ~20 | 35 | 50 | 150 |
| Route handlers con cache | 13/485 (2.7%) | 40/500 | 60/550 | 150/700 |
| Features AI deployed | 5 | 9 | 15 | 25+ |
| ADRs activos | 17 | 20 | 25 | 35 |

---

## ⚡ Agent teams recomendados por sprint

Cada sprint debe arrancar con un `/agent-team` que dispare múltiples especialistas en paralelo:

| Sprint | Team size | Composición |
|---|---|---|
| 1 | 6 | backend-platform-engineer + performance-engineer + integration-specialist + migration-planner + qa-reliability-engineer + devops-release-engineer |
| 2 | 6 | data-analyst + frontend-engineer + backend-platform-engineer + integration-specialist + seo-growth-strategist + checkout-specialist |
| 3 | 7 | data-analyst + integration-specialist + performance-engineer + frontend-engineer + backend-platform-engineer + qa-reliability-engineer + security-auditor |
| 4 | 5 | solution-architect + backend-platform-engineer + integration-specialist + devops-release-engineer + security-auditor |
| 5 | 6 | database-engineer + data-analyst + backend-platform-engineer + frontend-engineer + performance-engineer + migration-planner |
| 6 | 5 | seo-growth-strategist + integration-specialist + performance-engineer + data-analyst + devops-release-engineer |
| 7 | 6 | solution-architect + backend-platform-engineer + integration-specialist + mobile-engineer + migration-planner + security-auditor |
| 8 | 5 | initiative-orchestrator (líder) + todo el pool cuando haga falta |

---

## 🚦 Gates bloqueantes entre sprints

Ningún sprint cierra hasta que todos estos checks pasen:

- [ ] `npx tsc --noEmit` → 0 errores
- [ ] `npm run lint` → limpio
- [ ] `npm run test` → verde (sin regresiones)
- [ ] `npm run test:e2e` → verde en los specs afectados por el sprint
- [ ] `npm run build` → exitoso
- [ ] Coverage no baja del umbral (80% statements, 70% branches, 75% functions, 80% lines)
- [ ] ADR nuevo si el sprint cambió arquitectura
- [ ] `docs/TECH-DEBT.md` actualizado (ítems nuevos + cerrados)
- [ ] `CLAUDE.md` actualizado si se tocó zona peligrosa
- [ ] Commit atómico por dominio con mensaje Conventional Commits
- [ ] Sprint review: 1 screenshot + 1 GIF + lista de 3 métricas cambiadas

---

## 🛑 Riesgos transversales y mitigaciones

| Riesgo | Sprint que lo introduce | Mitigación |
|---|---|---|
| Multi-tenant leak al romper aislamiento controlado | 5 (catálogo canónico), 7 (delivery network) | Tests obligatorios en `__tests__/security-multitenant-*.test.ts` por cada tabla global nueva |
| Costo Vercel crece con features AI | 2, 3, 5 | Cache Components + `withCache()` wrapper + cost cap del AI Gateway |
| Compliance peruano (billing, marketplace, logística) | 4, 5, 7 | Asesoría legal 1× pre-Sprint 5; Nubefact cubre SUNAT con auditoría |
| Schema drift Prisma cuando el código adelanta al schema | Continuo | `npx prisma validate` en CI + TD-030 a TD-033 cerradas antes de Sprint 1 |
| Brandon se quema con 24 semanas de ejecución continua | Cualquiera | Cada sprint es auto-contenido — pausable en cualquier momento sin romper nada |
| Falla externa (Groq down, MP down, WhatsApp tier down) | Cualquiera | Vercel AI Gateway = failover gratis; BullMQ con DLQ; workers idempotentes |

---

## 📎 Links útiles

- **ADR completo:** [adr/016-plan-maestro-24-weeks.md](./adr/016-plan-maestro-24-weeks.md)
- **TECH-DEBT:** [TECH-DEBT.md](./TECH-DEBT.md)
- **Architecture anchor:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Onboarding nuevos agentes:** [ONBOARDING.md](./ONBOARDING.md)
- **CLAUDE.md:** [`../CLAUDE.md`](../../CLAUDE.md) (parent repo)

---

**Última actualización:** 2026-04-08 (Etapa 0 cerrada + Sprint 1 en progreso + agent teams lanzados en paralelo).
