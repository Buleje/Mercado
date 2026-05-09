# Marketplace DB — Patrones recurrentes

> **Fuente:** `lib/db/marketplace.db.ts` (1602 LOC, 5 namespaces, 24 funciones async).
> **Generado:** 2026-05-08 tras detectar 3 toques en sesión activa + audit de 9 commits históricos.

---

## Contexto: por qué este archivo se toca tanto

Aglutina 5 dominios cross-tenant: `Stores`, `StoreProducts`, `Orders`, `Reviews`, `AbandonedCarts`. Cada release lo toca en zonas distintas y los bugs aparecen en la **frontera tenant ↔ marketplace** (un Customer `phone` `@unique` global colisiona con multi-store, un `Store` huérfano sin `Tenant`, etc.). Es danger-zone listado en `CLAUDE.md` §6.

---

## Top 5 patrones recurrentes

| # | Patrón | Evidencia | Síntoma típico |
|---|---|---|---|
| 1 | **Catch silencioso → reconciliación retroactiva** | 5 logger.error añadidos round 3+4 (líneas 1013, 1538, 1560, 1584, 1599) + tag `TIER_DISCOUNT_FAILED` en `notes` (1131) | Bug oculto: cliente VIP sin descuento, sin rastro |
| 2 | **Schema drift: `select` explícito + raw SQL para campos faltantes** | `hoursJson` via `$executeRaw` (498, 551), `cover/lat/lng` skipped (350), `vacationMode` agregado en findByPossibleIds (440) | `ColumnNotFound` en runtime, drift entre schema y DB Supabase |
| 3 | **Race condition multi-store checkout** | F5 fix: `findFirst` + `create` en vez de `upsert` (1031), captura `P2002` (1051), comentario "carrito multi-tienda paralelo" (1027) | `Customer.phone` `@unique` global colisiona entre 2 tiendas concurrentes |
| 4 | **eslint-disable con justificación de aggregate cross-table** | 9 `no-restricted-properties` (1041, 1065, 1096, 1139, 1147, 1164, 1187, 1205, 1227) — todos con migración pendiente a `CustomersDB`/`CouponsDB` | Deuda técnica: marketplace toca `customer`/`coupon` directo |
| 5 | **Cache invalidation por prefijo después de write** | 8 `invalidateByPrefix("marketplace:stores")` (201, 267, 502, 560, 782) y `marketplace:store-products` (701, 729, 882) | Stale data si se olvida invalidar tras un `update`/`create` |

---

## Anti-patterns identificados

| Anti-pattern | Dónde | Riesgo |
|---|---|---|
| `catch {}` vacío sin logger | Estaba en abandoned-carts hasta round 3 (74da5394). Aún común en otras DBs. | Bug invisible — único síntoma es "el cliente se queja" |
| Total backend calculado **dentro** del try/catch del tier (986-1015) | Si `prisma.order.count` falla y `tierDiscountFailed=true`, el `order` se crea igual con descuento 0 | Discrepancia con `/api/marketplace/customer-tier` (otro espejo) |
| `prisma.customer.create` directo en lugar de `CustomersDB` (1041) | Aggregate cross-table sin extension de audit/cache | Comentado como "refactor pendiente" por 4+ commits |
| `phone` global `@unique` asumido como per-tenant en algunas queries | Bug F5 ya parchado, pero el `@unique` sigue siendo trampa para nuevos métodos | Devolver Customer de **otro tenant** |
| Raw SQL para `hoursJson` cuando Prisma `Json` field debería bastar | 498, 551, 555 | Indica schema drift no reconciliado — la migration falta o `prisma generate` no corrió |

---

## Antes de tocar este archivo (checklist)

```bash
# 1. Esquema vs DB — drift detector
npm run db:sanity                                  # detecta P2021/P2022 antes de runtime

# 2. ¿Quién consume? (impact radius)
grep -rln "MarketplaceOrdersDB\|MarketplaceStoresDB" app/ --include="*.ts" --include="*.tsx"

# 3. Tests del área
ls __tests__/ | grep -i marketplace                # __tests__/lib/marketplace*.test.ts
npm test -- marketplace.db                         # focused

# 4. Historial reciente del archivo (3 últimos commits)
git log --oneline -3 lib/db/marketplace.db.ts

# 5. Verificar que NO hay catch silencioso nuevo (regla #1)
grep -nE "catch\s*\{?\s*$|catch\s*\(.*\)\s*\{\s*$" lib/db/marketplace.db.ts
# Cada catch debe tener logger.error con { err, op }

# 6. Verificar tenantId 1er param en métodos nuevos
grep -nE "async \w+\(.*\):" lib/db/marketplace.db.ts | grep -v tenantId | grep -v "params:"
```

