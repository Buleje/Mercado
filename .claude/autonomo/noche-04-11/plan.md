# Noche autónoma 04-11 (00:20 → 07:00 Lima) — Dueño: Brandon

Pedido literal (04-11 00:15): «quiero que trabajes toda la noche hasta las 7 de la mañana, 7 horas seguidas sin
detenerte… no puedes suspenderte, tienes que seguir aplicando mejoras, nuevas funciones, integraciones, investiga
otros SaaS e intégralos a mi sistema, mejorar todo la parte forestal, ventas, compras, superadmin y todo lo que
puedas al máximo posible».

## Reglas de la noche
- NO preguntar (memoria autonomia-noche-no-preguntar). Duda → default sensato; plata/schema/zona de peligro dudosa → «Decide Brandon».
- NO: subir a internet, push, enviar mensajes/correos, tocar datos reales de Blas, SNIFFS, migraciones contra la base compartida (dejar SQL listo en `migraciones-propuestas/`).
- Carriles con archivos disjuntos (leer `.claude/docs/carriles-en-paralelo.md`), tramos ≤1 pantalla o ≤1 endpoint; yo guardo en fila con `git commit -F msg -- <archivos>`.
- Zona de peligro / dinero / stock → `reviewer` opus antes de guardar.
- Panel de desarrollo para probar (qa-capturas). 06:30 → cerrar: PDF de la noche en Semana actual › Buleje (sistema), memoria de resultados, handoff, panel-trabajo, aviso al celular.
- Si el chat pasa 200 mil: guardar estado acá y `sesion-nueva "noche 04-11" "Dueño: Brandon. Seguir .claude/autonomo/noche-04-11/plan.md" --cerrar-esta`.

## Cola (marcar [x] con el guardado)
### Ola 1 — arreglos medidos y forestal
- [x] ~~Ventas: devolución fiada 409~~ DESCARTADO: es un freno a propósito (`frenoDevolucionFiada`, security-t5 17-10).
- [x] ~~Forestal: corrida sin origen~~ DESCARTADO: `analizarRadar` ya usa `corridaSinOrigen` (ctp-radar.ts:20,88).
- [x] ~~3 P2 de lotes~~ DESCARTADO: lock `FOR UPDATE ORDER BY id` sobre trozas ya existe (forest-lote-mixto, forest-lote-aserrio:1386).
- [x] Compras: factura XML → vista previa (tramo 1) GUARDADO 0f4ee6789 (8 tests, curl 200/401).
- [x] Forestal: Anexo 04 → despacho: YA CONSTRUIDO (ADR-446, e3eb18571). Falta datos (ver «Decide Brandon»).
- [x] Investigación otros SaaS → `investigacion.md` (12 huecos, top 5).
- [x] Forestal: marcas del día con texto (≥1280 px): ya resuelto (radar 00:50).
### Ola 2 — investigar otros SaaS (Odoo, Alegra, Siigo, Bsale, Business Central, NetSuite) y elegir 2-3 integraciones construibles sin claves
- [ ] Investigación con fuentes → `investigacion.md`.
- [ ] Integración 1 (candidata: exportar registros de ventas y compras para SIRE/PLE del contador).
- [ ] Integración 2 (candidata: factura del proveedor → borrador de compra con IA, match con la orden).
### Ola 3 — ventas, compras, superadmin
- [ ] Ventas: listas de precio con vigencia o reserva de stock (medir cuál primero).
- [ ] Compras: lo que falte del mapa (medir).
- [ ] Superadmin: medir qué usa y qué falta (salud de negocios, uso por negocio).
### Cierre 06:30

## Bitácora
- 00:35 descartados 3 de la ola 1 (ya resueltos); lanzados 3 ayudantes: XML compras, diseño Anexo 04, investigación SaaS.
- 00:50 radar: 4 pendientes viejos marcados como ya resueltos (marcas con texto, P2 lotes, corrida sin origen, casillero 362 líneas). Armador del PDF de la noche listo: `armar_pdf.py <resumen.txt> <salida.pdf>` (Helvética base14: sin «›» ni «•»).
- Chat 1 llegó a 205 mil: al volver los 3 ayudantes, pegar sus reportes acá (sección «Reportes de la ola 1») y rotar con sesion-nueva.

