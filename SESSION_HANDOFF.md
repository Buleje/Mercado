# SESSION HANDOFF — 2026-09-14 (tarde)

Branch: `audit/storefront-mejoras-verificadas-2026-06-15`. **Todo subido** (push de la noche: `dbcbc4a7`, `93978b2e`, `e7b11141` y la ronda de la consola).
Detalle completo y cómo revertir cada cosa: memoria `harness-refresh-2026-09-14`.

## ✅ Hecho y subido hoy (tarde)
| Commit | Qué | Verificación |
|---|---|---|
| `1087d258` + `4da8a134` | Harness al día con Claude Code 2.1.270: 8 agentes (`inherit`, skills, Playwright), hook `SubagentStart`, `StopFailure`, teams OFF, `/verify` → `/gates`, `typecheck:fast` = TypeScript 7 nativo | validadores, 2 subagentes reales, reviewer independiente |
| `13ece52b` · `2419f560` · `50c9fd72` | next 16.2.10, `@playwright/mcp` 0.0.76 (+ Chromium 1226), TypeScript 7.0.2 nativo sin pisar `tsc` 5.9 | build-gate limpio, MCP navegando la tienda |
| `10aa335f` · `e74dfa42` · `832c40fa` · `e47a91ba` | WIP de RRHH de la mañana: scripts QA sólo en `-qa`, Tareas en la barra, traer desde Adelantos, almacenero sin 403 (1ª parte) | 79 + 994 tests, endpoint 200/403/401 |
| `560cb51b` | Aviso de caja abierta desde un día anterior | tests + navegador (claro, oscuro, 400 px, clic al cuadre) |
| `85e5a3ef` · `08c18c45` · `3ba47215` | 0 avisos de eslint heredados · almacenero sin ningún 403 · 4 módulos con `?vista=` | navegador QA: 0 × 4xx, 0 errores de consola |

## ✅ Hecho hoy (noche) — commits locales, sin subir
| Commit | Qué | Verificación |
|---|---|---|
| `a84585b8` | RRHH rediseñado: modales con 24 px de margen (antes 0), ficha en tarjetas, navegador de fechas, y 6 fallas (manager sin puestos por 403, `?vista=` reescrita, recargar devolvía a hoy, puesto en línea sin elegir, «14 días × S/ 45 = S/ 270», foco del buscador) | tsc + 159 tests + navegador claro/oscuro/400 px, banda de pestañas en 7 hubs |
| `67088707` | RRHH: agregar persona con monto daba 422 (faltaba `vigenteDesde`), manager 403 al agregar, horas de jornada en tarifas por hora, hoja del mes en celular por persona (1.490 → 504 px) | camino de UI como admin y `qamanager` |
| `fd20c5a9` | RRHH: jornada editable en puestos y sin 403 de Adelantos para almacenero y manager | 0 respuestas 4xx por rol |
| `b6d10ad6` | Logger de producción tiraba TypeError en el navegador (`process.stdout`): 42 componentes cliente | test que fallaba 2 de 3 antes del arreglo |
| `ef165c94` · `2205edc6` · `0270feb9` | Errores tragados con `sinDato`, 9 módulos con `?sub=`, fecha en el aviso de caja | reviewer con contexto fresco + 259 archivos de test (2.898 ✓) |
| `dbcbc4a7` | 104 de 107 `.catch(() => null)` del servidor con `sinDato`/`leerJson`/`descartarEsperado`; el log ya no guarda valores de Prisma; metas, tareas y beta-feedback no reescriben un JSON corrupto | auditoría `security` sin veto + 24 tests nuevos |
| `93978b2e` | Tuteo en todo el panel: `components/admin`, `app/admin`, hooks, `lib`, mensajes de `app/api` y prompts de IA | detector genérico: 0 residuo real en el panel; 3.289 tests; 19 aserciones actualizadas |

