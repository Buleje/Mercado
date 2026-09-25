# Archivo de handoffs (entradas cerradas, la más nueva arriba)

> Movidas desde `SESSION_HANDOFF.md` el 2026-09-23: el arranque sólo lee la PRIMERA entrada de ese archivo, y 36 KB apilados costaban contexto sin servir de handoff.


# SESSION HANDOFF — 2026-09-24 (noche): Consumos ordenado, banda en una fila y «explicar con ⓘ» en todo el forestal

**Estado:** push al día (`081bfaf13`). Árbol limpio salvo `.claude/improvement-radar.md` (sugerencias automáticas de skills por co-edición del barrido: ruido, no se commiteó).

**Hecho (7 commits, todos con compuertas verdes):**
- `d21d75a81` / `5dc62bfa1` — lo que dejó sin commitear la sesión anterior (ADR-431 patio por permiso + rediseño Consumos/Saldos), revisado y probado en navegador.
- `fabc21e45` — banda de los libros en UNA fila (container queries `/banda` y `/acciones`; `BandaPermiso` = chip + «Solo este permiso»). 167 → 119 px a 1920/1600. A 1440/1280 siguen 2 renglones.
- Consumos › Patio en 2 tarjetas («Qué queda en el patio» + «Trozas en el patio» con lote, día y filtros adentro); Sección 2 con filtros dentro del cuadro. pt de rolliza = ≈aserrable 56 % en toda la vista (antes 38 260 vs 21 426 pt de la misma pila). Celular: 9,8 → 4,4 pantallas.
- `85155a20c` — InfoTip en portal (z-system, pointer-events, tokens del panel), `VistaHeader.hint` → ⓘ, regla 9 en `.claude/rules/ui-components.md`, columna «pal. ayuda» en `scripts/medir-orden-admin.mjs`, tests `infotip-portal` + `infotip-no-anidado` (prohíbe ⓘ en button/h*/label/summary).
- `081bfaf13` — barrido ⓘ en ~130 archivos del forestal (7 agentes + revisor que encontró 5 altas, todas corregidas).

**Pendiente / para proponer:**
- «y otros» de Brandon: el barrido ⓘ fuera del forestal (admin general). Medición en `reports/orden-admin/orden-1600.json` (columna `ayuda`).
- `AdminModal` no acepta ⓘ junto al título (los agentes lo pusieron en el primer rótulo del cuerpo): agregar prop `ayuda`.
- Medición «antes/después» del forestal es ruidosa (pantallas que cargan distinto a 6 s vs 10 s): comparar solo pantalla a pantalla con el mismo contenido.
- Siguen del 23-09: avisos de plazos caídos (WhatsApp 401 + Resend) · reserva de Juancho vencida · probar el audio real del cubicador.

---

# SESSION HANDOFF — 2026-09-24 (mañana): crédito de la nube + plan «patio por permiso» y rediseño de Consumos/Saldos

**Estado:** árbol limpio, push al día (`d09b6bfca`). Límite semanal al **99 % hasta las 16:00 del 24-09** → Brandon eligió construir AQUÍ después de esa hora.

**Hecho hoy:**
- Crédito de la nube reclamado: quedan ~USD 247 de 250 y **vence el 05-11**. Se usa por la **web** (claude.ai/code → Mercado → rama); el `claude --cloud` del CLI da un falso «set up GitHub». Memoria `credito-nube-250-2026-09`.
- 2 ramas de la nube **revisadas y con tests locales verdes, SIN mergear:** `nube/selector-permiso-activo` (`202f4406c`, 5/5) · `nube/permiso-filtra` (`cc1c8ef4f`, 15/15 + typecheck; **no toca el patio**).
- `7a22231a9` gitignore `scripts/tmp-*.mjs` + `main-data.json` · `d09b6bfca` radar: 2 «pendientes» ya estaban hechos (gate `e6ca252cf`, reserva vencida `2c334edcd`).