## Decide Brandon (para el PDF de la mañana)
- Anexo 04 de Blas (medido 04-11): 15 guías sin despacho (160,186 m³). Con la producción de hoy solo alcanzan 063, 066 y 071 (25,795 m³, 16 %); las otras 12 esperan lotes de ago-sep. Dudas: ¿cuál versión de la 064 vale (18,848 o 19,720 m³)? ¿el anexo 2-19-0488732 es la 066? ¿el borrador de 17,950 m³ (24-10) es la 069 o la 070? ¿por qué se anuló el lote 26-2026? ¿registrar ya las 3 o esperar? Faltan anexos de las guías 059, 061, 069, 070 (confirmar con el talonario). NO se tocó nada de Blas.
- 00:40 architect: Anexo 04 ya construido; solo datos/decisiones. Para acelerar: script `anexos-sin-despacho.mjs` (pendiente, chico).

## Ola 2 (desde el chat 2) — en este orden, carriles disjuntos en UNA tanda
- [x] A. Compras tramo 2 (GUARDADO 1efb2f4e1; falta: oscuro, aviso «ya cargada» a 400, sacar línea, fflate a package.json, dólar) (frontend opus): pantalla en Compras «Subir factura XML» → vista previa (tipo `VistaPreviaFacturaXml` en `lib/compras/factura-xml-cruce.ts`) → elegir producto por línea → guardar por `POST /api/purchases` existente. Falta del tramo 1: abrir .zip de SUNAT, decodificar ISO-8859-1 en el navegador, test de negocio ajeno (401/404), `yaCargada` por proveedor + número. 1 captura 400 px y 1280.
- [x] B. Forestal #1+#2 (GUARDADO daac4c51f backend + 20ada0cfd pantalla; falta: buscador en subvistas-modulos.ts (archivo con WIP ajeno), captura de «por origen», pestaña elegida fuera de vista en celular) (backend+pantalla, 1 ayudante opus): «Precio máximo por troza» (cuánto pagar por m³ de rollo: m³ × 56 % × 424 PT × precio de venta − costos; regla pie tablar de la memoria `pie-tablar-rollo-vs-aserrada`) + «Rendimiento por proveedor/permiso» (PT producido ÷ m³ consumido por origen). Solo lectura de datos existentes. Probar en QA forestal.
- [x] C. Ventas #3 (GUARDADO 03ea18672: ver + aceptar, security aprobó con 4 arreglos aplicados, 25 tests) (2 tramos, backend opus + security): cotización con enlace público (abrir y aceptar sin clave, token firmado como el del estado de cuenta). Ruta pública = `security` antes de guardar.
- [x] D. #4 Demo (GUARDADO 9474cfa05, 14 tests, ensayo 17 llamadas; Decide Brandon: crear negocio demo-… y correrlo) de aserradero con datos de ejemplo: construir el sembrador reusando `lib/onboarding/signup-flow.ts`, SOLO para un negocio marcado demo; NO correrlo contra la base compartida sin Brandon (dejarlo listo + «Decide Brandon»).
- [ ] E. Superadmin: medir con 1 Explore haiku qué páginas no tienen datos o fallan; arreglar 1-2.
- #5 SIRE cruce → Decide Brandon: necesita que baje de SOL una propuesta RCE real.
- Pequeños: script `scripts/dev-helpers/anexos-sin-despacho.mjs <tenantId>`; `tsc-acotado.sh` con tipos de `server-only` (7 errores falsos); guardián `censo-ds-trinquete` rojo por archivos sucios viejos de components (tablas a mano 6→7, casillas 242→244): revisar antes de la ola 2.
- 01:00 chat 1 cerrado a 210 mil.
- 00:40 (chat 2) lanzados en UNA tanda: A pantalla XML (frontend opus), B1 cálculo precio troza + rendimiento por origen (backend opus, solo lógica+endpoint), C1 cotización enlace público solo ver (backend opus), D sembrador demo (backend opus, sin correr), E medición superadmin (Explore haiku). Trinquete DS rojo = WIP viejo ajeno del 30-10 (alquileres/trámites/ctp-parte), no bloquea el guardado.
- 00:45 GUARDADO dbee486ec tsc-acotado sin falsos server-only · 4d1cf8803 tipo de cambio SUNAT/BCRP (`GET /api/admin/tipo-cambio`, 6 fechas reales 200; el BCRP a veces contesta HTML → reintento).
- 00:47 E superadmin: 61 páginas, 0 errores 500/404; solo «Próximamente» en marketplace (Comisiones, Vendors). El ayudante entró 8 veces como superadmin: SUPERADMIN_PHONE no está → 0 WhatsApp.
- 00:48 B1 hecho (16 tests; QA Tornillo 63,6 % medido → máx S/ 619,43/m³; por origen solo «Sin origen»: QA no liga corridas a guías) → reviewer opus + B2 pantalla en paralelo. C1 hecho (12 tests, captura ok) → C2 aceptar; después security de los 2 tramos.
- 00:55 GUARDADOS 4f4711b9e (ayudantes saben de sql-lectura/tsx-servidor/tsc-acotado) · aff136aaa (qa-capturas --sin-login documentado).
- 01:00 Brandon (despierto un momento): «Permite todo los permiso sin importar que sean para entrar, trabajarte o pausarte» → HECHO: ask vacío, allow amplio, fuera `Bash(env)` y `.env*`; quedan 38 candados anti-desastre (memoria `permisos-todo-permitido-2026-11-04`). `.claude/settings.json` queda sin guardar (ya tenía cambios ajenos).
- 01:00 vivos en el chat 2: A (pantalla XML), B2 (pantalla precio troza), reviewer de B1, C2 (aceptar cotización), investigación SIRE → `sire-formato.md`. Chat 2 en 294 mil: rotar cuando vuelvan.

