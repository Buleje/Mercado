# ADR-440 — Cubicación Oxapampa propia de cada troza y acta del conteo del patio

- **Fecha:** 2026-09-26
- **Estado:** Aceptado
- **Ámbito:** Libro CTP → trozas (Ingresos, ficha de la guía, patio) y conteo del patio.
- **Contrato:** `lib/forestal/cubicacion-oxapampa.ts` (fórmula), `lib/forestal/medidas-troza.ts` (qué se guarda y qué se rechaza, Zod), `WoodEntriesDB.guardarMedidasTrozas`, `PATCH /api/admin/forestal/trozas/medidas`, `ForestPatioConteoDB`, `GET/POST /api/admin/forestal/patio/conteos`, columnas `WoodEntryTroza.oxD1Pulg/oxD2Pulg/oxLargoPies/oxPt/oxMedidoEn/oxMedidoPor/d1d2MedidoEnPlanta`, modelo `ForestPatioConteo`, migración `prisma/migrations/20260926_troza_oxapampa_y_conteo_patio/`, auditoría `ctp_troza_cubicacion_oxapampa`, `ctp_troza_d1d2_planta`, `ctp_patio_conteo`.

## Contexto

Brandon (26-09): «la cubicación smaliana de la guía es sólo para proceso interno, pero la oxapampina es con la que trabajo con dueños, compras, ventas, flete y otros procesos». El libro sólo tenía el m³ Smalian que publica SERFOR y un PT **estimado** por rendimiento (`ptDeLinea`, 56 % para rolliza o m³ × 424). No había dónde guardar la medición propia del aserradero.

Medido el 26-09 en Blas: 84 trozas en el patio, 84 con largo, **7 con D1/D2** en cm (la guía no los trae en las otras 77), 0 cubicadas en Oxapampa.

El conteo del patio (`/admin/patio` → «Contar el patio», ADR-436) vivía sólo en localStorage del equipo donde se hizo: nadie más veía el acta ni sus diferencias.

## Decisión

1. **Fórmula Oxapampa**: `PT = Dp² × L / 24,5`, con `Dp = (D1″ + D2″) / 2` en pulgadas y `L` en pies. **Las dos puntas son obligatorias**: con una sola no hay PT (la revisión encontró que con una punta se congelaba un PT hasta 21 % más alto). `DIVISOR_OXAPAMPA = 24.5` vive en un solo lugar.
2. **El servidor calcula y congela** `oxPt` al guardar (redondeando cada medida a 2 decimales antes de la fórmula, igual que la pantalla): un cambio futuro de fórmula no reescribe lo ya comprado, vendido o pagado. Se guarda quién y cuándo (`oxMedidoPor`, `oxMedidoEn`).
3. **Dato comercial, no del libro**: la cubicación Oxapampa no la frena el cierre de mes (como el sello de etiqueta, ADR-436). No toca `volumenM3` ni ningún número declarado a SERFOR.
4. **D1/D2 en cm medidos en planta** sólo se escriben si la troza no los tiene (nunca se pisa lo publicado por SERFOR, `COALESCE`), quedan marcados `d1d2MedidoEnPlanta` y, esos sí, respetan cierre y congelado. El cierre se mira **por troza** con la función pura `closedPeriodOf` sobre la lista de cierres leída una vez (un memo por mes UTC daba resultados distintos según el orden de las filas: la guía del 01-09 a 00:00Z es el 31-08 en Lima).
5. **Dónde se mide**: la ficha de la guía («Cubicar Oxapampa», planilla con Enter/Tab como Excel, PT en vivo y total) y el patio («Medir escaneando», una troza por escaneo, con cola sin señal). La lista de trozas de la guía muestra D1 · D2 · Largo (la guía) y D1″ · D2″ · L′ · PT (Oxapampa) con total «N de M cubicadas».
6. **Plata de la guía**: se paga con el PT Oxapampa (decidido por Brandon el 26-09, ver «Addendum §6» abajo).
7. **Acta del conteo en el servidor**: `ForestPatioConteo`, única por `(tenantId, iniciadoEn)` —guardar dos veces el mismo conteo actualiza su acta—; no se pisa un acta con una versión cuyo `terminadoEn` sea más viejo. Faltantes, sobrantes (piezas del libro no esperadas) y sorpresas (códigos que no son de ninguna troza) por separado. Historial en la pestaña Trozas del libro, con impresión del acta.

