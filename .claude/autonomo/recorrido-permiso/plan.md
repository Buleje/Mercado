# Recorrido del permiso — plan técnico de ejecución (27-10)

Doc de Brandon (lo que aprueba): https://claude.ai/artifact/3mi1HkTLY7T3x2v6B7wCzR
(«Plan maestro · de Capacidad a la salida por permiso»; columna Estado = Idea/Aprobada/En curso/Hecho/Descartada).
**No arrancar una fase hasta que Brandon la marque «Aprobada» o diga «ejecuta».** Releer el doc antes
(`read` con `sinceRev` 9) y las 5 preguntas de la última sección: cambian la fase 1 (orden de elección),
la 2 (no alcanza), la 4 (lote comercial, rol del N° de GTF) y la 0 (fecha de recepción).

## Mapa (2 architects, 27-10; cifras de Blas re-medidas por el hilo principal)

Blas (`cmpxiv6p4000bohvzwl6bnfpv`): 0 consumos · 0 despachos · 6 corridas · 0 lotes comerciales ·
5 lotes de aserrío sin trozas · 65 trozas libres · 14 ingresos: 7 con permiso, 0 con fecha de recepción.

Ya construido (ADR-403, ADR-464 fases 1-5, ADR-505, ADR-446):
- Capacidad: `CtpSaldosView.tsx:72` → `use-fuentes-de-capacidad.ts:102`; cálculo `lib/forestal/capacidad-de-planta.ts`
  (`esLibre` :217, `esPorRecepcionar` :227). Puente: `saldos/LlevarAlCubicadorModal.tsx` → `bloquesDeCandidato`
  (`capacidad-a-bloques.ts:449`) → `sembrarBloques` (`sembrar-reparto.ts:259`, localStorage). Bloque = permiso+especie+fuente
  con **todas** las `trozaIds` del grupo (incluye «por recepcionar», `capacidad-a-bloques.ts:251`).
- Reparto: `lib/forestal/cubicacion-reparto.ts` (`BloqueRolliza` :67, `trozaIds` :152, `trozasMedidas` :159,
  `BloqueDistribuido` :361, `MAX_TROZAS_POR_BLOQUE`=500 :64). Distribución guardada = KV `ctp-distribuciones:`
  (`forest-distribuciones.db.ts:19-54`, guarda lo cargado; `save` sin candado). Marcas en servidor (`forest-reparto-marcas.db.ts`).
- Del bloque al Libro: lote por bloque `lotes-por-bloque.ts` + `POST /lotes-aserrio/propuestas {modo}`; jornadas
  `jornadas-de-bloque.ts` (`planLibroDeBloque` :203 reparte TODAS las libres) + `use-registrar-jornadas.ts:108-147`
  (2 pedidos: `consumir` exigirTodas → `declarar_produccion`); «Registrar toda» `reparto-registrar-todo.tsx`.
- Consumo: T1 = `motivoNoElegible` (`forest-lote-aserrio.db.ts:201`); `consumir` :1284 (tx); `consumirEnPatio` :1518
  (compensación, NO tx); `setConsumosEnTx` (`forest-ctp-consumo.db.ts:417`, I1/I2/cierre/congelado, lock ORDER BY id);
  `vincularCorridaEnTx` (`forest-vincular-corrida.db.ts:413`, `PERMISO_DISTINTO`). Consumir por IDs sólo vía lote
  (`PATCH /lotes-aserrio accion:"consumir"`).
- Producción: `declararProduccion` (`forest-ctp.db.ts:1709`, `PAQUETES_NO_CUADRAN`, tope 56 %; puede cobrar aserrío ADR-412).
- Lotes: aserrío `ForestLoteAserrio` (schema :7407); mixto ADR-441; comercial `ForestProdLote`/`Miembro` (:7604/:7662), L1 en
  `forest-lote.db.ts:503`.
- Salida: despacho = `ForestCtpEntry section="despacho"`; origen `ForestCtpDespachoOrigen` (`setOrigenesEnTx`
  `forest-ctp-despacho.db.ts:215`); GTF `emitirGtf` :1297; Anexo→despacho `registrarTanda`
  (`forest-ctp-guia-desde-anexo.db.ts:735`, tx por guía, idempotente por N°); anexos en KV (`forest-anexos.db.ts`);
  «Pasar al libro» `reparto-anexo-al-libro.tsx`.
- Invariantes: códigos en `forest-ctp-consumo.db.ts:95-199` (I1-I6, L1, T1-T3). Siempre `≤`; faltante = `sinAtribuir`.

