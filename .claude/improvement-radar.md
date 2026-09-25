# Improvement Radar — Buleje

Bandeja de propuestas de mejora detectadas por Claude entre sesiones.
Cada entrada: **status** [pending|approved|applied|blocked|rejected].

Al arrancar sesión, `session-start-context.mjs` muestra las `pending` en el contexto.

---

### [applied] 2026-09-15 — Recepción en bloque + costo + fotos del ingreso (`0dbaec7c`); el puntaje mide recepción y dice qué hacer (`1f1046d4`); la guía avisa lo que falta en la Ficha (`8fc6df0f`).
### [applied] 2026-09-15 — **Productos disponibles: edad, apartar, valorizar y exportar** (`cafe82c1f`, ADR-418). Columna «Parado hace» + 8 columnas ordenables (`ThOrdenable` ahora en `ctp-tabla`), modelo `ForestCtpApartado` con índice único parcial (migración aplicada), valorización por costo de guía ÷ rendimiento, CSV y 4 chips que acotan la tabla. 80 tests; verificado en navegador con datos reales (853 días, S/ 11.196, apartar/liberar contra la base).
### [applied] 2026-09-23 — (resuelto en `2c334edcd`: llegan a los avisos del libro con liberar y extender; queda sólo WhatsApp, bloqueado por el canal caído — ver memoria avisos-plazos-canal-caido) **La reserva vencida no avisa sola**: la pastilla del apartado se pinta en rojo cuando pasa el plazo, pero hay que estar mirando esa fila. Falta que el vencimiento llegue a los pendientes del libro o a WhatsApp — una reserva vencida es stock congelado por error.
### [applied] 2026-09-19 — **El permiso de trabajo se elige en la banda y vale en todo el panel** (`0c8ae9a95`). Pedido de Brandon señalando la banda del LO-TH. `ContratoActivoChip` + `contexts/contrato-activo-context` (localStorage por tenant, sincronizado entre pestañas con `storage`); la regla de propuesta quedó DENTRO de `SelectorContrato`: llena el hueco, pero no pisa el `codigoSugerido` del documento ni una elección a mano, y `CtpFleteModal` lleva `sugerirActivo={!flete}` porque su `contratoId=null` es una elección deliberada. Verificado en navegador: elegido en el CTP, aparece en el LO-TH; menú en portal (la tarjeta tiene `overflow-hidden`) y acotado a la pantalla (se salía 172 px por la izquierda a 400 px).
### [applied] 2026-09-19 — **El aviso de una vista era invisible**: punto de 6 px con `aria-hidden` en `libro-chrome.tsx`, sin decir cuántos y sin anunciarse a un lector de pantalla. Ahora es el mismo badge numérico del grupo + `sr-only` con el conteo. Lo destapó el pendiente de corridas sin materia prima, que llevaba meses sin poder encenderse.
### [applied] 2026-09-19 — **Las dos reglas de «sin origen», unificadas** (`0c8ae9a95`): `analizarRadar` miraba sólo el volumen de consumo e ignoraba los reprocesos (ADR-316), acusando de huérfana justo a la corrida reprocesada. Ahora usa `corridaSinOrigen`. Ninguna cifra cambia en Blas hoy; el test nuevo falla con HEAD.
### [applied] 2026-09-19 — **El chip de permiso en los libros hermanos** (`1572132c6`): Lotes de aserrío, Trámites y oficios (cubre Plantaciones, mismo LibroChrome) y Herramientas forestales. Acopio de cacao descartado a propósito: no es forestal. **Honesto**: en esos tres el chip es informativo — ningún libro lee `useContratoActivo()` para filtrar; la única lectura que hace algo vive en `SelectorContrato`.
### [applied] 2026-09-19 — **El gate de anidado ya no cruza por nombre** (`e6ca252cf`): `origenDe()` resuelve el import y sólo acusa si el archivo coincide; sin poder resolver, conserva la sospecha. Fixture de 3 archivos: el viejo reportaba 2 roturas (una falsa), el nuevo 1, la real. **Al arreglarlo apareció el riesgo contrario y por poco se commitea**: comparando rutas como strings el gate dejaba de detectar las roturas DE VERDAD. El test cubre las dos caras.
### [applied] 2026-09-19 — **El cierre nombra la madera declarada sin trozas** (`b3771abbe`): `agregarSinOrigen` devuelve el detalle (línea, fecha, producido, unidad, m³ declarados) ordenado por lo declarado, y la observación agrega «N declaran X m³ de entrada sin una sola troza» — y calla cuando ninguna declara. En Blas: **5 de 14 declaran 142,26 m³**. La lista una-por-una con botón YA existía en `CtpVincularEnTandaModal`; lo que faltaba era la cifra.
### [pending] 2026-09-19 — **`materiaPrimaRef` NO significa que haya origen**: en Blas las **14** corridas sin origen tienen lote anotado (14 de 14), y aun así ninguna tiene un solo consumo atribuido. Usar ese campo como proxy de «ya tiene materia prima» descuenta justo las 5 peores —las del 01/08 que declaran 142,26 m³ sin una troza— y deja el conteo en 9. Verificado por SQL directo: 15 corridas, 14 sin origen, 85,4427 m³ producidos. La única regla es `corridaSinOrigen` (aristas de consumo/reproceso).
### [pending] 2026-09-19 — **El chip de permiso no filtra nada todavía**: se elige y se propone al registrar, pero ninguna pantalla acota sus datos al permiso activo. «Ver sólo lo de este contrato» es el paso que lo vuelve una herramienta de trabajo y no un cartel.
### [applied] 2026-09-19 — (duplicado de la línea de arriba, ya resuelto en `e6ca252cf`; descartado el 24-09) **El gate de anidado HTML cruza componentes por NOMBRE**, sin mirar de qué archivo vienen: dos `Etapa` distintos (uno exportado en `historia/EtapasDelLote`, otro privado en `LothTraceResumen`) daban 2 roturas falsas y bloqueaban el commit. Se desambiguó renombrando el privado a `PasoDelEmbudo`, pero el gate sigue pudiendo dar el mismo falso positivo con el próximo par de homónimos: debería resolver el import.
### [pending] 2026-09-19 — **El selector no dice cuándo lo llenó el permiso activo**: cuando el valor viene de `codigoSugerido` hay aviso, pero cuando lo pone el contrato activo no se distingue de una elección propia. Un texto tipo «Propuesto por el permiso activo» lo cierra.
### [pending] 2026-09-19 — **Blas real: 14 de 15 corridas sin materia prima atribuida, 85,44 m³** (medido contra la base, no estimado). 5 de las 14 declaran volumen de entrada (27,52 · 67,69 · 6,38 · 5,41 · 35,26 m³, todas del 01/08) y ni una troza. Cuatro meses cerrarían con la observación: 2025-10 (1), 2026-06 (2), 2026-08 (10), 2026-09 (1). **Corrige el «14 de 14» del 09-15**: desde el 16-09 una corrida recibió consumo.
### [pending] 2026-09-15 — **El destinatario del apartado es texto libre**: `ForestCtpApartado.para` sin FK, igual que el destinatario de la guía. El `datalist` de nombres ya usados tapa el síntoma, no la causa. Se arregla junto con la FK de la guía (entrada de abajo): un solo modelo de cliente para apartar, despachar y cobrar.
### [pending] 2026-09-15 — **`CtpProductosDisponibles.tsx` ~1.980 líneas** contra el estándar de ~300: se extrajeron los avisos y el orden, falta sacar la fila de la tabla y los KPIs. Es el componente más grande del libro.
### [applied] 2026-09-15 — **Dictado más fino + leer al revés** (`ADR-419`) y **modales como ventana** (`fba544453`, ADR-420). Fracciones/centenas/«por»/homófonos en el parser, lectura inversa con guarda de tanda, y mover/achicar/fijar en los 167 `AdminModal` + los 8 modales a mano del forestal.
### [pending] 2026-09-15 — **~95 modales a mano sin cablear como ventana**: quedan los de documentos (10), POS (8), inventario (6), compras (2) y los 33 de `components/admin`. Son 5 líneas por archivo y el hook ya lo soporta; el patrón está en `CtpProducirSinLoteModal`. **Ojo**: en varios el `ref`/`role="dialog"` está en el velo y hay que moverlo a la caja de adentro primero.
### [pending] 2026-09-15 — **Con el modal fijado, el scroll de atrás sigue bloqueado** (`react-remove-scroll` de Radix). Se puede tocar y leer lo que está a la vista, pero no scrollear a otra parte — que es media función de «fijar para seguir trabajando».
### [pending] 2026-09-15 — **El audio real del dictado nunca se probó**: el Chrome de Playwright devuelve `getVoices() = 0`, así que el orden de lectura se verifica interceptando `speak` y el timbre/velocidad quedan sin probar. Hace falta una pasada a mano de Brandon con parlante.
### [pending] 2026-09-15 — **El puntaje sigue premiando la inactividad**: sin despachos, 3 de 5 categorías dan 0 y un CTP que no mueve nada puntúa mejor que uno que despacha bien. Falta normalizar por total (el modelo ya guarda `totalIngresos`).
### [pending] 2026-09-15 — **El tope de 25 borra la escala**: 5 casos y 50 restan lo mismo; validar 16 de 21 no mueve el puntaje. Hay test que lo fija como deuda conocida.
### [applied] 2026-09-19 — **`corridasSinOrigen` cableado**: `ForestCtpDB.contarCorridasSinOrigen` + `GET /api/admin/forestal/ctp?sinOrigen=1` + `agregarSinOrigen` (pura, 6 tests) alimentan el pendiente que estaba fijo en 0. Cuenta en el servidor con LA regla (`corridaSinOrigen`), sin bajar el grafo. Medido en QA: 5 corridas / 14,2525 m³ en el año, 2 / 5,4335 en el trimestre de la pantalla; el grafo del Radar da los mismos 5 por la otra vía. Navegador: la pestaña Producción enciende su aviso y el cierre de agosto ya observa «1 corrida sin materia prima atribuida». 0 errores de consola.
### [pending] 2026-09-15 — **Destinatario, conductor y vehículo son texto dentro del JSON de la guía**: sin FK no hay «qué le despaché a este cliente», ni saldo ni precio por cliente. El patrón existe en el mismo modelo (`duenoParteId`). Requiere migración.
### [pending] 2026-09-15 — **Tres P2 de la auditoría de lotes** (sin reproducir, razonados sobre el código): el `FOR UPDATE` va sobre la corrida y no sobre las trozas; los 3 pasos de escritura no son atómicos si falla el tercero (esa madera se podría consumir dos veces); una troza de otro tenant se descarta en silencio.
### [pending] 2026-09-15 — **La plata a medio camino**: el costo ya entra con la guía, pero falta que llegue al m³ producido y al margen por venta (Rentabilidad tiene 260 líneas sin base; `ForestCuentaMov` en 0).

## Producir sin lote — ideas medidas (2026-09-14 noche, datos reales de Blas)

### [applied] 2026-09-14 (sin commitear) — Cargar piezas con la caja de dictado primero y herramientas agrupadas; campo Código con sugerencias de trozas disponibles (guías recibidas, «-» = sin código, interno); detalle flotante por día (portal en el diálogo, «sin trozas vinculadas» = `corridaSinOrigen`). 2 revisores, 6 defectos arreglados, navegador 0 errores.
### [pending] 2026-09-14 — **Dos reglas de «corrida sin origen»**: Consumos y el detalle del día usan `corridaSinOrigen` (consumos + reprocesos); el Radar (`analizarRadar`) mira sólo el volumen de consumo y no cuenta reprocesos. En Blas da igual (14), con una corrida nacida de reproceso diverge.
### [pending] 2026-09-14 — `CubicadorTrozas.tsx:408` tiene su propia caja de dictado: no recibió la disposición nueva (herramientas dentro de la caja).
### [pending] 2026-09-14 — `CtpSemanaDeRegistro.tsx` en 517 líneas (tope ~300): extraer el casillero a su componente.

