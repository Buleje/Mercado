# ADR-082 — Multi-Tenant Isolation Architecture

**Status:** Accepted
**Date:** 2026-04-29
**Authors:** Brandon Buleje + Claude (auditoría Security Auditor + Pentester)
**Supersedes:** N/A (formaliza prácticas existentes + cierra hallazgos de auditoría)

---

## Contexto

Buleje es un SaaS multi-tenant. Cada tenant es una bodega/tienda. Si los datos de un cliente se cruzan entre tenants, hay riesgo de demanda real bajo **Ley 29733 PE** (multa hasta 100 UIT ≈ S/. 515,000) — además de daño reputacional irreversible. La auditoría del 2026-04-29 detectó 6 vectores críticos + 4 altos explotables al momento del audit.

Este ADR formaliza el modelo de aislamiento, las defensas en cada capa, y las reglas no-negociables para cualquier desarrollador (humano o agente) que toque código sensible.

## Decisión

### 1. Modelo de aislamiento: app-level, NO Postgres RLS

| Razón | Detalle |
|---|---|
| Performance | RLS en Postgres con CUID + 160 modelos genera planificación de queries lenta y dificulta el cache layer Upstash Redis |
| Flexibilidad | Marketplace cross-vendor requiere queries cross-tenant intencionales (loyalty, comisiones) — RLS las complicaría |
| Trazabilidad | El audit log y el cache key prefijado con `tenantId:` son legibles directamente |

**Trade-off:** la disciplina cae sobre el código. Cada query SIN `tenantId` filter es un leak potencial. Por eso esta ADR.

### 2. Capas de defensa (en orden de ejecución)

```
[Cliente] ──► proxy.ts ──► requireAdmin/requireCustomer ──► lib/db/*.db.ts ──► Prisma ──► Postgres
              │                │                              │
              │                │                              └─ tenantId 1er param obligatorio
              │                │                              └─ cache key `<tenantId>:<entity>:...`
              │                │                              └─ audit log entry con tenantId
              │                │
              │                └─ verifica JWT HMAC, prefiere tenantId del JWT sobre header
              │
              └─ sobrescribe `x-tenant-id` con tenant resuelto del host (no confía cliente)
```

**Cron de defensa en profundidad:** `app/api/cron/isolation-monitor/route.ts` corre cada 6h y detecta:
- Registros huérfanos sin `tenantId` válido
- `OrderItem.productId` que cruza `tenantId` de otro tenant (mismo en cart, reviews, etc.)
- Si encuentra cross-tenant, alerta a SuperAdmin via WhatsApp + Push.

### 3. Reglas no-negociables