## 🔧 Consola del panel (noche) — `1da711dd` · `b1937ca3` · `83d4b848`, subidos
Pedido: «soluciona problemas y errores en general» + log de consola con 404 en `me/specializations`, `notifications/stream`, `chat/threads` y `rrhh/colaboradores/desde-adelantos`.
| Qué | Causa medida | Verificación |
|---|---|---|
| 404 en rutas que existen | Estado viejo en memoria del dev server: `route.js` y chunks EN disco, el handler ni corría (sin `[AUTH] OK`). `touch` de una ruta → todas 200. «Reiniciar sin limpiar las rompe»: descartado | curl con sesión 6/6 200; memoria `next-dev-manifest-stale-404-api` |
| `SSEListener` borrado | Escuchaba con `onmessage` y el servidor manda eventos con nombre: nunca recibió nada; sus eventos tenían 0 listeners | RRHH en navegador: EventSource a la vez 3 → 2 |
| Reconexión del stream de notificaciones | 10 s fijos para siempre; si fallaba la verificación de sesión, abandonaba hasta recargar | test nuevo 6/6 (espera exacta 10/20/40 s, tope 5 min) |
| 10 `console.error` de RRHH → `sinDato` | Cada falla de carga salía como error rojo en el overlay de Next | eslint 0, typecheck 0, vitest 9/9, consola RRHH 0 errores / 0 × 4xx |

## 👥 RRHH: hoja semanal con lo ganado + PDF con firma + fotocheck (ADR-416) — `c1ffc99c` + `ad50ca90`, subidos
Pedido de Brandon (texto libre en la ronda de cierre): formato semanal en Asistencia con ganancia diaria y semanal acumulada, referencia, días trabajados, PDF con columna de firma; y en Personal un fotocheck con foto y QR descargable en PDF.
| Qué | Verificación |
|---|---|
| `calcularGanado` devuelve `dias` (importe por día) y `referencia`; el total sigue saliendo de los tramos | 4 tests nuevos (semanal 350 ÷ 7, jornal, fuera de período, sin tarifa) |
| Modo **Semana** en Asistencia: tabla editable con importe del día, días trabajados, faltas, referencia y ganado (sólo admin/owner), calendario en celular | navegador con 2 personas de prueba: S/ 225 + S/ 330 = S/ 555, 8 días; 0 × 4xx, 0 errores; 400 px sin scroll horizontal |
| PDF semanal A4 apaisado con firma, total, leyenda y copy de referencia | texto extraído + render con `pdftoppm` |
| **Foto** (`Colaborador.fotoUrl`, SQL `adr-416-foto-colaborador.sql` APLICADO) subida a `/api/upload` carpeta `rrhh`; botón **Fotocheck** en la ficha y **Fotochecks (N)** en Personal; `?persona=<id>` abre la ficha (destino del QR) | e2e: upload 200 + PATCH 200 + https en la base, PDF renderizado, quitar → null; imagen del bucket y datos de prueba borrados |
| `scripts/dev-with-canary.mjs`: sonda al arrancar; si una ruta /api da HTML 404 (estado viejo al relanzar), toca su route.ts y la refresca | medido: con `/api/health` en 404, tocar la ruta → health 200 y sonda 401; el log dice `rutas /api al día` |
**Producción:** aplicar `adr-415-metas-y-tareas.sql` y `adr-416-foto-colaborador.sql` ANTES de subir el código.

## 🗂️ Metas y tareas por negocio (ADR-415) — `d9e2e549`, subido
Pedido: «Metas y tareas por negocio». Antes: `local-data/*.json` sin `tenantId` (una lista para los 14 negocios) y en Vercel el disco es de sólo lectura (producción nunca guardó una).
| Qué | Verificación |
|---|---|
| SQL `prisma/migrations/adr-415-metas-y-tareas.sql` **APLICADO** a la base (2 tablas, 4 índices, CHECK de listas cerradas, REVOKE a anon) | 8/8 sentencias; tablas en 0 filas, 6/4 CHECK, 0 permisos anon |
| Modelos `AdminGoal`/`AdminTask` + `TENANT_MODELS`, clases `lib/db/admin-{goals,tasks}.db.ts`, contrato `lib/admin/metas-tareas.ts`, 4 rutas con Zod + CSRF | `prisma validate`, typecheck 0, eslint 0, 18 tests de ruta |
| Zod 4: `.partial()` aplica los `.default()` → esquema de edición aparte | medido con zod 4.4.3; test «PATCH {current} no pisa la categoría» |
| TasksTab avisa si guardar/cambiar estado/borrar falla; `completedAt` lo pone el servidor | navegador |
| Carga vieja que pisaba lo optimista (Tareas y Metas): el GET del doble montaje volvía 470 ms después de Eliminar y la tarea reaparecía | e2e 11/11 (antes 10/11) + test de componente que falla sin la guarda |
**Producción:** aplicar el SQL ANTES de subir este código (sin tablas → P2021 y el panel de metas vacío).

