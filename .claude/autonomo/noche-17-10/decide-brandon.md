# Decide Brandon — noche 17-10

> Armado por el architect. **No se aplicó nada a la base** (es la misma que producción).
> Cada cambio de base está listo para aprobar con un clic: los SQL están en `migraciones-propuestas/`, son idempotentes (se pueden correr dos veces sin daño) y solo AGREGAN.
> Fuentes: `carriles/*/triage.md`, `carriles/*/reporte-*.md`, `pdf/*.txt`. Verificado contra la base el 17-10: ninguna tabla ni columna propuesta existe todavía.

Resumen: **(a) 22 cambios de base** (5 con SQL listo) · **(b) 28 reglas de negocio** · **(c) 11 en zona de peligro** · 18 pedidos reclasificados que NO necesitan base.

---

## (a) Pide tablas o columnas nuevas

### Con SQL listo (los 5 más valiosos)

| # | Qué resuelve (Hoy → Con esto → Ejemplo) | Área | SQL | Código que se escribe después | Riesgo |
|---|---|---|---|---|---|
| 01 | Hoy el sistema no sabe que una caja trae 12 → Con esto cada proveedor tiene su presentación, factor, mínimo y múltiplo → «Caja Gloria x 24 a S/ 86» se compara por lata, se escanea la caja y entran 24 | Compras, bodega (C11/C21/C30) | `01-proveedor-producto-presentacion.sql` | `lib/db/proveedor-producto.db.ts` · `/api/compras/presentaciones` · ficha del proveedor, Recibir, Sugerencias, Comparar | 0 (tabla nueva) |
| 02 | Hoy el fiado no sabe de qué venta salió → Con esto cada fiado guarda su venta → devolver 1 de 3 gaseosas fiadas baja exactamente ese fiado | Ventas (M27) | `02-fiado-venta.sql` | `lib/db/fiados.db.ts` · POST `/api/sales` | 0 (los 30 viejos quedan sin vínculo) |
| 03 | Hoy el efectivo que trae el repartidor no se anota → Con esto rendición por jornada con diferencia → cobró S/ 300, entregó S/ 280: quedan S/ 20 pendientes a su nombre | Pedidos y Caja (P32/P33/M51) | `03-rendicion-reparto.sql` | `lib/db/rendicion-reparto.db.ts` · `/api/delivery/rendiciones` · ficha del repartidor + Caja | Dinero: reviewer + security |
| 04 | Hoy serie y número van como texto y dos guardados a la vez dejan pasar la misma factura → Con esto la base la rechaza; además moneda, adjunto y «prometí pagar el 30» sin perder la fecha original | Compras, por pagar (C41/C42/C45) | `04-por-pagar-documento-y-promesa.sql` | `cuentas-por-pagar.db.ts`, `por-pagar.db.ts`, `/api/payables` | 0 (la tabla tiene 0 filas) |
| 05 | Hoy no hay «pedir permiso al dueño» → Con esto una bandeja única de aprobaciones con huella (si cambian el monto después, vuelve a pedir) → factura de S/ 5.000 o pasar el límite de crédito de un vecino | Comprobantes, Compras, Ventas, Pedidos (F15/C12/M37/M45/N04) | `05-aprobaciones.sql` | `lib/db/aprobaciones.db.ts` · `/api/aprobaciones` · campana «Por aprobar» | Permisos: security |

### Siguientes (contrato hecho en el triage; el SQL se escribe cuando se aprueben)

| # | Qué | Códigos | Prioridad |
|---|---|---|---|
| 06 | Vendedor de la venta, distinto del cajero | M12/M39 | Alta (comisiones dependen de esto) |
| 07 | Pago a proveedor: informado → verificado → conciliado, foto, una sola vez por clave | C47 | Alta (dinero) |
| 08 | Orden de compra: medio de pago previsto, guía, acuse del proveedor, fecha prometida, condiciones congeladas | C05/C06/C13/C35/N06 | Media |
| 09 | Liquidación de comisiones (regla congelada, generada/aprobada/pagada/anulada) | M42/M44/M45 | Media (después de 06 y de la regla b-1) |
| 10 | Anticipo a proveedor reusando Adelantos (no un sistema paralelo) | N05/C44 | Media |
| 11 | Incidencias del pedido | N03 | Media |
| 12 | Devolución a proveedor completa (fotos, lote, nota de crédito, reposición) | C50/C52/C54 | Media |
| 13 | Zona y costo de envío en el pedido | N05 pedidos | Ver (c): lo escribe el checkout |
| 14 | Turno, capacidad y zonas del repartidor | P19/P21 | Media (antes de rutas sugeridas) |
| 15 | Devolución de pedido con estado físico, recogida y resolución | N04 pedidos | Media |
| 16 | Versiones y alternativas de cotización | F29/F30 | Baja |
| 17 | Quién emitió cada comprobante | — | Baja (1 columna) |
| 18 | Corrección de una recepción sin borrarla | C24 | Media |
| 19 | Guía de remisión por línea del pedido | F21 | Baja |
| 20 | Relevo de turno de caja | M18 | Baja |
| 21 | Solicitudes de compra internas | N01 compras | Baja |
| 22 | Borradores de comprobante | N01 comprobantes | Baja |