## Al abrir el chat 3 (si los ayudantes murieron al rotar)
- Archivos sin guardar de B1 (backend precio troza): `lib/forestal/precio-troza-tipos.ts`, `precio-maximo-troza.ts`, `rendimiento-por-origen.ts`, `precio-troza-lectura.ts`, `app/api/admin/forestal/precio-troza/route.ts`, `__tests__/forestal-precio-troza.test.ts`, `lib/db/forest-ctp-consumo.db.ts` (método `consumosConOrigen`). Necesitan reviewer opus (plata) antes de guardar.
- C1 sin guardar: `lib/cotizaciones/enlace-token.ts`, `enlace-publico.ts`, `app/api/cotizaciones/[id]/enlace/route.ts`, `app/cotizacion/[token]/{page,loading}.tsx` + `_componentes/hoja-cotizacion.tsx`, `components/admin/cotizaciones/{use-enlace-cliente.ts,AccionesCotizacion.tsx,tipos.ts}`, `__tests__/cotizacion-enlace-publico.test.ts`. Probado (12 tests, captura OK). C2 (aceptar) a medias si murió. Ruta pública → `security` opus antes de guardar.
- A (pantalla XML) y B2 (pantalla precio troza): mirar `git status components/admin/compras/factura-xml components/admin/forestal/precio-troza`; si quedaron a medias, relanzar con «Falta:».
- Después: conectar el dólar (`/api/admin/tipo-cambio`) a la vista previa XML cuando la factura es USD.
- 00:56 GUARDADO daac4c51f precio troza backend (reviewer: corridas sin aserrado ya no cuentan; 18 tests) · 00:59 1efb2f4e1 pantalla factura XML (compra S/ 581.39 creada en main QA).
- 01:00 SIRE investigado → `sire-formato.md` (RVIE 33 campos, RCE 37, nombre LE+RUC+periodo…; tramo 1 = exportar VENTAS en formato SIRE, se puede ya; compras pide fecha de emisión + IGV en el esquema → Decide Brandon; pedirle ZIP real de propuesta).
- Quedan vivos: B2 pantalla precio troza, C2 aceptar cotización. Después: security de C1+C2 → guardar → rotar al chat 3.
- 01:04 GUARDADO 20ada0cfd pantalla precio troza (arreglé pestañas encimadas a 400 px) · 908c79951 esfuerzo xhigh (Brandon 01:05: «pon el esfuerzo xhigh por defecto y trabaja con eso en general» → ayudantes medium→xhigh, defs, regla; memoria `esfuerzo-xhigh-en-todo-2026-11-04`).
- 01:04 C1+C2 terminados (25 tests; aceptada real en main BUL-COT-0003/0004 de prueba) → `security` opus xhigh corriendo. Al volver: guardar o aplicar arreglos. Después rotar al chat 3.
- 01:12 GUARDADO 03ea18672 cotización con enlace (ver + aceptar). En main QA quedaron de prueba: BUL-COT-0003/0004 aceptadas, compra po-1793771513107-diob y proveedor DISTRIBUIDORA EJEMPLO (borrables).
- 01:12 chat 2 cerrado a ~320 mil → chat 3.