Cortes: (a) bloque consume todas las trozas; (b) **permiso no viaja a la salida** (`AnexoEmitido`
`anexo04-registro.ts:14`, `CorridaOrigen` `anexo-a-despacho.ts:125` sin permiso → el mejor ajuste cruza permisos);
(c) orquestación en el cliente (cerrar = corrida abierta); (d) compensación en `consumirEnPatio` y despacho de trozas;
(e) lote comercial fuera de la cadena; (f) datos: guías sin recepción/permiso; (g) tenant `"main"` de respaldo en la clave
localStorage (`sembrar-reparto.ts:46,56`, `CubicadorMadera.tsx:223`); (h) crear lote no mira mes cerrado (ADR-464 l.32).

## Fases (archivos disjuntos por carril; commits al cerrar cada fase, en fila con `commit-carril.sh`)

| Fase | Carril / modelo | Qué | Gate |
|---|---|---|---|
| 0 Datos listos | frontend sonnet + backend sonnet | lista de faltantes del grupo (guías sin recibir/sin permiso) con acción; quitar fallback `"main"` (g) | captura QA forestal |
| 1 Elegir trozas | backend opus (lógica) → frontend sonnet | `lib/forestal/trozas-para-bloque.ts` puro (`elegirTrozasParaBloque`: trozas enteras, objetivo = máx(usado/pct, usado/0,56), por día ≤ tope, ADR-505, desempate id, excluye por recepcionar); `ForestLoteAserrioDB.elegiblesDe` (+mes cerrado/congelado); `POST /distribuciones/trozas-para-bloque` sólo lectura; `trozasElegidas?: string[]` en `BloqueRolliza` + Zod `distribuciones/route.ts:69`; `planLibroDeBloque` y `lotes-por-bloque` leen `trozasElegidas ?? trozaIds`; candado en `ForestDistribucionesDB.save` | vitest casos (alcanza/no alcanza/56 %/no llegó/mes cerrado) + captura |
| 2 Jornadas seguras | backend opus + reviewer opus | `registrarJornadaEnTx` (crearEnTx + consumo piezas/m³ + declarar en 1 tx, sin compensación); `GET/POST /distribuciones/encadenado` (estado DERIVADO del Libro: lote por `loteId`, corridas vivas, despachos por `anexo.despachoIds`; POST ejecuta desde `siguiente` hasta `hasta`, `requireAdmin(["admin","owner"])`) | vitest + corte a la mitad y retomar en QA + reviewer |
| 3 Permiso en la salida | backend opus + reviewer opus | `permiso` en `AnexoEmitido` (JSON) y `CorridaOrigen` (derivado de `WoodEntry.originCode`/`corrida.originCode`); `proponerDespachoDeAnexo` excluye otros permisos; resto a `sinAtribuirM3` | test con 2 permisos que hoy se cruzan + reviewer |
| 4 Pantalla del recorrido | frontend opus (diseño nuevo) | stepper de 7 pasos desde el bloque, estado por paso, lote comercial opcional, «Datos para SERFOR» con Copiar, N° de GTF → `registrarGuia` con permiso | qa-capturas claro/oscuro/400 px |
| 5 Primer permiso real | hilo principal + Brandon | recorrido completo en `inversiones-agroforestales-blas-sociedad-op-qa-ui`; luego Blas con Brandon | salida atada + certificado completo |

Reglas: sin cambios de `schema.prisma` en ninguna fase (todo en JSON del KV o derivado). Un paso = una tx; nunca una tx
gigante (bandeja de anexos tomada hasta 60 s, `CTP_TX_OPTS` 20 s, órdenes de lock distintos → deadlock P2010).
ADR nuevo antes de la fase 1: «El bloque elige las trozas y el recorrido sigue por permiso desde el servidor» (`/adr`).
Mejoras del doc (sección 6) entran en la fase 4 salvo «trozas ya elegidas en otro bloque» (fase 1).

## Ejecución (estado vivo)

Brandon 27-10 aprobó: **todas las fases en orden** + las 5 mejoras; orden de elección = **las que llegaron primero**;
no alcanza = **registrar lo que alcanza** (faltante a la vista); **sin lote comercial** (salida directo de producción).
Abiertas con valor por defecto: N° de GTF lo registran dueño/admin (como hoy); recepción propone la fecha de la guía.

