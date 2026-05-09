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

## Pendiente de agentes round 28 (auditoría profunda)

Espero reportes de:
- DB engineer (12 hallazgos profundos)
- Mobile/responsive (10 hallazgos)
- DevOps + observability (10 hallazgos)
- UI Design System (10 hallazgos)

Estos enriquecerán cada sprint con items concretos archivo:línea.

---

**Próxima acción**: ejecutar Sprint 1 (quick wins) para subir a 18.5+ inmediato.