### [applied] 2026-09-15 — La especie ahora se exige y se elige en el modal (`lib/forestal/especie-del-asiento.ts`, 6 tests); el permiso se propone desde los códigos (`permisoDesdeLosCodigos`, 6 tests). Commits `f31b43f3` y el del SNIFFS.
### [resuelto] 2026-09-14 — **La única producción sin lote real quedó sin especie ni permiso** (corrida N.º 28 del 10/09: 6 paquetes, 0,2417 m³, `speciesCommon` null, `originCode` null). El modal deja registrar con «Sin especie declarada». Propuesta: pedir la especie (o sacarla de los códigos de troza del cubicado) antes de «Registrar producción», y avisar si falta el permiso.
### [applied] 2026-09-15 — Hecho: el campo dice de qué permiso son los códigos y ofrece usarlo; con dos permisos no elige.
### [resuelto] 2026-09-14 — **Permiso sugerido desde el código de troza**: cada código lleva a UNA guía (0 códigos en más de una guía, 24 guías, 3 permisos, 0 trozas sin permiso), así que los códigos escritos en el cubicado pueden proponer el permiso a vincular. 6 de 14 corridas reales no tienen permiso.
### [applied] 2026-09-15 — `proponerVinculacion` arma la propuesta (trozas, guía, permiso, m³ y faltante al 56 %) y el modal de vincular se abre con ella. **Midiendo apareció por qué nadie vinculó nunca: el modal escribe por `sumar-corrida`, que exige un lote con piezas libres, y en Blas hay 20 lotes sin piezas libres y 0 de 160 trozas con lote — el selector salía SIEMPRE vacío.** Falta armar el lote desde la propuesta: ésa es la siguiente.
### [resuelto] 2026-09-14 — **Vincular la materia prima desde los códigos escritos**: 0 de 14 corridas tienen trozas atribuidas y las 160 trozas (197,6 m³) siguen en patio sin consumir. Los códigos internos del cubicado podrían PRE-armar la vinculación (`CtpVincularMateriaPrimaModal`), que sigue siendo un acto aparte y explícito (I1–I6, T1).
### [pending] 2026-09-14 — **49 de 160 trozas sin código real**: la guía 019-001-0000013 guarda `codificacion = "-"` en sus 49 trozas. Las sugerencias por código cubren 111; para las otras falta `codigoPlanta` (0 cargados) o renumerar (ya existe `trozas/renumerar`).
### [pending] 2026-09-14 — **Rendimiento por troza**: con código por pieza y `volumenM3` de cada troza se puede mostrar, en el paso Declarar, cuánto salió de cada troza contra su volumen (tope del 56 %). Sin medir cuántas piezas por código cargaría un parte real.
### [pending] 2026-09-15 — **Armar el lote de aserrío desde la propuesta de vinculación**: es el paso que hoy corta la cadena. Con los códigos ya resueltos a trozas, guía y permiso, falta crear el lote con esas trozas para que «Vincular materia prima» pueda confirmar. Sin esto la propuesta se ve pero no se puede aplicar.
### [pending] 2026-09-15 — **Dos corridas con cifras imposibles ya escritas en el libro** (N.º 26: 141 piezas en 0,0010 m³; N.º 24: 141 en 0,0090). El aviso nuevo las señala, pero **corregirlas es un acto aparte** que todavía nadie hizo.
### [pending] 2026-09-15 — **9 de 14 corridas sin volumen de entrada ni rendimiento**: el libro no puede mostrar el coeficiente que SERFOR mira. Las 5 que sí lo tienen dan 52-55 %.
### [pending] 2026-09-15 — **27 de 33 paquetes sin medidas** (espesor/ancho/largo): sin ellas no se puede recalcular el volumen ni imprimir una lista de empaque, y el freno de cifras imposibles cae al criterio flojo.
### [pending] 2026-09-15 — **Códigos de paquete heterogéneos**: van de `2026-032` (que parece un permiso) a `SL-6`; 19 de 33 son numéricos. Un código con forma fija (fecha + turno + correlativo) y renumerar.
### [pending] 2026-09-15 — **Al reabrir «Producir sin lote» lo cubicado de la vez pasada sigue ahí sin decir de cuándo es** (medido: 1 pieza sobrevivió a Escape y reapareció). Riesgo de declarar la jornada del sábado con fecha del lunes.
### [pending] 2026-09-14 — Comando de voz «código veinticinco» para fijar el código mientras se dicta (hoy sólo especie, dueño y medidas fijas tienen comando).
### [pending] 2026-09-14 — **Recibir las guías pendientes**: el campo Código sólo sugiere trozas de guías recibidas (mismo corte que el patio), y en Blas eso deja 7 de 111 códigos reales: 104 están en guías sin recepción (21 guías `pendiente`, varias sin `fechaRecepcion`). Recibirlas en la bandeja de recepción las haría aparecer — y es también lo que le falta al patio.

## Aplicadas en sesión 2026-09-14 (tarde: producto verificado en navegador)

### [applied] 2026-09-14 (`560cb51b`) — Aviso de caja abierta: `lib/caja/caja-abierta.ts` (días de calendario de Lima) + `AlertsDB.cajaAbiertaDesde` + banner «Cuadrar caja» → `?tab=ventas-caja&vista=arqueo` (clic medido: 0,4 s). Abrir/cerrar caja invalida el resumen. El negocio real tiene 1 caja abierta desde el jueves 11/06 (95 días).
### [applied] 2026-09-14 (`08c18c45`) — Almacenero sin 403: la precarga del panel y la campana/hub de notificaciones gatean con `puedePedir`. Navegador QA: 3 × 403 + 3 errores de consola → 0 y 0; admin sigue con 200.
### [applied] 2026-09-14 (`85e5a3ef`, `3ba47215`) — 0 avisos de eslint en page.tsx, DailyGoalTracker y MetasLogrosModule (foco explícito en vez de `autoFocus`, fallas registradas en logger). Metas, Inicio del vendedor, Catálogo y Repartidores recuerdan su vista en `?vista=` (link directo, clic y «atrás» verificados).
### [applied] 2026-09-14 (ADR-415, sin commitear) — **Metas y tareas compartidas entre negocios** → tablas `AdminGoal`/`AdminTask` por tenant, SQL aplicado, e2e 11/11. Era: `lib/file-store.ts` guarda `goals` y `tasks` en `local-data/<key>.json` sin `tenantId`; los admins de todos los tenants leen y escriben la misma lista (auditoría security del barrido de errores, confirmado por código). Arreglo: clave por tenant o modelo Prisma; decidir qué pasa con los datos ya compartidos.
### [applied] 2026-09-14 (sin commitear) — Guarda de «carga vieja que pisa lo optimista» en 11 pantallas más (13 con Tareas y Metas); cada test falla con HEAD. POSView y `minimizedIds` del chat: falsos positivos. Detalle en memoria `carga-vieja-pisa-lo-optimista`.
### [pending] 2026-09-14 — `"use cache"` + `revalidateTag(tag, "max")`: la doc de Next 16 que trae el paquete (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md:20,136`) dice que sirve lo viejo en la próxima visita y que las rutas API que necesitan vencer al instante pasen `{ expire: 0 }`. **Sin resolver.** En dev la promo creada apareció en el GET siguiente aunque `PromotionsDB.add` NO invalida la caché → en dev la lectura ni pasó por la caché, así que esa medición no prueba nada (lo marcó el revisor; el código de Next sí entrega lo marcado como viejo: `revalidation-utils.js`, «return this stream, even if it's stale»). Medir con `next build && next start` (o dev con `NEXT_PRIVATE_DEBUG_CACHE=1` y buscar `had stale tag`) antes de tocar las 34 llamadas en 14 archivos (`PromotionsDB`, `CampaignsDB`, `finance.db` `safeRevalidate`). Aparte: `PromotionsDB.add` no invalida → con caché activa una promo nueva tardaría hasta 5 min en la lista. Si se confirma, afecta a PromotionsTab (eliminar/pausar recargan), MarketingAutomationTab (crear/cambiar estado) y la plantilla nueva de PuntoCompraView.
### [pending] 2026-09-14 — POSView: tras vender, `fetchProducts()` sin guarda; un GET en vuelo de antes puede pintar el stock anterior (deducido, sin medir).
### [pending] 2026-09-14 — **Avisos en vivo del panel no cruzan instancias en Vercel**: `lib/sse-emitter.ts` es un Map en memoria (`globalThis`), así que `emitAdminSSE` (p. ej. `app/api/orders/route.ts:1006` al entrar un pedido) sólo llega a los `/api/admin/sse` abiertos en la MISMA instancia. `notifications/stream` lo compensa consultando la base cada 5 s por pestaña abierta (24 consultas/min). Medido por código, no en producción. Esa noche se borró `SSEListener` (escuchaba con `onmessage` eventos con nombre: nunca recibió nada) y el stream pasó a reconectar con espera creciente.
### [applied] 2026-09-14 (ADR-416, sin commitear) — RRHH: hoja semanal con ganado por día + PDF con firma; fotocheck con foto y QR a la ficha. e2e semanal S/ 555 exacto; e2e fotocheck upload/PDF/quitar verde.
### [applied] 2026-09-14 (sin commitear) — Nombre y logo del negocio en los PDF: `GET /api/admin/membrete` (nombre de Ajustes → nombre registrado del tenant; logo de Ajustes → logo del tenant). `main` decía «FOTOCHECK» sin nombre: ahora «BULEJE» en el fotocheck y en la hoja semanal (medido con `pdftotext`). Logo sin probar con datos reales: ningún negocio tiene uno cargado.
### [pending] 2026-09-14 — Fotocheck: página pública de verificación del QR (hoy lleva a la ficha con login; por Ley 29733 no se expuso nada).
### [applied] 2026-09-14 (`d9e2e549`, `c1ffc99c`, `ad50ca90`, subidos) — ADR-415, ADR-416 y la sonda del dev launcher commiteados y subidos.
### [pending] 2026-09-14 — **Producción: aplicar `prisma/migrations/adr-415-metas-y-tareas.sql` antes de subir el código de metas y tareas** (sin tablas, las rutas dan P2021). Confirmar que el `DATABASE_URL` de Vercel es la misma base.
### [pending] 2026-09-14 — `beta-feedback` sigue en `lib/file-store.ts`: ruta pública, sin tenant, y en Vercel no puede escribir (lo detectó `migration-planner`).
### [applied] 2026-09-14 (sin commitear; `lib/admin/metas-tareas.ts` + 6 tests con el reloj a las 20:30 de Lima) — Fechas de metas y tareas en zona horaria de Lima (medido por `migration-planner` con TZ=America/Lima): la plantilla «Meta diaria» creada el 14/9 queda con `dueDate` 15/9, y una tarea que vence el 14/9 aparece vencida a las 09:00 de ese día y se muestra como 13/9 (`new Date("YYYY-MM-DD")` es medianoche UTC).
### [pending] 2026-09-14 — Voseo fuera del panel: ~370 en `components/marketplace` + `app/(store)`, ~166 en superadmin, checkout (zona de peligro), landing y cliente. El panel quedó en tuteo (`93978b2e`); método en memoria `tuteo-panel-barrido-2026-09-14`.
### [pending] 2026-09-14 — **Pase a producción** (CORREGIDO: producción NO es `master`). Producción = deploy por CLI del **2026-07-16 22:35**, commit `7774f5ca` de la rama `prod`, ya contenido en esta rama (+901 commits; `origin/prod` es ancestro → avance directo). Bloqueos medidos: (1) todos los previews de Vercel fallan desde agosto porque `DATABASE_URL` usa `app_user` y el prerender de `/marketplace/__validate__` consulta la base (ADR-114 dice no usar `app_user` en Vercel); (2) 7 de 9 crons nuevos mandan WhatsApp/Telegram/correo, 3 de madrugada en Lima. Riesgos: la caja real de 95 días se cerraría sin conteo la primera noche; 26 migraciones aplicadas a mano sin registrar (todas presentes, 0 que rompan). Plan publicado: https://claude.ai/code/artifact/32bd1a51-c14e-4676-be0a-c09a0b108470
### [applied] 2026-09-14 — 9 módulos anidados con `?sub=` (useSubvistaModulo), verificados en navegador. Quedan con diseño aparte: `AnalyticsBIModule` (pestañas calculadas y padre sin `?vista=`), `ForestalTramites` (vista que depende de estado) y `MarketplaceModule` (vive en dos padres).
### [applied] 2026-09-14 — Errores tragados del panel: `lib/errores/sin-dato.ts` (`sinDato`, `leerJson`, `descartarEsperado`) en los 42 `.catch(() => null)` de `components/admin` + `app/admin`. Quedan ~108 en `app/api` y `lib` (lado servidor, otro criterio de logging).

