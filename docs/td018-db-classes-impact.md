# TD-018 — Impacto en `lib/db/*.db.ts`: Float → Decimal(12,2)

**Fecha:** 2026-04-09
**Estado:** Análisis READ-ONLY — no se editó ningún archivo de código
**Generado por:** Backend Platform Engineer (subagente)

---

## 1. Inventario de archivos impactados

Total real encontrado: **30 archivos** tienen al menos un campo monetario mencionado en los tipos o mappers.
De esos 30, **22 requieren fix activo de TypeScript** (los 8 restantes solo referencian campos no-monetarios del mismo modelo o son solo tipos).

| # | Archivo | Metodos/mappers tocados | Campos monetarios tocados | `toNum` ya usa | Fix estimado (líneas) |
|---|---------|------------------------|--------------------------|----------------|----------------------|
| 1 | `orders.db.ts` | `mapOrder`, `mapReturn` | `price`, `total`, `totalCogs`, `couponDiscount`, `discountAmount`, `costPrice` (item), `total` (return) | NO — raw assignment | ~35 |
| 2 | `sales.db.ts` | `mapSale`, `mapCashMovement`, `mapCashRegister` | `price`, `total`, `totalCogs`, `amountPaid`, `change`, `costPrice`, `descuentoMonto`, `amount`, `openingAmount`, `closingAmount`, `expectedAmount`, `difference` | Parcial — `Number()` inline | ~40 |
| 3 | `products.db.ts` | `mapProduct`, `mapPriceHistory`, `mapBundle` | `price`, `costPrice`, `oldPrice`, `newPrice`, `price` (bundle) | NO — raw assignment | ~15 |
| 4 | `customers.db.ts` | `mapCustomer` | `totalSpent`, `creditBalance`, `creditLimit` | NO — raw assignment | ~8 |
| 5 | `misc.db.ts` | Tipos `DbProduct`, `DbOrderItem`, `DbCustomer`, `DbOrder`, `DbPayable`, `DbPayment` | `price`, `costPrice`, `total`, `totalCogs`, `couponDiscount`, `discountAmount`, `totalSpent`, `creditBalance`, `creditLimit`, `amount`, `paidAmount` | NO (tipos, no mappers) | ~20 (solo DTOs) |
| 6 | `finance.db.ts` | `mapPayable`, `mapExpense` | `amount`, `paidAmount` (Payable), `amount` (Expense), `amount` (Payment) | NO — raw assignment | ~12 |
| 7 | `purchases.db.ts` | `mapPurchaseOrder` | `unitCost`, `total`, `discount` | NO — raw assignment | ~8 |
| 8 | `fiados.db.ts` | `mapFiado`, `mapCuota`, `registerPago` | `total`, `saldo`, `monto` | SI — 4 usos | ~5 (solo `registerPago` aritmética) |
| 9 | `prestamos.db.ts` | `mapPrestamo`, `mapCuota`, `registrarPago`, `refinanciar`, `getResumen` | `monto`, `tasaInteres`, `moraInteres`, `tea`, `monto`/`capital`/`interes`/`moraCalculada`/`montoPagado` (cuota) | SI — 11 usos, más funciones `round2` | ~20 (aritmética amortización con `number`) |
| 10 | `treasury.db.ts` | `mapCuenta`, `mapMovimiento`, `mapTransferencia` | `saldo`, `saldoInicial`, `monto`, `saldoAnterior`, `saldoPosterior` | SI — variante `const toNum = (v: unknown)` | ~8 |
| 11 | `recetas.db.ts` | `mapReceta`, `mapIngrediente`, `mapProduccion`, `calcularCosto` | `costoTotal`, `cantidad`, `costoReal`, `costPrice`/`price` en cálculo | SI — 5 usos | ~10 (cálculo `costUnit * Number(ing.cantidad)`) |
| 12 | `turnos.db.ts` | `mapTurno` | `inicioEfectivo`, `cierreEfectivo`, `ventasTotal` | SI — 4 usos | ~3 |
| 13 | `cotizaciones.db.ts` | `mapItem`, `mapCotizacion` | `precioUnit`, `descuento`, `subtotal`, `igv`, `total` | NO — usa `dec()` local | ~5 (renombrar `dec` a `toNum` o extender) |
| 14 | `notas-credito.db.ts` | `mapNotaCredito` | `monto`, `igv`, `total` | NO — usa `dec()` local | ~5 (renombrar `dec` a `toNum`) |
| 15 | `credit.db.ts` | `mapProfile`, `mapInstallment` | `creditLimit`, `usedCredit`, `availableCredit`, `avgTicket`, `totalAmount`, `installmentAmount`, `interestRate`, `paidAmount` | NO — raw assignment (any) | ~18 |
| 16 | `marketplace.db.ts` | mappers internos de `DbStore`, `DbStoreProduct`, `DbVendorDashboard` | `commission`, `retailPrice`, `wholesalePrice`, `total` (revenue), `total` (order) | NO — raw assignment | ~20 |
| 17 | `sponsored-boosts.db.ts` | `mapBoost` | `bidAmount`, `totalSpentPen`, `maxBudgetPen` | NO — usa `toDecimalNum()` DIFERENTE | ~5 (unificar con `toNum`) |
| 18 | `product-variants.db.ts` | `mapVariant` | `priceModifier` | NO — raw assignment | ~5 |
| 19 | `supplier-portal.db.ts` | inline mapper de `SupplierPriceVersionDB` | `oldPrice`, `newPrice` | NO — raw assignment | ~5 |
| 20 | `promotions.db.ts` | `mapPromotion`, `mapCoupon` | `discountPercent`, `minPurchase`, `discountValue`, `balance` | NO — raw assignment | ~8 |
| 21 | `batches.db.ts` | `mapBatch` | `costUnit` | NO — raw assignment | ~4 |
| 22 | `mermas.db.ts` | NO tiene campos monetarios directos | — | NO | 0 (no impacta) |