### Reclasificados: NO piden base

| Pedido | Se arma con |
|---|---|
| C09 vínculos de documentos | ya existen |
| C20 datos extra de la recepción | el Json de la recepción |
| C46 cuenta destino / caja prevista | ficha del proveedor + Tesorería |
| N02 presupuesto de compras | presupuesto de gastos con categoría «compras:» (falta filtrarla en Gastos) |
| P39/P40 historial y asignaciones | historial de estados + asignaciones de reparto |
| Foto del pago | aprobaciones de pago que ya existen |
| Asignar un aviso | tareas del panel |
| Último contacto del fiado | gestiones del fiado |
| Vistas y recientes por usuario | ajustes por usuario (KV) |
| F24 estado fiscal de la guía | recién cuando exista guía electrónica |
| F28, N05 comprobantes, F48, C55, cancelar OC a crédito, «no llegará», fiado en hora Perú, alta de cliente que pisaba, chat público | **hechos esta noche** |

---

## (b) Regla de negocio — una línea cada una (pregunta · opciones · recomendación)

| # | Pregunta | Opciones | Recomiendo |
|---|---|---|---|
| 1 | Comisión sobre qué (M43) | venta neta · lo cobrado · margen | **Lo cobrado**: un fiado que no se paga no paga comisión. Ej.: venta 100, cobró 60 → comisión sobre 60 |
| 2 | Devuelven algo cuya comisión ya pagaste (M44) | pedir que la devuelva · descontar el período siguiente | **Descontar en el siguiente** |
| 3 | Pasar el límite de crédito (M37) | nunca · con motivo y permiso | **Con motivo y aprobación del dueño** (usa 05) |
| 4 | Vender sin turno abierto o en turno ajeno | bloquear · avisar | **Bloquear sin turno; turno ajeno solo dueño** |
| 5 | Mover el vencimiento de un fiado ya puesto | libre · con motivo · nunca | **Con motivo y queda la fecha original** |
| 6 | Caja que pasa la medianoche: ¿de qué día es? | día de apertura · día de cada venta | **Día de apertura** (así cuadra el cierre) |
| 7 | Ticket promedio | ventas ÷ tickets · ventas ÷ clientes | **Ventas ÷ tickets** |
| 8 | Stock mínimo 0 | no avisar nunca · avisar al agotarse | **Avisar solo al agotarse** |
| 9 | Motivo en anular/ajustar | opcional · siempre | **Siempre** |
| 10 | Tolerancia en Yape/tarjeta | 0 · S/ 0,10 | **0** (lo digital es exacto) |
| 11 | Deshacer un abono | no se puede · con motivo | **Con motivo y movimiento inverso** (dinero: reviewer) |
| 12 | N.° de operación de Yape | opcional · obligatorio | **Obligatorio en caja y en pedidos** (en pedidos la columna ya existe) |
| 13 | Quién asigna el vendedor | el cajero · el dueño | **Cajero al vender; corregir después solo dueño** |
| 14 | ¿Alguien aprueba lo que él mismo pidió? | nunca · el dueño sí | **El dueño sí** (en la bodega es el único admin); los demás no |
| 15 | Ofertas a repartidores a «5 + 1,5/km» ignoran la tarifa de cada uno | fija · la de cada repartidor | **La de cada repartidor**, con la fija de respaldo |
| 16 | Unir los dos mapas de reparto (P13) | sí · no | **Sí**, uno solo |
| 17 | Rutas sugeridas (P15/P16/P27/M50) | ya · después | **Después del #14 de (a)** |
| 18 | Pedidos borrador desde WhatsApp (P46) | sí · no | **Sí, como borrador que alguien confirma** |
| 19 | Pedidos sin conexión (P47) | sí · no | **Más adelante** (el POS ya tiene su cola) |
| 20 | Carga y consolidación (P48) | sí · no | **Después de rutas** |
| 21 | Un pedido único entre canales (M48) | sí · no | **Sí**, la tienda y el WhatsApp ven el mismo |
| 22 | Política de los 3 lados (orden · recepción · factura) (C43) | estricta · con tolerancia | **Tolerancia 2 % o S/ 5, lo menor**; arriba de eso, aprobación |
| 23 | Lo recibido sin orden | no suma stock · suma | **Suma stock y queda marcado «sin orden»** |
| 24 | Tipo de gasto «alquiler» en compras y comprobantes | sí · no | **Sí** |
| 25 | Dos motores que predicen reposición | dejar · unir | **Unir en uno** |
| 26 | Proveedores duplicados | dejar · unir | **Unir con revisión** (mismo RUC = el mismo) |
| 27 | Precios del mercado | ajuste (KV) · tabla | **Ajuste (KV)** hasta que haya más de una fuente |
| 28 | IGV estimado 18 % sin documento · umbrales de aprobación (F15/C12) | — | **Marcar «estimado» siempre; umbral inicial S/ 1.000 orden, S/ 3.000 comprobante** |