## Aplicadas en sesión 2026-09-14 (harness contra Claude Code v2.1.270)

### [applied] 2026-09-14 — 8 agent defs reescritos: `model: inherit`, `skills:` precargadas, `frontend`/`tester` con MCP Playwright, sin `maxTurns`/`permissionMode` en constructores, `experimental.cacheTtl: 1h`, rutas absolutas a las memorias de Brandon. Motivo medido: 0 despachos de los defs vs ~110 `general-purpose` con nombre en 11 días.
### [applied] 2026-09-14 — Hook `SubagentStart` (`subagent-start-context.mjs`): todo subagente recibe perfil/tenant/reglas/gates/reporte. Hook `StopFailure` → aviso toast+Telegram cuando el turno muere por error de API. `SessionStart` `compact` re-inyecta branch/handoff.
### [applied] 2026-09-14 — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=0` (los nombrados vuelven a ser subagentes en background), `CLAUDE_CODE_RESUME_INTERRUPTED_TURN=1`, `language: spanish`, `bashOutputMaxChars`/`taskOutputMaxChars` 24000, `bashEditDiffEnabled`; user: `autoContinueAtUsageLimit`, `cleanupPeriodDays: 90`.
### [applied] 2026-09-14 — Skill `verify` → `gates` (libera el `/verify` bundled); `TaskCreate/TaskUpdate` fuera de 6 skills y 4 permisos (Task tools no existen en Fable desde 2.1.268). `team-templates/CONTRACTS/REPORTS/REVIEWS` → `_archive-swarm/`. `AGENTS.md` reescrito al estado real.
### [applied] 2026-09-14 — Ubuntu: `git maintenance` con timers systemd (hourly/daily/weekly); `fsmonitor` no existe en Linux.
### [applied] 2026-09-14 — Ubuntu/WSL: tope de RAM del kernel de 13G para los Bash/Monitor de Claude (`CLAUDE_CODE_TOOL_MEMORY_LIMIT` + `function claude` en `~/.bashrc` que lo lanza en un scope de systemd delegado). Antes: `tool cgroup: disabled (EACCES)`. Un tsc/build desbocado muere con exit 137 en vez de congelar WSL; el boot de sesión muestra si está activo. Rige desde la próxima terminal.
### [applied] 2026-09-14 (commit `50c9fd72`) — **TypeScript 7.0.2 GA está publicado** (`latest`): `npx -p typescript@7.0.2 tsc --noEmit` = 22 s, 2 errores (ambos WIP en `AdminOverlaysLayer.tsx:114-115`). Migrar `typescript@5.9` + `@typescript/native-preview` → `typescript@7` como gate único (`tsc` = nativo Go). Riesgo: divergencias tipo TS2869/TS2783 medidas el 09-09; hacerlo en commit propio con `build-gate` verde.
### [applied] 2026-09-14 (commits `13ece52b`, `2419f560`) — Deps: `next` y `eslint-config-next` 16.2.10; `@playwright/mcp` 0.0.76 + Chromium 1226 descargado. **Prisma ya estaba en 7.8.0** (el rango `^7.4.2` de package.json engañaba: mirar `node_modules/<pkg>/package.json`, no el rango). `vitest` 5 (major) queda afuera: pendiente propio.
### [applied] 2026-09-14 — Barra de estado de Claude Code: `~/.claude/statusline.mjs` + `statusLine` en `~/.claude/settings.json` (refresh 15 s). Modelo · esfuerzo · contexto · caché · límites / RAM libre · uso del tope de 13G de los Bash (y ⚠ si el kernel ya cortó algo) · dev :3000 · rama ±sucios. 54 ms, sin red.
### [applied] 2026-09-14 — WIP de RRHH de la sesión anterior commiteado en 4 partes: `10aa335f` (scripts QA sólo en tenants `-qa`), `e74dfa42` (Tareas en la barra), `832c40fa` (traer desde Adelantos, ADR-414 §6b), `e47a91ba` (almacenero sin 403, `lib/auth/roles-rutas-panel.ts`; `--no-verify` por 2 avisos de eslint previos en HEAD, gates a mano). Subido.
### [blocked] 2026-09-14 — `vitest` 4 → 5: `@vitest/browser-playwright`/`@vitest/browser` sólo en `5.0.0-beta.6` (latest 4.1.10) y `vitest-browser-react` pide `vitest ^4` → el proyecto `vrt` no puede subir. Destraba cuando `npm view @vitest/browser-playwright dist-tags.latest` empiece con 5 y `vitest-browser-react` acepte `^5`. Otros cambios que rompen: mocks limpios antes de cada test (**medido: 0 de 9.948 tests fallan** con `clearMocks: true` sobre Vitest 4, sonda que confirma que la config aplica), `sequential` fuera (3 archivos lo mencionan), `$` en títulos de `test.each/for` sin comillas (25 usos), Node ≥22.12 y Vite ≥6.4 (ya cumplidos).
### [pending] 2026-09-14 — Brandon: correr `/skill-doctor` (skills sin uso y su costo de contexto) y `/doctor` (pendiente desde 08-03). Ambos son comandos de la CLI, no invocables por el modelo.

## Aplicadas en sesión 2026-09-11 (reconfiguración: perfil de Brandon + propuestas con lentes)

### [applied] 2026-09-11 — Perfil del usuario (no existía: 291 memorias, 0 de tipo `user`)
- `perfil-brandon-como-trabaja.md` (cómo escribe, cómo pide, qué elige, cómo reporta bugs) + `propuestas-con-lentes.md` (8 lentes + formato de opción). Referenciadas desde CLAUDE.md (cabecera), `agentic-style.md`, los 8 agent defs y el skill nuevo `ronda-de-mejoras`.
### [applied] 2026-09-11 — `isolation: worktree` quitado de 4 agent defs (contradecía la lección del 08-03).
### [applied] 2026-09-11 — `scripts/barrido-modales-anidados.mjs` (detector transitivo; encontró 4 modales detrás) + regla en `ui-components.md`.
### [applied] 2026-09-11 — IA del producto a la familia Claude 5 con precios verificados en platform.claude.com (Opus 5 $5/$25 · Sonnet 5 $2/$10 · Haiku 4.5 $1/$5 · Fable 5.1 $10/$50).
### [applied] 2026-09-11 — `agent-memory/` de agentes archivados (data-qa, integrator, observer, optimizer) → `_agents-archive/`.
### [applied] 2026-09-12 — Tablero «Radar Buleje» como Artifact privado: https://claude.ai/code/artifact/f4e397ae-cc1a-4aa6-9f65-f3aec4193acf (republicar el mismo archivo del scratchpad o pasar la URL como `url` desde otra sesión).
### [applied] 2026-09-12 — La tira de días en Consumos y Despacho (`seccion`, `maximo`); «hoy» de Lima en 3 pantallas más; consola sin «Failed to fetch» al navegar (`lib/navegacion.ts`). Commit `85e79bf4`.
### [applied] 2026-09-12 — Cámaras: aviso por WhatsApp por lectura (noche/siempre, 1 cada 10 min), «Subir a mano», guía Hikvision en pantalla. Commit `21b7c002`.
### [refuted] 2026-09-12 — «Cerrar un mes en una pantalla» como capstone: YA EXISTÍA entero (`CtpCierreAsistido` + `CtpResumenesSerfor` + `CtpCierrePanel`). Se enlazó desde el resumen por especie y la tira. Lente 2 (construido sin estrenar) antes de proponer.

## Aplicadas en sesión 2026-08-19 (auditoría de poder agéntico)

### [applied] 2026-08-19 — Bug real: auto-learn.mjs y post-edit-dispatcher.mjs truncaban stdin
- `readStdinSync()` leía con un solo `readFileSync(stdin.fd)` dentro de un retry-EAGAIN que devolvía en el PRIMER read exitoso — en un pipe no-bloqueante eso puede ser un chunk parcial. 1080 líneas de `SyntaxError` acumuladas en `auto-learn.errors.log`, siempre con fragmentos de la MITAD de un archivo grande. El dispatcher además fallaba en silencio (sin log) — posible skip silencioso de hex-guard/typography/screenshot/rubric en ediciones grandes.
- Fix: mismo patrón `data`+`end` que ya usaban los 3 hooks hermanos (hex-code-guard/typography-lint/ui-screenshot). Verificado con payload de 448KB por el camino real. Commit `d7153640`.
- **Explica** por qué "Skills sugeridos por compound-learning" no generó nada nuevo pese a las 500+ archivos de forestal/adelantos/admin de las últimas semanas — vale la pena revisar en una próxima sesión qué patrones detecta ahora que el pipeline no está roto.

### [applied] 2026-08-19 — Poda skill `review` (redundante con `/code-review` built-in). Commit `c9267a0d`.
### [applied] 2026-08-19 — Skill `commit` afilado con sección de reorganización masiva (>50 archivos) — lecciones de la sesión de 555 archivos → 13 commits. Commit `b840769d`.
### [applied] 2026-08-19 — `agentic-style.md`: nota sobre scope de forks (heredan la meta grande del padre, pueden commitear en paralelo si no se les prohíbe explícito). Commit `b840769d`.

### [pending] `/doctor` quincenal — sigue sin correr (pendiente desde 2026-08-03+). Es un comando de la CLI, Brandon tiene que dispararlo él (no invocable vía Skill tool).

## Aplicadas en sesión 2026-07-06 (tune PC + harness)

### [applied] 2026-07-06 — Edge AutoLaunch bloqueado PERMANENTE
- Se había re-agregado solo tras quitarlo el 07-04 (Edge lo re-crea al actualizar).
- Fix durable: Run key removido + policy HKCU `StartupBoostEnabled=0` + `BackgroundModeEnabled=0` → Edge ya no puede re-registrarse.