**A las 16:00, en orden** (Brandon eligió las 4 opciones + texto libre = prioridad 1):
0. Leer el informe final de la sesión de la nube «Filtro de permiso en libro CTP» (qué pantallas quedaron sin filtrar y por qué).
1. Navegador claro/oscuro 1280/400 de las 2 ramas → merge (primero `permiso-filtra`: toca `CTPLibroOperaciones` y `wood-entries`).
2. **TEXTO LIBRE:** «mejorar las páginas ya creadas: diseño más ordenado y distribuido, cambios de alto nivel y profundos en diseño, UX, accesibilidad». Ámbito: pestañas **Consumos** (`CtpConsumosView`, 1 184 líneas) y **Saldos** (`CtpSaldosView`, 916 líneas, 15 `useState`) del LO-CTP, ambas con más de 300 líneas. Arrancar con capturas (`node scripts/qa-capturas.mjs`) + axe + mapa de bloques; diseño con la skill `bsm-design-system`.
3. **Resumen por permiso:** una fila por permiso (trozas · m³ · guías · especies · la más vieja); clic = filtra.
4. **«Solo este permiso»** de la banda también en el patio (`/api/admin/forestal/trozas/patio` + `CtpPatio*`).
5. **Filtros de alto valor:** días en el patio, rango de diámetro/largo, sin código («-»), CITES. Hoy hay 0 de 4 (`CtpPatioFiltros` trae especie, guía, permiso, proveedor, resolución, soloLibres y texto).
6. **Exportar el patio por permiso** a Excel (`exportToExcel` = 1 archivo por llamada).

**Decisión de diseño que hay que validar con capturas:** «¿cuántas trozas me quedan?» hoy se responde en **Consumos** (cuya ayuda dice «Qué madera entró a la sierra»), y la edad del patio está en **Saldos**. Propuesta: el resumen por permiso va en Saldos (el balance), con salto a Consumos ya filtrado para elegir trozas. Nada de página nueva.

**Datos reales** (Blas, 24-09, SQL de solo lectura, `scripts/tmp-patio-por-permiso.mjs`): **77 trozas / 155,65 m³ en 2 permisos.** `10-HUA-PUE/PER-FMP-2026-007` 46 trozas / 135,59 m³ / 8 guías / 7 especies · `19-SEC/REG-PLT-2021-017` 31 trozas / 20,06 m³ / 1 guía / 1 especie · 0 sin contrato · la más vieja del 08-09. Criterio: no consumida, no despachada, sin retrozos. **NO descuenta las guías sin recepcionar**: cruzarlo contra el KPI «Trozas en el patio» antes de presentarlo como el dato.

**Cómo construir:** INITIATIVE (5+ archivos, 2 áreas) → workflow por fases, o `frontend` + `backend` con archivos disjuntos + `reviewer` con contexto fresco. Nunca worktree.

**Siguen del 23-09:** avisos de plazos caídos (WhatsApp 401 + Resend) · reserva de Juancho vencida (la decide Brandon) · reiniciar Chrome · probar el audio real del cubicador · «Reinicio gratis» de Opus 5.5 hasta el 22-10 (lo decide Brandon).

---

# SESSION HANDOFF — 2026-09-23 (mañana): cubicador revisado y COMMITEADO · harness y PC

**Estado:** árbol limpio (sólo `main-data.json` y 4 `scripts/tmp-*` viejos, no son de esta sesión). 86 commits sin subir, 0 atrasados.

| Commit | Qué |
|---|---|
| `d95ebd1c3` | harness: paralelismo contado por `message.id` (real 1,20, no 1,00) · el arranque lee este archivo, no los `nextActions` de abril · `allowScripts` para npm 12 |
| `7fafafd3c` | fix trozas: `numerosDeTroza` + `DIAMETRO_MAX_CM = 200` (413 trozas reales, máx 115) |
| `e12a5f1ec` | feat cubicador: voz hasta 10, largo fijo, pitido, dueños que se eligen + 4 fallos del revisor (corte ajeno → pausa, calla al desmontar, fichas por `claveDueno`, audio no crea dueños) |

**Gates:** tsc ✅ · eslint 0 errores · 41 archivos 774/774 · foto del fix compilada aparte · navegador QA ✅ (pausa probada con motor simulado; **el audio real sigue sin probar**).

