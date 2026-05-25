# Audit 04 — Code Quality & Convention Violations
**Fecha:** 2026-05-25  
**Archivos escaneados:** 97,329 TS/TSX  
**Scope:** `app/`, `lib/`, `components/` (excluye `node_modules`, `.next`, `.git`, `.claude`, `lib/generated`)

---

## Resumen ejecutivo

| Severidad | Conteo |
|-----------|--------|
| P0 (viola regla no-negociable CLAUDE.md) | 8 hallazgos / ~320 ocurrencias |
| P1 (deuda real con impacto funcional) | 9 hallazgos / ~640 ocurrencias |
| P2 (cosmético / deuda menor) | 5 hallazgos / ~600+ ocurrencias |

---

## Hallazgos P0 — Viola regla no-negociable de CLAUDE.md

### P0-1: Prisma directo fuera de `lib/db/` (Regla #1)
**Conteo:** 163 archivos únicos con uso directo de `prisma.*` en `app/` o `lib/` no-db.  
**Archivos top por ocurrencias:**

| Ocurrencias | Archivo |
|-------------|---------|
| 60 | `app/api/admin/seed-data/route.ts` |
| 27 | `app/api/demo/create/route.ts` |
| 22 | `app/api/billing/webhook/route.ts` |
| 17 | `app/api/marketplace/stores/route.ts` |
| 17 | `app/api/billing/mp-webhook/route.ts` |
| 11 | `app/api/email-automation/route.ts` |
| 8 | `app/api/sales/route.ts` (parcial — mezcla `prisma.*` directo con `lib/db/`) |
| — | `app/sitemap.ts:5` — `import { prisma }` directo |
| — | `app/layout.tsx:192` — `prisma.review.aggregate` |
| — | `app/api/sales/export/route.ts:3` |
| — | `app/api/auto-reorder/history/route.ts:3` |
| — | `app/api/delivery/me/earnings/route.ts:3` (TODO documentado) |
| — | `app/api/cotizaciones/[id]/convertir/route.ts:42` |
| — | `app/api/invoices/sunat/route.ts:55` |

**Riesgo:** Queries sin cache + audit + garantía de tenantId. Cache invalidation imposible de rastrear.  
**Fix:** Mover a clase `lib/db/*.db.ts` correspondiente.

---

### P0-2: `tenantId` ausente en queries del sitemap (Regla #3)
**Evidencia directa:**  
- `app/sitemap.ts:131-136` — `prisma.product.findMany({ where: { active: true, deletedAt: null } })` sin `tenantId`. Expone categorías de **todos los tenants** en el sitemap público de Buleje raíz.  
- `app/sitemap.ts:266-269` — `prisma.receta.findMany({ where: { activa: true } })` sin `tenantId`. Expone recetas de todos los tenants en el SEO público.

**Nota:** `app/sitemap.ts:21-26` (productos) SÍ tiene `tenantId: "main"` — correcto. Las stores (línea 171) se filtran por `isPublished: true` sin tenantId, lo cual es intencional para el marketplace público. Solo líneas 131 y 266 son violaciones claras.  
**Fix:** Agregar `tenantId: "main"` o eliminar la query dinámica de categorías cross-tenant.

---

### P0-3: `userId` hardcodeado como `"user_me"` en páginas de usuario autenticado
**Evidencia:**  
- `app/(store)/cuenta/gift-cards/page.tsx:19` — `const userId = "user_me";`  
- `app/(store)/cuenta/cupones/page.tsx:19` — `const userId = "user_me";`

**Riesgo:** Cualquier usuario autenticado ve los datos de `"user_me"` (probablemente vacío o datos de prueba). No es un leak de datos entre usuarios reales porque `"user_me"` es un placeholder, pero **la feature está rota en producción** — los usuarios ven siempre el mismo resultado ficticio.  
**Fix:** Leer `userId` del session via `getCustomerSession()` antes del TODO sprint.

---

### P0-4: `export const dynamic = "force-dynamic"` en Next 16 (Regla #4 — feedback memory)
**Estado actual:** Los 5 archivos encontrados son **comentarios explicando por qué se removió** — no son violaciones activas. El hotfix `bdb6f5f2` ya corrigió las 16 violaciones.  
**Acción:** Verificar en futuros PRs que no se reintroduzca. No hay violación activa hoy.

---

### P0-5: 133 endpoints sin `try/catch` exponen 500s desnudos (Regla en `api-patterns`)
**Conteo por área:**

