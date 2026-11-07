# Compactar el Libro CTP (17-10) — plan aprobado

Pedido de Brandon: «compactar, unificar pestañas (que tienen casi la misma función) para que se complementen, reducir espacios. Los botones de la página (filtros, opciones, nuevo ingreso y demás) se pondrán al lado de las pestañas en la esquina… manteniendo orden y jerarquía en todas las pestañas».

Línea base (QA forestal, 1280): la vista empieza en y=851 (banda 199 + 16 + puesta en marcha 482 + 16). Meta y≈318 (1280) / ≈418 (400). Memoria: `ctp-libro-compactar-linea-base-2026-10-17.md`.

F/ = components/admin/forestal/ · S/ = components/admin/shared/

## Mecanismo (agente A, `S/libro-acciones-vista.tsx`)
Cada vista pone sus acciones (Indicadores, Buscar, Filtros, Opciones, «+ Nuevo …», exportar, recargar) en la fila de vistas con `<AccionesDeLaVista>` (portal al slot de `libro-chrome`). Fuera del libro (tests, otros usos) se pinta en su lugar. Sólo en la RAÍZ de la vista, nunca dentro de un modal. `VistaHeader` y `useKpisPlegables` ya lo hacen solos (los cambia A). El título repetido de la vista se oculta dentro del libro: el riel ya dice dónde estás. API exacta: la que A publica en el archivo.

## Por vista (lo que hay hoy en su barra → al riel)
| Vista | Barra propia hoy | Primer dato hoy |
|---|---|---|
| Ingresos | Indicadores, Buscar, Filtros, Opciones, Nuevo ingreso | tabla 148 |
| Lotes | Opciones, Armar lote + título | 208 |
| Consumos | tarjetas Patio/Sección 2, título | tabla 354 |
| Producción | Opciones, Saldo por permiso, Producir sin lote, Indicadores | tabla 204 |
| Volumen disponible | m³/pt/Excel + título | tabla 537 |
| Despacho | Indicadores, Filtros, Opciones, Nuevo despacho | tabla 160 |
| Trozas | Indicadores + título | 176 |
| Radar | CSV, Imprimir, PNG, SVG, Recargar | 64 |
| Historia del lote | Elige el lote, Imprimir, Descargar, Recargar | 64 |
| Reprocesos | Indicadores, Actualizar | 96 |
| Planta | Indicadores, Nuevo despacho, Más opciones | 64 |
| EUDR | Indicadores, GeoJSON | vacío 826 debajo del mapa |
| Guías emitidas | Indicadores, Ir a Despacho | 128 |
| Tablero | 5 secciones + título + Indicadores | tabla 1236 |
| Saldos | título, Recargar, Descargar | tabla 795 |
| Cuadros SERFOR | título, Recalcular | 224 |
| Cumplimiento | «Chequeo del período», Indicadores, Descargar, Recargar | 326 |
| Cierre | Mes a cerrar | 192 |
| Fletes | Indicadores, Anotar viaje | 120 |
| Directorio | Agregar destinatario, Planilla + 7 secciones en 2 filas | 324 |
| Contratos | título, Actualizar | 561 |
| Ficha CTP | Editar ficha | 96 |
Muchas acciones → un botón «Opciones» con menú (ADR-489). Exportar/Imprimir/PNG/SVG/CSV/GeoJSON → dentro de «Opciones» o un «Descargar ▾». «Recargar/Actualizar» → ícono.

## Fusiones (22 → 16 vistas, sin perder nada)
| Se va | Pasa a | Evidencia |
|---|---|---|
| Cuadros SERFOR (`resumenes`) | Saldos › sección «Lo que firma el libro» (`SUBS_SALDOS`); se borra la tabla repetida de `F/saldos/SeccionLibro.tsx:9-10` (`TablaConciliacion.tsx:98-118` = Cuadro Resumen 1 `lib/forestal/loctp-resumenes.ts:101-110`). Saldos pasa de estado interno (`CtpSaldosView.tsx:54`) a `?sub=` | mismas columnas, misma fuente `/ctp` |
| Guías emitidas (`guias`) | Despacho › sección `guias` (`SUBS_DESPACHO`) | «Ir a Despacho» `CTPLibroOperaciones.tsx:849`; Despacho ya tiene «GTF salida» |
| Trozas (`trozas`) | Volumen disponible › «Por troza» (`CtpTrozasDisponibles.tsx:39-42`). NO perder «Días en el patio» ni «≈pt» ni la ficha con ‹ › ni D1/D2 (memoria `trozas-filtros-ficha-kpis-2026-10-05.md`) | 3 hooks leen `/trozas/patio` |
| Historia del lote (`historia-lote`) | Lotes › sección `historia` (`SUBS_LOTES`); tocar una fila abre su historia | mismo `use-lotes-aserrio` |
| Cierre (`cierre`) | Cumplimiento › «Cerrar el mes» (`SUBS_CUMPLIMIENTO`: `chequeo`, `cerrar`) | Cumplimiento ya dice «Aún no conviene cerrar» |
| Ficha CTP (`ficha`) | Directorio › «Tu CTP» (`SUBS_DIRECTORIO`) | datos que llenan la guía |
Se afinan (no se fusionan): Radar deja su pestaña Rendimiento y enlaza al Tablero; Reprocesos ↔ Volumen disponible y EUDR ↔ Radar se enlazan.
Resultado: Operación (Ingresos, Lotes, Consumos, Producción, Volumen disponible, Despacho) · Trazabilidad (Radar, Reprocesos, Planta, EUDR) · Control (Tablero, Saldos, Cumplimiento) · Gestión (Fletes, Directorio, Contratos).

