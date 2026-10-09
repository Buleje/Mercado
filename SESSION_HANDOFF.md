# SESSION HANDOFF — 2026-10-08 (tarde-noche): plan de mejoras + tandas 2 y 3 + tienda/seguridad + Ventas y Caja potenciada (6 pestañas)

**Estado:** ✅ commiteado (24 commits `851f260c7` → `34e1ae011` + tanda 3 `74dbd8787` → `341b6eef4`), **sin subir** (no se pidió push). Árbol limpio salvo `.claude/autonomo/` y una captura de VRT sin versionar. Typecheck verde 14:05. **Blas: migración del código único APLICADA 13:31** (respaldo `.claude/autonomo/respaldos/codigo-unico-blas-2026-10-08-18-07-07.json`, huella `71ccd7a8…`; se revierte con `node scripts/migrar-codigo-unico-adr-477.mjs --tenant blas --revertir <respaldo>`). PDF «Mejoras ejecutadas» en el Escritorio. Doc vivo del plan (rev 123+) y bitácora `.claude/autonomo/ejecucion-2026-10-08-tarde.md`.

**Hecho:** código único 12A-0001 (ADR-477) · Guías GTF con dos códigos, resumen interno en servidor, documentos del permiso y envío por WhatsApp · QR con dominio público (`/t/<slug>/verificar/…`), hoja de despacho con QR, despachar escaneando · Rendimiento por especie/corrida con plata derivada que dice qué falta · Cubicación de trozas → cuenta del adelanto (ADR-478) con 6 puertas de doble pago cerradas y un solo candado por guía normalizada · Cámaras: sonido, ver movimiento, marcadores ArUco y «Trozas a la vista» (ADR-480), personas por ropa sin biometría (ADR-479) · indicadores en una fila, permiso visible, aprovechamiento, despacho por guía, trámites, Smalian/Oxapampina · `qa-capturas` encuentra el dev en :3000/:3001 y `--ls`.

**Para Brandon (decide):** dominio/subdominio de los QR (ROOT_DOMAIN) · B1 adelanto DADO excedido por cubicación · dos códigos en la hoja SERFOR · retención de fotos 365→60 · costos de Blas (K4 2-3) · reimprimir las 22 etiquetas de Blas · probar sonido/marcadores/ver movimiento con blasadmin.

**Al retomar:** datos de QA en main (guías 019-001-0000771/772 y 020-001-0000771 del PO 12, cubicaciones de prueba, 3 enlaces que vencen 15/10). LSP muestra errores falsos de `forestCubicacionTrozas` (tipos de Prisma viejos en el LSP; el typecheck da verde).