## Consecuencias

- Migración **aditiva** (columnas opcionales o con default y una tabla nueva): no rompe el código que corre en producción (`master` del 09-05) sobre la misma base.
- La etiqueta y la ficha en texto del QR (ADR-436) muestran el PT Oxapampa cuando existe.
- Una corrección de D1/D2 en cm mal tipeados en planta no se puede hacer por esta vía (sólo se escribe sobre vacío). Si hace falta, abrir la corrección cuando `d1d2MedidoEnPlanta` es true.
- El pago por PT Oxapampa se enchufó el mismo día (addendum §6).

## Addendum §6 — Pagar con el PT Oxapampa (2026-09-26)

Brandon eligió «Pagar con el PT Oxapampa». Medido antes, sólo lectura: Blas 12 guías, **0 con costo, 0 fletes, 0 trozas cubicadas**; `main` 15 guías con costo (2 con pagos). Antes/después de `GuiaPlataDB.leer` sobre las 51 guías de los dos tenants: **51/51 iguales** en costo, puesto en patio, cuenta y pago.

**Regla del PT para pagar** (`lib/forestal/plata-de-guia.ts`): por pt manda la **cantidad de la factura** (precedencia de ADR-437, sin cambio); si no la trae, el **PT Oxapampa** de la línea cuando TODAS sus trozas **originales que llegaron** están cubicadas; si falta una, el **≈ estimado** (`ptDeLinea`). `oxapampaPorLinea` excluye pedazos retrozados (`trozaOrigenId`: sería la misma madera dos veces) y trozas `noRecepcionada` (salen del total, se cuentan en `noLlegaron`), y lleva cada troza a la fila de SU especie (`filaDeEspecie`, ADR-435: en Blas las trozas de una GTF multi-especie cuelgan de una fila). La guía entera (`ptDeLaGuia`, para el flete) es Oxapampa sólo si todas sus líneas lo son; si no, Σ estimado — no se mezclan medidas.

**Sello** (`sellarActas`, dentro de la tx de `guardarCompra`): el cliente manda `costoDetalle.ptUsado` (lo que multiplicó); el servidor lo contrasta con la cubicación leída en la tx y escribe `ptUsado`, `fuentePt` (`factura|oxapampa|estimado`), `ptCubicadas`, `ptTrozas` — campos opcionales del JSON existente, sin schema. Acepta el PT **vigente** o el **ya sellado** en ese asiento (re-medir después de pagar no cambia lo pagado, aunque se corrija el precio); cualquier otro → 409 `CUBICACION_CAMBIO`. En «por especie» cada costo = precio × cantidad al céntimo salvo la especie mayor (el ajuste) → si no, 422 `COSTO_NO_CUADRA`. La pantalla usa el sellado (`ptDelBorrador`) y ofrece «Usar la de hoy».

**Flete por pt**: columnas aditivas `ForestFlete.tarifaPorPt Decimal(12,4)`, `ptCobrado Decimal(12,2)`, `ptFuente` (migración `20260926_flete_por_pt`, aplicada por `:5432`). Con tarifa, el servidor pone `monto = montoPorPt(tarifa, PT de la guía)` (`cobroPorPt`); el `ptVisto` de la pantalla tiene que ser el vigente o el ya cobrado de ese viaje (congelado). Sin tarifa, el monto a mano de siempre; quitar la tarifa limpia las tres columnas. `GET /api/admin/forestal/fletes?ptGuia=` da la vista previa con el mismo número.
