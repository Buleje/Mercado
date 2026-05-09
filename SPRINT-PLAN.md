# SPRINT-PLAN.md — Buleje (post sesión rounds 6-27)

> **Generado:** 2026-05-09 · **Estado base:** 18.06/20 (90.3%) · 22 rounds, 30 commits
> **Propósito:** plan de 8 sprints atómicos para llevar el proyecto de 90% → 95%+. Cada sprint es independiente y tiene ROI medible.

## Estado por categoría

| Cat | Score | Categoría |
|---|---|---|
| **20** | 🛡️ Seguridad |
| **20** | 🔐 Compliance Ley 29733 |
| **20** | 🐛 Bugs / Errores |
| **20** | ✅ Tests / QA |
| 19 | 💰 Pagos / Checkout · 🏷️ Code Quality |
| 18 | 📚 Documentación · 🏢 Multi-tenant · 🤖 AI/IA · ⚡ Performance |
| 17 | 🎯 UX/A11y · 🛠️ DX |
| 16 | 🎨 UI / Design System · 🚀 DevOps · 📱 Mobile |
| **14** | 💾 **DB / Data** ← gap mayor |

## Inventario base (rondas 6-27)

| Item | Valor |
|---|---|
| Components >2500L (split candidates) | 9 archivos, peor 5692L (`MarketplaceModule.tsx`) |
| Files con `bg-gray-*` raw (DS violation) | **453** en components/admin/ |
| Files con `text-gray-*` raw | 41 en components/admin/ |
| Emojis genéricos en código (CLAUDE.md ban) | 43 hits |
| API routes con `prisma.*` directo (deuda multi-tenant) | **147** en app/api/ |
| Audit-context migrado | 30 rutas write + 3 webhooks + 1 cron |
| Tests cumulados | 96+ (66 recovered + 30 nuevos) |
| ADRs publicados | 99 |
| Client components | 151 (RSC candidates) |

---

## SPRINT 1 — Quick wins (1-2 días, bloque concentrado)

**Objetivo:** capturar items <2h cada uno que suben puntos sin riesgo.
**Score gain estimado:** +0.4

| # | Item | Cat impactada | Esfuerzo |
|---|---|---|---|
| 1.1 | Aplicar `apply-db-waves.sh` (DIRECT_URL Brandon) | DB 14→17 | 5 min |
| 1.2 | Verificar `ProductAnalytics` existe en Supabase | DB schema drift | 15 min |
| 1.3 | Migrar `MarketplaceAbandonedCart.total` Float→Decimal | DB precision | 10 min schema + 15 min migration |
| 1.4 | Aplicar `next.config.ts optimizeCss: true` | Performance | 10 min |
| 1.5 | Agregar `priority` a hero LCP /marketplace | Performance | 5 min |
| 1.6 | framer-motion full → `m` alias en 5 archivos | Performance | 10 min |
| 1.7 | LivesStrip + QuickFilterChips RSC | Performance | 20 min |
| 1.8 | Configurar `owner`/`manager`/`analista` en PERMISSIONS o removerlos | Seguridad TD-047 | 30 min |
| 1.9 | Stripe webhook freshness check (paridad MP round 22) | Seguridad | 15 min |
| 1.10 | Cleanup 43 emojis genéricos → Lucide icons | UI/DS | 60 min |

**Total:** ~3-4 horas trabajo · gain estimado +0.4 promedio

---

## SPRINT 2 — Split monolitos (3-5 días)

**Objetivo:** romper componentes >2500L en sub-hooks/sub-componentes. Patrón: extraer `useXState` hooks por dominio.
**Score gain estimado:** +0.5 (UI 16→18, DX 17→18)