**Resuelto 04:10:** la venta `bc19cbe5` (S/ 0,10 con devolución de S/ 24,90) era un dato de prueba del 09-10 anterior al arreglo de la pantalla; pero `POST /api/returns` seguía sin tope y se cerró esta noche (`7bf2d342a`, `0321542f1`, `b56368a17`).

---

## (c) Zona de peligro — necesitan security o reviewer antes de tocarse

| # | Qué | Recomiendo |
|---|---|---|
| 1 | B6: «Yape falso» **borra** el pedido | **Cancelar con motivo** (queda el rastro) en vez de borrar |
| 2 | F41: emitir dos veces el mismo comprobante si se reintenta | Clave única por operación en el servidor (la tabla tiene 0 filas: el momento es ahora) + security |
| 3 | F06: impuestos por línea (exonerado / inafecto) | Sí, con pruebas contra SUNAT en beta |
| 4 | F39: emitir por lote | Después de #2 |
| 5 | N06: series y puntos de emisión | Sí, una serie por caja |
| 6 | N07: notas de débito | Después de #3 |
| 7 | Facturar ventas del POS desde Emitir | Sí, enlazando la venta (no copiando montos) |
| 8 | Cobro en línea con respuesta perdida (504) que se cobra otra vez con otra clave | Reusar la misma clave en el reintento; reviewer |
| 9 | Permisos de la tienda que la pantalla muestra pero el servidor no hace cumplir | security antes de abrirlo |
| 10 | Almacenero sin acceso a paquetes | Darle lectura y armado; no precios |
| 11 | Zona y costo de envío del pedido ((a)-13) | Lo escribe el checkout: va con security y pruebas de pago |

---

## Orden recomendado (después de que Brandon apruebe)

| Bloque | Qué | Minutos | Por qué en ese orden |
|---|---|---|---|
| 0 | ~~Mirar la venta `bc19cbe5`~~ | 0 | resuelto esta noche |
| 1 | Aplicar 02 + 04 (solo columnas, tablas casi vacías) y escribir su código | 60 | riesgo 0, cierra la factura repetida |
| 2 | Aplicar 01 y montar presentaciones en Recibir y Sugerencias | 90 | lo que más usa la bodega todos los días |
| 3 | Aplicar 03 rendición + reviewer + security | 120 | dinero en la calle cada día de reparto |
| 4 | (c) 1 y 2: cancelar en vez de borrar y clave única de emisión | 90 | dos agujeros de dinero o fiscales |
| 5 | Aplicar 05 aprobaciones + reglas b-3, b-14, b-22, b-28 | 120 | lo usan 4 módulos |
| 6 | (a) 06-07-09 vendedor, verificación de pagos y comisiones | 150 | depende de b-1 y b-13 |
| 7 | Resto de (a) por prioridad y (c) 3-11 | por sesión | — |

Cómo aplicar cada SQL (ya está en la cabecera de cada archivo): copiarlo a `prisma/migrations/20261017_<nombre>/migration.sql` → `aplicar-migracion-sesion.mjs --ensayo` → aplicar → `migraciones-cruce.mjs --verificar` → `prisma-session.mjs migrate resolve --applied`. Nunca `migrate dev` ni `migrate deploy` por el pooler.
