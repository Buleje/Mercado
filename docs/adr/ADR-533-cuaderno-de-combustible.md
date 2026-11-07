# ADR-533 — Cuaderno de combustible en cilindros (SUNAT, bienes fiscalizados)

- **Estado:** aceptado (2026-11-04). Schema: `20261104a_cuaderno_combustible_adr533` (tablas `FuelPurchase`, `FuelCount`; columnas nuevas en `AssetExpense`).
- **Pedido por:** Brandon (04-11): «Sí, en el panel» — el cuaderno que el informe técnico del trámite RCBF le promete a SUNAT: ingresos de cilindros, vale por máquina con horómetro, operador y firma, saldo diario con aviso si se pasa de 4 cilindros, conteo semanal y reporte mensual contra 5,500 gal al año.
- **Relacionados:** ADR-527 (Cuentas en Mi Plata: qué es plata que salió), ADR-529 (contabilidad), ADR-491 (firma a mano en el lienzo).

## Contexto

Constitución (Pasco) es Zona de Régimen Especial (DS 015-2019-IN): ahí el diésel en cilindros es bien fiscalizado y Blas tiene que inscribirse en el Registro para Control de Bienes Fiscalizados. El informe técnico declara: 100 cilindros de 55 gal al año (5,500 gal), nunca más de 4 guardados a la vez (220 gal, debajo del metro cúbico = 264 gal que pide Registro de Hidrocarburos de OSINERGMIN) y un control escrito de entradas y salidas. En una visita, SUNAT pide ver ese control y que cuadre con las facturas del grifo.

Activos ya tenía máquinas (`Asset`, con `fuelTargetPerUnit` = meta de gal/h y `currentHours`) y gastos por máquina (`AssetExpense`, categoría combustible). Faltaba el almacén del medio: el cilindro que entra con factura y sale en vales.

## Decisión

1. **El vale es un `AssetExpense` con `fuelSource = "cilindros"`** (más `voucherNumber` único por negocio, `hourMeter`, `operatorName`, `signature` PNG, `createdBy` y anulación). Así el consumo cae solo en la ficha de la máquina (costo por hora, ranking, rentabilidad) sin un segundo registro que se desincronice. El horómetro del vale no puede retroceder entre vales de la misma máquina y sube `currentHours`.
2. **El ingreso es su propia tabla `FuelPurchase`** (compra con factura, grifo, RUC, guía, o stock inicial): cilindros, galones, precio y `firstCylinder`. Cada cilindro recibe número en fila (C-01, C-02…; los anulados no se reusan, índice único por negocio + reintento si dos ingresos chocan).
3. **Los cilindros salen en fila: primero en entrar, primero en salir.** El vale sabe de qué cilindro salió y cuesta al precio de ese cilindro. Si no hay cilindro, el vale queda «sin respaldo» y lo cubre el próximo ingreso (avisa: falta anotar una compra).
4. **El conteo físico manda** (`FuelCount`, con la foto de lo que decía el cuaderno al contar): después de un conteo, el saldo queda en lo contado y la diferencia queda anotada (faltante sale del cilindro más viejo; sobrante vuelve al último abierto).
5. **Nada se borra: se anula con motivo** (`annulledAt/annulReason/annulledBy` en las tres). Lo anulado sigue en la pantalla y en el reporte, tachado. Anular y cambiar lo declarado = admin/owner; anotar = admin, owner, cajero, almacenero.
6. **Las cuentas son una función pura** (`lib/combustible/cuaderno.ts`: recorrido, saldo diario, nivel del almacén, gal/h vs meta + 10 %, reporte del mes que tiene que cerrar: saldo inicial + compras − consumo ± conteos = saldo final). La usan el servidor y la pantalla; la ruta GET devuelve el cuaderno entero y el navegador arma vistas y reporte (PDF con membrete forestal + Excel).
7. **El vale de cilindros NO es plata que salió** en Cuentas de Mi Plata: la plata salió una vez, al pagar la compra. `cuentas-movimientos.db.ts` lo salta y `assets.db.ts` ignora los anulados.
8. **La compra deja su gasto en Mi Plata** (categoría «Combustible») si se pide, **con dedupe por factura**: si ese RUC + n.° de factura ya estaba anotado (`ComprobantesDB.comprobanteRepetido`), se enlaza ese gasto (`expenseId`) en vez de crear otro. Si el gasto falla, el ingreso queda igual y se registra el error.
9. **Lo declarado vive en la configuración del negocio** (KV `interno:combustible-cuaderno:<tenant>`): producto, gal por cilindro, máx. cilindros, cupo anual, proyección de 12 meses y responsable. Contra eso se miden los avisos (tope, excede, ≥ 264 gal, negativo) y el reporte.

## Alternativas descartadas

- **Tabla propia de vales separada de `AssetExpense`**: duplicaba el consumo de la máquina y obligaba a sincronizar dos registros (costo/hora y ranking hubieran dejado de ver el combustible).
- **Cilindro como fila propia (una por cilindro)**: 100 filas al año que solo repiten lo que dicen el ingreso y `firstCylinder`; la fila de cilindros se reconstruye en el recorrido.
- **Saldo guardado en una columna**: se desarma con cualquier renglón con fecha vieja o anulación; recalcularlo desde los movimientos siempre da lo mismo y cuesta milisegundos (cientos de renglones al año).
- **Borrar renglones equivocados**: un cuaderno fiscalizado con huecos es peor que uno con tachones explicados.
- **Contar el vale como gasto de plata**: contaba dos veces el mismo diésel (compra + vale) en Cuentas.

## Consecuencias

- Pestaña «Combustible» en Mi Plata › Activos (vales, ingresos, saldo diario, conteos, reporte del mes) con PDF/Excel para imprimir o mandar.
- Un vale con fecha vieja reordena el saldo de ahí en adelante (es correcto: el cuaderno es cronológico); los conteos guardan la foto para mostrar qué decía el cuaderno ese día.
- El costo del vale depende del precio de compra del cilindro: si la compra se anota sin precio, el vale cuesta 0 hasta que se corrija.
- Falta cargar en Blas real lo declarado (5,500 gal, proyección, responsable) y las placas/series de los tractores forestales.