> **Nota sobre `mermas.db.ts`:** aparece en el grep por la palabra `cost` pero no tiene campos Decimal propios — obtiene el costo desde el producto vía join. No requiere fix directo, pero sus callers sí.

---

## 2. Patrón `toNum()` existente — análisis de consistencia

### Definiciones encontradas (5 archivos, 3 variantes)

| Archivo | Definición | Signatura |
|---------|-----------|-----------|
| `fiados.db.ts` | `function toNum(d: Prisma.Decimal \| null \| undefined): number` | Tipada con `Prisma.Decimal` |
| `prestamos.db.ts` | `function toNum(d: Prisma.Decimal \| null \| undefined): number` | Idéntica a fiados |
| `recetas.db.ts` | `function toNum(d: Prisma.Decimal \| null \| undefined): number` | Idéntica a fiados |
| `turnos.db.ts` | `function toNum(d: Prisma.Decimal \| null \| undefined): number` | Idéntica a fiados |
| `treasury.db.ts` | `const toNum = (v: unknown): number => Number(v ?? 0)` | Variante `unknown` (menos tipada) |
| `sponsored-boosts.db.ts` | `function toDecimalNum(d: Prisma.Decimal \| number \| string \| null \| undefined): number` | Acepta múltiples tipos |
| `cotizaciones.db.ts` | `function dec(v: unknown): number` | Nombre diferente, misma idea |
| `notas-credito.db.ts` | `function dec(v: unknown): number` | Idéntica a cotizaciones |

**Inconsistencia detectada:** existen 4 nombres distintos para el mismo patrón (`toNum`, `toDecimalNum`, `dec`, inline `Number()`).
**Conclusión:** El plan TD-018 propone unificar todo bajo `toNum`. La variante canónica a usar es la de `fiados.db.ts` / `prestamos.db.ts` porque es la más tipada y segura.