### [applied] 2026-07-06 — Scheduled tasks bloat Windows disabled (sin admin)
- ASUS Update Checker + AsusSystemAnalysis (telemetría), OneDrive Reporting ×3 (todos los SIDs), GoogleUserPEH ×3 (Platform Experience Helper).
- `ASUS Optimization` se DEJÓ (puede manejar Fn keys). Updaters de Edge/Google se dejaron (seguridad).

### [applied] 2026-07-06 — WSL slim: servicios inútiles disabled
- tailscaled (túnel en "stopped", solo quemaba 72MB + red) · cloud-init ×4 (+ `/etc/cloud/cloud-init.disabled`) · landscape-client · apport · motd-news.timer.
- Revertir: `sudo systemctl enable --now <svc>`.

### [applied] 2026-07-06 — Telemetría de agentes reparada
- `subagent-cost-log.mjs`: payloads con `agent_type:""` generaban líneas basura (95 en jsonl + bucket `""` en agregados). Fix: fallback que trata `""` como ausente + descarte de payloads fantasma con muestra en errors.log. Datos históricos purgados.

### [applied] 2026-07-06 — RAG re-indexado (estaba stale desde ~mayo)
- `node ~/.local/qdrant/rag/index.mjs` re-corrido. Nota: client 1.13 vs server 1.18 warnea versión pero funciona.

