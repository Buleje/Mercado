# Deuda Técnica — Bodega San Martín

> **Regla:** Dedicar ~20% de cada sesión a reducir deuda técnica.
> Actualizar este archivo cuando se identifique o resuelva deuda.
> **Última auditoría:** 2026-04-07 (Sprint C Final Push — TD-012 cerrada, TD-030 a TD-033 nuevas)

## 🔴 Alta prioridad (afecta estabilidad o seguridad)

| ID | Área | Descripción | Impacto | Estado |
|----|------|-------------|---------|--------|
| ~~TD-001~~ | ~~CheckoutModal~~ | **RESUELTO 2026-04-06.** Verificado: `components/CheckoutModal.tsx` (16 líneas) es re-export intencional para preservar el path `@/components/CheckoutModal` usado por `StoreClientShell.tsx:6` vía `dynamic()`. Implementación real en `components/checkout/CheckoutModal.tsx` (238 líneas). **No hay duplicación de lógica** — la arquitectura es correcta. | — | ✅ Cerrado |
| TD-002 | Prisma migration | Modelos AIConversation/AIMessage agregados al schema. Migration SQL preparada en `prisma/migrations/20260406210602_add_ai_conversation_and_message/`. **Pendiente:** Brandon corre `DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy` antes del próximo push | Memoria IA no persiste datos hasta correr migración | 🟡 En progreso (SQL listo) |
| TD-003 | A/B testing + Quality eval | Métricas en memoria — se pierden al reiniciar servidor | Pérdida de datos de experimentos | 🔓 Abierto |
| TD-011 | admin/page.tsx | Archivo de 1413 líneas — refactor en progreso (Sesiones 1-2 hechas, faltan 4-7) | Alto acoplamiento, difícil de mantener | 🟡 En progreso |
| ~~TD-012~~ | ~~next.config.ts~~ | **RESUELTO 2026-04-07 — Sprint C Final Push.** `ignoreBuildErrors: true → false` activado. Histórico: 469 → 121 → 122 → **0 errores**. Cierre en 1 sesión con Agent Team 4 teammates paralelos (backend 43, frontend 52, DB 3, QA 7) + 17 fundacionales previos (unificación `AdminRole` 9 valores, `LLMResponse.data/attempts`, Tab "colas", `logActivity` signature). **4 bugs reales destapados** (args invertidos `SalesDB.add`, `orderId` faltante en cotizaciones, `category` required en import-csv, `findUnique` vs unique compuesto en cms-db/pages). Verificación: `tsc --noEmit` 0 errors, `npm run build` pasa, `2172/2172` tests verde. Ver `docs/adr/008-typescript-strict-gate.md`. | — | ✅ Cerrado |

## 🟠 Media prioridad (afecta desarrollo o rendimiento)