**PC (medido tras reiniciar):** BIOS 305 aplicada, pero la iGPU sigue con 512 MB; 26 congelamientos DWM desde el 15-09; al arrancar ya hay 242 MB de VRAM en uso contra un presupuesto de 190 (Chrome 101). Externa a 1920×1080 @ 240 Hz. Ubuntu: 0 fallos, apt al día, npm 12.1, vercel 59.25.4, `pam_lastlog` comentado (`/etc/pam.d/login.bak-2026-09-23`).

**Tarde (misma sesión):** push `8ab5cdd28..1bf4c9498` · `77db28e17` contexto de subagentes (agrupar llamadas, QA forestal) · `036a324ed` `scripts/qa-capturas.mjs` (recorrido en 1 llamada: 187→1 llamadas) · `430c4a12a` tope DAP 4 m. PC: 120 Hz aplicado (no libera VRAM), Chrome sin aceleración por política (**falta reiniciar Chrome**), PATH sin Node de Windows (`~/.bashrc`).

**Noche (misma sesión), COMMITEADO:** `622a7c12e` aviso + arreglo de un clic «el trato empieza después» (ADR-430; reviewer + security sin veto; auditoría que perdía 3/16 renglones bajo carga) · `3ed8de960` «Producir sin lote»: anular el día (anula, no borra), detalle sin scroll, «Más nuevas primero», sin pastillas, tira plegable, más compacto (reviewer 5 + security sin veto). Incidente: un agente dejó `SET SESSION READ ONLY` pegado en el pooler 3 min (reparado, producción sin errores) → regla en memoria `pooler-set-session-se-pega` y en el contexto de subagentes.

**Cierre (misma sesión):** WASACO COBRADO (15:44 UTC: trato 14/09 → 07/09, 6 cargos N° 30–35 = S/ 1 619,60, SELECT antes 0 · después 6) · `2c334edcd` reservas vencidas en la campana del libro con Liberar/Extender (+ editar apartado, que daba 422) · el tenant QA forestal NO se activó (los 3 QA de Blas están inactivos a propósito: crons + tienda pública sobre la base de producción) · todo subido · se lanzó la compactación del vhdx (APAGA WSL; resultado en `C:\Users\Usuario\.claude-tune\2026-09-23\compactar.log`).

**Para retomar (en orden):**
1. Leer `compactar.log` (esperado: ~79,8 → ~55 GB) y confirmar `wsl.exe --version` + dev server arriba.
2. **Avisos de plazos caídos desde el 12/09** (memoria `avisos-plazos-canal-caido`): WhatsApp 401 (token Meta) + `buleje.pe` sin verificar en Resend, y 10 días sin intentos. Necesita a Brandon; después, disparar el cron y mirar `NotificationLog`.
3. Reserva de Juancho (N° 29 Cachimbo, vencida 22/09) visible en la campana: la decide Brandon (liberar/extender).
4. Brandon: reiniciar Chrome (política sin aceleración) + F2 → UMA; contar DWM id 500 desde el 23-09.
5. Probar el audio real del cubicador; el panel admin podría dejar de usar `/api/tenants/resolve` público (403 en QA inactivo).

---
# SESSION HANDOFF — 2026-09-23 (madrugada, PAUSA pedida por Brandon): voz + dueños del cubicador SIN COMMITEAR

**Estado:** construido y verificado, **falta revisor + commit**. Brandon pidió parar acá. Nada de esta ronda está commiteado.

| Pedido de Brandon (23-09) | Qué quedó | Evidencia |
|---|---|---|
| Voz más rápida | slider hasta 10 (Chrome/Windows: `SetRate(int(10·log10(rate)))`, chromium `tts_win.cc:297` → «3,0×» era el paso 4 de 10); la lectura encola la fila siguiente sin `cancel()` entre filas | 27 tests de la cola |
| Más personalización | `cubicador-ajustes-voz.tsx` (tono, volumen, 2 interruptores, «Restablecer todo») | capturas claro/oscuro 1280/400 en `reports/visual-verify/` |
| Largo fijo al leer | «Continúa con Panguana, largo fijo 7 pies. 2, 8»; arranca con **5** iguales (medido en 700 piezas de Blas: con 3 se leía más largo), 3 de otro largo lo sueltan | 16 tests |
| Tip al guardar por voz con «Repite: no» | `lib/forestal/pitido.ts`, 70 ms; grave si la medida es rara; nada a mano | test con Web Audio falso |
| Dueños: crear sólo en el modal | barra y celda = `<select>`; voz sólo elige (`duenoDictado`); `aplicarDueno` ya no guarda; relleno/pegado tampoco | navegador QA: opciones, «Quitar los 3» (w/l/lu), «Usar su ficha», pieza atada al Directorio |
| Modal Dueños ancho | `variant="info"` 1024 px, 2 columnas, pie por prop `footer` (antes sin margen) | captura `duenos-modal-light.png` |
| **Bug que ya existía** (lo halló el agente) | dictado de TROZAS partía diámetros («50 60 4.5» → 5, 6, 4.5; 6/6 frases mal) → `numerosDeTroza` en `cubicacion.ts` | 21 tests |