## Archivos (disjuntos)
- A (cabecera): `S/libro-chrome.tsx`, `S/libro-acciones-vista.tsx`, `S/module-primitives.tsx`, `S/titulo-modulo.tsx`, `F/kpis-plegables.tsx`, `F/CtpArranque.tsx`, `F/ctp-vistas-fusionadas.ts` (sólo las listas SUBS_*).
- B (Ingresos, Producción, Despacho + Guías): `CtpIngresosKpis`, `CtpIngresosFiltros`, `CtpEntryActions`, `CtpEntriesView` (sólo su barra), `CtpDiaDeProduccionBarra`, `CtpParteBarra`, `CtpDespachoPestanas`, `CtpGuiasEmitidasView`, `CtpGuiasEmitidasBarra`, `CtpGuiasSeleccionBarra`, `GuiasAFormatoBarra` (+ los archivos de Producción/Despacho donde viva su barra).
- C (Lotes + Historia, Consumos, Volumen disponible + Trozas, Trazabilidad): `CtpLotesView`, `CtpLotesBarra`, `CtpHistoriaLoteView`, `CtpConsumosView`, `CtpConsumosSeccion2Barra`, `CtpVolumenDisponible`, `CtpTrozasDisponibles`, `trozas-disponibles-tabla`, `CtpTrozasView`, `CtpTrozasBarra`, `CtpTrazaRadar`, `CtpReprocesosDeclarados`, `CtpPlantaView`, `CtpPlantaCroquisBarra`, `CtpEudrPanel`.
- D (Control y Gestión): `CtpTableroControl`, `CtpSaldosView`, `saldos/SeccionesSaldos`, `saldos/SeccionLibro`, `saldos/SaldosCabecera`, `CtpResumenesSerfor`, `CtpCompliancePanel`, `CtpCierrePanel`, `CtpFletesView`, `CtpDirectorioView`, `CtpContratosView`, `CtpFichaEditor`.
- E (fase 2, al final, uno solo): `F/CTPLibroOperaciones.tsx` (`CTP_GROUPS` :169-228, switch :728-855, teclas :500-540), `lib/admin/subvistas-modulos.ts:50-73`, `app/admin/_lib/tab-migration.ts:230-234`, `CTP_VISTAS_FUSIONADAS`/`TECLAS_FUSIONADAS` en `ctp-vistas-fusionadas.ts`, enlaces del repo a `vista=(guias|trozas|historia-lote|resumenes|cierre|ficha)` e `irA("…")`, guardianes `admin-subvistas-sincronizadas`, `ctp-vistas-fusionadas`, `destino-tab`, `panel-sin-perdida` (+ `reports/panel/altas-aprobadas.json`), `sistema-subvistas`, `admin-module-standards`.
Si un agente necesita tocar un archivo de otro, lo pide al hilo principal.

## Verificar
Tenant QA forestal `inversiones-agroforestales-blas-sociedad-op-qa-ui`: `node scripts/qa-capturas.mjs --tenant <slug> --ruta "/admin?tab=ctp-libro-operaciones&vista=<key>" --anchos 1280,400 --temas claro --pasos '[{"esperar":2500},{"medir":"main"}]'`. Navegar entre vistas por el RIEL, no recargando cada una (memoria `qa-barrido-vistas-429-navegar-por-riel.md`: el barrido con recarga da 429). Reportar el y del primer dato antes/después.

## Agregado para E (17-10, del agente A)
- `tituloCorto="Libro CTP"` y `avisos={<CtpPendientes…/>}` fuera de `tools` en `CTPLibroOperaciones.tsx` (LO-TH podría pasar `tituloCorto="Libro TH"`).
- `ContratoActivoChip` («Elegir permiso», 241 px a 400): sólo ícono cuando aprieta, para bajar la fila 1 de 160 a 112 px a 400.
- `scripts/qa-pasos/ctp-ventanas.json`: el paso que clica al hermano de «Herramientas del libro» ya no aplica (las acciones del libro están dentro del «⋯»).