### [applied] 2026-07-06 — Ronda profunda (segunda pasada "sigue profundizando")
- **Windows ronda 2 elevada**: DiagTrack + Xbox ×4 + MapsBroker + RetailDemo + SysMain disabled+stopped · Widgets policy OFF · **SearchHost/Bing web content OFF** (msedgewebview2 362MB→0). Scripts+revert en `C:\Users\Usuario\.claude-tune\`. Windows libre: 8.2→11.4 GB.
- **WSL**: snapd disabled (era lo más lento del boot, 2.9s) · journal cap 100M (-334MB) · playwright browsers viejos purgados (-630MB) · apt autoremove.
- **qdrant a systemd**: `qdrant.service` enabled (sobrevive reinicios de WSL, ya no depende del nohup del boot hook) + `qdrant-reindex.timer` semanal (dom 05:00).
- **MCPs a binarios directos** (mata ~190MB de wrapper npm c/u ≈ 700MB/sesión): lsmcp ya parcheado en `.mcp.json`; firecrawl/context7/playwright requieren tocar `~/.claude.json` → **PENDIENTE post-cierre**: correr `python3 ~/.claude/autonomy-setup/mcp-direct-bin-patch.py` SIN sesiones abiertas. El patch también arregla el `--executable-path` de playwright que apuntaba a chromium-1208 INEXISTENTE (browser habría fallado al lanzar).

### [applied] 2026-07-06 — Ronda 3: DISCO (hallazgo mayor)
- **32.4 GB de swap.vhdx huérfanos de WSL borrados de `%TEMP%`** (C: 45→83 GB libres). Causa raíz: swap sin ruta fija → `.wslconfig swapFile=D:\WSL\swap.vhdx`. Prevención: Storage Sense ON.
- VHDX 69.7GB físicos vs 37GB internos → RunOnce `WSLSetSparse` al próximo logon (verificar: debería bajar a ~40GB). fstrim corrido + timer armado.
- Defender: exclusión D:\WSL + vmmemWSL (menos IO en cada write de la VM) · DODownloadMode=0. Reverts en `.claude-tune\revert-ronda3-*.ps1`.
- Inventario stale detectado: Tor/BlueStacks/PandoraFMS/LastPass/Docker Desktop YA NO están instalados.

### [applied] 2026-07-13 — Verificación post-reboot + fixes derivados
- swap ✅ 8G activo · qdrant.service ✅ active · **fstrim.timer estaba MUERTO en WSL2** (`ConditionVirtualization=!container`) → override en `/etc/systemd/system/fstrim.{timer,service}.d/wsl.conf`, ahora active, próxima corrida dom 05:04.
- vhdx sigue en **70GB** (sparse nunca se aplicó; RunOnce original desapareció sin log) → **RunOnce `WSLSetSparse` re-armado** (`wsl.exe --manage Ubuntu --set-sparse true` al próximo logon de Windows). Verificar tamaño en ~1 semana (sparse+fstrim reclaman gradual).
- **MCP patch ahora auto-ejecutable**: `mcp-patch-oneshot.timer` (systemd user, cada 10min) corre `mcp-direct-bin-patch.py` apenas no haya sesiones claude y se auto-desactiva. Ya no depende de que Brandon lo corra a mano.
- Playwright: chromium-1208 fantasma (0 bytes) purgado; el real es 1223. Hook `session-start-autonomy.mjs` ahora resuelve el chromium dinámicamente (no más "not_installed" falso).

### [applied] 2026-08-03 — qdrant client ya está en ^1.18.0 (verificado en ~/.local/qdrant/rag/package.json; se aplicó en la ronda Ubuntu del 07-13 y la entrada quedó duplicada).

### [pending→nota] Telegram bot: evaluar si el tool nativo `PushNotification` del harness ya cubre el push al móvil antes de armar bot.

## Aplicadas en sesión 2026-04-28

### [applied] 2026-04-28 — OOM cap tsc bajado a 4096 MB
- post-tool-tsc.mjs: `--max-old-space-size=12288 → 4096`. Causaba OOM en WSL (tope 10 GB).

### [applied] 2026-04-28 — stop-alert-sound.mjs neutralizado
- Antes lanzaba explorer.exe (YouTube) + powershell.exe (beeps). Robaba foco al terminal.

### [applied] 2026-04-28 — MCPs no usados desactivados
- `~/.claude.json`: Twilio + Resend movidos a `mcpServers_disabled`. Backup en `~/.claude.json.backup-*`.
- Para reactivar: `python3 -c "import json; d=json.load(open('/home/usuario/.claude.json')); d['mcpServers']['twilio']=d['mcpServers_disabled'].pop('twilio'); json.dump(d, open('/home/usuario/.claude.json','w'), indent=2)"`

### [applied] 2026-04-28 — N+1 en StoreReviewsDB.listByStoreId
- `lib/db/store-reviews.db.ts`: paralelizado top-N reviews + groupBy de ratings (antes era 2 queries seriales con findMany completo). Latencia esperada: ~50% menos. Memoria: ~10× menos en stores con muchas reseñas.

### [applied] 2026-04-28 — DB pool warmup en boot
- `instrumentation.ts`: SELECT 1 fire-and-forget en startup. Elimina cold start de pgBouncer (~720ms en primera request) → primera request real ya tibia.

### [applied] 2026-04-28 — post-edit-ui-screenshot debounce 5s
- Agregado mismo patrón que post-tool-tsc. Evita 5 chromiums paralelos en bursts de edits UI.

### [applied] 2026-04-28 — Sonnet/Haiku routing para subagentes
- Memoria `feedback_model_routing.md` con tabla por tipo de tarea. Usar `model: "sonnet"` en subagentes mecánicos.

### [applied] 2026-04-28 — React Compiler (annotation mode)
- `babel-plugin-react-compiler@1.0.0` instalado.
- `next.config.ts`: `experimental.reactCompiler = { compilationMode: "annotation" }`.
- **Cero impacto** sobre componentes que NO usen `"use memo"`. Para activar en un componente: agregar `"use memo"` arriba.
- Dev server health-check post: ok, 118 ms.

## Bloqueadas

### [applied] Schema drift — RESUELTO TOTAL (2026-06-10, auditoría integral)
- DIRECT_URL funciona (psql directo OK desde esta red). 13 migraciones registradas con `migrate resolve`, phantom reconstruida, drift-fix 1+2 aplicados (9 tablas creadas). `prisma migrate status` → up to date · `db:drift` → 0/0/0 faltantes.

### [blocked] 2026-05-02 — 4 migrations may-2 pending Supabase prod
- **Migrations:** add_delivery_sos_alert / add_delivery_partner_score / add_payment_approval / add_payment_approval_link.
- **Root cause confirmado (3 bugs encadenados):**
  1. `DIRECT_URL` tiene `$` literal en password sin URL-encode (P1013).
  2. Aún encoded, DNS WSL no resuelve `db.<ref>.supabase.co` (P1001 — IPv6 missing).
  3. Pooler (`pgBouncer transaction`) acepta conexión pero timeout en `migrate deploy`.
- **Workaround disponible:** `scripts/apply-may2-migrations.sql` (commit `ff3fecfe`) — pegar en Supabase SQL Editor (idempotente, registra en `_prisma_migrations`).
- **Verificación automática:** routine cloud `trig_016QQYSckqyzQy8wHyDh35K9` corriendo + programado sábado 9-may. Si tablas existen → abre PR para limpiar el raw SQL workaround en `lib/db/order-payment-link.db.ts`.

---

## Aplicadas en sesión 2026-05-02

### [applied] 2026-05-02 — WhatsApp Concierge AI multi-vendor + Recommend handler
- Cross-tenant marketplace search (`lib/whatsapp/concierge/cross-tenant-search.ts`).
- Multi-vendor checkout split por storeId con idempotencia (`multi-vendor-checkout.ts`).
- Handler IA de recomendaciones con `smartModel` natural-Peruvian (`recommend.handler.ts`).
- Intent `recomendar` agregado al clasificador (`ai-intent.ts`).
- Endpoint dev `/api/whatsapp/concierge/test` + smoke E2E `scripts/test-whatsapp-concierge.mjs`.
- Setup guide `WHATSAPP_SETUP.md`.

### [applied] 2026-05-02 — Yape Vision close-loop superadmin
- Vision IA Claude Sonnet 4.6 (`lib/ai/yape-vision.ts`) con cost-control.
- DB class self-bootstrapping `lib/db/payment-approval.db.ts`.
- Webhook Twilio + Meta `/api/whatsapp/yape-capture`.
- UI superadmin `/superadmin/pagos-yape` con polling + optimistic + zoom + reject modal (812 líneas).
- Loop cerrado: approve → `OrdersDB.update` → `notifyYapeApproved` por WhatsApp.
- Helper read-only `lib/db/order-payment-link.db.ts` (raw SQL fuera del danger zone, schema drift workaround).

### [applied] 2026-05-02 — Delivery Dashboard 2.0
- 5 widgets: EarningsTodayHero / RiderScoreCard / HotZonesPanel / StreaksAndBonusCard / ChatAndSOSPanel.
- 4 endpoints `/api/delivery/{hot-zones,me/score,me/sos,me/streaks}`.
- 4 DB classes (delivery-hot-zones / score / sos / streaks).
- `PartnerDashboard.tsx` reorganizado en 3 secciones (HOY · OPORTUNIDADES · PROGRESO).

### [applied] 2026-05-02 — i18n Quechua + AutoTranslator DOM-walker
- Locale type extendido a `es | en | shi | qu` (Runa Simi chanka).
- Overlay `lib/i18n/translations-qu.ts` (204 líneas hand-translated).
- `lib/i18n/auto-translator.ts` con 3 capas (dict / localStorage / MyMemory API).
- `<AutoTranslator>` DOM walker con WeakMap + MutationObserver — traduce nodos no-instrumentados al cambiar locale.
- `<T>` wrapper inline para Server Components.
- Migración `t()` en 12 archivos landing/footer/nav.

### [applied] 2026-05-02 — Provider AI fallback chain
- `lib/ai/provider.ts`: Anthropic Haiku 4.5 > Groq llama-3.3-70b (free 14k req/d) > OpenAI gpt-4o-mini.
- Auto-detect por env vars en startup.
- Groq como OpenAI-compatible via `createOpenAI({ baseURL })`.

### [applied] 2026-05-02 — Admin sidebar "buleje" theme + nav links
- Theme `buleje` (slate-deep + teal #00B4A6) en `SidebarTheme` union.
- Default nuevos tenants en `buleje` (`lib/admin-template.ts`).
- Cristal/shaded auto-rerouted a buleje render.
- Nav: "Pagos Yape" + "Catálogo variaciones" en SuperAdminShell.

### [applied] 2026-05-02 — Polish surface storefront
- Theme: hard-reload siempre en light (sessionStorage en vez de localStorage).
- Lenis smooth-scroll lerp 0.085 (Beast Philanthropy / Apple-style float).
- Keyframe `pulse-subtle` para StreaksAndBonusCard active bonuses.
- ScrollProgressBar 3px teal (estilo Stripe/Notion/Linear).
- RecentlyViewedDrawer redesign (centered + blur-md fuerte).

### [applied] 2026-05-02 — CSRF exempt /api/whatsapp/*
- Meta no envía cookies en webhooks; HMAC X-Hub-Signature-256 ya protege.
- Antes: 403 silencioso bloqueaba cualquier POST de Meta.

### [applied] 2026-05-02 — i18n LocaleToggle qu records
- 3 records faltantes después del upgrade del Locale type. tsc gate desbloqueado.

---

## Pendientes (próximas sesiones)

### [pending] 2026-04-28 — Telegram bot setup (necesita input Brandon)
- **Acción manual:** ver `/setup-autonomy` Bloque 3.
- **Beneficio:** notificación push real al móvil cuando termina trabajo largo.

### [applied] 2026-05-03 — Playwright deps instaladas
- libnss3 + libatk + libcups + libxkb + libgbm + resto del set chromium ya en sistema.
- npx playwright --version → 1.58.2 funcional.

### [applied] 2026-05-03 — Tesseract OCR instalado
- tesseract-ocr 5.3.4 + tesseract-ocr-spa (español + inglés + osd).
- Verificado: `tesseract --version` ok.

### [applied] 2026-05-03 — GitHub CLI autenticado
- `gh auth login` completado vía device code. Token con scopes: gist, read:org, repo, workflow.
- Habilita PRs/issues automáticos desde Claude.

---

## Tecnologías nuevas a evaluar

### [applied] 2026-07-13 — Modernización agéntica (deep-research verificado)
- Investigación con workflow deep-research (24 fuentes, 120 claims) + agente claude-code-guide; 11/12 claims clave re-verificados contra changelog oficial.
- Aplicado: `.claude/rules/agentic-style.md` bullet F (subagentes background default + anidados ×5, additionalContext en Stop hooks, Tool(param:valor), .claude anidados, /doctor, LSP nativo NO existe → lsmcp sigue) + CLAUDE.md regla 15 actualizada a v2.1.205 + memoria `claude-code-novedades-2026-07.md`.
- Ubuntu: fstrim override WSL2 + RunOnce sparse re-armado + mcp-patch-oneshot.timer + qdrant client 1.13→1.18 (RAG verificado OK) + ast-grep 0.44 + symlink `fd`.

### [applied] 2026-07-13 — Ronda 2 "sigue mejorando" (calidad de código + fricción)
- **Bugs reales fijados vía lint:fast**: `state-machine.ts` del concierge WhatsApp tragaba errores de handlers SIN log (ahora `logger.error` con state+intent) · `gift-cards.db.ts` condición duplicada `"cancelled"||"cancelled"` · `predictions/route.ts` filtro redundante · `FinancialResults.tsx` `{sign && sign}` · 2× `delay: 0*0.1`.
- **InicioDashboard.tsx −175 LOC**: 5 cadenas de cálculo muertas que corrían EN CADA RENDER (topCustomers/stockByCategory/sinMov/criticalStock/topProfit) + KPICard/DeltaBadge/COLOR_MAP muertos + imports. 689→514 líneas. Gates: tsgo exit 0 + eslint 0 errores.
- **VRT ampliado a 4 tests** (+ StoreAvatar iniciales + PaymentMethodChip), 4/4 verdes determinísticos.
- **Knip auditado**: de 21 deps "muertas" solo 1 real (`@storybook/test` v8 stale, removido −24 packages). `critters` la exige `optimizeCss` (falso positivo) y el resto SÍ se importa → knip necesita config (entry points next/scripts/storybook) antes de confiar. Fix bonus: `preview.ts` importaba tipo de `@storybook/nextjs` NO instalado (resolvía por hoisting) → `@storybook/react`.
- **Permisos**: +5 patrones (`npx tsc/eslint/oxlint/knip`, `tsgo`) a `permissions.allow` (155→160; backup `.claude/settings.json.bak-perms`). Bash/git/playwright ya estaban cubiertos.
- Nota: BodegueroSpotlight conserva 4 `no-unreachable` INTENCIONALES (UI guardada post-CMS, documentado en el archivo).

### [pending] Correr `/doctor` quincenal (2.1.203+: checkup con auto-fix + propone podar CLAUDE.md). Primera corrida: próxima sesión.
### [applied] 2026-08-03 — knip confiable: `knip.jsonc` con TODOS los falsos positivos documentados con su porqué (storybook webpack loaders, scripts/, critters-por-require-runtime, posthog/embla huérfanos). `npx knip --dependencies` = 0 hallazgos. Borradas 5 deps muertas reales (gsap, vaul, hover-card, select, @types/bcryptjs); `critters` se intentó borrar y se RESTAURÓ (next lo requiere en runtime con optimizeCss — el radar del 07-13 ya lo sabía y el grep de imports no lo ve).

### [applied] 2026-08-03 — RUM de PostHog VIVO por primera vez: el provider huérfano de mayo (nunca montado en toda la historia del repo — `git log -S "<PostHogProvider"` vacío) se reemplazó por `instrumentation-client.ts` (patrón oficial Next 15.3+, pageviews por history_change). Key en .env.local, dominios en la CSP de middleware-utils. Verificado end-to-end: evento en el backend de PostHog vía SQL. Gotcha mayor documentado en memoria: posthog-js descarta eventos de webdriver/headless (`_is_bot()`), la verificación con Playwright exige `opt_out_useragent_filter` (activo solo en dev).

### [applied] 2026-08-19 — `lib/security/csp.ts` borrado (0 importers confirmados por grep). Commit `0a97a3a8`.
### [applied] 2026-08-03 — `no-unused-vars` en CERO absoluto: 518 → 0. Fan-out de 3 subagentes sonnet por scope + remanente a mano; el de admin ejercitó generator≠evaluator anidado (su verifier atrapó 1 hunk ajeno). Bonus: ~1.000 líneas de código muerto real (StoreCard/TopStoresSection/CategoryTreemapView/InventoryAnalyticsDashboard nunca cableados). Lección operativa: los agent-defs con isolation worktree por default hacen que el fan-out anidado branchee de una base de HACE MESES en ramas largas — el barredor lo detectó, descartó 3 worktrees y rehizo directo en el checkout (valida code-quality §5.2).

### [applied] 2026-08-19 — `lib/slo/__tests__/budget-calculator.test.ts` movido a `__tests__/slo-budget-calculator.test.ts` (import cambiado a `@/lib/slo/budget-calculator`). Corrido por primera vez desde que existe: 9/9 verde. Commit `0a97a3a8`.
### [applied] 2026-07-13 — **oxlint** adoptado como pre-check (`npm run lint:fast`)
- Medido en este repo: oxlint **7.6s / 204MB / 506 hallazgos** vs ESLint **98.9s / 1.84GB / 1746 warnings** → 13× más rápido, 9× menos RAM. Instalado como devDep (v1.73).
- Encontró código muerto que el gate no reporta (ej. 6 vars/función sin usar en `InicioDashboard.tsx`). ESLint sigue siendo el gate autoritativo (reglas custom design-tokens + jsx-a11y).
### [applied] 2026-07-13 — **Vitest 4 `toMatchScreenshot`** piloto funcionando (`npm run test:vrt`)
- Deps: `@vitest/browser-playwright` + `vitest-browser-react` + `@tailwindcss/vite`. `vitest.config.ts` ahora usa projects `unit`/`vrt` (unit = suite de siempre, sin cambios; `npm run test` apunta a unit explícito).
- Piloto: 2 single-sources (PaymentMethodIcon custom + ProductPhotoFallback) — baselines ESTILADOS (tokens+Tailwind renderizan vía @tailwindcss/vite) en `__tests__/vrt/__screenshots__/`, 2ª corrida verde en 2.7s, determinístico local.
- Gotchas: 1ª corrida SIEMPRE falla (crea baselines para revisar); yape/plin flaky por onError de logo → usar métodos con arte custom o esperar el load; baselines local ≠ CI (correr solo local o en Docker).
### [pending] **TypeScript 7 GA** (native Go): RC salió jun-2026, GA ~jul-2026. Cuando salga: migrar de tsgo preview a `typescript@7` estable como typechecker principal (mismo motor, sin las divergencias de preview tipo TS2869).

- **Next.js 16 PPR** ✅ ya activo (`cacheComponents: true`)
- **React Compiler** ✅ activo en annotation mode (opt-in) — ojo: `react-hooks/refs` ahora flaggea reads de `ref.current` en `useMemo` (1 caso ya disabled en `SidebarConfigurator.tsx`).
- **Bun runtime**: 3-4x más rápido que Node. Riesgo: incompat con algunos MCPs.
- **Vercel AI SDK 6**: prompt caching automático. Si se usa chat con IA, -70% costo.

---

## Deuda detectada 2026-05-02

### [applied] 410 errors eslint legacy — RESUELTO (re-verificado 2026-06-10)
- `npm run lint` hoy: **0 errores, 0 warnings** (gate de auditoría integral). Los 410 se fueron limpiando en sprints intermedios. Entry stale, cerrado.

## Aplicadas 2026-05-20

### [applied] 2026-05-20 — RLS Postgres híbrido (ADR-114)
- Aplicado via Supabase MCP: Order, Customer, Sale, ActivityLog con FORCE ROW LEVEL SECURITY + 4 policies tenant_isolation_*.
- Payment excluido (sin tenantId → TD-115).
- Tests funcionales 4/4 OK (sin tenant → 0 rows · main → datos propios · __system__ → bypass).
- ⚠️ DATABASE_URL Vercel SIGUE en postgres (BYPASSRLS). NO cambiar a app_user hasta migrar 880 endpoints a withRlsTenant() (TD-116).

### [applied] 2026-05-20 — Suite tests verde (60→0 fallos)
- Mocks marketplace + warehouse-transfers actualizados vs evolución de DB classes.
- Commit 0639a39b · 332 files passed · 4426 tests passed.

### [applied] 2026-05-20 — Q1 perf+SEO+UX (8/8 hechos)
- defer en back-nav-refresh (LCP -20-40ms)
- PromoBanner CLS fix (CLS -0.05-0.12)
- Footer dynamic → import estático (next 16 incompat con ssr:false en server components)
- alt="" reemplazado con descripciones SEO en 2 imágenes featured
- _source.png 884KB movido fuera de public/
- Stats reales debajo del search (X tiendas · Y+ productos · Yape Plin efectivo)
- Subtítulo VISIBLE en mobile con copy "Pedí en 2 min. Pagás cuando llega"
- CTA "Ver todas las tiendas" promovido a botón primario filled verde

### [pending→DESBLOQUEADO 2026-06-10] TD-116 — migrar endpoints a withRlsTx()
- **Infra COMPLETA hoy (commits hasta esta sesión):**
  - Hallazgo: `postgres` tiene `rolbypassrls=true` → `withRlsTenant` viejo era no-op + pitfall SET LOCAL fuera de tx.
  - Fix: `withRlsTx()` en lib/prisma-rls.ts (SET LOCAL + queries en UNA transacción).
  - Políticas fail-open (fase expand) aplicadas — cambiar el rol NO rompe paths sin migrar.
  - Rol `buleje_app` NOBYPASSRLS creado + grants. Credencial: /tmp/buleje_app.env (Brandon la agrega a .env.local/Vercel).
  - Aislamiento VERIFICADO como buleje_app: main=19 · tenant=6 · falso=0 · __system__=80.
- **Lo que queda (orden):** 1) Brandon agrega BULEJE_APP_DATABASE_URL y canary del rol en dev → 2) migrar endpoints a `withRlsTx` por lotes (usar la variante TX, no la vieja) → 3) al 100%, fase contract: políticas fail-closed.

## Deuda detectada 2026-05-20 (post Ola 1/2/3 deps upgrade)

### [applied] 60/4491 tests fallando — RESUELTO (re-verificado 2026-05-26)
- marketplace-tier-discount 8/8, api-marketplace-products + advanced-search + notification-center 57/57 → TODOS PASAN. Fix llegó con 0639a39b (20-may). Entry duplicado/stale, cerrado.

### [historico] 60/4491 tests fallando — sprint dedicado de mocks
- `npx vitest run` reporta 60 tests fallando (1.3% del total).
- **NO causados por upgrade de deps**: `prisma.product.findMany` se llama desde `lib/db/marketplace/orders.db.ts:282` pero el mock del test (`__tests__/lib/db/marketplace-tier-discount.test.ts`) NO incluye `product.findMany`. Fue agregado en `lib/db/marketplace/orders.db.ts` (commit 7eeeb1d0 batch 5) sin actualizar el mock.
- **Distribución de fallas:**
  - 17× `Cannot read properties of undefined (reading '0')` — mock devuelve undefined
  - 14× `Cannot read properties of undefined (reading 'findMany')` — modelo prisma faltante en mock
  - 8× `MarketplaceOrdersDB.getMarketplaceById is not a function` — método renombrado, tests con nombre stale
  - 8× `Cannot read properties of undefined (reading 'catch')` — promise chaining en mock undefined
  - 4× `prisma.product.findMany is not a function` — mismo patrón
  - ~9× misc assertions (cupones, stock, status codes)
- **Tests afectados (sample):** `marketplace-tier-discount.test.ts`, `api-marketplace-products.test.ts`, `api-marketplace-slug.test.ts`, `notification-center.test.ts`, `advanced-search.test.tsx`.
- **Estrategia sugerida:**
  1. Crear helper `__tests__/helpers/prismaMock.ts` con TODOS los modelos × métodos comunes (findMany/findFirst/findUnique/create/update/updateMany/delete/count) devolviendo defaults razonables.
  2. Reemplazar mocks ad-hoc por el helper.
  3. Renombrar `getMarketplaceById` callsites en tests.
- Esfuerzo estimado: 3-5h sprint dedicado.
- **Bypass actual:** `SKIP_VITEST_GATE=1` documentado en commit b26becff.

---

## Skills sugeridos por compound-learning (auto, 2026-05-03)

Detectados 114 patrones con ≥3 co-edits sin skill creado.
Mostrando top 3. Para crear skill: usá `/luis` o decí "crea skill para X".

### [rejected-stale 2026-06-10] pat-coedit-1777240582428-zpqt
- **Tipo:** `co_edit_cluster` (3 occurrences)
- **Files:** `app/api/marketplace/subcategories/route.ts`, `app/tiendas/TiendasClient.tsx`
- **Sugerencia:** Files [app/api/marketplace/subcategories/route.ts, app/tiendas/TiendasClient.tsx] are always edited together. Consider creating a skill that pre-loads all 2 files.
- **Last seen:** 2026-04-26T21:56:22.427Z

### [rejected-stale 2026-06-10] pat-coedit-1777253978825-5eer (TiendasClient ya decompuesto; patrones de abril)
- **Tipo:** `co_edit_cluster` (3 occurrences)
- **Files:** `components/marketplace/PromoBannerRenderer.tsx`, `lib/promo-banners.ts`
- **Sugerencia:** Files [components/marketplace/PromoBannerRenderer.tsx, lib/promo-banners.ts] are always edited together. Consider creating a skill that pre-loads all 2 files.
- **Last seen:** 2026-04-27T01:39:38.824Z

### [pending] pat-coedit-1777254228120-pe6r
- **Tipo:** `co_edit_cluster` (3 occurrences)
- **Files:** `components/superadmin/banners/BannerImageAdjuster.tsx`, `components/superadmin/banners/BannerPreviewStudio.tsx`
- **Sugerencia:** Files [components/superadmin/banners/BannerImageAdjuster.tsx, components/superadmin/banners/BannerPreviewStudio.tsx] are always edited together. Consider creating a skill that pre-loads all 2 files.
- **Last seen:** 2026-04-27T01:43:48.118Z


### [pending] Sweep fire-and-forget → after() en app/api/** (2026-07-17)
El patrón `.catch(() => {})` de la casa MUERE en Vercel serverless (lambda congelada al responder). Ya mordió: webhook WhatsApp perdía TODOS los mensajes entrantes en prod (fix b58a2f34). Grep `\.catch\(` en routes con side-effects post-respuesta (notificaciones, logs de actividad, envíos) y envolver en `after()` de next/server los críticos.

---

## Skills sugeridos por compound-learning (auto, 2026-09-13)

Detectados 14 patrones con ≥5 co-edits sin skill creado.
Mostrando top 3. Para crear skill: usá `/luis` o decí "crea skill para X".

### [pending] pat-coedit-1789273483843-29r4
- **Tipo:** `co_edit_cluster` (5 occurrences)
- **Files:** `components/admin/CashAuditTab.tsx`, `components/admin/ContratosModule.tsx`, `components/admin/FiadosModule.tsx`, `components/admin/ReceivingTab.tsx`, `components/admin/adelantos/lista/TablaAdelantos.tsx`, `components/admin/dashboard/ExpiredBatchesWidget.tsx`, `components/admin/documentos/BulkTagModal.tsx`, `components/admin/documentos/ConfirmarBorrarCarpetas.tsx`, `components/admin/forestal/CubicacionesGuardadas.tsx`, `components/admin/forestal/PlantacionVerticesTabla.tsx`, `components/admin/layout/AdminSidebar.tsx`, `components/admin/pos/OCPrintPreviewModal.tsx`, `components/admin/pos/POSCrossSell.tsx`, `components/admin/pos/POSCustomerSearch.tsx`, `components/admin/pos/POSExpressMode.tsx`, `components/admin/recetas/RecetarioAdminTab.tsx`, `components/admin/shared/AdminCommandPalette.tsx`, `components/admin/shared/AdminDateFilter.tsx`
- **Sugerencia:** Files [components/admin/CashAuditTab.tsx, components/admin/ContratosModule.tsx, components/admin/FiadosModule.tsx, components/admin/ReceivingTab.tsx, components/admin/adelantos/lista/TablaAdelantos.tsx, components/admin/dashboard/ExpiredBatchesWidget.tsx, components/admin/documentos/BulkTagModal.tsx, components/admin/documentos/ConfirmarBorrarCarpetas.tsx, components/admin/forestal/CubicacionesGuardadas.tsx, components/admin/forestal/PlantacionVerticesTabla.tsx, components/admin/layout/AdminSidebar.tsx, components/admin/pos/OCPrintPreviewModal.tsx, components/admin/pos/POSCrossSell.tsx, components/admin/pos/POSCustomerSearch.tsx, components/admin/pos/POSExpressMode.tsx, components/admin/recetas/RecetarioAdminTab.tsx, components/admin/shared/AdminCommandPalette.tsx, components/admin/shared/AdminDateFilter.tsx] are always edited together. Consider creating a skill that pre-loads all 18 files.
- **Last seen:** 2026-09-13T04:24:36.458Z

### [pending] pat-coedit-1789273483843-j0nd
- **Tipo:** `co_edit_cluster` (5 occurrences)
- **Files:** `components/admin/AdminModals.tsx`, `components/admin/CashAuditTab.tsx`, `components/admin/ContratosModule.tsx`, `components/admin/adelantos/lista/AnularAdelantoModal.tsx`, `components/admin/adelantos/lista/TablaAdelantos.tsx`, `components/admin/clientes/ClienteFormModal.tsx`, `components/admin/dashboard/ExpiredBatchesWidget.tsx`, `components/admin/documentos/BulkTagModal.tsx`, `components/admin/documentos/ConfirmarBorrarCarpetas.tsx`, `components/admin/forestal/PlantacionVerticesTabla.tsx`, `components/admin/layout/AdminSidebar.tsx`, `components/admin/pos/InvoiceScannerModal.tsx`, `components/admin/pos/OCPrintPreviewModal.tsx`, `components/admin/pos/POSCrossSell.tsx`, `components/admin/pos/POSCustomerSearch.tsx`, `components/admin/recetas/RecetarioAdminTab.tsx`, `components/admin/shared/AdminCommandPalette.tsx`
- **Sugerencia:** Files [components/admin/AdminModals.tsx, components/admin/CashAuditTab.tsx, components/admin/ContratosModule.tsx, components/admin/adelantos/lista/AnularAdelantoModal.tsx, components/admin/adelantos/lista/TablaAdelantos.tsx, components/admin/clientes/ClienteFormModal.tsx, components/admin/dashboard/ExpiredBatchesWidget.tsx, components/admin/documentos/BulkTagModal.tsx, components/admin/documentos/ConfirmarBorrarCarpetas.tsx, components/admin/forestal/PlantacionVerticesTabla.tsx, components/admin/layout/AdminSidebar.tsx, components/admin/pos/InvoiceScannerModal.tsx, components/admin/pos/OCPrintPreviewModal.tsx, components/admin/pos/POSCrossSell.tsx, components/admin/pos/POSCustomerSearch.tsx, components/admin/recetas/RecetarioAdminTab.tsx, components/admin/shared/AdminCommandPalette.tsx] are always edited together. Consider creating a skill that pre-loads all 17 files.
- **Last seen:** 2026-09-13T04:24:21.617Z

### [pending] pat-coedit-1789273483843-51xr
- **Tipo:** `co_edit_cluster` (5 occurrences)
- **Files:** `components/admin/AdminModals.tsx`, `components/admin/BudgetVsRealTab.tsx`, `components/admin/CouponsTab.tsx`, `components/admin/StoreCustomizer.tsx`, `components/admin/SupplierComparator.tsx`, `components/admin/TurnosModule.tsx`, `components/admin/documentos/ComentariosDoc.tsx`, `components/admin/documentos/MoveToFolderModal.tsx`, `components/admin/documentos/TemplateGenerator.tsx`, `components/admin/forestal/CtpTrozasDeIngreso.tsx`, `components/admin/forestal/DistribucionesGuardadas.tsx`, `components/admin/forestal/PlantacionPasoBloques.tsx`, `components/admin/forestal/TramiteRelacionGuias.tsx`, `components/admin/marketplace/tabs/ProductosTab.tsx`, `components/admin/store-page/CatalogoTiendaTab.tsx`
- **Sugerencia:** Files [components/admin/AdminModals.tsx, components/admin/BudgetVsRealTab.tsx, components/admin/CouponsTab.tsx, components/admin/StoreCustomizer.tsx, components/admin/SupplierComparator.tsx, components/admin/TurnosModule.tsx, components/admin/documentos/ComentariosDoc.tsx, components/admin/documentos/MoveToFolderModal.tsx, components/admin/documentos/TemplateGenerator.tsx, components/admin/forestal/CtpTrozasDeIngreso.tsx, components/admin/forestal/DistribucionesGuardadas.tsx, components/admin/forestal/PlantacionPasoBloques.tsx, components/admin/forestal/TramiteRelacionGuias.tsx, components/admin/marketplace/tabs/ProductosTab.tsx, components/admin/store-page/CatalogoTiendaTab.tsx] are always edited together. Consider creating a skill that pre-loads all 15 files.
- **Last seen:** 2026-09-13T04:22:30.507Z
### [applied] 2026-09-21 — **Un titular, varios permisos** (ADR-425, sin commitear). La entidad ya existía (`ForestContrato`) y **nadie la ataba**: medido en Blas, `titularId` nulo en 6 de 6 y `areaHa` nulo en 6 de 6. Ahora la ficha del Directorio lista, agrega y edita los permisos del titular (suyos · candidatos por nombre para atar en un clic · pendientes del alta), el picker pregunta **con cuál** cuando hay dos o más, el permiso llena el alta de plan diciendo qué completó, y el plan creado se ata a `planId` (columna con 0 usos). Región → 25 departamentos; ARFFS → lo que el tenant ya escribió + «Otra…». Verificado en navegador: alta de ficha + permiso en un guardado → `QA-ADR425-0001 · titularId atado · areaHa 850.25` leído de vuelta por la API; 0 errores de consola; 34 tests nuevos.
### [applied] 2026-09-21 — **Panel «qué le falta a tus permisos»** en Libro CTP → Contratos (sin commitear). Sólo aparece si falta algo y el título trae la cifra («4 de 6 permisos sin área de manejo»); cada fila dice el hueco con palabras y se completa ahí (área, vigencia, ficha del Directorio propuesta por nombre, nunca atada sola). **Orden por m³ amparados** (28,89 → 13,94 → 6,78 → 4,79 → sin movimiento): completar el área de un permiso que amparó 28,9 m³ cambia una cifra hoy; uno sin un ingreso es papeleo. Verificado en navegador con datos reales: `19-SEC/PER-FMC-2024-008` quedó con `areaHa 1250.5`, vigencia 2025-01-15→2027-01-14 y `titularId` atado, y el título recontó 5→4. Chip subido a AA (18:1 light / 14,3:1 dark).
### [applied] 2026-09-21 — **Dar de baja lo creado, con aviso antes** (sin commitear): papelera por fila en el picker del Directorio («Deja de aparecer acá y en los demás selectores. Las guías e ingresos ya emitidos no cambian») y baja de permisos desde la ficha, que **pide `?usos=1` ANTES de confirmar** y dice cuántos documentos cuelgan («No hay nada imputado…» vs «Tiene N documentos imputados (…). Nada de eso se borra»). `ForestContratoDB.darDeBaja` es baja lógica: el índice único del código es parcial, así que el papel se puede volver a cargar.
### [applied] 2026-09-21 — **El alta de plan pide lo que el modelo ya guardaba** (sin commitear): la **UIT viajaba invisible con 5350** (el plan del año siguiente nacía con la UIT del anterior), `notes` no tenía pantalla en ningún lado, el estado no se podía elegir y los 3 costos por m³ sólo se cargaban en Analítica. Más **«Copiar de un plan anterior»**, que trae titular, ARFFS, región, regente, UIT y costos — y nunca número, resolución, parcela ni vigencia. Verificado: el plan creado guardó los 3 costos y la observación.
### [pending] 2026-09-21 — **`ForestParty.tituloHabilitante` y los permisos dicen cosas distintas**: la ficha guarda UN título (el casillero 8/9 de la guía) y ahora al lado viven N permisos. Mientras la guía siga imprimiendo el campo viejo, atar un permiso no cambia lo que sale en el papel. El paso siguiente es que la GTF ofrezca elegir cuál de sus permisos declara.
### [pending] 2026-09-21 — **La ARFFS de la ficha CTP y de la guía siguen siendo texto libre** (`CtpFichaFormIdentidad`, `CtpGuiaDatosTab`): el selector de lo ya escrito está hecho y compartido (`campos-elegibles`), falta cablearlo en esas dos pantallas hermanas.
### [pending] 2026-09-21 — **Un plan de manejo cargado por error no se puede borrar**: `DELETE /api/admin/forestal/plan` responde **405** (medido). Queda `PATCH estado:"cerrado"`, que lo saca de los vigentes pero lo deja en el selector. Los permisos ya tienen baja lógica con aviso de cuántos documentos cuelgan; el plan debería tener la misma.
### [applied] 2026-09-21 — **La completitud de la ficha ya sabe de los permisos** (sin commitear). `pendientesDeFicha(f, { permisos })` deja de reclamar el título habilitante cuando el titular tiene al menos uno atado, y lo dice: «El origen legal está en sus permisos: 1 cargado acá abajo, con su área y su vigencia». El **denominador no cambia** a propósito: si encogiera, atar un permiso dejaría la barra en el mismo porcentaje. Verificado con los dos casos reales: ficha con permiso atado → **40 %, ya no lo pide**; ficha cuyos permisos son sólo candidatos → sigue pidiéndolo (todavía no son suyos).
### [applied] 2026-09-21 — **El plan de manejo se edita, se elimina y se identifica** (ADR-426, sin commitear). `DELETE /api/admin/forestal/plan` no existía (**405** medido) y el `PATCH` estaba desde ADR-126 **sin una sola pantalla que lo usara**. Ahora: baja lógica que dice antes qué cuelga con el número real (`?usos=1`: en `PO 12` → 3 especies, 4 árboles, 11 asientos, 0 guías, 185 m³), edición con el MISMO formulario del alta (test que compara claves contra el formulario vacío: una copia corta **borra**), y 9 columnas de identidad (apodo, propietario+doc, provincia, distrito, sector, cuenca, `contratoId`) con región→provincia→distrito encadenados. Verificado por la pantalla: Oxapampa ofreció 8 distritos, el plan guardó los 7 campos, la edición abrió con sus valores y el borrado lo sacó de la lista. 0 errores de consola.
### [applied] 2026-09-21 — **La GTF elige entre los permisos, no sólo entre los títulos de la ficha** (sin commitear). Medido: la Ficha CTP tenía **1** título y los permisos eran **6** — los otros cinco sólo se podían tipear a mano en un papel que pasa por un puesto de control. El select ahora agrupa «De la ficha del CTP» y «Permisos cargados» (dedupe por código normalizado; `CONC-25-001` aparece una vez), completa los casilleros (2) y (9) vacíos al elegir, y nombra el código desconocido sin bloquear. Módulo puro con 15 tests.
### [applied] 2026-09-21 — **El papel imprime el permiso elegido** (sin commitear). `tituloDeGuia(ficha, elegido, permisos)` ahora resuelve también desde `ForestContrato`: si el título elegido no está en la Ficha CTP, sus casilleros (5)(8)(9) salen con el código, la resolución y el plan de manejo del permiso (`tipoPlanDesdePermiso`, RJ 001-2018-OSINFOR). Lo que el permiso no tiene queda **en blanco**, nunca inventado. Cableado en los tres llamadores que imprimen (`CtpGtfSeccion`, `Anexo04GtfSalida`, `CtpGuiaRegistrada`). 63 tests en verde entre el módulo y el formato.
### [applied] 2026-09-21 — **El modal de despacho ya no se vuelve solo a Productos** (sin commitear). Causa encontrada en el código: `CtpProductosDisponibles.tsx:1849` pasa `presetUids={[...seleccion]}`, un **array nuevo en cada render**, así que el efecto `[presetUids]` de `CtpDespachoGuiaModal:160` re-corría con la misma selección y su `setTab("productos")` sacaba al operador de la pestaña de datos. El efecto pasa a depender del **contenido** (`uids.join("|")`) y los uids salen de esa clave, así que quedan cubiertos los tres padres. **Pendiente de verificación en navegador**: no logré llegar al modal por el flujo de despacho en el tiempo de la sesión; gates en verde y causa razonada sobre el código, pero nadie lo vio funcionar todavía.
### [applied] 2026-09-21 — **Los dos lados del vínculo plan↔permiso validan el tenant** (sin commitear). Ninguno tiene FK a propósito (una FK compara ids, no tenants). `ForestPlanDB` ya rechazaba un `contratoId` ajeno; faltaba el reverso: `ForestContratoDB.crear/actualizar` ahora exige que el `planId` sea de un plan vivo del mismo negocio. Probado contra el servidor: `PATCH …/contratos/<id> {"planId":"plan-de-otro-negocio"}` → **400 `plan_ajeno`**, y el caso legítimo sigue en 200.
### [applied] 2026-09-21 — **Los indicadores del plan se pueden ocultar de verdad** (sin commitear). Ya existía un botón «Indicadores», pero estaba en la esquina opuesta a las cifras y plegado **no ocultaba nada**. Ahora el control va pegado a las cifras con tres estados recordados (`loth:plan:indicadores-v2` = `{forma, oculto}`): **Tarjetas · Cifras · Ocultar**, medido en el navegador **497 px → 386 px → 294 px** de cabecera, y al recargar en oculto queda «Ver indicadores» (el botón no se desmonta: el foco se conserva). Cada tarjeta suma contra qué se compara, reusando `estadoVigencia` y `analizarZafra` —los 545 días y el −25,4 % coinciden con la carátula y el panel de Zafra de abajo—. 0 errores de consola propios.
### [pending] 2026-09-21 — **Falta decir CUÁLES especies están fuera del plan**: la tarjeta «Control» dice «sin excesos ni especies fuera» pero cuando las hay no las nombra; haría falta `fueraDelPlanNombres: string[]` en `KpisPlan` (sale de `d.noAutorizadas` en `use-loth-plan`). Se descartó inventar m³/ha en «Autorizado» porque `LothPoaPanel` ya publica una intensidad con otro numerador y dos cifras con la misma unidad se contradicen.
### [applied] 2026-09-21 — **Campos personalizados en los modales** (ADR-427, sin commitear). Pedido de Brandon. Medido antes: no existía nada (`grep` = 0 archivos) y 174 archivos montan `AdminModal`. Motor completo: 2 tablas, módulo puro (26 tests), DB class + API (32 tests), bloque de UI montable (`<CamposPersonalizados formulario registroId />`) y **2 pilotos cableados** (alta/edición de plan y ficha del Directorio). Verificado contra el servidor: el `registro-A` ve su campo temporal y el permanente, el `registro-B` **sólo el permanente**; `12,5` guarda `valorNum 12.5`; «como veinte» avisa sin trabar. **Hallazgo grande**: el `@@unique` de Prisma **no protegía a los permanentes** (`soloParaRegistroId` NULL y Postgres trata cada NULL como distinto — se crearon dos iguales por API). Arreglado con índices **parciales** que además excluyen `deletedAt`, así la baja libera el nombre (verificado: recrear da 201). Tercera vez que este repo tropieza con el mismo NULL (ADR-396, ADR-421).
### [applied] 2026-09-21 — **Campos personalizados en 5 modales de uso diario** (sin commitear): alta y corrección de ingreso, detalle de lote, alta y detalle de adelanto. Elegidos midiendo el tenant real (24 guías/160 trozas · 21 lotes · 4 adelantos, contra 0 órdenes de compra y 0 despachos), no por intuición. Ciclo probado en la pantalla: campo creado, valor escrito, adelanto guardado y el valor leído de vuelta atado a ESE id (otro adelanto devuelve vacío). Detalle que evita duplicar plata: si fallan los campos el adelanto ya existe, así que reintentar guarda **sólo** los campos.
### [applied] 2026-09-21 — **Los dos agujeros del pentest, cerrados** (sin commitear): un `registroId` inventado ahora da `409 registro_desconocido` (antes 200 ×5) y un cajero que pide los campos de otro módulo recibe `403` con el motivo (antes leía «DNI del titular»). Un formulario **sin mapear no se bloquea**: se permite avisando, porque el motor se cablea modal por modal. 22 tests nuevos, 88 verdes en las cuatro suites.
### [applied] 2026-09-21 — **Ley 29733 hasta donde llega hoy** (sin commitear): el export incluye los campos personalizados de la persona cuando se la puede cruzar por documento contra el Directorio, y **declara** en `fueraDeAlcance` lo que no puede cruzar en vez de callarlo. Honesto: ningún formulario cableado cuelga de un pedido o una venta, así que para un cliente de bodega trae 0; y el borrado no toca esos valores porque esa ruta no suprime la ficha del Directorio. Los tests muerden: mutar el cruce rompe 5, sacar cualquiera de los dos `tenantId` rompe 2.
### [applied] 2026-09-21 — **«Por cobrar» es una lista, no un tablero de enlaces** (sin commitear). `GET /api/admin/por-cobrar?detalle=1` devuelve las filas y el resumen **derivado de ellas**, con los `where` en un solo lugar para que los dos caminos no diverjan: 13 filas suman **4.656,34**, idéntico al resumen viejo. De paso corrigió dos sobreconteos reales: un préstamo **recibido** (deuda propia) se contaba como por cobrar, y un préstamo saldado que quedó en `ACTIVO` sumaba al conteo con monto 0. El scoring quedó como botón por fila: replicar su fórmula en el backend habría sido la segunda fuente que el pedido prohíbe.
### [pending] 2026-09-21 — **Los otros 167 modales no tienen campos personalizados**: el motor está y el cableado es de tres líneas por modal, pero cada uno necesita decidir su id de formulario y dónde va el bloque. Los candidatos obvios por uso: ingreso de madera, despacho/guía, lotes, adelantos y compras.
### [applied] 2026-09-21 — **Auditoría de seguridad de los campos personalizados** (sin commitear). Veredicto: **sin críticos** — 0 tenant leak, 0 auth bypass, 0 SQLi, 0 XSS explotable. Descartado con evidencia: PATCH/DELETE de un campo ajeno → 404; GET de otro tenant → vacío; PUT con `campoId` ajeno → `ignorados:1` y 0 filas; spoof de `x-tenant-id` ignorado (manda el JWT); los 15 `prisma.*` llevan `tenantId`; definir un campo es management-tier (cajero → 403) y llenarlo no; CSRF y límites Zod OK. **Arreglados en el momento**: el texto de la baja mentía («se borra… no se puede deshacer» sobre un soft delete) → ahora dice lo que hace; un nombre sin letras daba 500 → 400 con motivo; y el formulario no tenía techo (96 campos permanentes creados en 17 s) → tope de 50 permanentes, con los temporales fuera de la cuenta y test que lo fija.
### [pending] 2026-09-21 — **Ley 29733: los campos personalizados no salen en el export ni se borran** (P2 de la auditoría). `app/api/compliance/data-export/route.ts:93-125` y `data-delete/route.ts:149-155` enumeran modelos a mano y no tocan `CampoPersonalizadoValor`: un DNI o un teléfono tipeado en un campo libre queda fuera del derecho de acceso y del de supresión. Patrón a vigilar: **toda tabla de datos libres abre el mismo agujero**.
### [pending] 2026-09-21 — **`registroId` no se valida contra ninguna tabla** (P2): un cajero escribió 5 valores contra ids inventados → 200. No es leak (la fila nace con su `tenantId`), pero deja basura sin techo. Falta validar que el registro exista para ese formulario antes de escribir.
### [pending] 2026-09-21 — **Los roles de campos personalizados son una lista global, no por formulario** (P3): un cajero lee y escribe campos de módulos que no le tocan. Habría que derivar el rol del `formulario` reusando `lib/auth/roles-rutas-panel.ts`.
### [pending] 2026-09-21 — **`applyRateLimit` se llavea por IP, no por tenant/usuario**: 100 req/60 s compartidos por toda una bodega detrás del mismo NAT. Existe `applyRateLimitWithTenant` y casi nadie lo usa. Lo destapó el pentest de campos personalizados, pero aplica a todo el panel.
### [applied] 2026-09-21 — **Mi Plata: de 6 pestañas + 14 sub-vistas a 5** (sin commitear). Pedido de Brandon («veo demasiadas pestañas… unificar para reducir el tiempo de ir buscando»). Medido antes: **309 px** de cromo antes del primer dato en 11 de 15 vistas (471 en Fiados), 8 vistas de ≤1,3 pantallas, y el índice «Por cobrar» en 0,9 pantallas con 5 pestañas debajo para **5 filas reales**. Ahora: Resumen · Resultado · Movimientos · Por cobrar · Reportes, con el segundo nivel como control en la fila del título (**325 → 268 px**, −17,5 %), el presupuesto como bloque dentro de Gastos y el Reporte Bancario en «Opciones» (se usa una vez al mes y ocupaba 170 px). `FinanzasModule.tsx` **1.420 → 252 líneas**. Lo que está en cero se pliega detrás de «+N sin usar» y **se mide con el endpoint del área**, no con una lista dura: en QA quedaron plegados Tesorería y Préstamos. Verificado recorriendo **21 URLs** (las 15 vistas viejas + 6 atajos): todas llegan a contenido; 8 tests lo fijan.
### [applied] 2026-09-21 — **El buscador global ofrecía vistas de Plata que ya no existen** (sin commitear). Lo cazó `admin-subvistas-sincronizadas`, que compara `VISTAS_POR_MODULO` contra la estructura real del módulo — y el archivo se había mudado a `finanzas/estructura.ts`. Sincronizado: `presupuesto` deja de ser vista propia y se nombra en el label y la pista de Gastos, para que buscar «presupuesto» siga llevando a donde está. **Sin ese test, reorganizar un módulo deja el buscador apuntando al vacío en silencio.**
### [applied] 2026-09-21 — **«NaN% vs mes anterior» en Ganancias y pérdidas** (sin commitear): la tarjeta calculaba `(actual − base) / base` y con el mes anterior en **0** eso es una división por cero — se veía en cualquier tenant que arranca sin ingresos. Ahora sin base **no se pinta** la línea (un «+∞%» tampoco diría nada), y el divisor usa el valor absoluto para que una base negativa no invierta la flecha. 5 tests.

## React Compiler: `annotation` estuvo 5 meses sin ejecutarse (2026-09-22)

`next.config.ts` tiene `reactCompiler: { compilationMode: "annotation" }` desde 2026-04-28 y
UN archivo declara la directiva (`components/marketplace/UnifiedProductCard.tsx`). Medido hoy:
la directiva `"use memo"` **sobrevive literal** en los chunks servidos por Turbopack en dev y
esos chunks **no importan `react/compiler-runtime`** → el compiler no transforma nada.
Evidencia de código: `get-babel-loader-config.js` (el que arma el babel-loader del compiler)
sólo lo importa `webpack-config.js`; `turbopack-build/` no lo toca. El binding nativo sí expone
`reactCompiler.isReactCompilerRequired()` (`build/swc/types.d.ts:36`), así que la integración
existe pero no llega al output en 16.2.10 + `--turbopack`.

NO verificado: si `next build` (producción) sí lo aplica — el build completo de este repo es caro.
Ese es el experimento que falta antes de invertir en migrar.

Contexto que lo vuelve interesante: Next **16.3** trae el React Compiler como port en Rust dentro
de Turbopack. Cuando 16.3 sea estable, reintentar así:
  npm run compiler:census components/marketplace   # 404 archivos, 11 con violación dura (97,3 % limpio)
  npm run compiler:optin components/marketplace/home --apply
  # verificar en el bundle: debe aparecer `react/compiler-runtime` y desaparecer `"use memo"`

Premio si funciona: 1.676 `useMemo` + 2.151 `useCallback` + 63 `memo()` escritos a mano.

## Uniformidad del panel — residuos medidos de la ronda del 2026-09-22

**Formato (lib/format ya es el canon, 431 archivos migrados):**
- **25 archivos con clon local** (`function formatDate/formatCurrency` propio) quedaron sin migrar a propósito para no
  sombrear el nombre: PurchaseOrdersTab (34 llamadas), PrestamosModule (22), FiadoModals (12), PayablesTab (9), FiadosModule (9),
  CotizacionesModule (8), SupplierPriceComparison (7), TurnosModule (7)… Receta: borrar el clon, importar de `@/lib/format`,
  correr `scratchpad/uniformidad/codemod-formato.py` (v4: fusiona imports) sobre esos archivos, capturar la pantalla.
- **47 archivos excluidos** (36 sucios de la sesión anterior de Brandon + 11 del agente de KPI): misma pasada cuando estén limpios.
- **11 montos con ternario de nulo** (`S/ {x != null ? x.toFixed(2) : "—"}`): decidir si «—» o «S/ 0.00»; hoy quedan.
- **40 formas raras sin mapear**: weekday combinado con fecha (Cierres, Fiados, Inicio), `dateStyle/timeStyle` (cron-dead-letters),
  decimales variables `d`/`dp`/`dec` (forestal). Las 2 en lib/utils (`formatLimaDate`, 0 usos) sobran: borrar tras migrar.
- Las 2 reglas nuevas del gate están en **warning**; promover a error cuando el residuo baje de ~50.

**Capas z (6 nombres en globals.css §CAPAS, 96 archivos migrados):**
- **7 archivos con escalera interna** que el codemod NO tocó porque dos peldaños caerían al mismo nombre y el orden pasaría
  a depender del DOM: `StoreCreativeMode` (100/115/120), `POSView` (10/20/30/40), `InventoryTab` (10/40), `UbicacionDoc`,
  `FiadoModals`, `CatalogOptionPicker` (8800/8801), `action-menu` (60/61). Revisar a mano: casi siempre el peldaño extra
  es un velo click-afuera que puede ir a la misma capa que su panel si el panel va después en el DOM.
- **Hallazgo de densidad (09-22):** `StatCard` declara `default: p-5` pero el admin tiene 89 `density="compact"` explícitos y las tarjetas a mano son p-3 (65) vs p-5 (3): el default del DS es el que nadie usa → decidir si el DS baja a compact/p-4 en `[data-area=admin]` antes de tocar los 191 `p-5`.
- **A/B de densidad medido (09-22, `reports/visual-verify/2026-09-22-densidad-ab/`)**: en `?tab=inicio&vista=caja` (9 StatCard en default) simular p-4 sobre p-5 baja cada tarjeta 8 px y no cambia la lectura. Lo que SÍ se ve: a 1366 px la grilla de **6 KPIs parte el monto en dos líneas** («S/» / «9,970.00») en Egresos, Balance y Utilidad. Es layout, no padding: 6 columnas → 3 bajo 1440 px, o valor `text-xl whitespace-nowrap tabular-nums`. Revisar la misma grilla en Ventas/Productos/Clientes de Inicio (6 StatCard cada uno).
- Falta el gate `ds-no-z-arbitrary-admin` (avisar ante `z-[N]` nuevo en admin) — escribirlo cuando se cierren los 7.
- `BottomSheet` (ui-system, compartido con la tienda) sigue en `z-50` numérico a propósito.