| Componente | Líneas | Split sugerido |
|---|---|---|
| `MarketplaceModule.tsx` | 5692 | useMarketplaceList + useMarketplaceFilters + useMarketplaceActions |
| `BannerPreviewStudio.tsx` | 3207 | useBannerCanvas + useBannerExport + sub-componente preview |
| `InventoryTab.tsx` | 3077 | useStockMovements + useReorderAlerts + useStockMin |
| `DashboardTab.tsx` | 3055 | useDashboardKPIs + useChartTokens + useTimeRange |
| `StoreCustomizer.tsx` | 3004 | useStoreTheme + useStoreLayout + useStorePreview |
| `PrestamosModule.tsx` | 2705 | usePrestamoList + usePrestamoCobros + usePrestamoStats |
| `FiadosModule.tsx` | 1366 | useFiadoList + useFiadoPago + useFiadoStats (ya documentado round 21) |

**Esfuerzo:** ~4h por componente × 7 = ~28h. Spread 3-5 días con verify post.

---

## SPRINT 3 — DB hardening (1-2 días)

**Objetivo:** cerrar gaps DB con DIRECT_URL accesible.
**Score gain estimado:** +1.5 (DB 14→17.5)

| # | Item | Esfuerzo |
|---|---|---|
| 3.1 | `./scripts/apply-db-waves.sh` (24 índices CONCURRENTLY) | 5 min |
| 3.2 | Verificar y aplicar migración `ProductAnalytics` si missing | 30 min |
| 3.3 | Migrar `MarketplaceAbandonedCart.total` a Decimal(12,2) | 30 min |
| 3.4 | Composite unique `SavedCart @@unique([customerPhone, tenantId])` | 30 min |
| 3.5 | **Customer.phone composite PK migration** (4h sprint dedicado, romper FK chain) | 4-6h |
| 3.6 | 4 migraciones may-2 pendientes (DNS WSL fix) | 30 min |
| 3.7 | Auditar FK onDelete (esperar agente DB round 28) | 30 min |

**Total:** ~6-8h · DB sube a 17-18/20

---

## SPRINT 4 — E2E tests críticos (2-3 días)

**Objetivo:** cubrir flujos críticos sin regression risk.
**Score gain estimado:** +0.5 (Tests/QA cap 20, pero refuerza)

| # | Item | Esfuerzo |
|---|---|---|
| 4.1 | E2E checkout signed-in (login → cart → checkout → order) | 45 min |
| 4.2 | E2E BroadcastChannel multi-tab dos pestanas reales | 30 min |
| 4.3 | E2E vendor onboarding (apply → approval → primer producto) | 60 min |
| 4.4 | E2E Yape close-loop (capture → vision → approve → notify) | 90 min |
| 4.5 | Regression test top-today cross-tenant (round 7 cache leak) | 15 min |
| 4.6 | Regression test 27 endpoints force-dynamic (round 8) | 30 min |
| 4.7 | Bcrypt settings fallback edge (issue desde round 13) | 15 min |

**Total:** ~5h · cobertura E2E critical paths completa

---

## SPRINT 5 — DS hardening (2-3 días)

**Objetivo:** consistencia visual + tokens consolidados.
**Score gain estimado:** +1.5 (UI 16→18, UX 17→18)

| # | Item | Esfuerzo |
|---|---|---|
| 5.1 | Sed bulk `bg-gray-*` raw → tokens DS en 453 archivos | 90 min |
| 5.2 | Sed bulk `text-gray-*` raw → tokens DS en 41 archivos | 30 min |
| 5.3 | Cleanup 43 emojis genéricos → Lucide icons | 60 min |
| 5.4 | a11y semantic refactor: 80+ labels visuales sin htmlFor | 4-6h |
| 5.5 | Empty states uniformes con primitive `<EmptyState>` del DS | 60 min |
| 5.6 | Loading skeletons consistency | 60 min |
| 5.7 | Sombras `shadow-*` raw → `--shadow-*` tokens | 45 min |

**Total:** ~10h · DS visual unificado

---

## SPRINT 6 — Mobile + a11y (2 días)

**Objetivo:** mejorar experiencia mobile/Capacitor.
**Score gain estimado:** +1 (Mobile 16→18)