| # | Regla | Enforcement |
|---|---|---|
| R1 | `tenantId` SIEMPRE 1er argumento en métodos de `lib/db/*.db.ts` | Convención + `BaseRepository` |
| R2 | NUNCA `prisma.<modelo>.<método>` directo fuera de `lib/db/` | ESLint `no-restricted-properties` (warn → error progresivo) |
| R3 | NUNCA confiar en `req.headers.get("x-tenant-id")` del cliente — usar el resuelto por proxy | proxy.ts:60 sobrescribe |
| R4 | Para `update`/`delete` por id, usar `updateMany`/`deleteMany` con `{id, tenantId}` (no `findFirst+update`) | Pattern oficial — cierra TOCTOU |
| R5 | Cache keys SIEMPRE prefijadas con `tenantId:` | Convención lib/db/* |
| R6 | Webhooks externos (Stripe/MP/Twilio): el `tenantId` se resuelve por mapping interno (stripeCustomerId, storeSlug en DB), NUNCA del payload externo | Auditoría manual |
| R7 | Endpoints públicos por phone (loyalty, customer-lookup, cart/restore): SIEMPRE filtran por `tenantId` del request | Auditoría manual |
| R8 | Auto-create de `tenant` solo en `/api/onboarding`. Resto de endpoints retorna 404 si tenant no existe | Auditoría manual |

### 4. Pattern para writes con id (TOCTOU-safe)

❌ **Anti-pattern (vulnerable a TOCTOU):**
```ts
const found = await prisma.X.findFirst({ where: { id, tenantId: auth.tenantId } });
if (!found) return 404;
await prisma.X.update({ where: { id }, data: ... });  // sin tenantId !
```

✅ **Pattern oficial (atómico):**
```ts
const result = await prisma.X.updateMany({
  where: { id, tenantId: auth.tenantId },
  data: { ... },
});
if (result.count === 0) return 404;
```

### 5. Customer.phone — caso especial

**Estado actual:** `Customer.phone` es `@id` global (PK única en toda la DB). Esto significa que el mismo cliente con el mismo teléfono solo puede existir en UN tenant. Si un cliente compra en 2 bodegas distintas, hay conflicto.

**Decisión:** mantener `@id` global por ahora — los clientes que cruzan bodegas son raros en producción. Pero, los endpoints públicos (`customer-lookup`, `loyalty`, `cart/restore`) DEBEN filtrar por `tenantId` aunque el `@id` los identifique únicamente, porque el flujo de UI puede leakear info entre tenants si no se filtra.

**Plan futuro (sprint 3+):** migrar a `@@id([tenantId, phone])` PK compuesta. Eliminaría la categoría completa de leaks por construcción. Requiere expand-migrate-contract sobre `LoyaltyTransaction`, `Review`, etc.

## Consecuencias

### Positivas
- Modelo claro, defendible ante auditoría legal de Ley 29733 PE.
- Reglas verificables automáticamente (ESLint, isolation-monitor cron).
- Onboarding rápido para nuevos devs/agentes: 8 reglas únicas de leer.

### Negativas
- ESLint rule emite ~1259 warnings (las 370 violaciones legacy). Mitigado: rule en `warn`, cleanup progresivo.
- `updateMany`/`deleteMany` retorna `count` en vez del row actualizado. Si el caller necesita el row, requiere un `findFirst` posterior (1 query extra). Trade-off aceptable.

### Alternativas consideradas

| Alternativa | Descartada porque |
|---|---|
| Postgres RLS | Performance + complica cache + cross-tenant intencional del marketplace |
| Schema-per-tenant | Operacionalmente caro (160 modelos × N tenants), break onboarding rápido |
| Sin cron isolation-monitor | Falta defensa en profundidad — el código nuevo puede regresionar silenciosamente |

## Referencias

- `proxy.ts:60` — sobrescritura de `x-tenant-id`
- `lib/middleware/tenant.ts:89` — `resolveTenantMultiSource` (JWT > cookie > Referer)
- `lib/middleware/auth-guards.ts:65` — guards por path
- `lib/middleware/cross-tenant-audit.ts` — audit log de inyección
- `lib/require-admin.ts:60-78` — preferencia JWT sobre header
- `lib/db/base-repository.ts` — `tenantId` 1er param + cache prefix
- `app/api/cron/isolation-monitor/route.ts` — defense in depth
- `eslint.config.mjs` — rule `no-restricted-properties` para `prisma.*` (HOTFIX-A4)
- Reportes de auditoría 2026-04-29 (Security Auditor + Pentester) — internos
- Commits relacionados: `e0940e45` (Wave 1+2 — 6 críticos + 2 altos + 1 medio), Wave 3 (M3 + A6 + A4)

## Hallazgos cerrados por este ADR

| Hallazgo | Sev | Cerrado en commit |
|---|---|---|
| C1 MP webhook secret obligatorio + tenantId scope | 🔴 | `e0940e45` |
| C2 Stripe metadata trust → cross-tenant guard | 🔴 | `e0940e45` |
| C3 customer-lookup tenantId filter | 🔴 | `e0940e45` |
| C4 cart/restore post-validación store.tenantId | 🔴 | `e0940e45` |
| C5 loyalty no expone PII en read público | 🔴 | `e0940e45` |
| C6 customers/[phone]/orders customer-session + rate 5/min | 🔴 | `e0940e45` |
| A1 orders/[id]/tracking ?phone= validation | 🟡 | `e0940e45` |
| A2 orders?phone= customer-session | 🟡 | `e0940e45` |
| M1 whatsapp verify token sin fallback | 🟠 | `e0940e45` |
| M3 TOCTOU updateMany pattern | 🟠 | Wave 3 |
| A6 auto-create tenant lock | 🟡 | Wave 3 |
| A4 ESLint no-direct-prisma rule | 🟡 | Wave 3 |

## Pendiente futuro (no bloqueante)

| ID | Descripción | Sprint estimado |
|---|---|---|
| A3 | Review create con OTP/customer-session check (vía marketplace) | 2 |
| A5 | Cache keys con `tenantId:` en `reviews.db.ts` y `marketplace-catalog.db.ts` | 2 |
| M2 | Idempotency key scoped por phone en orders POST | 2 |
| M4 | Documentar `@cross-tenant intentional` en customer-tier/referral | 3 |
| Migración | `Customer.@@id([tenantId, phone])` PK compuesta | 3-4 |
| E2E | Suite cross-tenant isolation con dos tenants A/B + cliente compartido | 3 |
| Migración 370→0 | Migrar progresivamente `prisma.*` directo a `lib/db/*.db.ts` | rolling |