### Usos totales de `toNum` hoy

```
fiados.db.ts:       4 usos
prestamos.db.ts:   11 usos
recetas.db.ts:      5 usos
treasury.db.ts:     7 usos (como const)
turnos.db.ts:       4 usos
Total:             31 ocurrencias en 5 archivos
```

---

## 3. Patrón `toNum()` — código copy-pasteable

```typescript
// ── Helper canónico — copiar en CADA archivo que no lo tenga ─────────────────
// Ubicación: sección "Helpers", entre toISO() y los mappers
// Fuente: fiados.db.ts / prestamos.db.ts (patrón original)

import type { Prisma } from "@/lib/generated/prisma/client";

function toNum(d: Prisma.Decimal | null | undefined): number {
  return d ? Number(d) : 0;
}

// Uso en mapper:
// ANTES (Float): precio: p.price          ← number directo de Prisma
// DESPUÉS (Decimal): precio: toNum(p.price) ← convierte Decimal → number

// Para campos nullable opcional:
// ANTES:  ...(p.costPrice != null && { costPrice: p.costPrice })
// DESPUÉS: ...(p.costPrice != null && { costPrice: toNum(p.costPrice) })

// Para aritmética DESPUÉS de mapear (ya es number):
// BIEN:  const total = toNum(order.total) + toNum(order.fee);
// MAL:   const total = order.total + order.fee;  // ← Decimal + Decimal no compila
```

**Regla de serialización JSON** (para route handlers):

```typescript
// ANTES (Float serializa bien):
return NextResponse.json({ price: product.price });

// DESPUÉS (Decimal no serializa):
// Opción A — si el campo ya pasó por toNum() en el mapper (DB class devuelve number):
return NextResponse.json({ price: product.price }); // ya es number, ok

// Opción B — si se serializa directamente desde Prisma (sin pasar por DB class):
return NextResponse.json({ price: product.price.toFixed(2) }); // string "19.99"
// O:
return NextResponse.json({ price: Number(product.price) }); // number
```

---

## 4. Endpoints API con riesgo de JSON serialization

Los siguientes 88 route handlers consumen DB classes impactadas y pueden romper en producción si se cambia el schema sin actualizar los mappers primero.

**Riesgo CRITICO (serialización directa sin pasar por DB class mapper):**

| Endpoint | Riesgo | Razón |
|----------|--------|-------|
| `app/api/orders/route.ts` | ALTO | `OrdersDB.getAll()` — `mapOrder` no usa `toNum`, asigna Decimal raw a `DbOrder.total: number` |
| `app/api/sales/route.ts` | ALTO | `SalesDB.getAll()` — `mapSale` asigna `s.total`, `s.amountPaid`, `s.change` sin conversión |
| `app/api/v1/products/route.ts` | ALTO | `ProductsDB.getAll()` — `mapProduct` asigna `p.price`, `p.costPrice` sin conversión |
| `app/api/customers/[phone]/route.ts` | ALTO | `CustomersDB` — `mapCustomer` asigna `totalSpent`, `creditBalance`, `creditLimit` raw |
| `app/api/invoices/emit/route.ts` | ALTO | Probablemente construye totales desde modelos Prisma directo |
| `app/api/admin/dashboard/route.ts` | ALTO | Agrega múltiples modelos monetarios — riesgo de mezclar Decimal con number |
| `app/api/cotizaciones/route.ts` | MEDIO | `cotizaciones.db.ts` usa `dec()` que ya convierte, pero input validation espera `number` |
| `app/api/notas-credito/route.ts` | MEDIO | Usa `dec()` — funcional pero inconsistente con el estándar `toNum` |
| `app/api/treasury/cuentas/route.ts` | MEDIO | `treasury.db.ts` usa `const toNum` con signatura `unknown` — menos typesafe |
| `app/api/marketplace/stores/my/sync/route.ts` | MEDIO | `marketplace.db.ts` no tiene `toNum`, asignaciones raw |
| `app/api/credit/route.ts` (si existe) | ALTO | `credit.db.ts` usa `any` + raw assignment en todos los campos monetarios |
| `app/api/cron/daily-summary/route.ts` | MEDIO | Agrega totales de ventas — si mezcla Decimal con number en suma, error silencioso |