**Gates al pausar:** typecheck ✅ 6,8 s · eslint 0 errores · vitest 24 archivos 475/475 · 0 `pageerror`.

**Para retomar (en orden):**
1. Revisor con contexto fresco sobre el diff (se lanzó y se detuvo al pausar: sin resultado). Foco: cola de la lectura (repetir/saltar fila, eco con varias utterances encoladas), largo fijo hacia atrás/desde la mitad, que ningún camino cree un dueño.
2. Commit de los 16 archivos (lista: `git status`, sin `main-data.json`, `scripts/tmp-*`, `SESSION_HANDOFF.md`). Sugerido: `feat(forestal): voz del cubicador más rápida, largo fijo al leer y dueños que se eligen` + un `fix(forestal): el dictado de trozas partía los diámetros` aparte (sólo `cubicacion.ts`, `CubicadorTrozas.tsx` l.18/228/393 y su test — ojo: `CubicadorTrozas.tsx` también tiene hunks de la voz).
3. Sin verificar: el audio real (velocidad de Microsoft Pablo, el tip en Android junto al micrófono).

**Pendiente de antes (no tocado):** WASACO en Blas: trato S/ 0,50 desde 14/09 y 6 corridas del 07/09 → **S/ 1 619,45 sin cobrar** (no cambié datos); 187 líneas de voseo en tienda/checkout; leyenda de venta en 5 renglones y «2671.2»; rama 81 commits sin push.

---


# SESSION HANDOFF — 2026-09-23 (madrugada): ADR-430 COMMITEADO · 81 commits sin push

**ADR-430 (precios por cliente, grupos, vínculos y saldo): COMMITEADO `cad28f460`** (87 archivos) + tuteo `c29819b1b`. Revisor + security (sin veto) pasados y arreglados; 247/247 tests del área; e2e en QA (vínculo que entra, libreta 0→1, venta 2 671,20, vaciada no se rellena, claro/oscuro). Memoria `precios-por-cliente-adr430`.

**Hallazgo en datos reales (Blas):** WASACO tiene trato S/ 0,50 **desde el 14/09** y sus 6 corridas son **del 07/09** → quedaron sin precio: **S/ 1 619,45 sin cobrar** (3 238,90 PT). Arreglo propuesto: mover la vigencia al 07/09 y recotizar (con permiso de Brandon) + aviso «el trato empieza después de la corrida» con arreglo de un clic.

**Otros medidos para la próxima:** 187 líneas en voseo en tienda/marketplace/checkout (panel admin = 0) · leyenda de la venta ocupa 5 renglones y el valor muestra 1 decimal («2671.2») · rama 81 commits adelante, 0 atrás.


Branch `audit/storefront-mejoras-verificadas-2026-06-15`. **Commits de esta sesión** (sólo mis hunks; los de los codemods de la mañana siguen sin commitear en los mismos archivos):
`779d928e4` .nvmrc 24.21 · `9b6339285` cubicador: orden por especie + especie dictada sola + lectura por tramos · `087e2d12c` libro: riel sin desborde a 400 px.