## 🧷 Ronda de cierre (noche) — SIN commitear
Pedido: «Logo y nombre en los PDF, misma guarda en 12 pantallas, fechas de metas en hora de Lima» (ADR-415/416 y la sonda ya subidos).
| Qué | Verificación |
|---|---|
| **Nombre y logo del negocio en los PDF**: `GET /api/admin/membrete` (`lib/admin/membrete.ts`, `lib/db/membrete.db.ts`): nombre de Ajustes → nombre registrado del tenant; logo de Ajustes → logo del tenant. Hoja semanal y fotocheck lo dibujan; sin CORS, el PDF sale con el nombre solo | 5 tests; ruta 200 `{"nombre":"Buleje"}`; «BULEJE» en los dos PDF (`pdftotext`). Logo sin datos reales: ningún negocio tiene uno |
| **Fechas de metas y tareas en hora de Lima**: `diasEntreFechas`, `vencimientoDePlantilla`, `fechaParaMostrar` en `lib/admin/metas-tareas.ts` | 6 tests con el reloj a las 20:30 de Lima (ya es mañana en UTC) |
| **Guarda de carga vieja en 11 pantallas más** (lo borrado reaparecía; en Cámaras «Copiar dirección» copiaba la vieja): PurchaseOrdersTab, DevolucionesProveedor, PuntoCompraView (lista de borrados, sin recarga por `"use cache"`), Promotions, Promociones, MarketingAutomation, CustomKPI, Distribuciones y Cubicaciones guardadas, Cámaras, AdminChatHead. POSView = falso positivo | 11 archivos de test, cada uno falla con el código de HEAD; 72/72 en 16 archivos; eslint 0 en líneas tocadas; typecheck 0; navegador (Compras ×3, Promociones ×2, Campañas): 0 errores, 0 × 4xx, 0 pedidos en 8 s quietos |
| **Arreglos del revisor con contexto fresco**: el dorso del fotocheck había perdido el contacto (Blas y mi-pollo tienen la dirección en `storeTheme`) → vuelve como respaldo; el título con logo cortaba «AGR / OFORESTALES» → corta entre palabras, baja hasta 6 pt y permite 3 líneas; Promociones y KPIs: un Recargar con Eliminar en camino traía la fila → contador de cambios en el `finally`, y (2ª pasada del revisor) la carga descartada vuelve a pedir: sin eso, crear durante la carga inicial dejaba la lista sólo con lo nuevo; el negocio se busca por id antes que por slug | test del caso Blas; 2 tests que fallan sin el contador y 5 que fallan sin el reintento (swap + `cmp`); jsPDF: «INVERSIONES / AGROFORESTALES BLAS / SAC» |
| **Sin resolver**: `"use cache"` + `revalidateTag("max")` tras escribir. En dev la lectura ni pasó por la caché (la promo creada apareció aunque `add` no invalida), así que medir ahí no prueba nada; la doc y el código de Next dicen que se entrega lo viejo. Medir con build + start | radar |

