# ADR-141 — P&L / rentabilidad del CTP (venta − COGS)

- **Estado:** Aceptado
- **Fecha:** 2026-07-18
- **Contexto:** ADR-134/135 (costeo/COGS on-read), ADR-139 (cierre → congela costos).

## Contexto

El módulo ya sabe **cuánto costó** lo despachado (`cogsDeDespacho`, null-safe:
falta factura ⇒ null, nunca 0) pero **no cuánto ganó**: `ForestCtpEntry` de
despacho no tenía valor de venta, así que no había margen ni P&L. Con el cierre
(ADR-139) los costos se congelan → los márgenes dejan de moverse retroactivamente,
que es la precondición para un P&L confiable.

## Decisión

1. **Capturar la venta.** Columna nueva `ForestCtpEntry.valorVenta Decimal(14,2)`
   (solo aplica a `section=despacho`). Migración idempotente vía `apply-sql.mjs`
   (pooler) + `prisma generate` + restart dev.
2. **Margen por despacho** (`ForestCtpDespachoDB.margenDeDespacho`): `margen =
   valorVenta − cogs`. **Regla de oro:** si falta la venta O el costo, margen
   `null` (NUNCA 0 — un 0 fingiría margen). El `motivo` propaga por qué (sin_venta
   / o el motivo del COGS: sin_costo/sin_atribucion/monedas_mezcladas…).
3. **P&L del período** (`pnlDelPeriodo`): agrega sobre los despachos vivos. El
   margen total cubre **solo los "completos"** (con venta Y costo conocidos); los
   `sinVenta`/`sinCosto` se cuentan aparte y NO se suman — no se inventa margen.
   Breakdown `porProducto` + `porDespacho` (para editar la venta fila por fila).
4. **La venta NO la bloquea el cierre.** Es un dato COMERCIAL, no del acta de
   trazabilidad: se puede registrar después de cerrar la producción del mes.
   `setValorVenta` no lleva el guard `PERIODO_CERRADO`.

## Consecuencias

- **+** El libro de compliance pasa a ser herramienta de gestión: margen por
  despacho / producto / período.
- **+** Honesto: el margen nunca se infla con 0s; los incompletos se muestran.
- **+** Compone con el cierre: costos congelados ⇒ márgenes estables.
- **−** `pnlDelPeriodo` itera despacho por despacho (N × `cogsDeDespacho`).
  Aceptable para volúmenes típicos (decenas/mes); optimizable con un batch de
  costos si crece.
- **−** v1 no captura descuentos/impuestos/flete de venta — `valorVenta` es el
  neto que el operador declara. Desglose de venta = follow-up.

## Verificación

Server E2E vía harness node autenticado (setValorVenta → margen recomputado; GET
`?pnl=1` → agregado con completos/incompletos). Endpoint: GET `?pnl=1`, PATCH
`{action:"set_venta", id, valorVenta}`. Audit `ctp_venta_set`. UI: sub-tab
«Rentabilidad» (resumen + margen por producto + venta editable por despacho).