## Cola para el chat 3 (en este orden; carriles disjuntos en UNA tanda; ayudantes con effort xhigh)
1. SIRE tramo 1: exportar VENTAS en formato SIRE (RVIE, 33 campos, ficha en `sire-formato.md`): función pura + test + endpoint + botón en `components/contabilidad/LibrosContador.tsx`. backend opus. Lo no confirmado de la ficha → dejarlo marcado y en «Decide Brandon».
2. Dólar en la compra XML: si la factura es USD, mostrar el tipo de cambio SUNAT del día de emisión (`GET /api/admin/tipo-cambio?fecha=`) y el equivalente en soles; al crear la compra, guardar en soles con nota del tipo de cambio (es plata → reviewer). Archivos: `components/admin/compras/factura-xml/*`.
3. Pendientes chicos de la XML: aviso «ya cargada» a 400 px, modo oscuro (1 captura), quitar una línea, `fflate` en package.json.
4. Precio troza: captura de «Rendimiento por origen» y que la pestaña elegida se vea en celular (scrollIntoView).
5. Investigar + construir otra integración sin clave (ideas: consulta RUC del proveedor nuevo en la vista XML con `consultarRUC`; feriados del Perú para plazos).
6. 06:30 CIERRE: PDF (`armar_pdf.py`) en Semana actual › Buleje (sistema), memoria `noche-autonoma-2026-11-04-resultados`, handoff, `panel-trabajo`, PushNotification.

## Bitácora chat 3
- 01:16 chat 3 abierto; lanzados en UNA tanda: (1) SIRE ventas exportar (backend opus), (2) dólar + pendientes de la compra XML (frontend opus).
- 01:35 GUARDADO c2faf0d87: pestaña elegida visible en celular (arreglo general del control de pestañas) + especies sin datos plegadas (400 px: 4,5 → 2,6 pantallas). Item 4 de la cola hecho (captura de «por origen» vista: QA solo «Sin origen»).
- 01:50 GUARDADO c732fb081: el arranque entraba sin sesión (qaadmin tiene varios negocios → requiresTenantChoice; /tmp/bsm-auth.env solo con csrf, curl de ayudantes = 401). Consulta de RUC probada: SPSA ACTIVO/HABIDO (fuente sunat).
- 01:55 SIRE ventas HECHO (14 tests; pantalla probada: main sin RUC → aviso claro; 422). reviewer sonnet corriendo. architect opus: diseño SIRE compras (SQL propuesto, sin migrar). Barrido de errores de las 58 pestañas en segundo plano.
- MEDIDO para Decide Brandon: (a) «Rendimiento por origen» en Blas no sirve hoy: 0 corridas con guía ligada; 11 lotes, 6 con permiso (1 solo permiso), 0 con trozas. (b) Asistencia de Blas sin marcar desde el 27-10 (49 marcas manuales en 6 días; kiosko 0 usos). (c) Cotizaciones: 5 en todo el sistema → «stock prometido en cotizaciones» descartado. (d) main sin RUC ni comprobantes electrónicos: SIRE no se puede probar de punta a punta sin el RUC de un negocio real.
- 02:05 dólar XML HECHO (21 tests; 03/11 TC 3.466 respaldo SBS-BCRP; US$ 101.01 → S/ 350.10, compra suma 350.11 por redondeo por línea; quitar línea OK; modal a xl). reviewer opus corriendo. Barrido de 58 pestañas relanzado (arreglado: usaba un chromium no bajado) → log en scratchpad del chat 3 `audit-runtime.log`, reporte en `reports/audit-admin-runtime/`.
- 02:05 chat 3 en 202 mil → rotar al chat 4 al volver los 3 ayudantes (reviewer SIRE, reviewer XML, architect SIRE compras).