| # | Item | Esfuerzo |
|---|---|---|
| 6.1 | Touch targets <44×44px → ampliar (audit por agente Mobile) | 90 min |
| 6.2 | safe-area-inset en navbar/footer/drawer | 30 min |
| 6.3 | Modal full-screen mobile sin scroll bug | 45 min |
| 6.4 | type="tel"/"email"/"number" donde aplica en forms | 30 min |
| 6.5 | hover:* + focus-visible: paridad para touch sin sticky hover | 60 min |
| 6.6 | Capacitor camera/geolocation fallback web | 45 min |

**Total:** ~5h · Mobile sube a 18/20

---

## SPRINT 7 — DevOps + observability (1-2 días)

**Objetivo:** alertas, runbooks, deploy gates robustos.
**Score gain estimado:** +1 (DevOps 16→18)

| # | Item | Esfuerzo |
|---|---|---|
| 7.1 | DR drill execution real (script ya listo, requiere DIRECT_URL) | 30 min |
| 7.2 | Sentry alert rules: cron failure >24h, error rate >1%, latency p99 | 60 min |
| 7.3 | PostHog funnels: checkout step-by-step, vendor onboarding | 90 min |
| 7.4 | Runbooks: DB down, Redis down, Stripe webhook lost | 60 min |
| 7.5 | SLO dashboard compartible (Vercel + Sentry + PostHog) | 90 min |
| 7.6 | Pre-commit gate: vitest --changed (ya skip, reactivar selectivo) | 30 min |
| 7.7 | CI coverage gate: minimum 70% en danger zones | 60 min |

**Total:** ~7h · DevOps a 18/20

---

## SPRINT 8 — Migraciones audit-context restantes (1 día)

**Objetivo:** completar M004 al 100% en routes write.
**Score gain estimado:** +0.3 (Seguridad ya 20)

| # | Item | Esfuerzo |
|---|---|---|
| 8.1 | Migrar admin/seed-data POST (509L, ~30 min) | 30 min |
| 8.2 | Migrar 12 routes restantes con `prisma.*` write directo | 4-5h |
| 8.3 | Workers BullMQ propagar audit-ctx desde job data | 90 min |
| 8.4 | trackAiUsage soporte streamText (event-based) | 45 min |
| 8.5 | audit-context: pasar `prismaClient` como param (refactor 45 min DANGER ZONE) | 45 min |
| 8.6 | Aplicar trackAiUsage al resto de uses (orchestrator, agents, daily-insights) | 60 min |

**Total:** ~8h · cierra M004 + AI tracking 100%

---

## Roadmap consolidado

| Sprint | Días | Score gain | ROI |
|---|---|---|---|
| 1 — Quick wins | 1-2 | +0.4 | **MUY ALTO** (gains/hora) |
| 3 — DB hardening | 1-2 | +1.5 | **MUY ALTO** (categoría más baja) |
| 5 — DS hardening | 2-3 | +1.5 | ALTO (visual + a11y) |
| 6 — Mobile + a11y | 2 | +1 | ALTO |
| 7 — DevOps | 1-2 | +1 | ALTO |
| 4 — E2E tests | 2-3 | +0.5 | MEDIO (Tests ya 20) |
| 8 — M004 cleanup | 1 | +0.3 | MEDIO |
| 2 — Split monolitos | 3-5 | +0.5 | MEDIO (alto esfuerzo) |

**Total esperado tras los 8 sprints**: 18.06 → **~24/20** (sí, supera 20 porque algunas categorías "saturan" en 20). Realista: **19.5/20 = 97.5%** con tope práctico.

## Orden recomendado por ROI

**Día 1**: Sprint 1 quick wins (mañana) + Sprint 3 DB hardening (tarde) → pasar a 19+
**Día 2-3**: Sprint 5 DS hardening + Sprint 6 Mobile → 19.5+
**Día 4**: Sprint 7 DevOps + Sprint 4 E2E selectivo → 20 lock
**Día 5+**: Sprint 2 split monolitos + Sprint 8 M004 cleanup → estabilización

## Bloqueado para Brandon (acción mínima requerida)

3 items bloqueantes que **solo Brandon puede destrabar**:

1. **DIRECT_URL Supabase** — ejecutar `./scripts/apply-db-waves.sh` (5 min). Desbloquea Sprint 3 completo.
2. **Decisión `owner`/`manager`/`analista`** — configurar PERMISSIONS o remover del type AdminRole. 30 min.
3. **DR drill execution** — correr `/dr-drill latest` desde red con DIRECT_URL para validar backup. 30 min.

## Backlog explícito (TD-040 a TD-048)

| TD | Item | Sprint |
|---|---|---|
| 040 | Customer.phone composite PK | Sprint 3 |
| 041 | SavedCart customerPhone composite | Sprint 3 |
| 042 | DB wave-1+2 indices | Sprint 3 |
| 043 | ProductAnalytics drift verify | Sprint 3 |
| 044 | audit-context globalThis silent | Sprint 8 |
| 045 | FiadosModule split | Sprint 2 |
| 046 | UX agent persistent truncation | Resuelto vía sprint 5 manual a11y |
| 047 | owner/manager/analista PERMISSIONS | Sprint 1 |
| 048 | trackAiUsage streamText | Sprint 8 |

## Hallazgos profundos round 28 (6 agentes paralelos completados)

### DB — 4 P0 + 5 P1 + 3 P2

| # | Severidad | Archivo:línea | Fix | Esfuerzo |
|---|---|---|---|---|
| DB-P0-1 | P0 | `lib/db/dashboard.db.ts:48,70,155` | Orders/Reviews sin `deletedAt:null` — KPIs revenue inflados | 10 min |
| DB-P0-2 | P0 | `prisma/schema.prisma:1726` (NewsletterSubscriber) | `email @unique` global → `@@unique([tenantId,email])` cross-tenant | 20 min |
| DB-P0-3 | P0 | `lib/db/inventory.db.ts:100` getByProduct | Falta `tenantId` + `take:500` — leak silencioso movimientos | 30 min |
| DB-P0-4 | P0 | `prisma/schema.prisma:2893` WholesaleOrder | Sin `tenantId` canónico — leak potencial cross-tenant | 20 min |
| DB-P1-5 | P1 | schema general (22 modelos) | Bare `@@index([tenantId])` redundantes — 5-10% overhead writes | 45 min |
| DB-P1-6 | P1 | `prisma/schema.prisma:837` Promotion | `discountPercent Float` → `Decimal(5,2)` precisión | 30 min |
| DB-P1-7 | P1 | `lib/db/sales.db.ts:159` CashRegisters.getAll | `movements` include sin `take` — OOM 50-200MB | 20 min |
| DB-P1-8 | P1 | `proposed-db-indexes-wave-1.sql` (idx 1+2) | Duplicados de schema existente — auditar antes de aplicar | 15 min |
| DB-P1-9 | P1 | `lib/db/orders.db.ts:229` getByCustomerPhone | Legacy 1-arg sin `tenantId` — cross-tenant leak | 45 min |
| DB-P2-10 | P2 | `prisma/schema.prisma:527-666` Settings | 30+ JSON String sin validación DB | 2h Zod, 2sem normalización |
| DB-P2-11 | P2 | `prisma/schema.prisma:1589` Batch.quantity | `Float` en FEFO crítico → `Decimal(10,3)` | 25 min |
| DB-P2-12 | P2 | `schema.prisma:2946,2918` CommissionLedger.rate + WholesaleOrderItem | `Float` → `Decimal` financiero | 20 min |

### UI/DS — 3 críticos + 6 altos + 1 medio

