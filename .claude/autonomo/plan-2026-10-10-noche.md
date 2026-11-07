# Noche autónoma 10-10 (00:00 → 06:30)

Directiva: memoria `modo-autonomo-noche-2026-10-10`. Scratchpad: `/tmp/claude-1000/-home-usuario-proyectos-Mercado/7e38a7f3-56a2-4ad4-9852-fd19f33b6295/scratchpad/noche/`.

## Cola

| # | Qué | Cómo | Estado |
|---|---|---|---|
| 1 | Ola 2 del panel (Configuración, Equipo/RRHH, Tienda online, Pedidos y reparto, Forestal) | workflow `panel-ola` + extra de la noche | hecha 04:25 (23 agentes, 4 h 20 min); commits en cola; remates (navegación dentro del hub + trinquete DS) con agente aparte |
| 2 | Rediseño total de la tienda Musa (/t/musa) + imágenes de los 27 productos | workflow propio `musa-rediseno` | hecho 02:10 (5 carriles aprobados o arreglados; commits en serie) · pulido entre carriles = agente aparte |
| 3 | Benchmark de paneles del mercado → 15 brechas medidas | agente en fondo | hecho 00:55 |
| 4 | Ola 3 (Mi Plata, Ventas y caja, Compras, Productos e inventario con KPIs ocultables, Comprobantes) | `panel-ola` | en curso (run wf_632096e5-257, desde 03:47; pasada de diseño solo en Ventas y caja e Inventario para llegar antes de las 06:30) |
| 5 | Ola 4 (Inicio, IA y Metas, Clientes, Mensajes, Marketplace) | `panel-ola` | cola |
| 6 | Ola 7 (brechas del benchmark, solo lo seguro de noche): O7-LIB libros para el contador (Registro de Ventas 14.1 / Compras 8.1 / Kardex valorizado 13.1, solo lectura, reusar extensiones/cierre-para-contador) · O7-KIO marcación del trabajador con PIN/QR del fotocheck (bandera apagada + security) · O7-FEED feed de productos por negocio (fuga entre tenants, security) · O7-FIX cierre de conteo por DB class (`app/api/inventory/conteo/[id]/close/route.ts:22` usa prisma) · O7-ETQ etiquetas de precio con código de barras (después de la ola 3) · O7-ARQ diseños con plan de migración para lo que toca schema/dinero (vacaciones y permisos, aprobación de compras, caja→unidad, combos con componentes, variantes vendibles, stock por almacén, embudo CRM, precio por cliente en el POS) | workflow propio | en curso (run wf_9ec61ba3-869, desde 02:25; ETQ adelantada con archivos nuevos y montaje diferido) |
| 7 | Ola 5 (diseño por grupo) · Ola 6 (modales y archivos gigantes; sin O6-B1/B2/C1) | `panel-ola` | si hay tiempo |

## Decide Brandon

- Benchmark (scratchpad/noche/benchmark-panel.md): precio por cliente al vender (`Customer.listaPrecio` schema:386 se guarda y nadie lo lee), comprar por caja/vender por unidad, combos que descuentan componentes, variantes vendibles, stock por almacén, vacaciones/permisos, aprobación de compras, planilla Perú, guía de remisión SUNAT: tocan schema o dinero → la ola 7 deja el diseño y el plan de migración, no los construye.

- Precios de MU011, MU012, MU015 y MU020 (Falabella/Inkafarma más baratos).
- Build de Vercel: `next build` solo también se cuelga en la máquina de 8 GB → ¿Enhanced Builds (pago) o build local + `vercel deploy --prebuilt`? (además falta `vercel login`).

- Ola 7 (para decidir): (a) conteo físico: al cerrar se PISA el stock con lo contado y se pierden las ventas entre la foto y el cierre (main tiene un conteo INICIADO desde el 07-05 con 44 movimientos encima) → congelar ventas, vencer el conteo o ajustar por diferencia; (b) el POS dejó devolver S/ 24,90 de una venta de S/ 0,10 (venta bc19cbe5 en main): revisar el tope de devoluciones; (c) lector de la caja: un código alfanumérico en mayúsculas no se encuentra y un número de <6 dígitos se busca como «contiene» y puede agregar otro producto (`usePOSLectorCodigo.ts:30,40-43`); (d) libros: el TXT oficial PLE/SIRE no está confirmado (sale «de trabajo»); faltan fecha e IGV de la factura del proveedor y costo en cada movimiento (schema); (e) `app/sitemap.ts` sirve los productos de "main" en todos los hosts y hay 20 rutas públicas con `x-tenant-id ?? "main"`.

- Diseño de brechas (docs/panel/brechas-mercado-diseno-2026-10.md, 12 brechas con orden recomendado: conteo → costo del kardex → precio por cliente → comprar por caja → aprobación de compras…). Hallazgos de dinero para decidir: **la caja y los pedidos GUARDAN un costo inventado del 70 % del precio** cuando el producto no tiene costo (`app/api/sales/route.ts:234,287`, `app/api/orders/route.ts:376,712`; 37 de 89 productos de main) → contamina utilidad y libros; el almacenero puede aprobar la orden que propuso el sistema (`app/api/purchases/[id]/route.ts:124`); un pedido que nace de una cotización no descuenta stock ni guarda cliente.
- Tienda online › Apariencia › contacto mide 26,65 pantallas y 57 botones (ola 2): falta medir si ya era así en HEAD.

## Bitácora