## 🪵 Producir sin lote (noche) — SIN commitear, en verificación
Pedido (texto libre, prioridad 1): en «Cargar piezas» la caja de dictado primero con Importar Excel y las funciones de voz adentro; campo «Código» con sugerencias de las trozas disponibles que rellena la especie (interno, no afecta nada); detalle flotante por día en «Día del registro» (dueño, especies, clasificación…); lista de funciones para seguir.
| Qué | Estado |
|---|---|
| Caja «Dictar o importar piezas» con grupos Entrada (Importar Excel) y Voz (repite, probar, ajustes); sin dictado siguen a la vista | 10 tests; vale también para el Cubicador principal |
| Campo Código (sólo con `conCodigoDeTroza`): combobox con trozas disponibles del patio (`/trozas/patio`), «-» = sin código, prefijo antes que contiene, especie por catálogo con `claveEspecie`; no va al servidor ni agrupa paquetes (`sinCodigoDeTroza`) | 43 tests (`forestal-codigo-de-troza*`, `cubicador-codigo-troza-campo`) |
| `jornadasDeProduccion` agrega `detalle?` sólo en producción (especies, clasificación, dueño, permisos, líneas, sin materia prima, paquetes, 6 corridas) + `CtpDetalleDeJornada` con ícono, hover y táctil | 23 tests; con filas reales de Blas el 01/08 da 6 clasificaciones y 32.416 PT, igual que el casillero |
| Gates conjuntos | typecheck 0, eslint 0 errores (1 aviso en línea movida, `cubicador-entrada-voz.tsx:305`), tokens 0 |
| Revisor 1 (Código y disposición) | Arreglado: sugería trozas de guías **sin recibir** (104 de 111 en Blas) → mismo corte que el patio (`guiaRecepcionada !== false`), quedan 7 sugerencias reales; la opción marcada quedaba vieja tras Escape → se reinicia (test que falla sin el arreglo). El código no sale del modal por ningún camino (verificado por el revisor) |
| Navegador (QA) | 1ª corrida: `trozas/patio` y `ctp/cierre` en **HTML 404** con sesión aunque la sonda dijo «al día» → tocar otra ruta las destrabó; `scripts/dev-with-canary.mjs` ahora toca la ruta SIEMPRE al arrancar. 2ª corrida: 0 errores de consola, 0 × 4xx en claro, oscuro y 400 px, sin scroll horizontal |
| Panel del día en el navegador | Visto en claro, oscuro y 400 px con el QA del 09/09: 4 corridas · 2.374 PT · 5,600 m³, especies, clasificación, dueño («De tercero · QA Aserrío» 3 + «Sin declarar» 1), líneas y corridas. Ajustes: alto máximo 448 → 560 px (el botón final quedaba bajo el scroll), «sin materia prima» en tono neutro (9 de 14 corridas reales con la misma regla que `produccionSinMateriaPrima`), casillero con `pt-4` en celular (checkbox e ícono tapaban «MIÉ»). Ojo al medir: `[role=dialog]` sin filtro agarra el menú lateral del panel |
| Revisor 2 (detalle del día) | En curso (agente): portal dentro del `[role=dialog]` (en «Declarar producción» la tira vive en el cuerpo con scroll del `AdminModal` y el panel se recortaba), «sin trozas vinculadas» con el criterio del Radar (`corridasSinOrigen`: 14 de 14 en Blas; el panel contaba 9 y omitía el 01/08), especies por `claveEspecie`, tests. Hecho por mí: `useModalAccesible` ya no se calla por un `role=dialog` SIN `aria-modal` dentro de la caja (Tab se escapaba con el panel abierto; test que falla sin el arreglo; barrido de modales anidados en verde) |
| Navegador del panel | Producir sin lote (QA, 09/09) en claro/oscuro/400 px: se abre por hover, dentro de la pantalla, Escape cierra sólo el panel, 0 errores, 0 × 4xx. **«Declarar producción» NO verificable en el navegador**: el tenant QA tiene 0 lotes y ninguna corrida abierta — queda cubierto por test de componente del portal |
| Cierre verificado | Agente: portal en el `[role=dialog]` (`hooks/use-ubicar-flotante.ts`), «sin trozas vinculadas» = `corridaSinOrigen` extraída de `resumenConsumos` (14 de 14 en Blas), especies por `claveEspecie`, `jornadasDesdeFilas` testeable. Gates: typecheck 0 · eslint 0 en 24 archivos tocados · tokens 0 · 222 tests relacionados. Dev relanzado: `rutas /api al día y refrescadas al arrancar`. Navegador final (QA) claro/oscuro/400 px: 0 errores, 0 × 4xx, panel por hover dentro de pantalla, Escape sólo el panel. **Tenant QA `active=false`** |
| Queda | «Declarar producción» sin ver en navegador (QA sin lotes); sugerencias con trozas reales sin ver (QA sin trozas; en Blas salen 7 por las guías sin recibir); el Radar (`analizarRadar`) usa otra regla de «sin origen» (sólo volumen de consumo, sin reprocesos); `CtpSemanaDeRegistro.tsx` 517 líneas; `CubicadorTrozas.tsx:408` tiene su propia caja de dictado sin el reordenamiento; nada commiteado |