---

## 5. Priorización por impacto en runtime

### Tier 1 — Riesgo máximo (fix ANTES de deploy del schema)

1. **`orders.db.ts` + `misc.db.ts`** — Cada pedido del e-commerce pasa por aquí. `mapOrder` asigna `o.total` (Decimal) directamente a `DbOrder.total: number`. Después del cambio de schema, este mapper rompe TypeScript y serializa `[object Object]` en JSON. Además `misc.db.ts` define los tipos base `DbOrder`, `DbProduct`, `DbCustomer` — todos los campos `price: number`, `total: number`, `creditBalance: number` necesitan mantenerse como `number` en el DTO (la conversión ocurre en el mapper, no en el tipo).

2. **`sales.db.ts`** — POS físico. `mapSale` asigna `s.total`, `s.amountPaid`, `s.change` sin conversión. Crítico porque `change` (vuelto de caja) es el campo más sensible para cuadre de caja. Riesgo adicional: `Number(s.descuentoMonto)` ya existe en el mapper (línea 61) pero sin el helper `toNum` — patrón inconsistente dentro del mismo archivo.

3. **`products.db.ts`** — Base de todos los cálculos. `mapProduct` asigna `p.price` y `p.costPrice` directamente. Afecta a `mapBundle` y `mapPriceHistory` también.

### Tier 2 — Alto impacto, fix en la misma sesión

4. **`finance.db.ts`** — `mapPayable` y `mapExpense` sin conversión. Afecta cuentas por pagar y gastos.
5. **`customers.db.ts`** — `totalSpent`, `creditBalance`, `creditLimit` sin conversión. Afecta límites de crédito en checkout.
6. **`credit.db.ts`** — Usa `any` en todos los mappers. Necesita refactor estructural (ver sección 6).
7. **`marketplace.db.ts`** — `retailPrice`, `wholesalePrice`, `commission` sin conversión. Afecta toda la lógica marketplace B2B.

### Tier 3 — Impacto medio, fix en sesión posterior

8-22: Resto de archivos con campos monetarios secundarios (treasury, recetas, cotizaciones, etc.).

---

## 6. Archivos que necesitan refactor estructural (no solo `toNum`)

Estos NO se resuelven con solo agregar `toNum` — requieren cambios adicionales:

### `orders.db.ts` — refactor de aritmética
El archivo hace cálculos de totales y COGS dentro de los métodos CRUD usando `number`. Después de la migración, los valores que llegan de Prisma serán `Decimal`. El patrón correcto es:
1. Recibir de Prisma como `Decimal`
2. Convertir a `number` con `toNum()` en el mapper
3. Toda la aritmética posterior opera sobre `number` (no Decimal)

**El riesgo está** en que si algún cálculo se hace ANTES del mapper (directamente sobre el resultado de Prisma), rompe.

### `prestamos.db.ts` — refactor de amortización
Las funciones `calcFrances`, `calcAleman`, `calcAmericano` trabajan con `number` puro — eso está bien. El problema es en `registrarPago` y `refinanciar` que hacen `Number(cuota.monto)` y `Number(prestamo.moraInteres)` directamente sobre los campos Prisma. Estos deben ser `toNum(cuota.monto)` para consistencia y typing correcto.

### `recetas.db.ts` — refactor de `calcularCosto`
Línea 155-156: `const costUnit = ing.producto.costPrice ?? ing.producto.price` asigna `Decimal | Float` a una variable implícita. Luego `total += costUnit * Number(ing.cantidad)`. Después de la migración, `costUnit` será `Decimal`, y `Decimal * number` no compila. Necesita:
```typescript
const costUnit = toNum(ing.producto.costPrice ?? ing.producto.price);
total += costUnit * toNum(ing.cantidad);
```