| # | Severidad | Magnitud | Fix | Esfuerzo |
|---|---|---|---|---|
| UI-C-1 | Crítico | 3087 líneas `bg-gray-*` raw admin/ | Sed bulk → `bg-[var(--surface-alt)]` | 8-12h |
| UI-C-2 | Crítico | 119 modales admin DIY + 59 marketplace | Migrar a `AdminModal` (Radix Dialog ya existe sin uso) | 20-30h |
| UI-C-3 | Crítico | 328 archivos admin con `text-2xl/h2` raw | DS typography primitives 0% adoption (PageTitle, Label, Caption) | sprint dedicado |
| UI-H-4 | Alto | 257 archivos animate-pulse propio | DS `LoadingState` y `EmptyState` con 0 imports en admin | 2-3h por tab |
| UI-H-5 | Alto | 1178 `shadow-*` raw vs 57 tokens | Mapear `shadow-token-*` → `var(--shadow-*)` Tailwind layer | 6-8h |
| UI-H-6 | Alto | 10592 `rounded-*` raw vs 15 tokens | Tenant config `--radius` ignorado por hardcodeo | 10-15h |
| UI-H-7 | Alto | 66 SVG inline admin + 61 marketplace + 35 emojis | WhatsApp, AlertTriangle, etc. → Lucide | 3-4h |
| UI-H-8 | Alto | MobilePOS+KioskPOS 0% `dark:` cobertura | POS nocturno ilegible (Pucallpa real) | 2-3h |
| UI-M-9 | Medio | `MarketplaceModule.tsx` 5692L split incompleto | Subdir `unified/marketplace/tabs/` ya iniciado | 8-12h |
| UI-M-10 | Medio | `CheckoutModalShell` overlay propio | Sin Radix focus trap garantizado (ZONA PELIGRO) | 3-4h |

### Mobile — 6 P0/P1 (ya aplicados 4)

| # | Estado | Fix | Notas |
|---|---|---|---|
| M-1 | ✅ Aplicado | Dark mode guard removido `app/layout.tsx:233` | Bloqueaba 100% mobile |
| M-2 | ✅ Aplicado | UnifiedProductCard CTA `h-10`→`h-11` (44px WCAG) | components/marketplace |
| M-3 | ⏳ Pendiente | hover-only cards sin focus-visible touch | Sprint 6 |
| M-4 | ⏳ Pendiente | close drawer 36px → 44px | Sprint 6 |
| M-5 | ✅ Aplicado | delivery-app `maximumScale 1→5`, `userScalable true` | WCAG 1.4.4 AA |
| M-6 | ⏳ Pendiente | Capacitor geolocation fallback web | Sprint 6 |
| M-7 | ✅ Aplicado | `.pb-safe` deduplicado globals.css (297 + 1604 → único) | safe-area inset |

### DevOps — 4 P0 + 6 P1

| # | Severidad | Estado | Item |
|---|---|---|---|
| DV-P0-1 | P0 | ✅ Round 28 | Coverage gate blocking (`ci.yml:67`) |
| DV-P0-2 | P0 | ✅ Round 28 | E2E checkout blocking (`ci.yml:84`) |
| DV-P0-3 | P0 | ⏳ Sprint 7 | gitleaks blocking (`ci.yml:45`) |
| DV-P0-4 | P0 | ⏳ Sprint 7 | `withCronHealth(jobName, handler)` wrapper para 53 crons |
| DV-P1-5 | P1 | ⏳ Sprint 7 | Cron failure >24h alert en superadmin-alerts |
| DV-P1-6 | P1 | ⏳ Sprint 7 | Sentry rule: error rate >1%, latency p99 |
| DV-P1-7 | P1 | ⏳ Sprint 7 | DR drill execution (script ya listo, falta DIRECT_URL) |
| DV-P1-8 | P1 | ⏳ Sprint 7 | PostHog funnels: checkout step + vendor onboarding |
| DV-P1-9 | P1 | ⏳ Sprint 7 | Runbooks: DB down, Redis down, Stripe lost |
| DV-P1-10 | P1 | ⏳ Sprint 7 | SLO dashboard compartible (Vercel + Sentry + PostHog) |

---

## Score proyectado tras hallazgos round 28

Con los 4 P0 mobile + 2 P0 DevOps ya aplicados en round 28: **18.06 → 18.6**.

Con sprints 1+3+5 ejecutados: **18.6 → 19.5+**.
Con sprints 6+7 más: **19.5 → 19.8+**.
Sprints 2+4+8 son refinamiento final: **19.8 → 20.0**.

---

**Próxima acción**: ejecutar Sprint 1 (quick wins) + Sprint 3 (DB P0 — los 4 hallazgos arriba) en sesión dedicada para subir a 19+.