| Frente | Estado |
|---|---|
| PC | apt al día, WSL 2.7.14, 15/16 programas por winget, DNS de «Ethernet 2» = 1.1.1.1/8.8.8.8 (`C:\Users\Usuario\.claude-tune\2026-09-22\revert-dns.ps1`), atajos de teclado apagados (`revert-teclado.ps1`). **Firmware ASUS 10.1.2.305 instalado, se aplica al REINICIAR** (Brandon debe reiniciar con cargador; luego verificar BIOS 305 + contar DWM id 500 vs 23). Memoria `pc-ronda-2026-09-22-dns-teclado-dwm` |
| ADR-429 «Declarar producción» | **COMMITEADO** `7ac40e584` (antes: Directorio ADR-425/426/427 `3e8e0bf8a`, lib/format `9b7b98c9f`; después: 2 tests intermitentes). Cada commit exportado y compilado aparte. Pendiente: probar vincular+despachar con datos reales (el QA no tiene trozas) |
| Pendiente tras ADR-429 | commit (junto con/después de ADR-425/427), ver la venta propuesta en el navegador cuando una corrida sin lote tenga materia prima vinculada; commit separando hunks (método: índice = worktree − hunks ajenos vía `git hash-object`+`update-index`, NUNCA `git apply --unidiff-zero` que corre renglones) |
| Gotcha del hook | `vitest --changed HEAD` corre ~840 archivos: un test que importe un modal entero se corta a 15 s (memoria `test-que-importa-un-modal-se-corta-en-el-hook`) |

---

# SESSION HANDOFF — 2026-09-22 (uniformidad del panel, rondas 1 y 2 CERRADAS, nada commiteado)

Branch: `audit/storefront-mejoras-verificadas-2026-06-15`. **Nada commiteado hoy**: ~620 archivos modificados (136 eran WIP
previo de Brandon; el resto es de esta sesión). Cada frente tiene su patch de reversión en
`/tmp/claude-1000/-home-usuario-proyectos-Mercado/1633d2ad-cb1c-4e39-a59c-09bc75252ebf/scratchpad/uniformidad/`
(`codemod-formato.patch` 430 archivos · `codemod-z.patch` 96 · `codemod-densidad.patch` 106; `git apply -R <patch>` revierte uno solo).
Memorias: `formato-canonico-lib-format`, `uniformidad-panel-ronda-2026-09-22`, `gate-tsc-nativo-y-react-compiler`, `grep-de-auditoria-miente`.

## ✅ Ronda 1 (cerrada, gates verdes: tsc 4,5 s · tokens 0 errores · VRT 33/33 · vitest 11.083)
| Frente | Resultado |
|---|---|
| Fechas/hora/moneda | `lib/format` canon (Lima, 24 h, «—», `soloFecha`), 430 archivos / 1.073 llamadas, 2 reglas nuevas (warning) |
| Capas z | `globals.css §CAPAS` 6 nombres + `@utility`; 96 archivos + `AdminModal`; probado con `admin-css-probe.mjs` |
| KPIs | `StatCard` único (+`highlight/accentBar/iconEmphasis`), 9/11 clones, `dashboard/KpiCard` borrado, gate |
| Filtros Excel | primitivo `components/admin/shared/filtros-columna/` + `lib/admin/filtros-columna.ts`, 84/84 tests |
| Densidad | sólo seguro: `space-y-5→4`, `space-y-8→6`, tarjeta `p-8→p-6` (106 archivos) |
| Emojis | 50 archivos → iconos del DS; gate `ds-no-emoji-icon-admin`; nuevos iconos en `packages/design-system/src/icons.ts` |