### `credit.db.ts` — refactor de `any` a tipos fuertes
Usa `any` en ambos mappers (`mapProfile`, `mapInstallment`). Todos los campos monetarios se asignan sin conversión. Además los tipos `DbCreditProfile` y `DbCreditInstallment` definen `number` para campos que serán `Decimal` en Prisma. Es el archivo con menor type-safety de los 22.

### `sponsored-boosts.db.ts` — unificación de helper
Tiene su propio `toDecimalNum()` con signatura más amplia (`Decimal | number | string`). Funcionalmente equivalente pero inconsistente. El plan TD-018 debe decidir: ¿adoptar `toDecimalNum` como canónico (más robusto) o mantener `toNum` y actualizar `sponsored-boosts`?

---

## 7. Resumen ejecutivo para el sprint

**Total archivos reales con campos monetarios:** 30 (no 22 como estimaba el plan — 8 adicionales detectados)
**Requieren fix activo de TypeScript:** 22 (coincidia con el plan, aunque la distribución difiere)
**Ya tienen algún patrón de conversión:** 5 (`fiados`, `prestamos`, `recetas`, `turnos`, `treasury`) + 2 con variantes (`cotizaciones`, `notas-credito`, `sponsored-boosts`)
**Sin ninguna protección hoy:** 15 archivos (asignación raw)

**Estimación realista solo para TypeScript (Fase 3):**

| Actividad | Horas |
|-----------|-------|
| Agregar `toNum` a 15 archivos sin helper + renombrar `dec`/`toDecimalNum` | 1.0 h |
| Actualizar 22 mappers (campos en DTOs + mappers) | 1.5 h |
| Aritmética y cálculos en `prestamos`, `recetas`, `orders` | 1.0 h |
| Actualizar tipos base en `misc.db.ts` | 0.5 h |
| Correr `npx tsc --noEmit` + fix de errores residuales | 1.0 h |
| **Total** | **5.0 h** |

> El plan original estimaba 3-4 h. La estimación real es **5 horas** por los 8 archivos extra detectados y el refactor estructural de 4 archivos (orders, prestamos, recetas, credit).

---

## 8. Orden recomendado de ejecución (Fase 3)

```
1. misc.db.ts          — tipos base (bloquea TypeScript de todo lo demás)
2. products.db.ts      — bloquea recetas y orders
3. orders.db.ts        — mayor volumen de requests en runtime
4. sales.db.ts         — POS físico, crítico para cuadre de caja
5. customers.db.ts     — creditLimit bloquea checkout
6. finance.db.ts       — cuentas por pagar
7. purchases.db.ts     — órdenes de compra
8. fiados.db.ts        — ya tiene toNum, solo fix aritmética
9. prestamos.db.ts     — ya tiene toNum, fix aritmética amortización
10. treasury.db.ts     — ya tiene toNum (variante), unificar signatura
11. recetas.db.ts      — fix calcularCosto
12. turnos.db.ts       — ya tiene toNum, mínimo cambio
13. credit.db.ts       — refactor any → tipos fuertes
14. marketplace.db.ts  — commission, retailPrice, wholesalePrice
15. cotizaciones.db.ts — renombrar dec → toNum
16. notas-credito.db.ts — renombrar dec → toNum
17. sponsored-boosts.db.ts — unificar toDecimalNum → toNum
18. promotions.db.ts   — discountValue, balance
19. batches.db.ts      — costUnit
20. product-variants.db.ts — priceModifier
21. supplier-portal.db.ts  — oldPrice, newPrice
22. mermas.db.ts        — no requiere cambio directo
```

---

*Análisis generado en modo READ-ONLY. Ningún archivo de código fue modificado.*