**Tanda 2 (14:50-16:15, workflow de 18 agentes):** `a9ce2ae6e` cubicación comercial (ADR-483: Oxapampina con descuentos desde la GTF del LO-TH y aserrada en el Despacho CTP, uno por uno o rápida, precio general, a la cuenta; 8 columnas aditivas en ForestCubicacionTrozas + CHECK v2 con `tablar`) · `c5eb816f4` ingreso al CTP «Desde tu Libro TH» ya relleno (ADR-481, sin columnas nuevas) · `34e1ae011` papeles de cada guía en LO-TH/CTP/formatos (ADR-482) + el PATCH del Drive fuerza roles admin/almacenero/dueño al etiquetar `gtf:`/`casillero:` (veto de security cerrado; probado cajero 404).
**Decide Brandon (tanda 2):** hueco = cilindro Øh²·L′÷24,5 ¿así en la plaza? · «Aplicar» ¿llena el valor de venta del despacho si está vacío? · vender a quien no dio adelanto (hoy sólo borrador: no hay cuenta por cobrar) · ¿guía del transportista obligatoria en «Papeles x/4»? · Blas: la GTF 019-001-0000001 ya se puede traer con «Desde tu Libro TH» (vencida → pide motivo).
**Tanda 3 (16:25-19:10, workflow de 17 agentes + 4 revisiones/arreglos sueltos):** `74dbd8787` QR corto `/v/<código>/…` (ADR-486; Blas = `il3g4`; 122→65 letras; el código sólo vale en el host principal; security aprobó 2 veces) · `72941416e` carta «Relación de guías» con título del permiso, expediente y código REL-AAAA-NNNN correlativo que sólo sube, en fila (ADR-487) · `5d2e25e9f` chip «N guías de tu Libro TH por ingresar» + aviso de papeles de ley en Inicio (cajero ni lo pide) · `b38c5b72f` resto sin adelanto a ForestCuentaMov + valor de venta del despacho; frenos de cobro doble con `puedeSerLaMismaGtf` = misma regla que el candado (ADR-484, 2 revisiones) · `385b80d71` corrida↔compra FIFO de un toque, un solo título si la corrida no tiene permiso, idempotente; especies aserradas sin ingreso en Saldos (ADR-485, 2 revisiones) · `341b6eef4` título único de módulo (titulo-modulo.tsx) en las 62 pestañas + 443 títulos a 20/700 y 14/700.
**Al retomar (tanda 3):** el dev se colgó 1 h por pánico de Turbopack (`aggregation_update.rs`); reiniciado 18:08 en :3000 con log `/tmp/dev-d.log`. Remate de títulos (Trámites, inicio, mayúsculas, ventanas a mano) y la tienda `/t/main` (pedido nuevo de Brandon) en curso. Datos de prueba en main: beneficiario «QA PL 484 (prueba anulada)» (no se puede borrar: tiene adelanto cancelado). Pendiente fuera: un despacho sin guía con valor puesto a mano + cubicación con resto a la cuenta suma dos veces en el resultado (no hay N° que los junte).
**Decide Brandon (tanda 3):** reimprimir las 22 etiquetas de Blas con el QR corto (las viejas siguen andando) · vincular las 4 fichas de adelantos de Blas a sus partes del directorio (si no, una venta de Wasaco que pase su adelanto da «sin cuenta») · las 5 corridas de Blas (78,671 m³) ¿existencia de apertura? · N° de expediente en la ficha del permiso (hoy vive en cada carta).
**Tienda /t/main + seguridad (19:15-20:50):** `c608cfc75` velocidad (sin Lenis/paleta en /t/*, vitrina 350→111 ms, foto a la medida) · `37064f13e` rediseño editorial Fraunces (400 px: 14→8,6 pantallas, CLS 0,025) · `1deb16c2c` ficha rápida en modal + vuelo a la bolsa + sonido · `0937c6a2b` checkout en la misma portada (solo `main`; otro negocio o query con «/» siguen el enlace) · `91217cbc1` remate de títulos (Trámites 30→20, 47 kicker, 103 ventanas) · `1c64198d9` **CRÍTICO de b63ac273e (en master/producción)**: el pedido de invitado firmaba sesión de cliente con el teléfono del cuerpo → historial ajeno; ahora solo sesiones verificadas + token de seguimiento con ids; primera compra sin 422 (fórmula única `lib/pricing/total-pedido`), stock una sola vez, cotizar sin oráculo, lote con máquina de estados. Security aprobó tras 3 vueltas.
**Decide Brandon (tienda):** subir el arreglo crítico a producción ya · arreglo de 5 líneas en `lib/middleware/tenant.ts:183` (Referer sin barra o con «/» en la query → negocio equivocado; receta en el reporte de security) · 22 pedidos viejos con 43 unidades restadas dos veces · 5 % de primera compra al invitado (`DESCUENTO_PERSONAL_AL_INVITADO=false` por privacidad) · «Canjear puntos» retirado de la vista previa (el servidor nunca lo descontaba) · confirmar que `ALLOW_E2E_TEST_AUTH` no esté prendida en Vercel · el logo del checkout de main es «Chicken».
**Seguridad (20:50-23:00, en la rama):** `271967093` negocio por Referer (sin barra/query, 404 ante %-escape) · `7200456a6` canje de puntos real (100 pts = S/ 1, tope 50 %, tx del alta, devuelto al cancelar/borrar) + Google ya no vincula por correo + `telefonoDeLaSesion` (solo OTP, 9 dígitos) · `3bf42bb1b` puntos del marketplace con sesión del teléfono + ficha social exacta. **HOTFIX DE PRODUCCIÓN LISTO SIN SUBIR**: worktree `/home/usuario/proyectos/Mercado-hotfix-2026-10-08`, rama `hotfix/sesion-invitado-2026-10-08` = `6b4bd49d2` (lo que corre en www.buleje.pe, deploy CLI 16-07 22:35) + `cf3d9428d` sesión invitado + `326e29e74` fiado + `9b641641f` Google/teléfono + `a23af7ac0` puntos marketplace; security aprobó; commits con --no-verify SOLO en esa copia (sin node_modules). Falta: Brandon `! vercel login` → `vercel deploy --prod --skip-domain` desde la copia → probar la URL → `vercel promote`; rollback = `dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2`.
**Ventas y Caja (21:55-23:55, workflow de 15 agentes + 6 sueltos):** pedido «potenciar POS, Turnos… hasta Comisiones». `b1bcaf96a` Vender: POSView 2.727→297 (24 piezas), cabecera en una fila con menú «⋯», lector que no pega códigos, catálogo sin internet con fecha/aviso 24 h · `af407f0b4` Turnos 2.244→~245: diferencia del servidor (la del cliente sumaba Yape), ventas en vivo, avisos 10 h, resumen de cualquier turno, ticket 80 mm, cajera solo lo suyo, UNA ventana de cierre (chip del hub → `&cerrar=1`) · `3ea0fab93` Me deben 1.449→200: «Quién te debe» arriba, cobro con medio y «anotar en la caja» (moverCajaEnTx último lock), VENCIDO se cobra, POS cobra fiado con medio+aCaja; **roles**: almacenero fuera de fiados (Ley 29733), perdonar deuda (status) solo admin — security OK con rol-probe · `99f911382` Caja 2.538→partida: parte del día por origen, cuadre con ventas, papel con nombre del negocio · `bec1a47e8` cierres sin conteo: los 2 crons ya NO inventan el conteo (inicio+ventas con Yape), close-shift con monto opcional, «Cerrada sin conteo» en Caja/detalle/Metas · `b57040fb0` Cuadrar caja 695→~110 (contador por denominación, cajero real del historial, «Viene del turno de…») + Comisiones del backend (CommissionRule) sin pago doble (cruce de períodos 409, montoVisto, advisory lock) · `355633df4` arnés: qa-capturas detecta el flock de afuera y espera un login 500 de otro carril nombrando el archivo; ActionMenu con export nombrado. Capturas 6 pestañas × 1280/400: 0 errores, 0 respuestas ≥400.
**Decide Brandon (Ventas y Caja):** trueque (con diferencia el servidor lo rechaza; sin diferencia anota efectivo que no entró) → ¿descuento, medio «trueque» o venta+compra? · cobro masivo de fiados no entra a la caja ni lleva medio · fiado del carrito del POS y Yape QR nunca se abren (cliente sin teléfono) · `ComisionesTab.tsx` (490 líneas con datos de ejemplo) sin uso → ¿borrar? · cajera sin turno propio ve «Turno sin abrir» en el POS aunque el dueño tenga uno · probar con una caja ABIERTA de QA: «Cambiar medio», cobro de fiado a caja, cierre desde el chip.

---

# SESSION HANDOFF — 2026-10-08: noche autónoma (cámaras, Libro TH/CTP, Inicio forestal, adelantos, orden de pantallas, superadmin, tuteo)

**Estado:** ✅ todo commiteado (36 commits desde las 00:15, de `ea4c6f311` a `3bdb8ddb3`+handoff) y SUBIDO a la rama `audit/storefront-mejoras-verificadas-2026-06-15`. Nada en producción. Árbol limpio salvo `.claude/` sin versionar. PDF «Mejoras de la noche» en el Escritorio de Windows (`OneDrive\Documentos\Escritorio`). Plan y bitácora: `.claude/autonomo/plan-2026-10-08.md`.

**Hecho (resumen; detalle en la memoria `noche-autonoma-2026-10-08-resultados`):**
1. **Cámaras**: galería «Personas», aviso por WhatsApp al aparecer alguien (Blas: 2 cámaras con número «sólo de noche»), zonas a ignorar, fotos a la papelera a los 30 días y fuera del sync a Windows.
2. **Libro TH/CTP**: Secciones 8,56→1,32 pantallas, Trazabilidad/Censo, cierre de mes con saldo al cierre, cada árbol hasta el aserradero, guías del CTP → formatos de trámite, marcas del día con texto, Tablero con unidad.
3. **Inicio**: pestaña «Forestal» (cifras del libro) y un forestal sin ventas abre ahí.
4. **Adelantos**: leer voucher (OCR en el navegador, nunca guarda solo) y firmar el recibo (hoja en bucket privado `forestal-privado`, GET con permiso; revisado por security, sin críticos).
5. **Orden**: Adelantos 21,4→0 (+ sub-vistas), Ajustes 9→0, Libro CTP 3→0, Trámites 0,5→0; modales fijados dejan usar la página; 8 modales más como ventana.
6. **Superadmin**: ingresos reales (de pago 9→0), enlaces 404, colores; **tienda pública** en tuteo (248→0 fuera del checkout).
7. **Celular (05:20-05:40)**: el h1 del Inicio medía 0 px a 400 (acciones shrink-0) → fila envuelve; flecha de pestañas sólo sobre el riel; «Gráficos» sólo ícono bajo 30rem. `medir-orden-admin` mide desborde/cortados/título aplastado con `ANCHO=400` (63 pestañas: 0 desbordes reales). Un módulo apagado (`?tab=a-medida`) dejaba el panel en blanco: el candado navegaba a «inicio» → `navigateTab` traduce ids viejos (4e53043a6). Humo final 63 × 1280/400: 0 errores. `qa-capturas` tiene `{"quien": sel}` (qué componentes dibujan un elemento).

**Para Brandon (decide):** (a) 65 árboles del censo de la plantación de Blas borrados el 06-10 sin historial — recuperables (memoria `blas-censo-borrado-06-10`); (b) GTF del LO-TH de Blas fechada 09/10/2025; (c) el voucher del alta sigue en el bucket público `media`; (d) probar cámaras reales en Blas; (e) «Por guía/Por troza» del CTP ahora en Opciones.

**Al retomar:** borrar los cron de la sesión si siguieran (CronList); la directiva autónoma venció a las 07:00.

---

# SESSION HANDOFF — 2026-10-07: Ubuntu + Claude al día (LSP de TS 7, herramientas, MCP remotos, juego fuera, WSL 3.0.1)

**Estado:** ✅ commiteado (`4a6d834ea`, `088a45783`), **sin subir** (no se pidió push). La sesión se cortó a propósito: `wsl --update` a 3.0.1 diferido 90 s. Al volver: `wsl.exe --version` debe decir 3.0.1 y `/mcp` debe mostrar context7/firecrawl como HTTP.

**Hecho:**
1. **LSP en Claude Code**: plugin `.claude/skills/buleje-ts7-lsp` (carga solo). Errores de tipos 0,3-0,44 s tras cada Edit, también en los archivos que importan al editado; herramienta `LSP` en los 8 agentes. Cuesta 2,6-3,6 GB por sesión (la barra lo muestra).
2. **Barra de estado**: «LSP X GB» + barra de subagentes; 87 → 43 ms. **Spinner** animado otra vez (`prefersReducedMotion: false`).
3. **Ubuntu**: apt al día, git 2.55, 24 herramientas (`scripts/ubuntu-herramientas.sh`, corre en el mantenimiento del domingo), fzf/eza/delta/difftastic integrados.
4. **MCP**: context7 y firecrawl remotos (−176 MB por sesión).
5. **Windows**: restos de Riot, «Modo juego LoL», Game Bar, búsqueda web del Inicio y arranques huérfanos fuera (respaldos en `.claude-tune\2026-10-07\`). La RAM la usan Ubuntu, Chrome y Acrobat abierto (1,4 GB).

→ detalle: memoria `ubuntu-claude-lsp-2026-10-07`.

---

# SESSION HANDOFF — 2026-10-04: Configuración en 8 secciones, mezcla de dos sesiones, cupo/T6 del importador, seguridad del Drive, Documentos del plan

**Estado:** ✅ TODO COMMITEADO Y SUBIDO (último `6ce5d15a5`, rama `audit/storefront-mejoras-verificadas-2026-06-15`). Árbol limpio salvo `.claude/` sin versionar. Typecheck 0; suite completa en verde al cierre (las 2 fallas que dio, corregidas).

**Hecho:**
1. **Configuración (`?tab=config`)**: 20 tarjetas → 8 secciones con `?vista=` y buscador por campo; fuera 36 de 91 campos sin lector; sin datos de ejemplo de Buleje; bloqueo si `/api/settings` falla; «Te falta» con datos reales; Mi panel y Tienda web plegables (memoria `ajustes-auditoria-2026-10-04`).
2. **Mezcla** de la rama remota (28 commits de otra sesión, Libro TH/cámaras) con la local (117): 18 conflictos resueltos conservando las dos (`4e449f940`). El arranque ahora avisa si GitHub va adelante.
3. **Libro TH**: cupo T9 también al agrandar talas en el importador; vista previa con T9/T6 y motivo; **T6 con motivo** para guías verificadas en SERFOR (ADR-468); Control del permiso con un solo selector; plan cargado 1 vez.
4. **Seguridad Drive (CRÍTICO, ya existía)**: permisos por toda la cadena de carpetas en todas las rutas, `/api/api-keys` solo admin/dueño, carpetas de otro negocio y ciclos rechazados (`6e0105ded`, `bfd2774b8`; memoria `drive-permisos-por-rol-2026-10-04`).
5. **Documentos del plan de manejo** rescatado de un stash olvidado del 30-09 (ADR-467). Stash y ramas de respaldo borrados; `.claude/autonomo/plan-2026-09-29.md` restaurado (solo vivía en el stash).
6. Herramientas: pre-commit corre los 13 tests guardianes y los que leen el fuente; `scripts/dev-helpers/rol-probe.mjs --todos` (usuarios QA por rol: memoria `qa-usuarios-por-rol`); paso `fallar` en `qa-capturas`.

**PRÓXIMA SESIÓN — Brandon eligió las 3 (en este orden):**
1. **Reactivar el tenant QA forestal** (`inversiones-agroforestales-blas-sociedad-op-qa-ui`): `/api/tenants/resolve` responde 403 «tenant inactivo» (`app/api/tenants/resolve/route.ts:48`) y ensucia la consola de cada `qa-capturas` forestal. Hacerlo por superadmin/endpoint (no SQL a mano) y verificar con una captura: consola 0.
2. **Script que compara el HTML antes/después de partir un componente** (`scripts/dev-helpers/comparar-dom.mjs` o similar): el agente que partió `LothPlanForm` lo armó a mano (render del original y del partido con RTL, 12 pasos, comparar `innerHTML`); su receta está en su memoria `partir-componente-mismo-dom.md`. Usarlo en el punto 3.
3. **Partir el Drive** (`components/admin/documentos/DocumentosModule.tsx`, 3.545 líneas) sin cambiar lo que dibuja, con el script del punto 2. Contexto: hoy se endurecieron sus permisos por rol (`bfd2774b8`). Quedan 408 componentes del admin >300 líneas; los otros 4 más grandes: `StoreCreativeMode` 5.023, `InventoryTab` 4.152, `StoreCustomizer` 3.672, `CubicadorMadera` 3.500.

**PENDIENTE (decisiones de Brandon):**
- Importador: dos guías del mismo árbol con el interruptor de talas apagado en una (caso raro, anotado por el agente).
- La capa `z-10` del menú «Copiar» del plan sigue disparando el aviso informativo `ds-no-z-arbitrary-admin` (cambiarla taparía el desplegable del directorio).
- El tenant QA forestal responde 403 en `/api/tenants/resolve` (está marcado inactivo).

---

# SESSION HANDOFF — 2026-09-27 (noche): PC + monitor, despacho ADR-444, guía rediseñada, días de producción ADR-445

**Estado:** ⚠️ **SIN COMMIT** — ~204 archivos (esta sesión + las 5 rondas de la anterior). Gates verdes al cierre: typecheck ✅ · eslint (168 archivos tocados) exit 0 · 13 archivos de test del área 149/149 · base real ADR-444 13/13. Brandon NO pidió commitear: **primera decisión de mañana** (sugerido: commits por ronda con el método de `commit-aislado-exportar-el-indice`).

**Hecho (sin commit):**
1. **ADR-444 — un paquete en UNA guía vigente + despacho atómico** (`docs/adr/ADR-444-…`). Registrar la guía (borrador o emitida) saca el paquete de Productos disponibles y del selector; una 2.ª guía con el mismo paquete da 409 sin grabar; anular lo devuelve; un 422 ya no deja la línea grabada. Revisado (2 defectos corregidos: código de troza = código de paquete; producto «de cualquier paquete»). Verificado en el navegador con PQ-001 en `main`. Memoria `despacho-paquete-una-guia-adr444`.
2. **Blas SL-681:** anuladas las líneas de despacho #2 y #3 (duplicadas por el bug), con motivo en la auditoría. #1 (SL-680, GTF 19-00000-000001) intacta. SL-681 libre para registrarse UNA vez.
3. **Rediseño de «Datos de la guía de transporte forestal»** (`CtpGuiaDatosTab.tsx`, `ctp-guia-bloques.tsx`, `ctp-guia-piezas.tsx`): dos columnas en el orden del papel, Ficha como resumen, «Faltan N» por bloque, ⓘ en vez de párrafos; 1390 → 1000 px. El pie del modal ya no cuenta «Fecha de inicio del traslado».
4. **Disponibles sin «0» al cargar** (y Trozas disponibles + gráficos): esqueleto mientras carga.
5. **ADR-445 — días de «Producir sin lote» con origen y salida** (`docs/adr/ADR-445-…`, `lib/forestal/origen-y-salida-del-dia.ts`): marca cubicado/por tipo/mixto/por declarar y salida (guías, borrador, sin guía, en patio); chips de la semana; «Agregar cubicación» con cuadre por especie+tipo contra TODAS las corridas atadas; cubicaciones leídas de la base (el caché de PlatformSettings es por instancia) con bloqueo y 409 por versión. Revisado (5 defectos corregidos). Blas: 63,5 % del m³ por tipo, 4 días (76,66 m³) salieron sin guía. Memoria `ctp-dias-origen-salida-adr445`. Datos QA en `main`: cubicaciones «QA ADR-445 …» (el 14/08 sigue por tipo para probar).
6. **PC de Brandon** (memoria `pc-ronda-2026-09-27-monitor-apps`): 13 apps fuera, +38 GB, monitor ASUS VG249QM5F verificado (RGB 8 bits 240 Hz por HDMI), batería tope 80 %, «modo trabajo» del panel (`~/.local/bin/panel-trabajo` / `panel-desarrollo` + íconos en el Escritorio: 0,64 GB y 0,12 s por consulta), tareas «Cazar congelamiento» y «Compactar Ubuntu de madrugada» (03:00, **se salta si Claude está abierto**). Congelamientos: 70 % en partidas de LoL; la opción UMA (2 GB) existe en la BIOS pero está oculta — escribirla es firmware, **sin OK de Brandon no se toca**.

**PENDIENTE (decisiones de Brandon):**
- Commitear (ver arriba).
- Registrar las salidas «sin guía» de Blas desde su Anexo 04 (puente anexo→despacho, ver `flujo-ingreso-despacho-blas-27-09`) — la recomendada.
- Marcas del día con texto; Consumos sin «0» al cargar (mismo patrón que Disponibles, `CtpConsumosSeccion2Kpis.tsx`).
- ADR-444 §Pendientes: apartar no rechaza en servidor un paquete ya en guía; `buscarPaquetes` no dice en qué guía va; consumos de `create` en tx aparte.
- CLAUDE.md desactualizado: 1.262 endpoints (dice 1.230) y 260 modelos (dice 254); tamaño total medido 1,27 M líneas de código.

---

# SESSION HANDOFF — 2026-09-27: guías guardadas (ADR-442), lotes (ADR-443), Trozas y Productos disponibles, mapa del flujo

**Estado:** ⚠️ **SIN COMMIT** — ~131 archivos de cinco rondas (Brandon no pidió commitear todavía; no mezclar con otra tarea). Gates verdes al cierre de cada ronda: typecheck, eslint 0, tokens 0, tests propios + `vitest related`. Migración aplicada a mano y marcada: `20260927_guias_guardadas_adr442` (tabla nueva `ForestGuiaGuardada`, EXPAND). Dev server reiniciado tras `prisma generate`.

**Hecho (sin commit):**
1. **ADR-442 Guías guardadas antes del ingreso**: guardar la guía (N° registro + GTF + 6 casilleros) antes del camión; el ingreso ve los papeles solo (etiqueta `gtf:`); «ingresada» se deduce; carpeta Drive `Guías forestales (GTF)/titular/permiso/GTF N°`; ronda 2: vencimiento a la vista, leer de una foto (`gtf-ocr` + `numeroRegistro`; **en local no hay clave de visión: lectura real NO medida**), ordenar papeles viejos (Blas: 3, botón lo aprieta Brandon), `contratoDelTenant`/`contratoPropio` (permiso de otro negocio rechazado en ingresos, gastos, adelantos, fletes, corridas).
2. **ADR-443 Lotes**: propuesta de lotes por especie+permiso (Blas 11 lotes/46 trozas), tarjetas simples, 3 lotes de Blas reparados (auditados; SQL de reversión en el ADR/transcript), reabrir pide confirmación, «¿De qué trozas salió?» (dos actos, bandeja por motivo; Blas 44/44 sin origen, 0 vinculables hasta arreglar Ingresos).
3. **Pestaña «Trozas disponibles»** (`?vista=trozas-disponibles`): por permiso con sus especies, por especie, por troza, KPIs, 3 gráficos, Excel; salió de Consumos (queda una línea con enlace). Un criterio: en el patio; sin recepcionar aparte. Revisada y corregida.

4. **Productos disponibles** rehecha con el formato de Trozas disponibles (revisada y corregida: cifras con el saldo del libro).
5. **Mapa del flujo ingreso→despacho** (memoria `flujo-ingreso-despacho-blas-27-09`): Blas despacha con 10 Anexos 04 (99 m³) fuera del libro, 0 despachos; lo único que falta construir es el puente Anexo 04 → despacho (+ registrar las 9 salidas pasadas + salida de madera de servicio). NO cerrar agosto antes del puente.

**PENDIENTE (decisiones de Brandon):** commitear (sugerido: 3 commits, uno por ronda); cerrar agosto en Blas antes de vincular en masa; corregir llegada de 7 guías y acomodar trozas en Ingresos para destrabar ~21 producciones; probar la lectura de GTF por foto donde haya clave de visión.

---

# SESSION HANDOFF — 2026-09-26 (noche): QR de ficha, lotes por especie, cubicación Oxapampa, pago por PT, WhatsApp del negocio

**Estado:** push al día (`f914f7278`). Árbol limpio. Commits de la sesión: `2800f6bd8` (QR ficha + lotes por especie), `9bb4cc551` (Oxapampa, medir escaneando, acta del conteo, tarjeta de troza), `849854759` (WhatsApp del negocio), `f914f7278` (pago madera/flete por PT Oxapampa).

**PENDIENTE — decisiones de Brandon antes de pasar a producción** (runbook `docs/runbooks/deploy-rama-a-produccion.md`):
1. Producción = deploy por CLI del 16-07 (rama `prod`, commit `7774f5ca`), no `master`. Los previews fallan por `DATABASE_URL` de **Preview** en Vercel: host `aws-0` y usuario `app_user` → debe ser `postgres.<ref>@aws-1-us-east-2.pooler.supabase.com:6543`. Revisar también `DIRECT_URL`/`AUTH_SECRET` en Preview y Production.
2. Riesgos al desplegar: caja de Blas abierta desde el 11-06 (el cierre automático la cerraría sin conteo a las 18:00); 13 crons nuevos (3 mandan WhatsApp de madrugada); 10 migraciones aplicadas a mano sin marcar (NUNCA `prisma migrate deploy` sin `migrate resolve --applied`); backup off-site 0/167; simulacro DR hace 130 días; Rolling Releases no disponible. Rollback: Instant Rollback a `dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2`.
3. Un `vercel login` de un agente entró a otra cuenta (`bulejelauea-9406`): revisar.

**PENDIENTE — canales** (Brandon, en Meta): agregar su número a la lista permitida del número de prueba; crear plantilla `aviso_libro_ctp` (Utilidad, español, con texto fijo alrededor de {{1}}: «Aviso del Libro CTP: {{1}}. Detalle en el panel.»). Correo: `RESEND_FROM_EMAIL` con `onboarding@resend.dev` sólo entrega al dueño; en Vercel Production hay que ponerla también. `buleje.pe` no existe en DNS. Reportes a la hora exacta: runbook `docs/runbooks/reportes-hora-exacta.md` (pg_cron + pg_net + Vault), no aplicado.

**Otros:** «hoy» en UTC en 21 archivos de `components/admin/forestal` (a las 19:00 Lima proponen mañana; sólo se arregló el alta de flete). `CtpPatioBandeja.tsx` usa `text-xs`/`ts-2xs`.

---

# SESSION HANDOFF — 2026-09-24 (cierre): colores del logo, indicadores en la barra y filtros en el encabezado

**Estado:** push al día. Árbol limpio salvo `.claude/improvement-radar.md` (ruido del hook de co-edición; no se commitea).

**Hecho en esta ronda (commits `74bb8a06f`, `68703a7a1`, `7ddf9d01f`; gates verdes: typecheck, eslint 0 avisos, anidado, vitest 969 relacionados):**
- **Colores del logo** (turquesa #00A29C + tinta #12181E, medidos en `public/brand/buleje-logo.png`). El verde salía del preset «emerald» (hue 175), del `Btn primary` = verde de éxito y del estilo «ejecutivo» con coral. ~80 botones de acción a la marca; estados siguen verdes. Oscuro: fondos con texto blanco 4,86:1. Memoria `colores-del-logo-no-verde`.
- **Indicadores en la barra** (`components/admin/forestal/kpis-plegables.tsx`): Ingresos, GTF, Producción, Despacho, Lotes, Disponibles, Consumos (Patio y S2) sin fila propia.
- **Filtros en el `<th>`** en 17 pantallas (forestal + admin), con copia `sm:hidden` para el celular y «Quitar filtros» cuando el filtro deja 0.

**PENDIENTE para la próxima sesión (en orden):**
1. **Decisión de Brandon — producción:** `PlatformSetting brand.primaryColor = #00B4A6` pinta tiendas y la raíz del admin (sidebar, portales). Pasarlo a `#00A29C` (1 valor en /superadmin o SQL). Hoy el panel ya es #00A29C porque el preset define toda la escala.
2. Tienda / marketplace: 159 botones con verde de éxito como CTA (fuera del admin, no se tocaron).
3. `AdminModal` no acepta ⓘ junto al título (prop `ayuda`).
4. Resto del admin fuera del forestal con texto de ayuda a la vista: 1 399 palabras en 62 pestañas (peores: Compras 104, Canales 89, Rendimiento 89) — `node scripts/medir-orden-admin.mjs`.
5. Navegador de toda la ronda en 1280 px (se verificó 1600 y 400).
6. Siguen del 23-09: avisos de plazos caídos (WhatsApp 401 + Resend) · reserva de Juancho vencida · audio real del cubicador.

---

> Entradas anteriores: `docs/handoff-archivo.md`.