| Área | Rutas sin try/catch |
|------|---------------------|
| `superadmin/` | 27 |
| `admin/` | 22 |
| `marketplace/` | 14 |
| `delivery/` | 6 |
| `ai-assistant/` | 5 |
| `orders/` | 4 |
| `auth/` | 4 |
| Otros | 51 |

**Ejemplos críticos con DB directo:**  
- `app/api/sales/export/route.ts:6` — 83 líneas, `prisma.sale.findMany`, sin try/catch  
- `app/api/auto-reorder/history/route.ts:7` — `prisma.purchaseOrder.findMany`, sin try/catch  
- `app/api/analytics/clv/route.ts:1` — 128 líneas, analytics, sin try/catch  
- `app/api/search/route.ts:6` — usa `Promise.all` con `.catch(() => [])` por item pero sin handler global  

**Fix:** Envolver el cuerpo del handler en `try { ... } catch (e) { logger.error(...); return NextResponse.json({ error: "..." }, { status: 500 }); }`.

---

### P0-6: Superadmin SLO page con mock data expuesto en producción
**Evidencia:**  
- `app/superadmin/slo/page.tsx:65` — datos mock hardcodeados (`"dpl_mock_001"`)  
- `app/superadmin/slo/page.tsx:164` — `usingMock` siempre `true` para Vercel/Sentry  
- `app/superadmin/slo/page.tsx:313,326` — badges "mock" visibles en UI de producción  

**Riesgo:** El panel de SLO del superadmin muestra métricas ficticias en prod. Brandon no puede confiar en estos KPIs para decisiones operativas.  
**Fix:** Conectar Vercel Analytics API + Sentry API o al menos ocultar el panel hasta integración.

---

### P0-7: `ab-testing.ts` con fallback `tenantId: "main"` sin crash (Regla #3)
**Evidencia:** `lib/ab-testing.ts:29` — `const effectiveTenantId = tenantId ?? "main"`. Si un caller no pasa `tenantId`, el A/B test se crea bajo el tenant `"main"` silenciosamente. El TODO lleva tiempo sin resolverse.  
**Fix:** Lanzar error explícito si `tenantId` es undefined en lugar del fallback silencioso.

---

### P0-8: `$queryRawUnsafe` con posible interpolación de string (Regla #11)
**Verificación:** `grep -rn "\$queryRawUnsafe\|\$executeRawUnsafe"` no retornó resultados en `app/` ni `lib/` (fuera de generated). El único uso encontrado anteriormente en `app/api/marketplace/stores/route.ts:286` usa `$queryRaw` con template literal (seguro), no `$queryRawUnsafe`. **No hay violación activa confirmada.**

---

## Hallazgos P1 — Deuda real con impacto funcional

### P1-1: 515 componentes superan 300 líneas (CLAUDE.md: máx ~300)
**Top 10:**

| Líneas | Archivo |
|--------|---------|
| 4,153 | `components/admin/unified/MarketplaceModule.tsx` |
| 3,090 | `components/superadmin/banners/BannerPreviewStudio.tsx` |
| 3,077 | `components/admin/InventoryTab.tsx` |
| 3,057 | `components/admin/DashboardTab.tsx` |
| 3,004 | `components/admin/StoreCustomizer.tsx` |
| 2,852 | `components/admin/unified/DeliveryPartnersModule.tsx` |
| 2,705 | `components/admin/PrestamosModule.tsx` |
| 2,464 | `components/admin/POSView.tsx` |
| 2,268 | `components/admin/ContratosModule.tsx` |
| 2,229 | `components/admin/SettingsModule.tsx` |

**Impacto:** Tiempo de compilación, dificultad de testing, conflictos de merge frecuentes.  
**Fix:** Extraer sub-componentes y hooks. Priorizar los top 5 en próximos sprints.

---

### P1-2: 630 usos de `any` explícito en código fuente
**Alcance:** `": any"`, `"as any"`, `"any[]"`, `"Promise<any>"`, `"Record<string, any>"`.  
**Impacto:** Pierde las garantías de TypeScript strict mode. Especialmente peligroso en handlers de API que deserializan JSON externo.  
**Fix:** Reemplazar con tipos concretos o `unknown` + type guard.

---

### P1-3: 41 `console.log/debug/dir` en código de producción
**Impacto:** Posible leak de datos sensibles en logs de Vercel. Contextos críticos:  
- `lib/ab-testing.ts:35` — `console.warn` explícito (ver P0-7)  
- Varios componentes admin y hooks  
**Fix:** Reemplazar con `logger.debug/warn` de `@/lib/logger`.

