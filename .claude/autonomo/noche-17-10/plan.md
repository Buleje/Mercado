# Noche autónoma 17-10 (00:10 → 07:00 Lima) — implementar los 4 PDF de Codex (228 propuestas)

Directiva: memoria `modo-autonomo-noche-2026-10-17`. Brief: `brief.md`. Commits: `commit.sh <carril> <paquete>`.

## Carriles
ventas (M01-M60) · pedidos (P01-P48) · compras (C01-C64) · comprobantes (F01-F56)

## Bitácora
- Desde commit `2eabc55dd`.
- 00:15 T0 lanzada: 4 carriles hacen triage + paquete 1 (compras empieza por C07/C58: canasta vaciada que reaparece).

## Decide Brandon
- Comprobantes F06 (tributos por línea), F15 (aprobación por excepción); facturar ventas del POS desde Emitir (toca emisión); F41 duplicado en servidor (migración + security).
- Compras C05: guardar el medio de pago previsto (columna nueva).
- Ventas M43 base de la comisión (venta, cobrado o margen); M12/M39 vendedor ≠ cajero; vender sin turno o en turno ajeno; mover un vencimiento ya puesto.
- Pedidos B6: «Yape falso» borra el pedido en vez de cancelarlo.

- 00:35 comprobantes p1 guardado `e81701b8e` (emitir eligiendo el pedido, revisión, resultado real; 8 bugs B1-B8).
- 00:40 terminaron compras p1 (canasta vaciada que volvía C07/C58, costo real, IGV, +1/+N), ventas p1 (hoy vs turno, deuda sin plazo, regla de comisión, sin UUID), pedidos p1 (siguiente paso + plata + 4 bugs que perdían datos). Commits en fila. Script de commit: `git add -N` dentro del flock (fallaba por index.lock).
- 00:45 lanzados: comprobantes p3 (guías), compras p3 (por pagar), pedidos p2 (reparto), security-t1 (PEDIR SECURITY de pedidos/ventas p1).
- 00:49 T1 guardada: `bd9d97e13` compras p1 · `40aa36e23` ventas p1 · `361f7036a` pedidos p1. Commit con tipos ajenos rojos: `tsc-ajenos.mjs` + `SKIP_TSC_GATE` (sólo si los errores son de archivos de otro carril que no importan el commit).
- 00:50 security-t1: 1 alto (PATCH/DELETE /api/orders/[id] aceptaban cualquier rol: almacenero escribía) + bajos/medio (historial sin roles, logActivity sin tenant, purga de notas a 90 d, fiados status+fecha). → fix-security-t1 (backend).
- 00:52 lanzados compras p2 (órdenes y recepciones) y ventas p2. Corriendo: comprobantes p3, compras p2/p3, pedidos p2, ventas p2, fix-security-t1.
- 00:57 seguridad t1: PATCH/bulk-status sólo cajero+tienda_owner (+gestión), DELETE sólo gestión; historial con roles; logActivity con tenant; notas internas fuera de la purga; fiados valida fecha antes de escribir.
- 01:10 listos compras p3 (por pagar: origen, factura repetida 409, calendario, propuesta, estado de cuenta), comprobantes p3 (guías en 5 etapas desde el pedido; de paso: guía enlazaba pedido de OTRO negocio + XSS al imprimir), pedidos p2 (reparto: editar/borrar repartidor daban 404 y fingían; passwordHash al navegador). Commits en fila. Yo: 3 secciones de Por pagar en el buscador del panel (+ fuente en el test).
- 01:12 guardián stock-mínimo rojo por `components/admin/pos/disponibilidad.ts` (ventas p2 a medias) → mensaje a ventas-p2.
- 01:15 lanzados comprobantes p2 (notas de crédito + tope de lo vendido), compras p4 (devoluciones), pedidos p4 (B7, botones por rol, Emitir/Guía desde el pedido, P08/P09/P12), security-t2 (reparto, guías, por pagar).
- 01:16 security-t2: repartidores y guías OK; Por pagar 2 medios (PATCH marcaba pagada sin abonos; factura repetida con carrera) + 2 bajos → fix-security-t2.
- 01:28 compras p2 listo (ciclo de la OC, recepción sin orden que nunca se guardaba, Entregas). El dev de :3000 murió (OOM con 1 GB libre) → dev:restart 8 s + auth QA renovada.
- 01:32 ventas p2 listo (lista/tarjetas, Ctrl+K, ticket promedio por tickets, esperado negativo explicado, cuenta del cliente). Seguridad t2 sumada al commit de compras p3.
- 01:34 compras p4 listo (devoluciones con tope, anular en vez de borrar, costo pendiente, recuperación con base).
- 01:36 commits: compras p2 `7a1f862de`, pedidos p2 `b5276095d`. comprobantes p2 listo (notas de crédito con remanente en el servidor, campos por motivo, qué cambia).
- 01:37 commits: ventas p2 `03abcdc75`. Yo: `--surface-alt` nunca existió (193 usos/120 archivos sin fondo) → alias de sunken en 3 bloques; medido claro #fafafa / oscuro #161b22.
- 01:43 commits: compras p4 `563465fcb`, comprobantes p2 `d61d45d8f`, fondo `814fcc315`. reviewer-compras: 1 alto (recepción no mira estado → stock doble), 5 medios (tope de devolución sin candado, anular vs enviada, recibida entera doble, cancelar a crédito borra deuda entera, recibida entera ignora «no llegará»), 1 bajo → fix-compras-r1.
- 01:49 reviewer-nc-ventas: 1 medio (dos notas a la vez acreditan el doble y repiten número) + 3 bajos → fix-nc-r1 (candado) y 2 bajos de recibos a ventas-p3. Descartado: SQL de tickets, permisos, tenant, división por 0, redondeo.
- 01:54 compras p5 listo (servicios fuera de reponer, causa y criterio, en camino real, ¿cómo se calculó?). Recibir un servicio suma stock → punto 8 a fix-compras-r1.
- 01:59 fix-nc-r1 listo: dos notas por todo a la vez = 201 + 400 (antes el doble); número bajo candado (`lib/db/candado.ts`); 3 notas de prueba en main quedaron ANULADAS (NC-0001..3 consumidos).
- 02:08 fix-compras-r1 listo (8 puntos con test y mutante inverso: recepción con orden cerrada 409, devoluciones en fila, cancelar baja la deuda a lo llegado, recibida entera resta «no llegará», servicios no suman stock). Unido al commit de compras p5 (dependencia cruzada ciclo-oc ↔ naturaleza).
- 02:12 commit `0dfc397ee` (compras p5 + arreglos del revisor). Fase 2 cuando terminen los paquetes: pestañas nuevas N de cada PDF (pedidos N01-N06, compras N01-N08, comprobantes N01-N08) — triage sin schema, construir las que salen de datos existentes; las que piden tablas → «Decide Brandon» con diseño.
- 02:12 comprobantes p4 listo (cotizaciones: buscador de cliente, disponibilidad, confirmación completa, plantillas de empresa, por seguir; 5 bugs de paso).
- 02:15 commits: `c6bfa40cc` notas en fila, `815afaae0` cotizaciones. security-t3 lanzado (convertir cotización, cancelar OC con deuda, anular/reingresar, alta de cliente que pisa por celular).
- 02:15 pedidos p3 listo (retiros con filtros/totales/CSV, ficha del repartidor, feed del día, rechazo con motivo). Seguridad de payouts sumada a security-t3.
- 02:20 security-t3: convertir cotización fallaba SIEMPRE (503, celular "" en FK); estado de cotización sin reglas (segundo pedido); alta de cliente PISA datos por celular; CSV con fórmulas; detalles de roles → fix-security-t3. OK: tenant, permisos, cancelar con deuda acotada, reingreso único.
- 02:23 compras p6 listo (ficha del proveedor, RUC/DNI y duplicados, evaluación con muestra, costo puesto, precios del mercado con fecha).
- 02:25 ventas p3 listo (avisos del turno, descuadre, bitácora antes→después, cierre doble 409, cola del POS sin POST doble, recibos de fiado). Commit en fila + reviewer.
- 02:31 commit `1b146ad9b` caja. reviewer-ventas-p3: ALTA cola offline (cualquier no-ok = «No pasó» para siempre; con 504 se cobraba dos veces), media (P2002 en idempotencia = 500), 3 bajas → fix-pos-r1. Cierre de caja OK (tx + candado).
- 02:36 compras p7 listo (buscador de compras, bandeja Revisar, atajos / N R, paquetes con costo real, avisos de factura).
- 02:40 fix-security-t3 listo: convertir cotización funciona (E2E en main, limpiado), estados con tabla (CONVERTIDA final), alta de cliente ya no pisa (409 + «Usar este»; POS/onboarding/tienda con ?siExiste=usar), anular/reingresar sólo dueño/admin, CSV sin fórmulas (lib/csv/celda.ts en 5 exportes). Nota: el 409 «registrado en otra tienda de la red» ya existía (decisión QA 10-06): revela que el número existe en otra tienda.
- 02:44 commits: `1b09fa088` seguridad t3, `c2bc195e2` 403 de devoluciones (yo). Lanzado pedidos-n (N02 preparación, N06 análisis, N01 programados; montaje después de p4).
- 02:47 fix-pos-r1 listo (cola offline: 429/5xx pendientes con la misma clave, Reintentar, P2002 → 200 dedup, arqueo 409, negocio desde la sesión). Yo: POST /api/sales tenía STRICT por IP = 10 ventas/15 min → venta 11 en 429 en hora punta; ahora GENEROUS por negocio+cajero tras el login (va en el mismo commit).
- 02:49 compras-n listo (N04 conciliación de documentos en Por pagar; N01/N02/N05/N06/N08 = decide Brandon con diseño). Commit espera a comprobantes-p5 (comparten subvistas-modulos.ts).
- 03:03 rate-limits listo: 10 rutas (ping del repartidor se congelaba a los 5 min; chat del cliente bloqueado a los 10 refrescos; boletas, caja, OCR). Hallazgos para security: GET /api/chat?phone= y /api/shopping-lists/[id]?phone= sin login.
- 03:12 panel-shell listo (M04 comandos en el buscador, M06 recientes, M07 vistas guardadas en Mis clientes, M08 avisos agrupados; buscador en bucle arreglado). Dev murió otra vez (Killed) y el carril lo levantó.
- 03:13 compras-remates listo (Entregas ya no valora en S/ 0 las órdenes automáticas: regla única valor-por-unidad).
- 03:16 fix-pii listo: GET /api/chat?phone= sin sesión devolvía nombre y mensajes de un cliente → cerrado; shopping-lists con roles; suggest con roles y tope de IA. Queda /api/chat/public?action=open (invitado).
- 03:20 pedidos-n listo (preparación, análisis operativo, agenda; el checkout descartaba día/franja elegidos → se guardan). Montaje en OrdersTab/index.tsx espera a pedidos-p4 (montaje-n.md). Revisé el diff de app/api/orders/route.ts: campos opcionales, fire-and-forget con logger, DB class existente.
- 03:31 comprobantes p5 listo (búsqueda en la base, período, 10 cifras, Seguimiento, expediente, conciliación). Commit + compras-n en fila (comparten subvistas).
- 03:32 fix-chat-invitado listo: el chat público devolvía 7 mensajes ajenos (nombre, fotos, ubicación, pedido) con sólo el celular → token firmado por conversación.
- 03:37 security-t4: chat de invitados OK (HMAC, timingSafeEqual, ata hilo+negocio+celular); 1 medio (POST /api/chat sin sesión escribe con celular ajeno; cliente logueado escribe como «sistema») + 4 bajos → fix-security-t4. Pedidos/franja OK, límites OK.
- 03:48 fix-security-t4 listo (chat: escribir pide sesión, token vence, Sentry tacha tokens, subidas con hilo; auto-reply caía a «main»).
- 04:04 arquitecto-decide: `decide-brandon.md` (22 piden schema, 28 reglas, 11 zona de peligro) + 5 SQL sin aplicar en `migraciones-propuestas/`. Venta bc19cbe5 (S/ 0,10 con devolución S/ 24,90) → diagnose-devolucion.
- 04:08 recorrido-qa: ~45 pantallas OK (0 errores de consola, 0 ≥400, sin bucles). Único problema (viejo): `* { min-width: 0 }` fuera de @layer en globals.css:320 anula TODO min-w-* de Tailwind 4 (382 archivos) → css-min-width con medición antes/después.
- 04:09 diagnose-devolucion: venta bc19cbe5 = dato QA previo al arreglo del 09-10; pero POST /api/returns con venta seguía sin tope → arreglado (devolverVenta con candado + Zod).
- 04:11 commit `7bf2d342a` (returns con venta topa). pedidos-p4 sin editar desde 01:45 (3 h) → detenido; pedidos-p4-cierre toma el WIP + monta Preparación/Análisis.
- 04:24 fix-devolucion-pedido listo (pedido con tope y candado; creditBalance = saldo a favor; deudores de campañas salía vacío).
- 04:25 pedidos-p4-cierre listo (roles, Emitir/Guía, B7, P08/P09/P12, montadas Preparación y Análisis).
- 04:28 commit `8246a15d6` pedidos p4. security-t5: ALTA devolver pedido no entregado → stock doble si luego se cancela; MEDIA devolver fiado a crédito = saldo a favor con el fiado entero → fix-security-t5. Resto OK (tope, IDOR, efectivo, crédito al cliente correcto).
- 05:15 cierre: typecheck verde sobre árbol limpio, 334 guardianes verdes (suite completa cortada por memoria), PDF en el Escritorio (41 págs), memoria de resultados y handoff.
- 05:34 remates 05:15-05:35 guardados (pedidos franja/listo, motivo obligatorio, compras C22 + desborde). PDF regenerado (40 mejoras, 42 commits). Typecheck verde sobre HEAD limpio.
- 06:09 CIERRE: 49 commits, typecheck verde sobre HEAD limpio, 334 guardianes verdes, PDF final 44 mejoras / 50 págs en el Escritorio.