---

## Reglas duras (extraídas de los 9 commits que tocaron este archivo)

1. **Cada `catch` requiere `logger.error("<op> failed", { err, op })`** — sin excepción.
2. **Customer en marketplace: `findFirst`+`create` scoped a `tenantId`**, NUNCA `upsert({where:{phone}})`. `phone` es `@unique` global.
3. **Capturar `P2002` (unique violation) como ok** en flows multi-store concurrentes — es race condition esperada.
4. **Schema drift workaround = `$executeRaw` + comentario con fecha de migration pendiente** (ej. línea 350 menciona "migration 20260411 pending").
5. **Tras todo write, `invalidateByPrefix("marketplace:<dominio>")`** — el cache TTL es 60–300s y un olvido genera bugs largos de diagnosticar.
6. **Total/precios SIEMPRE backend** (regla #6 CLAUDE.md). En este archivo, `subtotal`, `tierDiscount`, `couponDiscount`, `loyaltyDiscount` se computan dentro de `createFromCart` (973-1108).
7. **Si la query de tier/cupón/loyalty falla, NO bloquear el pedido**, pero dejar tag de reconciliación en `notes` (patrón nuevo round 4).

---

## Decisión: ¿skill nuevo?

**No por ahora — basta el documento de learnings.** Razones:

| Criterio | Estado |
|---|---|
| ¿Patrones se repiten >3× en archivos distintos? | Patrones 1, 2, 5 son universales en `lib/db/*` — ya cubiertos por skills `multi-tenant-guard`, `db-sanity`, `audit-first` |
| ¿Hay reglas únicas a este archivo que un skill genérico no captura? | Sí: race condition `Customer.phone` cross-tenant + reconciliación tier — pero son **2 reglas**, insuficiente para skill propio |
| Costo/beneficio de skill | Bajo: este archivo se toca ~1×/semana. El doc actúa como pre-flight checklist suficiente |

**Cuándo sí crear skill `marketplace-db-guard`:** si en próximas 2 semanas aparecen 2+ bugs nuevos en este archivo del mismo tipo (race, drift, catch silencioso) → activar skill con auto-grep de los 6 comandos del checklist.

---

## Hallazgos surprising (P0/P1)

### P1 — `tierDiscountFailed` flag se pierde si `customerPhone` es null
Línea 986: el `try/catch` del tier solo corre si `params.customerPhone` existe. Si un pedido marketplace se crea sin teléfono (flujo invitado/anónimo), `tierDiscountFailed` queda en `false` por default, pero también el descuento queda en 0 sin posibilidad de reconciliación. **No es bug, es by-design**, pero el log de reconciliación `findOrdersWithFailedTierDiscount` NO los detecta. Vale documentarlo o agregar un `[ANONYMOUS_NO_TIER]` tag.

### P1 — `findOrdersWithFailedTierDiscount` no acepta `tenantId` filter para superadmin cross-tenant
Línea 1259: recibe `tenantId` pero lo aplica como WHERE estricto. Si un superadmin quiere reconciliar TODA la plataforma, debe iterar tenant por tenant. Aceptable para MVP, pero limita el caso "audit trimestral cross-tenant".

### P2 — Deuda de migración `CustomersDB`/`CouponsDB` lleva 4+ commits "pendiente"
9 `eslint-disable no-restricted-properties` con comentarios "refactor pendiente". Riesgo: cuando migren, deben reproducir 1:1 el comportamiento de `findFirst` scoped + race-safe + P2002 catch — fácil de romper. **Sugerencia:** crear ADR cuando se haga el refactor.

---

## Última verificación

| Item | Valor |
|---|---|
| LOC | 1602 |
| Funciones async | 24 |
| Namespaces | 5 (`Stores`, `StoreProducts`, `Orders`, `Reviews`, `AbandonedCarts`) |
| `try/catch` blocks | 7 (todos con logger.error tras round 3+4) |
| `eslint-disable` aggregate | 9 (todos con justificación + refactor pendiente) |
| `invalidateByPrefix` calls | 8 |
| Raw SQL (`$executeRaw`/`$queryRaw`) | 4 (todos por schema drift de `hoursJson`) |
| Consumidores en `app/api/marketplace/**` | ≥20 routes |