## ⚠️ Pendientes medidos de esta noche
- POSView: tras vender llama `fetchProducts()` sin guarda; un GET de productos en vuelo desde antes puede pintar el stock de antes de la venta (deducido por código, no medido).
- `"use cache"` + `revalidateTag(tag, "max")`: 19 llamadas en 7 archivos de `lib` sirven lo viejo en la primera lectura después de escribir.
- Voseo fuera del panel: ~370 en marketplace/tienda, ~166 en superadmin, checkout (zona de peligro) y landing.
- 2 `.catch(() => null)` en zona de peligro: `app/api/orders/route.ts:479`, `app/api/checkout/fiado-option/route.ts:30`.

## 🖥️ Entorno (rige desde una terminal nueva)
- `claude` se lanza en un scope de systemd con tope de RAM de 13G para los Bash (función en `~/.bashrc`); el boot de sesión dice si está activo.
- Barra de estado en `~/.claude/statusline.mjs` (RAM, tope, dev, rama, caché).
- El MCP de Playwright de una sesión abierta antes del upgrade no encuentra Chromium hasta `/mcp` reconnect; para medir, scripts con `require("playwright")` del repo (ejemplos en el scratchpad de la sesión).

## ⏳ Pendiente (en el radar, con medición)
1. **Pase a producción** — plan publicado: https://claude.ai/code/artifact/32bd1a51-c14e-4676-be0a-c09a0b108470. Producción = CLI del 16/07 (`7774f5ca`, rama `prod`), +901 commits por subir. Bloqueos: `DATABASE_URL` de Vercel con `app_user` (todos los previews fallan) y 7 crons nuevos que mandan mensajes. (Lo que decía antes sobre `master` estaba mal: `master` está abandonada.)
2. `AnalyticsBIModule`, `ForestalTramites` y `MarketplaceModule` sin vista en la URL (necesitan diseño; ver radar).
3. ~108 `.catch(() => null)` del lado servidor (`app/api`, `lib`).
4. Vitest 5 bloqueado hasta que `@vitest/browser-playwright` publique 5 estable (limpiar mocks: 0 de 9.948 tests fallan).
5. Brandon: `/skill-doctor` y `/doctor`.

## 🧹 Estado de QA
Tenant `inversiones-agroforestales-blas-sociedad-op-qa-ui` **inactivo** (`active=false`, apagado al terminar); conserva: 9 personas «QA …», 4 puestos, asistencia del 08 al 14/09. Usuarios `qaadmin`, `qaalmacenero` y `qamanager` (`scripts/create-qa-manager.mjs`); para reactivarlo: `active=true` en `Tenant`.

---

# SESIÓN 2026-09-19 — harness más rápido + el pendiente que nunca se disparaba

Pedido de Brandon: «continuá con la sesión anterior y con las mejoras, y optimizame en agentes para que seas mejor y más rápido».

## ⚡ Optimización del harness (todo medido antes/después, sin commitear)
| Cambio | Antes | Después | Evidencia |
|---|---|---|---|
| **`pre-tool-guard.mjs` único** en `PreToolUse` (mem-guard + danger-zone + bash-guard + filtro de deploy en 1 proceso) | 83,4 ms/tool-call | **32,5 ms (−61 %)** | batería de 18 casos: **0 divergencias** (bloquea y deja pasar igual que los 3 viejos); `BSM_DZ_BLOCK=1` sigue bloqueando |
| `Skill(*)`: los 3 deploy-gates se spawneaban siempre | 91 ms | **30 ms** | con `skill=deploy` sigue entrando y bloqueando (10 console.log) |
| mem-guard: censo de procesos | 2 × `ps \| awk` | `/proc` en JS + caché 4 s | — |
| `lsmcp` | activo (LSP tsgo, 69+14 MB) | **desactivado** | **0 invocaciones reales** en 35 transcripts (el grep que daba 4.458 contaba listados de tools) |
| `danger-zone`: nombraba 5 agentes inexistentes y «131 modelos» | — | 8 agentes reales, skills reales, 189 modelos | los 5 (`checkout-squad`, `security-squad`, `database-engineer`, `frontend-engineer`, `backend-platform-engineer`) no existen desde el 09-14 |

