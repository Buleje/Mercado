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
6. **Plata de la guía**: por ahora sólo **muestra** el PT Oxapampa junto al estimado; ningún monto cambia. Enchufarlo al pago (usarlo cuando todas las trozas estén cubicadas, marcar «≈» si no, congelar el PT usado en `costoDetalle`; flete por PT necesita otra columna) es una decisión aparte del dueño.
7. **Acta del conteo en el servidor**: `ForestPatioConteo`, única por `(tenantId, iniciadoEn)` —guardar dos veces el mismo conteo actualiza su acta—; no se pisa un acta con una versión cuyo `terminadoEn` sea más viejo. Faltantes, sobrantes (piezas del libro no esperadas) y sorpresas (códigos que no son de ninguna troza) por separado. Historial en la pestaña Trozas del libro, con impresión del acta.

## Consecuencias

- Migración **aditiva** (columnas opcionales o con default y una tabla nueva): no rompe el código que corre en producción (`master` del 09-05) sobre la misma base.
- La etiqueta y la ficha en texto del QR (ADR-436) muestran el PT Oxapampa cuando existe.
- Una corrección de D1/D2 en cm mal tipeados en planta no se puede hacer por esta vía (sólo se escribe sobre vacío). Si hace falta, abrir la corrección cuando `d1d2MedidoEnPlanta` es true.
- El pago por PT Oxapampa queda pendiente de decisión (punto 6).