## 🔄 Ronda 2 (agentes despachados con archivos DISJUNTOS — no relanzar sobre lo mismo)
| Agente | Alcance | Se lleva además |
|---|---|---|
| A filtros fase 2 (Opus) ✅ (reanudado tras el reset y cerrado) | HECHO en disco y compilando: 7 consumidores forestales al primitivo (`resumen-tabla-trabajo` no), `ctp-filtros-panel` −233 líneas, `DataTable.filtrable`, pilotos **Inventario / Compras (ReceivingTab) / Clientes (CRMTab)** con tests `*-filtros-columna.test.tsx`. Pedidos cerrado: kanban sin `<th>` → método de pago, repartidor y fecha como chips/selector en la barra, MISMO estado que `OrdersFilters` (badge «Filtros 2»); Clientes: un solo estado, pastilla = acceso rápido (verificado en ambos sentidos). Bugs hallados y corregidos: pastillas de categoría en 0 filas (`claveCategoria`, preexistente) y rótulos de cards móviles contaminados por el popover (`useMobileTableCards`). Gates finales: tsc 0 · eslint 0 · 98/98 tests · consola 0. **Pendiente**: captura del libro forestal (tenant correcto `inversiones-agroforestales-blas-sociedad-anonima`; `op-qa-ui` da 403) | la «escalera z» de `InventoryTab` no existía (falso positivo del censo) |
| B formato clones (Sonnet) ✅ | 25/25: clones borrados o convertidos en wrapper (`ctp-shared` mantiene firma para ~40 forestales; `GoalsTab.formatNumber`→`formatGoalValue`; `WaConversationList`→`formatConversationTime`); 315−/228+; tsc 0 · eslint 0 nuevos · vitest 11.089 · navegador Préstamos/Fiados/OC. Bug real corregido: «S/9970»→«S/9,970». Sin mapear a propósito: 7 líneas USD/PEN de Préstamos (el canon es PEN), inputs editables, export Excel numérico, weekday combinado | la escalera z de `FiadoModals` no existía (falso positivo del censo) |
| D rincones (Sonnet) ✅ | `CatalogOptionPicker` + `action-menu` a `z-system`/`z-modal-2` (orden DOM verificado); gate `ds-no-z-arbitrary-admin` (residuo 17 en archivos de A/C); `shared/KPICard` borrado tras migrar 6 consumidores (hex → `emphasis`); 7/16 clones de fuera migrados, 9 quedan con motivo (`onClick+active`, paletas por ícono, `KPIHeroCard` tiene más que StatCard) | también las capas de `ActivosModule`, `SimpleExpiryTab`, `SimpleMovementsTab` |
| C densidad ✅ (reanudado tras el reset) | 6/6 módulos con captura antes/después: grilla de 6 KPIs de Inicio → `inicio/_shared/kpi-grid.ts` (3 col ≤1699 px, 6 ≥1700; monto en 1 línea a 1366/1280/400); 70 `p-2→p-3` (POS 17, Documentos 11, Cacao 7, Forestal 33, Creativo 2); escaleras z de `POSView`/`UbicacionDoc`/`StoreCreativeMode` a capas con nombre (orden DOM medido); **bugs preexistentes arreglados**: menú «Opciones» del POS invisible desde 2026-06-10 (`absolute` dentro de `overflow-x-auto`) y tintes inválidos `bg-primary/10/[0.07]` en el editor. Propone: ocultado de ícono móvil dentro de `StatCard`; token `--breakpoint-3xl` (hoy 6 clases `3xl:` no hacen nada); capa con nombre para flotantes (`z-40` chips + 17 `fixed bottom z-50`); sembrar cacao en `main`. Capturas en `reports/visual-verify/2026-09-22-densidad-modulos/` | módulo por módulo: Inicio, POS, Documentos, Cacao, Forestal (tenant forestal), StoreCreativeMode último; `p-2→p-3` con captura antes/después; **`p-5` NO se toca** | escaleras z de `POSView` (10/20/30/40), `UbicacionDoc` (30/40), `StoreCreativeMode` (100/115/120) |

## ⚖️ Decisión pendiente de Brandon (con número)
`StatCard` del DS declara `default: p-5`, pero el panel usa **89 `density="compact"` explícitos** y las tarjetas a mano son
p-3 (65) vs p-5 (3). El «default» del DS es el que nadie usa. Opciones: (a) el DS pasa a `compact` por defecto dentro de
`[data-area=admin]`; (b) el default del DS baja a p-4; (c) queda como está y el codemod deja p-5. A/B ya capturado (`reports/visual-verify/2026-09-22-densidad-ab/`): p-4 vs p-5 = 8 px por tarjeta, imperceptible; el defecto real es que la grilla de 6 KPIs de Inicio parte el monto en dos líneas a 1366 px → va al agente C como hallazgo concreto.

## Residuo con número
⚠️ B reinició el dev server por caída de RAM con 3 agentes: si `/tmp/dev-server.log` deja de crecer, el log vivo es otro.

36 archivos del WIP de Brandon excluidos de TODOS los codemods (pasarlos cuando commitee) · 11 montos con ternario de nulo ·
40 formas raras de fecha sin mapear · promover a error las reglas nuevas recién cuando el residuo baje.

---

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
