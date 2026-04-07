# Deuda Técnica — Bodega San Martín

> **Regla:** Dedicar ~20% de cada sesión a reducir deuda técnica.
> Actualizar este archivo cuando se identifique o resuelva deuda.
> **Última auditoría:** 2026-04-06

## 🔴 Alta prioridad (afecta estabilidad o seguridad)

| ID | Área | Descripción | Impacto | Estado |
|----|------|-------------|---------|--------|
| ~~TD-001~~ | ~~CheckoutModal~~ | **RESUELTO 2026-04-06.** Verificado: `components/CheckoutModal.tsx` (16 líneas) es re-export intencional para preservar el path `@/components/CheckoutModal` usado por `StoreClientShell.tsx:6` vía `dynamic()`. Implementación real en `components/checkout/CheckoutModal.tsx` (238 líneas). **No hay duplicación de lógica** — la arquitectura es correcta. | — | ✅ Cerrado |
| TD-002 | Prisma migration | Modelos AIConversation/AIMessage agregados al schema. Migration SQL preparada en `prisma/migrations/20260406210602_add_ai_conversation_and_message/`. **Pendiente:** Brandon corre `DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy` antes del próximo push | Memoria IA no persiste datos hasta correr migración | 🟡 En progreso (SQL listo) |
| TD-003 | A/B testing + Quality eval | Métricas en memoria — se pierden al reiniciar servidor | Pérdida de datos de experimentos | 🔓 Abierto |
| TD-011 | admin/page.tsx | Archivo de 1413 líneas — refactor en progreso (Sesiones 1-2 hechas, faltan 4-7) | Alto acoplamiento, difícil de mantener | 🟡 En progreso |
| TD-012 | next.config.ts | `ignoreBuildErrors: true` enmascara errores TS reales. **Baseline 2026-04-07: 121 errores** (469 → 251 → 121, -74.2% acumulado). Sesión 2026-04-07 cerró 35 errores en 5 archivos top: AIActionPlan -10, LoyaltyTab -7, EtiquetasTab -7, daily-summary -7, api-purchases test -6 (commits `cebb778`, `226e8b0`). Distribución actual muy fragmentada (long tail, máx 4 errores por archivo). | Bugs llegan a producción sin gate de tipos | 🟡 En progreso (121 → 0 → flip flag → activar TD-026 gate pre-commit) |

## 🟠 Media prioridad (afecta desarrollo o rendimiento)

| ID | Área | Descripción | Impacto | Estado |
|----|------|-------------|---------|--------|
| TD-004 | API endpoints | Algunos endpoints todavía usan OFFSET en vez de cursor pagination | Degradación con tablas grandes | 🔓 Abierto |
| TD-007 | Descuentos | Strategy Pattern creado (ADR 006) pero no integrado al checkout | Lógica fragmentada entre currency.ts, pricing.agent y checkout | 🔓 Abierto |
| TD-010 | DB classes | Sin interfaces formales (IProductsDB, IOrdersDB) | Dificulta mocking en tests | 🔓 Abierto |
| TD-013 | proxy.ts | 470 líneas mezclando auth + CSP + tenant + rate limit + helpers duplicados de `lib/middleware-utils.ts` | Difícil de testear y modificar | 🔓 Abierto |
| TD-014 | Doppler | Migración planeada en `docs/doppler.md` pero bloqueada por acciones humanas (crear cuenta, autenticar CLI) | Secrets duplicados Vercel + .env.local | 🟡 En progreso |
| TD-026 | .husky/pre-commit | Falta gate `npx tsc --noEmit` en pre-commit hook. Solo se puede activar cuando TD-012 baje a 0 errores (de lo contrario bloquea todo commit). Plan: añadir línea `npx tsc --noEmit \|\| (echo "❌ TS errors — fix antes de commitear" && exit 1)` al final de `.husky/pre-commit`. Sin este gate, nuevos TS errors se cuelan después de cerrar TD-012. | Riesgo de regresión post-cierre TD-012 | 🔓 Bloqueado por TD-012 |
| TD-027 | api/superadmin/stores | Conteo de productos por tenant es N+1 (Promise.all + count por store). Funcional pero ineficiente. Plan: groupBy o subquery. Documentado inline en `app/api/superadmin/stores/route.ts`. | Latencia crece con # de tiendas | 🔓 Abierto |
| TD-028 | components/admin/AdminTenantBar.tsx | Marcado `"use client"` sin justificación — es presentacional puro (sin hooks ni handlers). Convertir a Server Component reduce bundle JS. | Bytes JS innecesarios en cliente | 🔓 Abierto |
| TD-029 | components/admin/fiados/FiadoFormModal.tsx | Setters tipados como `(p: any)` — escape hatch del type system introducido en commit `11bdafd` para destrabar TS errors rápido. Tipar correctamente con el shape real del form. | Pierde safety en formulario crítico de fiados | 🔓 Abierto |

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
| TD-018 | `OrderItem.price`, `SaleItem.price`, `WholesaleOrderItem.unitPrice`+`total`, `Bundle.price` | Usan `Float` para dinero. Float tiene ~15-17 dígitos de precisión → errores de redondeo acumulados en audits, chargebacks, discrepancias de pago. | `schema-data-types.md` | 🔴 Crítica (correctness) |
| TD-019 | `WholesaleOrderItem.productId`, `WholesaleOrderItem.wholesaleOrderId`, `StoreProduct.productId` | FK sin `@@index`. Postgres NO indexa FKs automáticamente → JOINs y CASCADE full-scan. Con pgbouncer `connection_limit=1`, serializa todas las transacciones. | `schema-foreign-key-indexes.md` | 🟠 Alta |
| TD-020 | `CommissionLedger`, `Review`, y otros con `tenantId` + campo filtro común | Índices single-column en `tenantId` y `status` por separado — falta compound `(tenantId, status)` y `(tenantId, createdAt)` para los WHERE más comunes del SaaS multi-tenant. | `query-missing-indexes.md` | 🟠 Alta |
| TD-021 | `StorePermission.userId` | FK con `@@unique([storeId, userId, userType])` pero sin `@@index([userId])` single-column. Queries "¿en qué tiendas trabaja este user?" van a full-scan. | `schema-foreign-key-indexes.md` | 🟡 Media |

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
