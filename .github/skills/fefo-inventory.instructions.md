---
applyTo: "**/batch*,**/inventory*,**/batches*"
---

# FEFO Inventory — Buleje

## Qué es FEFO

First Expired, First Out — los productos con fecha de vencimiento más próxima
se despachan primero. Previene pérdidas por vencimiento.

## Archivos clave

```
lib/db/inventory.db.ts        — decrementFEFO(), refreshProductExpiresAt()
app/api/batches/route.ts      — CRUD de lotes (danger zone)
app/api/inventory-movements/  — Registra entradas/salidas
prisma/schema.prisma (Batch)  — Modelo de lotes (~línea 969)
```

## Modelo Batch (campos críticos)

```prisma
model Batch {
  id          Int       @id @default(autoincrement())
  productId   Int
  quantity    Float     // Stock disponible en este lote
  expiryDate  DateTime? // ← ESTE campo (NO expiresAt)
  costPrice   Float?
  location    String?
  tenantId    String    @default("main")
  createdAt   DateTime  @default(now())
  product     Product   @relation(fields: [productId], references: [id])
}
```

## Campo Product.expiresAt

```prisma
// En Product model:
expiresAt DateTime? // Fecha más próxima de vencimiento del stock disponible
                    // Actualizado automáticamente por refreshProductExpiresAt()
```

## decrementFEFO() — cómo funciona

```typescript
// Llamado desde POST /api/orders al confirmar una compra
// 1. Busca batches del producto ordenados por expiryDate ASC (más próximo primero)
// 2. Descuenta cantidad empezando por el lote más próximo a vencer
// 3. Si un lote queda en 0, lo marca/elimina
// 4. Llama refreshProductExpiresAt() para actualizar Product.expiresAt
await decrementFEFO(productId, quantity, tenantId);
```

## refreshProductExpiresAt() — mantiene Product.expiresAt actualizado

```typescript
// Ejecutado DESPUÉS de cada venta o movimiento de inventario
// Busca el batch con expiryDate más próxima y stock > 0
// Actualiza Product.expiresAt con ese valor
await refreshProductExpiresAt(productId, tenantId);
```

## Flujo de entrada de stock (compra/recepción)

```
POST /api/batches → crear Batch con productId, quantity, expiryDate, costPrice
→ InventoryMovement tipo "entrada"
→ refreshProductExpiresAt() para recalcular Product.expiresAt
```

## Alertas de vencimiento

```
vercel.json crons:
- /api/stock-alerts (diario 8am) → productos vencidos o próximos a vencer
- /api/reorder-alerts (diario 6am) → stock bajo mínimo
```

## Mermas (pérdidas de inventario)

```
app/api/mermas/ — Registra pérdidas por vencimiento, rotura, robo
Crea InventoryMovement tipo "merma"
```

## Gotchas ⚠️

- **`expiryDate` no `expiresAt`** en Batch — error frecuente al acceder al campo
- **`Product.expiresAt` es calculado** — no lo actualices manualmente; usar `refreshProductExpiresAt()`
- **El checkout NO selecciona por lote** — `decrementFEFO` descuenta globalmente del lote más próximo
- **Batch duplicado corregido** — schema tenía dos modelos Batch; se eliminó el duplicado (mantener el de línea ~969)
- **`quantity` es Float en Batch** — permite fracciones (kg, litros)
- **Nunca llamar Prisma directo en batches** — usar `InventoryDB` del db class

## Anti-patrones

- NO usar `expiresAt` para referirte al campo de Batch (es `expiryDate`)
- NO decrementar stock global sin llamar `decrementFEFO()` — pierde trazabilidad FEFO
- NO crear batch sin `expiryDate` para productos perecibles
- NO olvidar `refreshProductExpiresAt()` después de movimientos de inventario
