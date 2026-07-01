# ADR-302 — Cacao: estado de cuenta al productor (deuda / anticipos / saldo)

> Estado: **Implementado** · Fecha: 2026-07-01 · Autor: Brandon + Claude
> Extiende [ADR-128](128-cacao-acopio-beneficio.md) (Acopio & Beneficio de Cacao)

## Contexto

El módulo de Cacao rastrea el dinero que **entra** (ventas: `CacaoVenta.montoCobrado`
+ `estadoPago` + `registrarPagoVenta`), pero **no** el que **sale** a los productores.
`CacaoLote.totalPagado` está mal nombrado: es el monto **DEBIDO** al productor
—`(precio + premio) × pesoKg`— no lo efectivamente abonado. En una acopiadora real
es práctica común pagar en cuotas (adelanto al recibir + saldo tras liquidar), así
que el acopiador necesita saber **a quién le debe y cuánto**. Hoy no puede: no hay
campo de pago, ni saldo, ni estado, ni método para registrar abonos, ni alerta de
saldos pendientes. Asimetría total respecto al lado ventas.

## Decisión

Espejar el patrón de cobros de ventas en el lado acopio, reutilizando la función
pura `cacaoEstadoPago(debido, pagado) → { estado, saldo }`.

**Schema (`CacaoLote`, aditivo):**
- `montoPagado Decimal? @db.Decimal(14,2)` — soles abonados al productor (adelanto + abonos).
- `estadoPago String @default("pendiente")` — `pendiente | parcial | pagado`.
- `totalPagado` se mantiene como el monto **debido** (no se renombra para no romper
  callers; se re-etiqueta en la UI a "Total a pagar").

**Datos/API:**
- `CacaoDB.registrarPagoAcopio(tenantId, loteId, montoPagado)` — espeja `registrarPagoVenta`;
  deriva `estadoPago` con `cacaoEstadoPago(lote.totalPagado, montoPagado)`.
- `producerDetail.agg` suma `montoPagado` y expone `saldo = debido − pagado`.
- `alerts()` agrega alerta de **saldos pendientes** a productores (severidad por antigüedad/monto).
- PATCH `action: "pago_acopio"` — restringido a **admin/owner** (salida de caja), NO almacenero.

**UI (`CacaoProducerDrawer`):** KPIs re-etiquetados (Debido / Pagado / Saldo), saldo por
lote y botón "Registrar pago" por lote con saldo > 0.

## Migración

Aditiva y reversible (2 columnas nullable + default). La red local no resuelve
`DIRECT_URL` (host directo de Supabase, gotcha #14), así que se aplica un
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` **idempotente** vía el **pooler**
(`DATABASE_URL`, que sí resuelve) con `pg` en query simple. Sin transformación de
datos → expand puro, sin fase contract.

## Consecuencias

- **+** El acopiador ve deuda y saldo por productor y por lote; puede pagar en cuotas.
- **+** Simetría con ventas; reutiliza lógica pura ya testeada.
- **−** `totalPagado` sigue con nombre engañoso (deuda técnica aceptada para no romper callers).
- **Riesgo:** si un entorno no aplica la migración, las lecturas del nuevo campo degradan
  a `pendiente`/`0` (columnas nullable + default) sin romper el módulo.

## Alternativas consideradas

- **Tabla `CacaoPagoAcopio` (log de abonos):** más fiel a cuotas múltiples, pero mayor
  superficie. Se descartó por paridad con el lado ventas (un solo `montoCobrado` acumulado).
- **Renombrar `totalPagado → totalDebido`:** correcto semánticamente pero rompe múltiples
  callers y CSV/reportes; se pospone.

## Referencias

- [ADR-128](128-cacao-acopio-beneficio.md) · `lib/cacao/cacao-quality.ts` (`cacaoEstadoPago`)
- `lib/db/cacao.db.ts` (`registrarPagoVenta` como plantilla)