**Revertir:** los 3 scripts viejos siguen intactos en `.claude/hooks/`; respaldos `settings.json.bak-2026-09-19` y `.mcp.json.bak-2026-09-19`.

## 🚨 El hallazgo grande: el paralelismo no se cumplía
Censo de 35 transcripts (`scripts/medir-paralelismo.mjs`, nuevo):
- **1,00 tool-calls por mensaje** (14.054 llamadas en 14.044 mensajes); 7 mensajes con 2+ llamadas = **0,05 %**
- **1,00 subagentes por tanda** (110 en 110); 88 % heredaba Opus, incluidos barridos mecánicos

El wall-clock ≈ nº de TANDAS, no de llamadas. Pesa mucho más que los milisegundos de hooks. Ahora la cifra de la sesión anterior **sale sola en el arranque** (enganchado a `session-start-context.mjs`, +98 ms una vez) y la regla `agentic-style` trae la tabla de qué modelo usar por agente y tipo de trabajo.
**Descartado:** medir la duración de cada subagente por transcript no sirve — en background el `tool_result` vuelve al instante y todo da 0 s.

## 🪵 Libro CTP: el pendiente que estaba fijo en 0 (radar → applied)
`hooks/use-ctp-pendientes.ts` tenía `corridasSinOrigen: 0` hardcodeado: el único pendiente que **bloquea el cierre** no se disparó nunca.
| Qué | Dónde |
|---|---|
| `agregarSinOrigen` — cuenta pura, con LA regla (`corridaSinOrigen`), no una segunda copia | `lib/forestal/loctp-consumos-analisis.ts` |
| `ForestCtpDB.contarCorridasSinOrigen` — cuenta en el servidor, sin bajar el grafo | `lib/db/forest-ctp.db.ts` |
| `GET /api/admin/forestal/ctp?sinOrigen=1` — dos números, no un grafo | `app/api/admin/forestal/ctp/route.ts` |
| Cableado + tipo `Respuesta` | `hooks/use-ctp-pendientes.ts` |

**Verificado (QA, tenant `main`):** endpoint 200 → 5 corridas / 14,2525 m³ (año), 2 / 5,4335 (trimestre que mira la pantalla). **Cruce contra el grafo del Radar: los mismos 5 por la otra vía** (es el bug de «14 vs 9» del 09-14, que así no vuelve). Navegador claro + oscuro: la pestaña **Producción** enciende su aviso (es el ÚNICO pendiente de esa vista) y el **cierre de agosto** ya observa «1 corrida sin materia prima atribuida: su costo se congela sin origen». **0 errores de consola.** Gates: typecheck 0 · eslint 0 en los 4 archivos · **20/20 tests** (6 nuevos).

## ⏳ Queda
- **Nada de esto está commiteado** — ahora son ~136 archivos sucios (los 130 de la sesión pasada + 6 de ésta).
- El aviso del pendiente es un **punto de 6 px con `aria-hidden`** (`libro-chrome.tsx:341`): un lector de pantalla no lo anuncia y a simple vista cuesta verlo.
- El radar sigue con 42 `pending`.

## ✅ Segunda mitad del 19-09 — los 5 frentes que eligió Brandon + su pedido nuevo

Brandon marcó las 4 opciones del menú y agregó, señalando la banda del LO-TH:
«que ahí estén las opciones de contrato o permiso para escoger rápido, y
establecerse el permiso en toda la página para poner fijo ese contrato en las
operaciones que realizo, y poder cambiar para que se aplique a todo».