---

### P1-4: `JSON.parse()` sin try/catch en rutas de sesión y API (runtime crash)
**Evidencia de falsos positivos eliminados:** Las ocurrencias en `lib/session.ts` están dentro de bloques `try/catch`. Las que sí representan riesgo real:  
- `app/api/message-templates/route.ts:41,64,87` — 3 JSON.parse sin try  
- `app/api/marketplace/stores/route.ts:191` — JSON.parse sin try  
- `app/api/pos/voice-interpret/route.ts:149` — JSON.parse sin try  
- `lib/design-presets.ts:584` — JSON.parse de datos potencialmente externos  

**Fix:** Envolver en try/catch o usar `z.string().transform(s => JSON.parse(s))` con safeParse.

---

### P1-5: Fire-and-forget de `createNotification` sin `.catch()` en crons
**Evidencia:** 20+ ocurrencias en `lib/notification-generators.ts` y crons de `app/api/cron/`.  
- `app/api/cron/fiados-reminder/route.ts:165,210`  
- `app/api/cron/market-alerts/route.ts:41,57,77,105`  
- `lib/notification-generators.ts:17,46,73,102...` (10+ más)  

**Riesgo:** Un fallo en `createNotification` puede cortar la ejecución del cron completo (en contextos `await` síncronos). Si son realmente fire-and-forget, deben ser `.catch(() => {})`. Si son críticos, deben estar dentro de try/catch del loop.  
**Fix:** Agregar `.catch((e) => logger.warn("notification failed", e))` o mover a contexto try.

---

### P1-6: 7 TODOs con feature rota o schema faltante en código de producción
**Críticos:**

| Archivo:Línea | Descripción |
|---------------|-------------|
| `app/api/marketplace/orders/route.ts:572` | `LoyaltyTransaction` no existe en schema — código comentado pero bloquea Sprint C |
| `app/api/billing/mp-subscribe/route.ts:105` | FIXME: `mpPendingSubscriptionId` falta en schema Tenant |
| `app/api/billing/mp-webhook/route.ts:282` | TODO: tabla `mp_pending_plans` faltante |
| `app/api/cron/mp-webhook-replay/route.ts:96` | TODO Sprint 3: lógica incompleta en replay |
| `app/(store)/cuenta/gift-cards/page.tsx:19` | userId mock (ya en P0-3) |
| `lib/rate-limit/store.ts:131,165` | TODO: Upstash no integrado — rate limit en memoria solo |
| `lib/credit/reniec-client.ts:140,171` | TD-030: RENIEC/SUNAT APIs reales no conectadas |

---

### P1-7: `sitemap.ts` con `prisma.*` directo + query sin tenantId (consolidado P0-1 + P0-2)
Ya documentado en P0-1 y P0-2. El archivo `app/sitemap.ts:5` importa `prisma` directamente — es candidato a una clase `SitemapDB` o mover queries a `lib/db/products.db.ts`.

---

### P1-8: 7,512 TODOs/FIXMEs totales en el proyecto
Mayoría en `TODOS los...` como texto narrativo (falso positivo del grep). TODOs reales de código: ~35 identificados. Los críticos están en P1-6. El resto son deuda menor.

---

### P1-9: `app/api/admin-users/route.ts` — GET sin try/catch (27-149 líneas de lógica)
**Evidencia:** `app/api/admin-users/route.ts` usa `requireAdmin` correctamente pero el GET de 130 líneas no tiene try/catch global. Mismo patrón para `suppliers/route.ts`, `batches/route.ts`, `tasks/route.ts`.

---

## Hallazgos P2 — Cosmético / deuda menor

### P2-1: ~60 bloques `catch {}` vacíos en hooks y componentes
**Contexto:** La mayoría son accesos a `localStorage` donde el silencio es correcto (storage bloqueado en privado/iframe). Ejemplos válidos:  
- `hooks/use-saved-addresses.ts:59,65` — localStorage read/write  
- `app/admin/_hooks/useHiddenTabs.ts:39,48` — localStorage  

**Genuinamente problemáticos (sin contexto de localStorage):**  
- `hooks/use-marketplace-deals.ts:137` — fetch de deals silenciado sin log  
- `components/admin/PayablesTab.tsx:59` — error de carga silenciado  
- `components/admin/DevolucionesProveedorModule.tsx:125` — error silenciado  