- 00:05 vigía del dev encendido; PC sin suspensión ni hibernación (ya estaba en 0).
- 00:12 lanzados: ola 2 (`panel-ola`, run wf_18c06a6e-468, extra = barra en una fila + `useKpisPlegables` alto md + compactar) · `musa-rediseno` (run wf_cb65c86f-696: dirección → BASE/PORTADA/CATALOGO/BOLSA/IMG → diseño → reviewer → verificación) · benchmark de paneles (agente en fondo → scratchpad/noche/benchmark-panel.md).
- Hallazgo: el botón «Indicadores» en la misma fila ya existe (`useKpisPlegables`, components/admin/forestal/kpis-plegables.tsx, 21 usos forestales): las olas lo llevan a comercio.
- 00:50 Vercel preview `dpl_5FnesjX9q8bmK4iXwHbMWHEWnsWV` (commit 7e7b7575c, build sin tsc): pasó el paso de tsc pero `next build` lleva >45 min en «Creating an optimized production build» sin una línea de log → el build de Next solo TAMBIÉN satura la máquina de 8 GB (hipótesis; el arreglo de tsc era necesario pero no suficiente).
- 00:55 benchmark listo (15 brechas). Para la ola 3: el conteo físico existe pero no está en las subvistas de Inventario (el buscador no lo encuentra).
- 02:10 Musa terminó (18 agentes, 2 h 10 min, 0 errores): verificación por el camino de la clienta verde (portada, filtro, contador 1→2, ficha, bolsa, WhatsApp; claro/oscuro, 1280/400; 27 imágenes 200). Pendientes entre carriles → agente de pulido.
- 02:16 commit de M-BASE cayó por el guardián de entregas anuladas: confundía `entregas: { tab: … }` del mapa de pestañas (ola 2) con una lectura → arreglado y commiteado (9c99c9515); commit-tanda reintenta solo.
- 02:25 lanzada la ola 7 (6 carriles: LIB, KIO, FEED, FIX, ETQ, ARQ). Todo archivo nuevo; el montaje en el panel lo hago yo después de la ola 3.
- 02:28 Musa commiteada entera: 54d782941 (imágenes) · 9bc7abd5d (identidad) · 129bd23f8 (portada) · catálogo · ad4bd45e7 (bolsa). El catálogo cayó por una línea >100 en el cuerpo → extraer.mjs ahora envuelve solo las líneas largas (autoajuste: 2 caídas iguales en la noche).
- 02:30 agente de pulido de Musa (10 puntos entre carriles: foco redondo, píldoras que se tapan, «Drucila te sugiere», texto del 10 % alineado al manual, imágenes centradas).
- 03:05 pulido de Musa listo: 10/10 puntos (5 arreglados, 4 ya resueltos y medidos, foco ampliado) + tapas negras en oscuro 1,08→2,26:1; 21/21 tests. El cupón general «BIENVENIDO» queda oculto en Musa y la franja dice la preventa con las palabras del manual. Commit en cola con reintento (el árbol está rojo por la ola 7 a medio construir). «El carrito se vacía al recargar en oscuro»: probablemente cada tema de qa-capturas abre un navegador nuevo (localStorage vacío); sin medir, no se toca cart-context.
- 03:41 pulido de Musa commiteado (49c6f52b2) al 6.º intento: esperó a que la ola 7 dejara el árbol en verde.
- 03:47 lanzada la ola 3 con la ola 2 ya en su verificación (solo lectura): 3 workflows vivos, 2 editando. Inventario (el ejemplo de Brandon) con pasada de diseño; Mi Plata, Compras y Comprobantes sin ella para llegar a tiempo. El conteo físico entra como subvista de Inventario.
- 04:05 ola 7 cerrada (16 agentes, 1 h 40 min): verificación verde (typecheck, 125 tests de la ola, guardianes 311; feed de 4 negocios sin cruces; kiosko rechaza enlaces inventados/revocados; libros cuadran con el panel 4 meses; PDF de etiquetas con precios de la base). O7-ARQ murió sin entregar → relanzado como agente aparte. Commits FEED/LIB/FIX/ETQ en cola con reintento; KIO (31 archivos, toca security-headers + sentry + layout) espera una pasada final de security.
- 04:25 ola 2 cerrada: typecheck y guardianes verdes, 27 enlaces viejos caen en su lugar, 0 pageerrors; quedó roja la navegación a otra vista del mismo hub (8/12) y el trinquete del DS → agente de remates. La revisión halló 2 fugas de permisos que venían de antes y las cerré: la cola de webhooks de Stripe (de toda la plataforma) la leía cualquier admin → superadmin; el token de Meta CAPI lo leían cajero y almacenero → admin.
- 04:20 diseño de brechas listo (arquitecto relanzado; el del workflow murió sin entregar). Commit del doc pendiente (index.lock ocupado por los commits en cola).
- 05:40-06:15 entraron los commits trabados (guardianes en verde otra vez): feed, webhooks, kiosko, doc de brechas, Configuración, Equipo, libros, conteo, Tienda online, etiquetas. En cola a las 06:20: Pedidos y reparto, Forestal, integrador de la ola 2 y remates.
- 06:16 PDF «Mejoras de la noche 10-10» en el Escritorio (20 mejoras, 16 guardadas al generarlo). SESSION_HANDOFF y memoria `noche-autonoma-2026-10-10-resultados` al día. Ola 3 sigue corriendo (17/18 agentes con resultado).
- 06:27 REMATES y O2-K4 no entran: `orders-tab-metodo-pago-toolbar.test.tsx` rojo (filtro del kanban por método de pago) → queda para la mañana (SESSION_HANDOFF paso 3).
- 06:50 ola 3 cerrada (21 agentes). Verificación: Compras por enlace muestra 2 de 7 vistas (plantilla global oculta compras) → para Brandon/security. 07:00 agente devuelve los chips «Método de pago» de Pedidos (los sacó la ola 2) para destrabar los commits.