| ID | Área | Descripción | Impacto | Estado |
|----|------|-------------|---------|--------|
| TD-004 | API endpoints | Algunos endpoints todavía usan OFFSET en vez de cursor pagination | Degradación con tablas grandes | 🔓 Abierto |
| TD-007 | Descuentos | Strategy Pattern creado (ADR 006) pero no integrado al checkout | Lógica fragmentada entre currency.ts, pricing.agent y checkout | 🔓 Abierto |
| TD-010 | DB classes | Sin interfaces formales (IProductsDB, IOrdersDB) | Dificulta mocking en tests | 🔓 Abierto |
| ~~TD-013~~ | ~~proxy.ts~~ | **RESUELTO 2026-04-08.** Split en 6 módulos bajo `lib/middleware/` (constants, tenant, security-headers, slug-routes, auth-guards, cross-tenant-audit). `proxy.ts` pasó de 398 → 117 líneas (-70.6%), máx por archivo 155 líneas. Zero behavior change validado con 78 tests verdes (proxy.test.ts + middleware-utils.test.ts + security-auth.test.ts). Ver ADR 014. | — | ✅ Cerrado |
| TD-014 | Doppler | Migración planeada en `docs/doppler.md` pero bloqueada por acciones humanas (crear cuenta, autenticar CLI) | Secrets duplicados Vercel + .env.local | 🟡 En progreso |
| ~~TD-026~~ | ~~.husky/pre-commit~~ | **RESUELTO 2026-04-08** (audit next-phase). `.husky/pre-commit` ahora corre `npx lint-staged` + `npx tsc --noEmit` como gate bloqueante con `exit 1` y mensaje legible. Emergency bypass documentado via `HUSKY=0 git commit`. En el mismo turno se quitó `continue-on-error: true` de `Lint` y `Run tests with coverage` en `.github/workflows/ci.yml` y se añadió un step dedicado `Type check (tsc --noEmit)`. ADR 008 ahora es promesa real tanto local como en CI. | — | ✅ Cerrado |
| TD-027 | api/superadmin/stores | Conteo de productos por tenant es N+1 (Promise.all + count por store). Funcional pero ineficiente. Plan: groupBy o subquery. Documentado inline en `app/api/superadmin/stores/route.ts`. | Latencia crece con # de tiendas | 🔓 Abierto |
| TD-028 | components/admin/AdminTenantBar.tsx | Marcado `"use client"` sin justificación — es presentacional puro (sin hooks ni handlers). Convertir a Server Component reduce bundle JS. | Bytes JS innecesarios en cliente | 🔓 Abierto |
| TD-029 | components/admin/fiados/FiadoFormModal.tsx | Setters tipados como `(p: any)` — escape hatch del type system introducido en commit `11bdafd` para destrabar TS errors rápido. Tipar correctamente con el shape real del form. | Pierde safety en formulario crítico de fiados | 🔓 Abierto |
| TD-034 | e2e/ product-card selector | **Descubierto 2026-04-08, parcialmente resuelto**. `data-testid="product-card"` restaurado en `RecommendedProducts.tsx` (home) + `CategoryCatalog.tsx` (/tienda). Además: `cart-button` en `Header.tsx`, `cart-sidebar` en `CartSidebar.tsx`, `checkout-button` en `CartSidebar.tsx`, `checkout-skip-account` en `CheckoutAccountStep.tsx`. Los e2e ahora llegan al CheckoutModal sin errores de selector. **PENDIENTE:** los tests fallan todavía en el wizard interno (StepDatos, StepPago) — faltan testids en los inputs name/phone/address y en los radio buttons de método de pago. Cada step componente necesita 1-2 testids más. | 18 e2e viejos desbloqueados parcialmente, 3 e2e del confirmar siguen rojos por selectors en wizard interno | 🟡 En progreso |

## 🟡 Baja prioridad (mejora calidad a largo plazo)