**Fix para los 3 genuinos:** Agregar `console.warn` o `logger.warn` mínimo.

---

### P2-2: `MoneyLeakDetector.tsx:64` usa función local `parse()` (no Zod)
**Aclaración:** La detección de `.parse(` en ese archivo es una función interna `parse(m)` de parseo de fechas/moneda — **no es una violación de Zod safeParse**. No hay violaciones reales de Zod `.parse()` confirmadas en el proyecto.

---

### P2-3: `app/api/delivery/me/earnings/route.ts:3` — `prisma` directo con TODO documentado
**Evidencia:** `app/api/delivery/me/earnings/route.ts:38` — `prisma.deliveryAssignment.findMany` con `tenantId` correcto pero fuera de `lib/db/`. TODO anotado desde `2026-05-08`.  
**Fix:** Crear `lib/db/delivery.db.ts` o mover a `DeliveryDB` existente.

---

### P2-4: Naming inconsistente en hooks admin
**Evidencia:** `app/admin/_hooks/useOnboardingTrigger.ts` y `useOnboardingTourTrigger.ts` — dos hooks con propósito casi idéntico por nombre. Posible duplicación de lógica.

---

### P2-5: `lib/ab-testing.ts` usa `prisma.*` directo
**Evidencia:** `lib/ab-testing.ts:36` — `prisma.aBTest.create` sin pasar por `lib/db/`. Afecta cache + audit.

---

## Tabla priorizada de acciones

| # | Sev | Archivo:Línea | Descripción | Fix estimado | Confianza |
|---|-----|--------------|-------------|-------------|-----------|
| 1 | P0 | `app/(store)/cuenta/gift-cards/page.tsx:19` | userId hardcoded "user_me" — feature rota en prod | Leer session real | Alta |
| 2 | P0 | `app/(store)/cuenta/cupones/page.tsx:19` | Mismo patrón | Leer session real | Alta |
| 3 | P0 | `app/sitemap.ts:131-136` | `product.findMany` sin tenantId — expone categorías cross-tenant | `tenantId: "main"` | Alta |
| 4 | P0 | `app/sitemap.ts:266-269` | `receta.findMany` sin tenantId | `tenantId: "main"` o scope | Alta |
| 5 | P0 | `app/api/sales/export/route.ts:6` | DB query sin try/catch, 83 líneas | Envolver handler | Alta |
| 6 | P0 | `app/api/auto-reorder/history/route.ts:7` | DB query sin try/catch | Envolver handler | Alta |
| 7 | P0 | `app/superadmin/slo/page.tsx:65` | Mock data en producción para SLOs | Conectar API real o ocultar | Alta |
| 8 | P0 | `lib/ab-testing.ts:29` | tenantId fallback silencioso a "main" | Throw si undefined | Alta |
| 9 | P1 | 133 routes sin try/catch | Ver lista completa en `/tmp/all_routes.txt` | Script bulk | Alta |
| 10 | P1 | `components/admin/unified/MarketplaceModule.tsx` (4,153 L) | Monolito — testing imposible | Split en sub-módulos | Alta |
| 11 | P1 | `app/api/message-templates/route.ts:41,64,87` | JSON.parse sin try — crash en input malformado | try/catch o Zod transform | Alta |
| 12 | P1 | `app/api/marketplace/orders/route.ts:572` | LoyaltyTransaction missing en schema | Schema + migration o remove | Alta |
| 13 | P1 | `lib/notification-generators.ts:17+` | createNotification sin .catch — puede cortar crons | `.catch(logger.warn)` | Media |
| 14 | P1 | 630 `any` explícitos | Pérdida de type safety | Reemplazar con `unknown` | Alta |
| 15 | P2 | `app/api/delivery/me/earnings/route.ts:3` | prisma directo con TODO desde 05-08 | Mover a delivery.db.ts | Alta |

---

## Notas metodológicas
- Los 163 archivos con `prisma.*` directo fueron verificados excluyendo `lib/db/`, generated, tests, `.claude/worktrees` y comentarios.
- Los bloques `catch {}` de `localStorage` son patrón correcto en browsers (QuotaExceededError, SecurityError).
- Los JSON.parse en `lib/session.ts` están dentro de try/catch — no son violaciones.
- No se detectó ningún secret hardcodeado confirmado (todas las keys encontradas provienen de `process.env.*`).
- `force-dynamic` ya fue corregido en hotfix `bdb6f5f2` — no hay violaciones activas.