| Frente | Qué quedó | Commit |
|---|---|---|
| **Permiso de trabajo en la banda** (pedido nuevo) | `ContratoActivoChip` en el LO-TH y el Libro CTP + `contexts/contrato-activo-context` (localStorage por tenant, `storage` entre pestañas). La propuesta vive DENTRO de `SelectorContrato`: llena el hueco, no pisa `codigoSugerido` ni una elección a mano; `CtpFleteModal` con `sugerirActivo={!flete}` | `0c8ae9a95` |
| **El aviso que nadie veía** | El punto de 6 px `aria-hidden` de cada vista es ahora el mismo badge numérico del grupo + `sr-only` con el conteo | `0c8ae9a95` |
| **Dos reglas de «sin origen»** | `analizarRadar` usa `corridaSinOrigen` (antes ignoraba reprocesos, ADR-316). Ninguna cifra cambia hoy; el test nuevo falla con HEAD | `0c8ae9a95` |
| **Medición contra Blas real** | **14 de 15 corridas sin materia prima, 85,44 m³.** 5 declaran volumen de entrada y ni una troza (01/08). 4 meses cerrarían observados. Corrige el «14 de 14» del 09-15 | (radar) |
| **Guardar todo** | 10 commits: harness ×2, CTP sin origen, contrato activo, cámaras, membrete+fechas, carga vieja ×12 pantallas, LOTH ×2, producir sin lote | — |

**Verificación del chip** (navegador, claro + oscuro, 1280 y 400 px): elegido en el Libro CTP, aparece en el LO-TH; sobrevive a recargar y a cambiar de libro. Menú en portal —la tarjeta del libro tiene `overflow-hidden` y lo recortaba— y acotado a la pantalla: sin eso se salía 172 px por la izquierda a 400 px. Seleccionar funciona con el portal (el `mousedown` de «afuera» debía mirar también el menú). 0 errores de consola, sin scroll horizontal. typecheck 0 · eslint 0 · 42 tests en 3 archivos · tokens del DS 0.

## 🧹 Lo que quedó sucio a propósito
- `scripts/tmp-{ganancia,medir-2,medir-despacho,medir-patio-blas}.mjs`: scripts de medición de la sesión pasada, sin commitear. Borralos o movelos si no los querés.
- `main-data.json`: aparece modificado con diff vacío (permisos o fin de línea).

## ⚠️ Gotchas nuevos
- El **gate de anidado HTML cruza componentes por NOMBRE**: dos `Etapa` distintos (uno exportado en `historia/EtapasDelLote`, otro privado en `LothTraceResumen`) daban 2 roturas falsas y bloqueaban el commit. Se renombró el privado a `PasoDelEmbudo`; el gate sigue pudiendo repetirlo con el próximo par de homónimos.
- `curl $BSM_CURL_FLAGS` **no funciona**: bash lo parte por espacios y las comillas quedan literales → ristra de `HTTP 000` y un 401 engañoso. Usar `-b "$BSM_COOKIE" -H "x-csrf-token: $BSM_CSRF" -H "x-tenant-id: $BSM_TENANT"`.
- En el login, `qaadmin` existe en **varias tiendas**: hay que elegir «Buleje · main» o el panel rebota al login.

## ✅ Tercera ronda 19-09 — las 4 opciones que marcó Brandon

| Frente | Estado | Commit |
|---|---|---|
| Chip de permiso en los libros hermanos | Lotes, Trámites (cubre Plantaciones) y Herramientas. **Cacao descartado a propósito**: no es forestal | `1572132c6` |
| El gate de anidado que cruza por nombre | `origenDe()` resuelve el import; sin poder resolver, conserva la sospecha | `e6ca252cf` |
| Las corridas que declaran madera sin trozas | El cierre agrega «N declaran X m³ de entrada sin una sola troza»; calla si ninguna declara | `b3771abbe` |
| **Armar el lote desde la propuesta** | **Agente en curso al cerrar esta nota** — toca `forest-lote-aserrio.db.ts`, `wood-entries.db.ts`, `consumo-trozas.ts`, el endpoint de lotes y 2 archivos de test. **Sin commitear, sin revisar** | — |

**Al terminar el agente del lote, lo que falta:** pasarlo por `reviewer` con contexto fresco (toca invariantes I1-I6 y locks de trozas: es zona de peligro), correr los gates y recién ahí commitear.

**Dos falsos que cayeron esta ronda** (los dos aparecieron sólo al medir, no en los gates):
- El gate de anidado bloqueaba commits legítimos por dos componentes homónimos; **y al arreglarlo, comparar rutas como strings lo dejó mudo** — detectaba cero. Sólo se vio porque el fixture incluía un caso que el gate DEBE seguir cazando.
- «Listar las corridas una por una con su botón» ya existía en `CtpVincularEnTandaModal`. Lo que faltaba era la cifra declarada.