## Cola para el chat 4 (si los ayudantes murieron al rotar, relanzar con «Falta:»)
1. GUARDADO 3c0bae319 — SIRE ventas. Falta (reviewer sonnet, sin críticos): M1 notas de crédito electrónicas sin referencia (`registro-ventas.ts:211-228`; rellenar desde la boleta/factura del mismo orderId como `referencia()` de `libros-contador.db.ts`) · M2 «pendiente en SUNAT» debe ir en cero/bloquearse y `AvisoSire.tsx` no pinta `resumen.avisos` · bajos: empate POS vs SunatInvoice (gana SunatInvoice, `sire-rvie.ts:241`), DNI `00000000` (`:115`), plurales («1 venta no entraron»). Era: `lib/contabilidad/libros/sire-rvie.ts`, `__tests__/sire-rvie.test.ts`, `components/contabilidad/AvisoSire.tsx`, `app/api/admin/contabilidad/libros/route.ts`, `components/contabilidad/use-libros-contador.ts`, `components/contabilidad/LibrosContador.tsx` (ya probado en pantalla). Falta: reviewer sonnet (si murió, relanzar) → aplicar críticos → guardar.
2. GUARDADO 33535e1ae — Dólar XML (reviewer opus sin críticos). Falta: M «La compra suma» como cifra principal en `FacturaXmlDolar.tsx:86-97` (y motivo real si hay descuento/descuadre) · `use-tipo-cambio.ts:60` usar `tipoCambioValido` · nota cuando la fuente es BCRP (`compra-desde-factura.ts:124`) · total nuevo al quitar líneas también en soles (`SubirFacturaXmlModal.tsx:197`) · 4 `toLocaleString` → `formatNumber` (design-strict, líneas ~190) · test del hook · guardar `.claude/agent-memory/frontend/compra-factura-xml-qa-gotchas.md`. Ya existía: costo unitario 2 decimales y cantidad entera en la base (19.078 de 20.000 facturas USD al azar no cuadran línea vs total; peor S/ 12,24) → Decide Brandon (migración). Era: `components/admin/compras/factura-xml/{compra-desde-factura.ts,use-tipo-cambio.ts,FacturaXmlDolar.tsx,use-factura-xml.ts,FacturaXmlLineas.tsx,SubirFacturaXmlModal.tsx}` + `__tests__/factura-xml-dolar.test.ts` + `.claude/agent-memory/frontend/compra-factura-xml-qa-gotchas.md`. Falta: reviewer opus (plata) → arreglos → guardar; después crear compra de prueba en main (pasos en scratchpad chat 3 `xml-dolar/pasos2.json` + clic `[data-factura-xml-crear]`) y mirar el aviso «ya cargada» a 400 px.
3. SIN GUARDAR — `scripts/audit-admin-runtime.mjs` (usa resolverChromium). Corrió hasta la pestaña 7 y el navegador se cayó (memoria); «inventario CON:121» NO se reproduce con qa-capturas (0 errores) → descartado. Para correrlo entero: por tandas con `TABS=a,b,c`.
4. HECHO (guardado con este lote) architect SIRE compras: 14 columnas nullable (9 compra + 5 gasto), tramos T0-T7, 5 «Decide Brandon» (⭐ mes = fecha de factura; compras viejas = bloqueo con sugerencia; madera de Blas = tramo 2c; IGV a mano copia del papel; recibo/ticket código 12/14/00). Gotchas: `cuerpoDeLaCompra` bota fecha/moneda/IGV/totales/RUC del emisor (solo en notas); la madera de Blas (ingresos) NO entra al libro de compras ni al SIRE. → `migraciones-propuestas/2026-11-04-sire-compras-datos-comprobante.sql` + `.claude/autonomo/noche-04-11/sire-compras-diseno.md` (NO migrar; va a Decide Brandon).
5. Siguiente integración: RUC del proveedor en la vista XML (SUNAT ACTIVO/HABIDO; `GET /api/sunat/lookup-ruc?ruc=` ya funciona) con aviso «NO HABIDO: su factura no te da crédito fiscal». Archivos `components/admin/compras/factura-xml/*` (después de guardar el 2).
6. 06:30 CIERRE igual que antes.
- 01:40 GUARDADOS 3c0bae319 SIRE ventas · 33535e1ae dólar XML · lote de diseño SIRE compras + barrido arreglado. Chat 3 → chat 4.