| ID | Área | Descripción | Impacto | Estado |
|----|------|-------------|---------|--------|
| TD-015 | Storybook | `stories/ErrorBoundary.stories.tsx` ya arreglado, pero faltan stories para hooks de admin | Cobertura visual incompleta | 🔓 Abierto |
| TD-016 | Service Worker | Sin SW + IndexedDB para PWA offline-first (#48 del Excel 2026) | App no funciona sin red | 🔓 Abierto |
| TD-017 | DDD formal | `lib/db/` agrupa por dominio sin Bounded Contexts ni Aggregates formales (#38 del Excel 2026) | Lógica de negocio mezclada con persistencia en módulos core (ventas, facturas) | 🔓 Abierto |

## 🆕 Hallazgos del audit Supabase Best Practices (2026-04-06)

Audit automatizado contra el skill `supabase-postgres-best-practices` recién instalado. Ordenado por impacto. **Ninguno aplicado todavía** — requieren migración Prisma.

| ID | Modelo/Campo | Problema | Referencia skill | Severidad |
|----|--------------|----------|------------------|-----------|
| TD-018 | `OrderItem.price`, `SaleItem.price`, `WholesaleOrderItem.unitPrice`+`total`, `Bundle.price` + 82 campos adicionales | Usan `Float` para dinero. Float tiene ~15-17 dígitos de precisión → errores de redondeo acumulados en audits, chargebacks, discrepancias de pago. **Sprint 1 arrancado 2026-04-09 en rama `feature/td018-float-to-decimal`**. Fase 1 (Preparación) en curso con Agent Team de 3 (database-engineer + backend-platform-engineer + migration-planner). Patrón `toNum()` existente en 5 archivos (fiados, prestamos, recetas, turnos, treasury) — será centralizado en `lib/decimal-utils.ts` durante la migración. | `schema-data-types.md` | 🔴 Crítica (correctness) — 🟡 en progreso |
| ~~TD-019~~ | ~~WholesaleOrderItem + StoreProduct FK~~ | **RESUELTO 2026-04-09** — verificación contra prod (Paso 0 Sprint 2 Ola 1) confirmó que los 3 índices ya estaban aplicados en producción. Zero schema drift en esas tablas. Ver ADR 017. | — | ✅ Cerrado |
| ~~TD-020~~ | ~~Compound indexes faltantes~~ | **RESUELTO 2026-04-09** — 4 compound indexes aplicados en prod vía `scripts/apply-ola1-indices.ts` (pooler session mode, CREATE INDEX CONCURRENTLY): `PurchaseOrder(tenantId,status)`, `Payable(tenantId,status)`, `NotificationLog(tenantId,createdAt DESC)`, `SupportTicket(tenantId,status)`. Tiempos 193+128+130+133 ms = <600ms total, zero downtime. Schema.prisma sincronizado con `@@index(..., map)`. Ver ADR 017. | — | ✅ Cerrado |
| ~~TD-021~~ | ~~StorePermission.userId~~ | **RESUELTO 2026-04-09** — verificación contra prod confirmó que `StorePermission_userId_idx` ya existía físicamente. Sin acción adicional requerida. Ver ADR 017. | — | ✅ Cerrado |

**Plan de mitigación propuesto** (requiere aprobación antes de ejecutar migración):
1. Sprint 1: TD-018 (Float→Decimal) — migración de datos con conversión de tipos, requiere ventana de mantenimiento.
2. Sprint 2: TD-019 + TD-021 — migración aditiva de índices, zero-downtime (usar `CREATE INDEX CONCURRENTLY` via SQL raw, no Prisma por defecto).
3. Sprint 3: TD-020 — compound indexes estratégicos después de medir queries con `pg_stat_statements`.

## 🆕 Hallazgos del audit Excel Agentes IA (2026-04-06 noche)

Audit automatizado contra las 28 prácticas del Excel `Mejores_Practicas_Agentes_IA.xlsx`. **Score real del sistema de agentes: 10 ✅ / 9 ⚠️ / 9 ❌ → 51.8% sólido / 35.7% perfecto**. Las brechas accionables:

| ID | Práctica Excel | Estado | Razón / Bloqueador |
|----|----------------|--------|-------------------|
| TD-022 | #9 Salida estructurada JSON | ⚠️ **Implementado vía prompt-based (ADR-009)** | `lib/ai-json-parser.ts` con helper `safeParseJSON<T>(raw, schema)` + 15 tests. Migrados 3 endpoints: `demand-prediction`, `ocr/invoice`, `promotions/ai-suggest` (con compat markdown). Spike llama-4-scout descartó Opción A (Groq bloquea tools+json_object en todos los modelos). **Pendiente:** migrar más endpoints cuando tengan uso crítico de JSON. |
| TD-023 | #7 Temperaturas diferenciadas | ✅ **RESUELTO** | `lib/ai-temperatures.ts` centralizado con 8 roles canónicos. 9 endpoints alineados. |
| TD-024 | #23 Modelo mixto / router LLM | ✅ **RESUELTO** | `lib/llm-router.ts` + `lib/llm-providers/{types,groq,anthropic,index}.ts`. Anthropic provider real implementado (sin SDK, fetch directo). 5 endpoints Groq migrados al router. `lib/ai-config.ts#chatCompletion` delega internamente al router ahora. 2 endpoints (`ocr/invoice`, `whatsapp-ai` + `chat/auto-reply`) siguen usando sus wrappers antiguos que ahora forwardearán al router cuando sea necesario. |
| TD-025 | #10 Human-in-the-Loop formal | ✅ **RESUELTO** | Backend completo: `lib/agents/pending-approvals.ts` + `isToolApprovalRequired()` helper + intercepción en `ai-assistant/route.ts` + endpoint `app/api/ai-assistant/approvals/route.ts` + 11 tests. Frontend: `components/admin/ai-center/HITLApprovalsBanner.tsx` con polling 5s + modal + approve/reject + toast. Montado en `AICommandCenter.tsx`. 2 tools marcados como críticos (notifications_send_order_update, notifications_send_promotion). |
| TD-026 | #2 RAG vectorial | ❌ | Sin embeddings ni vector store. Snapshot text + 32 tools cubren el caso actual, pero falla con catálogos >1000 productos. ADR 011 cuando sea momento: pgvector vs ChromaDB vs Pinecone. |
| TD-027 | #16 LlamaGuard / moderación | ❌ | Sin filtros de moderación en inputs ni outputs. `moderateLLMOutput()` existe pero es regex básico, no LlamaGuard. Antes de abrir el chat a clientes finales del marketplace, resolverlo. |

## 🆕 Hallazgos del Sprint C Final Push (2026-04-07) — Schema drift Prisma

Al cerrar los últimos 105 errores TS, el Agent Team descubrió 4 gaps reales entre el código y `prisma/schema.prisma`. Los route handlers y componentes referenciaban campos/modelos que simplemente no existen en el schema. Se aplicaron workarounds en el código (corrección, eliminación, o type assertion con comentario) pero el gap de schema sigue abierto y requiere migración futura.

| ID | Modelo/Campo | Problema | Workaround aplicado | Severidad |
|----|--------------|----------|---------------------|-----------|
| TD-030 | `LoyaltyTransaction` (modelo completo) | Referenciado por `app/api/marketplace/loyalty/route.ts` (3 uses) pero el modelo no existe en schema. El historial de puntos de fidelidad NO persiste — solo se guarda el balance actual en `Customer.loyaltyPoints`. | Opción B: array vacío en GET, operación directa sobre `customer.loyaltyPoints` en POST. | 🟠 Alta — audit loyalty roto |
| TD-031 | `Review.imageUrls` | Referenciado por `app/api/marketplace/stores/[slug]/reviews/route.ts` (3 uses: select, create, response). El UI del marketplace soportaba reseñas con fotos pero la DB nunca tuvo la columna. | Opción B: removido el uso, reseñas sin fotos. | 🟡 Media — feature UI sin backing |
| TD-032 | `Coupon.storeId` | Referenciado en 3 archivos (`marketplace/coupons`, `marketplace/coupons/validate`, `superadmin/marketplace/coupons`). Los cupones del marketplace NO están diferenciados de los cupones del POS — comparten tabla sin relación a tienda. | Opción B: removidos filtros por `storeId` con comentarios TECH-DEBT. | 🟡 Media — cupones cruzados |
| TD-033 | `Tenant.settings` (relación) | Los crons (`demand-forecast`, `marketplace-weekly-report`, `stock-alerts-notify`, `recompra-coupon`, `zone-offers-push`) asumían una relación `Tenant.settings` que no existe. La config real vive en el modelo `Settings` separado (1:1 implícito vía `tenantId`) y los feature flags en `Settings.featureFlagsJson`. | Opción A: corregido — queries ahora hacen `prisma.settings.findUnique({ where: { tenantId } })` y leen `featureFlagsJson` para feature flags. | ✅ Ya corregido en código |

**Plan de migración futuro** (requiere sesión dedicada con `migration-planner`):

1. **TD-030**: crear modelo `LoyaltyTransaction` con `(id, customerId, tenantId, amount, reason, createdAt)` + migration + backfill de `Customer.loyaltyPoints` a movimientos sintéticos.
2. **TD-031**: agregar `Review.imageUrls String[]` (PostgreSQL array) o tabla `ReviewImage` con relación 1:N.
3. **TD-032**: agregar `Coupon.storeId String? @index` + FK opcional a `Store` + migration que marque los existentes como cupones POS (storeId = null).
4. **TD-033**: sin migración necesaria — solo documentar la relación implícita en `prisma/schema.prisma` como comentario.

## ✅ Resueltas

| ID | Área | Descripción | Resuelto en |
|----|------|-------------|-------------|
| TD-005 | N+1 queries | Auditoría sistemática completa | `docs/n-plus-1-audit.md` (sesión previa) |
| TD-006 | Cache | `lib/cache.ts` híbrido Memory+Redis con `getOrSet`, `invalidate`, `invalidateByPrefix` activo | Implementado antes de 2026-04 |
| TD-008 | Documentación API | OpenAPI spec generada con `npm run openapi:generate` desde Zod schemas → `public/openapi.json` | Implementado en sesiones previas |
| TD-009 | Tracing | `@vercel/otel` registrado en `instrumentation.ts` con service name `bodega-san-martin` | Implementado en sesiones previas |

## 🚧 Resueltas en sesión 2026-04-06 (Agent Team — sesiones 1+2)

Hallazgo crítico: `npx tsc --noEmit` reveló ~916 líneas de errores TypeScript pre-existentes que `ignoreBuildErrors: true` enmascaraba. La sesión Agent Team del 2026-04-06 cerró ~150 errores (-16% del total), priorizando los más críticos.

**Score real acumulado tras sesiones 1+2+3 del Agent Team:**
- Total errores TS: 916 → **620 líneas (-32%)**
- `tenantId` leaks: ~44 cerrados, **7 restantes** (-86%)
- Capitalización Prisma camelCase: **0 errores restantes** (todos resueltos)
- Tests Vitest: 2069/2100 → **2092/2100** (+23 tests verdes — fefo-logic mocks + security-multitenant marketplace endpoint bug)
- `admin/page.tsx`: 1446 → 1257 líneas (-189)
- Modelos Prisma AIConversation + AIMessage: schema + migration SQL listos
- **Bug crítico hallado y arreglado en producción:** `app/api/marketplace/stores/[slug]/products` retornaba 500 a todos los visitantes del marketplace por usar `Product` mayúscula en select donde Prisma 7 espera `product` camelCase

| Categoría | Archivos | Descripción | Severidad original |
|---|---|---|---|
| `tenantId` faltante | `lib/db/sales.db.ts`, `lib/db/supplier-portal.db.ts` (×2), `lib/push-subscriptions.ts`, `lib/workers/log-activity.worker.ts`, `lib/sunat.ts` | 6 queries Prisma sin `tenantId` → multi-tenant leak real | 🔴 Crítica |
| Capitalización Prisma | `lib/notification-generators.ts` (×9), `prisma/seed-fruteria.ts` (×4) | Relaciones `Customer`/`Product`/`Prestamo`/`Fiado`/`Sale`/`Order`/`PurchaseOrder` en PascalCase rompían los queries en runtime | 🟡 Alta |
| Tipos de DB classes incompletos | `lib/db/sales.db.ts:131,173`, `lib/forecasting/auto-reorder.ts`, `lib/whatsapp/conversation-engine.ts` | `DbSale` sin `items`, `CashRegister` sin `movements`, `DbPurchaseOrder`/`DbOrder` sin `createdAt`/`updatedAt` | 🟡 Alta |
| Variable indefinida | `lib/mailer.ts:141` | `tenantName` referenciado pero no declarado | 🟡 Alta |
| Roles faltantes | `lib/module-permissions.ts:55` | Record sin `owner`, `manager`, `analista` | 🟡 Alta |
| Comparación imposible | `lib/require-admin.ts:55` | Comparación con `"superadmin"` fuera del union de roles | 🟡 Alta |
| Implicit `any` en page.tsx | `app/admin/page.tsx` (líneas 753, 784, 1029, 1060, 1177) | Setters mal usados con updater functions | 🟢 Cosmética |
| JSX type mismatch | `stories/ErrorBoundary.stories.tsx` (×4) | Componente que retorna `void` (throw sin return) | 🟢 Cosmética |
| Funciones duplicadas | `scripts/setup-sentry-alerts.ts:411`, `scripts/verify-redis.ts:14` | Re-implementación duplicada | 🟢 Baja |
| Argumento faltante | `scripts/seed-test-data.ts:4` | Función llamada sin argumento requerido | 🟡 Media |
| Bug pre-existente | `app/admin/page.tsx` | Icono `Shield` usado sin import | 🟢 Cosmética |

**Total:** ~30 errores TS resueltos. Tras este bloque, `next.config.ts` puede quitar `ignoreBuildErrors: true` y `npm run build` actuará como gate real.

---

**Cómo agregar deuda técnica:**
1. Asignar ID consecutivo (TD-XXX)
2. Describir claramente el problema
3. Clasificar prioridad: 🔴 Alta / 🟠 Media / 🟡 Baja
4. Mover a "Resueltas" cuando se arregle