- [x] ADR-519 `docs/adr/ADR-519-recorrido-del-permiso.md`
- [x] Tanda A: carril 0 «Datos listos» → commit `100d347f8` (+ claves sin «main» alineadas en libreta-produccion/ResumenReparto, paso qa `modificar`, preset `recorrido-distribucion-sembrada`) · carril 1 «Elegir trozas» y carril 3 «Permiso en la salida» hechos, sin commit
- [x] Revisión: fase 1 (1 ALTO: propuesta ≠ reparto del Libro → misma `repartirEnDias`; +3 MEDIO +4 BAJO) y fase 3 (3 MEDIO: reasignar origen a mano, reproceso, motivo falso; +3 BAJO), arreglados por su carril
- [x] Commits tanda A: fase 0 `100d347f8` · fase 1 `90fd222c1` · fase 3 `193dfc755`
- [x] Contrato compartido fase 2 ↔ 4: `lib/forestal/recorrido-permiso.ts` (GET/POST `/api/admin/forestal/distribuciones/recorrido`, pasos datos·trozas·lote·jornadas·anexo·salida, estado DERIVADO)
- [x] Tanda B construida: carril 2 (`forest-jornada-bloque.db.ts`, ruta `/distribuciones/recorrido` GET/POST, `recorrido-estado.ts`, declarar/consumir partidos en EnTx) + carril 4 (`components/admin/forestal/recorrido/**`, hooks, `recorrido-pantalla.ts`, aviso en cubicador)
- [ ] Revisión fase 2: 1 ALTO (corte entre Libro y anotación del bloque → registrar dentro de `PlatformSettingsDB.actualizar` + adoptar huérfanos) + 1 MEDIO (N° de línea duplicable → advisory lock en `crearEnTx`) + 5 BAJO → en arreglo por carril 2
- [x] Carril 4 conectado a la ruta real (`porDia`, `usadoM3`, `continuar`, invalidar caché); probado en QA hasta el paso 4 (lote LA-2026-001 creado)
- [x] Revisión fase 2 ronda 2 (adopción): 2 MEDIO + 3 BAJO arreglados
- [x] Commit tanda B `b9065d7ce` (+ `740c471ee` regla del revisor: nunca stash)
- [x] Fase 5a: punta a punta en QA = 6/6 por la UI (corrida N° 48 0,912 m³ real 44 %, despacho GTF QA-519-0001 atado sólo a su corrida y permiso; SELECT: consumo ≤ ingreso, sin N° duplicados ni corridas abiertas; doble registro no duplica). Limpieza hecha salvo paquete PQ-2609-031
- [x] Arreglos de la prueba → pantalla `93ea6e066`, servidor `7fd852de7` (revisión: 1 MEDIO «Duplicar» + 4 BAJO, arreglados): servidor (unidades de paquetes, paquete vivo de corrida anulada, 409 distribución duplicada, total del pie a 3 decimales, aviso de plazo con salida registrada) · pantalla (recargar sin duplicar, GTF en el anexo existente, contador «sin anexo 04» con despachoIds, datos SERFOR se refrescan, errores visibles)
- [ ] Fase 5b: Blas con Brandon (recibir sus 14 guías y completar 7 permisos antes)

## Candados y escrituras fuera de la tx (para revisores; 27-10)

| Candado | Quién lo toma | Orden |
|---|---|---|
| Clave KV `ctp-distribuciones:{tenant}` (`PlatformSettingsDB.actualizar`) | `ForestDistribucionesDB.save/remove` (rutas, fuera de otra tx), `anotarBloque`, `escribirEnBloque` (jornada + anotación en la MISMA tx) | primero |
| Advisory `ctp-lineno:{tenant}:{section}` | `crearEnTx` (`forest-ctp.db.ts`) y `forest-ctp-sin-lote.db.ts` — todo alta de línea del Libro CTP | después de la KV |
| Corrida → lote → trozas `ORDER BY id` FOR UPDATE | `consumirEnTx` | después |
| Ingresos `ORDER BY id` | `setConsumosEnTx` (I1/I2, congelado) | dentro del consumo |
| Bandeja de anexos (otra clave KV) | `registrarTanda` (ADR-446) → producción → paquetes | flujo aparte, nunca dentro del de jornadas |

Escrituras después del commit (si fallan no rompen el Libro): cobro de aserrío ADR-412 (`cobrarSinRomper`), auditoría,
invalidación de caché. Antes de A1 (27-10) la anotación del bloque iba después de la tx del Libro → huérfanos; ahora va
dentro (`escribirEnBloque`) y la adopción de huérfanos es sólo defensiva (mismo lote entero, ningún otro bloque de
ninguna distribución lo tomó, nota «bloque <etiqueta>»).

### Pendiente (27-10, al cerrar)
- Fase 5b con Brandon en Blas (27-10 eligió **PLT-2021-017**: guía 019-001-0000003, 34 trozas TORNILLO 20,687 m³, tope aserrada 11,585 m³; tiene la cubicación; él pone las fechas en pantalla). Medido: las 14 guías sin `gtfDate` ni `fechaRecepcion` (todas asiento 19-10); las 7 de serie 010 sin permiso ni trozas. 3 cubicaciones guardadas de Tornillo (24-07 ×2, 05-08) sin GTF. Al avisar, verificar con SELECT cada paso.
- [x] «Anular el día» con el mismo control de paquete en guía → `6ce88be4f`.
- [x] Aviso de plazo de salidas en campana + Libro (una sola clasificación) → `ec0d82017`.
- QA: 5 paquetes huérfanos de antes del arreglo (FE0924B-01/02, QA503-P1/P2, QA504-P1): se limpian re-anulando sus corridas desde la app.
- `largoM` es `Decimal(8,2)`: 10' = 3,048 m se guarda 3,05 (3 decimales pediría migración).
