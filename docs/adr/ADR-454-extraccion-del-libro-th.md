# ADR-454 — Extracción del Libro TH: el permiso de punta a punta (BORRADOR)

- **Estado:** propuesto (borrador del architect, 2026-09-29). Sin schema nuevo, sin migración.
- **Pedido (Brandon, 29-09):** «una página donde esté todo el manejo, saldos, extracción: tabla de permisos, cuánto está aprobado según censo, cuánto se trozó = saldo, cuánto de despacho = saldo, y talado = saldo; el saldo es la resta del censo menos la operación. Gráficos de volumen por especie por permiso, general, extracción, KPIs». Eligió además «el permiso de punta a punta»: autorizado → talado → trozado → despachado → recibido en planta → aserrado, con aviso al 80 % y al 100 %.

## Contexto (medido, no supuesto)

| Qué ya existe | Dónde | Qué le falta para este pedido |
|---|---|---|
| Analítica del LO-TH | `ForestPlanDB.analytics` (`lib/db/forest-plan.db.ts:674`), `LothAnalyticsView.tsx`, `loth-analitica.ts` | Suma **todas** las líneas del negocio sin mirar el plan (`:684-687`); «plan activo» = el vigente más nuevo; no llega al CTP |
| Balance autorizado − movilizado | `computeBalance` (`lib/forestal/loth-constants.ts:242`) | No usa el censo; `movilizado` mezcla m³ de troza con m³ de producto aserrado |
| Indicadores del plan (autorizado, % aprovechado, movilizado, saldo, zafra) | `LothPlanIndicadores.tsx`, `analizarZafra` (`loth-zafra.ts`) | Un solo plan; sin tala/trozado/cadena |
| POA: aprovechables, semilleros, DMC | `analizarPoa` (`loth-poa.ts`), config KV `loth-poa:{tenantId}` (`forest-loth-poa.db.ts`) | El volumen aprovechable **excluye lo ya talado**: sirve para «qué queda», no como base fija |
| Etapa de cada árbol (incl. «en el CTP») | `estadoDeArboles` (`loth-etapa-arbol.ts:205`), `ForestLothDB.estadoDeArboles` (`forest-loth.db.ts:1520`) | Cuenta árboles, no suma por especie; mete las líneas sin plan en **todos** los planes (`OR planId null`) |
| Restante de la especie al talar | `restanteDeEspecie` (`loth-restante.ts:66`) | Usa el censo **entero** (sin descontar semilleros) |
| Estado de cada troza | `loth-tablero-trozas.ts` («Control del permiso») | Sin censo ni saldo |
| Ficha del permiso en el CTP | ADR-432, `ForestContratoDB.volumen` | Mira el permiso por `WoodEntry.contratoId`, no por árbol |
| Plan ↔ permiso | `ForestPlan.contratoId` (ADR-426), `ForestContrato.planId` (ADR-421), `permisoGemeloDelPlan` (`loth-plan-permiso.ts`) | **0 de 3 planes vivos** están unidos en ninguna dirección (Blas 2, main 1) |
| Gráficos | `recharts ^3.8.0` (`package.json:155`, 68 archivos); forestal: `trozas-disponibles-graficos.tsx` con `CHART_PALETTE`/`ChartTooltip` de `components/ui-system/charts`; envoltorios `BulejeStackedBar`, `BulejeComposedChart`, `BulejeFunnelChart` | El LO-TH no tiene ningún gráfico hoy (la Analítica dibuja barras con `div`) |

Advertencia que manda el diseño (`forest-plan.db.ts:~250`): la MISMA madera se asienta en tala, trozado y despacho; sumar filas de secciones distintas da el triple. **Cada operación se suma por separado y cada troza cae en UNA sola salida.**

## Decisión

### 1. Definiciones (fuente exacta de cada cifra)

Unidad de la tabla: el **plan** (`ForestPlan`, `deletedAt IS NULL`) = el «permiso» en pantalla. Especie = `claveEspecie()` (el plan escribe «Tornillo (Cedrelinga catenaeformis)», el libro «Tornillo»).

| Cifra | Fuente y filtro | Unidad |
|---|---|---|
| **Permiso del plan** | `ForestPlan.contratoId` → si no, `ForestContrato.planId = plan.id` → si no, gemelo por código (`permisoGemeloDelPlan`, `vinculo:"gemelo"`, sugerido, nunca escrito) | — |
| **Línea viva** | `ForestLothEntry` con `deletedAt IS NULL AND status='registrado'`, secciones `tala`, `trozado`, `despacho_troza`, `consumo_troza`, `entryDate ≤ hasta` | — |
| **Plan de una línea** | `planId`; si es null, el plan cuyo censo tiene su árbol (`claveDeCodigo(treeCode ‖ arbolDeTroza(trozaCode))`; despacho/consumo: el árbol de SU trozado); si no, fila **«Sin plan»** | — |
| **Censado** | Σ `ForestCensusTree.volumenEstimadoM3` del plan (`deletedAt IS NULL`), todos los estados | m³ · árboles |
| **Semilleros** | del regente: `normalizarCondicion(condicion)='semillero'`; del POA: `analizarPoa(...)` categoría `semillero` con la config guardada del plan (`ForestLothPoaDB.get`) y `taladosEnLibro` | árboles · m³ |
| **Excluidos** | categorías `bajo_dmc`, `sin_dap`, `descartado` de `analizarPoa` | árboles · m³ |
| **Censo aprovechable = «aprobado según censo»** (la BASE de los saldos) | censado − semilleros (regente + POA) − excluidos. **Incluye los ya talados** (categoría `talado`): la base no se achica al talar | m³ · árboles |
| **Autorizado** | Σ `ForestPlanSpecies.volumenAutorizadoM3` (`deletedAt IS NULL`) por clave; `null` si el plan no tiene especies (nunca 0) | m³ · árboles autorizados |
| **Talado** | 1ª línea `tala` viva por `claveDeCodigo(treeCode)` (T3); especie = la de la línea; `volumeM3` null cuenta en `n`, no en m³ | m³ · árboles |
| **Trozado** | 1ª línea `trozado` viva por `claveDeCodigo(trozaCode)` (T3) | m³ · trozas · árboles |
| **Despachado** | trozas cuya 1ª salida viva es `despacho_troza`; **m³ = el de su trozado** (la línea de despacho trae `volumeM3` null: main 2/2) | m³ · trozas |
| **Consumido en el TH** | trozas cuya 1ª salida es `consumo_troza` (rama, secciones 4-6) | m³ · trozas |
| **En el monte** | trozado − despachado − consumido, troza por troza (disjunto: `desp + cons + monte = trozado` exacto) | m³ · trozas |
| **Talados sin trozar** | árboles con tala viva y 0 trozas | m³ talado · árboles |
| **Recibido en planta** | trozas del trozado con `WoodEntryTroza.lothTrozadoId = trozado.id` (ADR-450), `noRecepcionada=false`, `WoodEntry.deletedAt IS NULL` y `status ∉ ESTADOS_SIN_INGRESO` (`anulado`,`rechazado`); m³ = el del trozado (misma medida que la cadena); aparte `m3Guia` = Σ `WoodEntryTroza.volumenM3` | m³ · trozas |
| **Aserrado** | de las recibidas, `consumidaEnId` a una `ForestCtpEntry` con `deletedAt IS NULL AND status<>'anulado'` | m³ · trozas |
| **Saldo de tala / trozado / despacho** | base aprovechable − talado / − trozado / − despachado (acumulado a `hasta`, NO dentro del período) | m³ |
| **Saldo autorizado** | `computeBalance(...).rows[].saldo` = autorizado − movilizado (la MISMA cuenta que la vista Plan) | m³ |
| **Avance (aviso 80/100)** | talado ÷ tope × 100; tope = autorizado si existe, si no el censo aprovechable | % |

Reglas de lectura: negativo contra el **censo** = «se midió más de lo estimado» (ámbar; el censo es 0,7854·DAP²·Hc·ff, la tala es Smalian), nunca infracción. Negativo contra el **autorizado** = exceso (rojo). Tolerancia 0,01 m³ (cinta, no epsilon).

### 2. Medición real (2026-09-29, lectura con `BEGIN READ ONLY`, funciones puras del repo vía tsx)

**Blas — plan `19-SEC/REG-PLT-2025-096` (PLANTACION, CCNN San Luis de Chinchiguani).** Sin permiso unido (gemelo `ctr_165b5048de1f37205cca0c`, 0 guías de ingreso con ese `contratoId`). 0 especies autorizadas. POA sin config guardada → 10 % por defecto. 6/6 líneas con `planId`.

| Especie | Censado m³ (árb.) | Semill. POA | Aprovechable m³ (árb.) | Talado m³ (árb.) | Saldo tala | Trozado m³ (trozas) | Saldo trozado | Despachado | Saldo despacho | En el monte |
|---|---|---|---|---|---|---|---|---|---|---|
| Copaiba | 126,922 (12) | 2 | 91,768 (10) | 10,3697 (1) | 81,3983 | 4,9510 (1) | 86,8170 | 0 | 91,768 | 4,9510 (1) |
| Lupuna | 92,666 (4) | 1 | 50,934 (3) | 15,5863 (1) | 35,3477 | 0 | 50,934 | 0 | 50,934 | 0 |
| Catahua | 89,894 (6) | 1 | 71,699 (5) | 0 | 71,699 | 0 | 71,699 | 0 | 71,699 | 0 |
| Mashonaste | 80,233 (13) | 2 | 62,540 (11) | 2,8368 (1) | 59,7032 | 0 | 62,540 | 0 | 62,540 | 0 |
| Sapotillo | 72,397 (16) | 2 | 58,805 (14) | 4,1418 (1) | 54,6632 | 1,6592 (1) | 57,1458 | 0 | 58,805 | 1,6592 (1) |
| Aguanomasha | 51,843 (8) | 1 | 42,527 (7) | 0 | 42,527 | 0 | 42,527 | 0 | 42,527 | 0 |
| Congona | 31,189 (3) | 1 | 13,178 (2) | 0 | 13,178 | 0 | 13,178 | 0 | 13,178 | 0 |
| Quinilla | 18,257 (3) | 1 | 9,068 (2) | 0 | 9,068 | 0 | 9,068 | 0 | 9,068 | 0 |
| **Total** | **563,401 (65)** | **11 (162,882 m³)** | **400,519 (54)** | **32,9346 (4)** | **367,5844** | **6,6102 (2)** | **393,9088** | **0** | **400,519** | **6,6102 (2)** |

Recibido en planta 0 · aserrado 0 · semilleros del regente 0 · excluidos 0. % extraído del censo = 32,9346 ÷ 400,519 = **8,22 %**. Etapas (`estadoDeArboles`): 61 en pie, 2 talados (100 y 114, 18,4231 m³ sin trozar), 2 trozados.

**Blas — plan `PO-2026-001` (Maderera Amazonica SAC).** Censo 2 Tornillo 6,1988 m³, autorizado 320 m³, 0 líneas vivas (las 8, de tala a despacho de producto, se borraron con `deletedAt` el 28-09) y el censo dice «talado» en los dos → 2 avisos `censo_talado_sin_tala`. Parece dato de prueba en el tenant real: con él, la vista «Todos» de Blas sumaba 406,7178 m³ aprovechables y 8,10 % extraído. **Corregido (29-09, base fija):** con los semilleros elegidos sobre el censo ORIGINAL, 002-TOR (55 cm) queda bajo el DMC del Tornillo (61 cm) y 001-TOR es su único semillero: el plan aporta 0 y «Todos» da 400,519 m³ y 8,22 %.

**main — plan `PO 12`** (POA 0 %): Tornillo censado 4,2474 (1) · autorizado 80 · talado 5,003 (1) → **saldo de tala −0,7556** · trozado 4,887 (4) → −0,6396 · despachado 2,761 (2) → 1,4864 · en el monte 2,126 (2) · recibido 0 (las 3 trozas del CTP atadas a su trozado están en ingresos **anulados**) · saldo autorizado 80 − 2,761 = 77,239. Misa 5,149 censada y **no autorizada**. Azúcar huayo 4,3074/45; Shihuahuaco 7,5278/60. Aviso `censo_no_dice_talado` (85-TOR sigue «en pie» en el censo).

**QA-ui (`cmtqtncxz001vs8vze4o3y7j9`):** 8/8 líneas sin `planId` y sin árbol en el censo → fila «Sin plan»: 5 trozas 16,985 m³ (1 despachada 4,1 · 1 consumida 5,63 · 3 en el monte 7,255); `DEMO-999-X` despachada sin trozado; `treeCode` 014-TOR ≠ censo DEMO-014 (el prefijo de la troza sí coincide). Sirve de fixture.

Verificaciones:
- **Sin duplicar:** `desp + cons + monte = trozado` en los 3 tenants (main 2,761+0+2,126 = 4,887; Blas 0+0+6,6102; QA 4,1+5,63+7,255 = 16,985). Σ especies = total en las 4 tablas.
- **Talado ≤ censo:** se cumple por plan y por especie en Blas. **No** en main (Tornillo 5,003 > 4,2474). Por árbol se pasa en 3 de 5 talas: 111 (+0,6947), 114 (+1,4083), 85-TOR (+0,7556). Es la estimación del censo, no un error del cálculo.
- **Trozado ≤ talado** (T4): se cumple por árbol en los dos tenants.
- `utmZona` vacío en los 65 árboles de Blas: no toca esta vista (no usa coordenadas); sólo el mapa.
- **Sin medir:** tiempo de respuesta con 2 000 árboles y 5 000 líneas (el mayor caso real: 65 árboles, 44 líneas).

### 3. KPIs (6, plegables, recordados en `loth-extraccion:kpis`)

| # | KPI | Fórmula | Contra qué se compara | Blas (plantación) |
|---|---|---|---|---|
| 1 | Extraído del censo | talado ÷ aprovechable | % del plazo corrido (`analizarZafra.avanceTiempoPct`); sin vigencia → «sin plazo» | 8,22 % · sin vigencia |
| 2 | Por talar | aprovechable − talado (m³), árboles aprovechables en pie, ≈ pt aserrable (`ptAserrableDeRolliza`) | desglose por especie (stock: sin delta) | 367,58 m³ · 50 árb. |
| 3 | Ritmo de tala | talado del período ÷ semanas | la MISMA función sobre `anterior` (flujo) | sin ritmo: 1 día con tala (< 14) |
| 4 | Se agota el | `projectSaldo(saldo tala, talado acumulado, 1ª tala, hoy)` | `vigenciaHasta`: ¿llega antes del cierre? | — (sin ritmo) |
| 5 | Trozas en el monte | n y m³ de «en el monte», días de la más vieja | % de lo trozado | 2 · 6,61 m³ |
| 6 | Llegó a planta | recibidas ÷ despachadas | trozas despachadas | «sin despacho todavía» |

«Talados sin trozar» y todo lo que pide trabajo va a los **avisos**, no a la grilla (memoria `deuda-no-es-indicador`).

### 4. Gráficos (5, plegables, recharts + `CHART_PALETTE`)

| # | Gráfico | Forma | Por qué |
|---|---|---|---|
| 1 | Por especie: censo vs operaciones | barras horizontales agrupadas (aprovechable, talado, trozado, despachado), 8 especies + «Otras»; clic = filtra la tabla | nombres largos; comparar 4 magnitudes de la misma especie |
| 2 | Permisos de punta a punta | una barra horizontal apilada por permiso con tramos **disjuntos**: despachado · consumido TH · en el monte · talado sin trozar/merma · por talar (suma = base) | la vista «Todos» en una mirada; los tramos no se pisan |
| 3 | Extracción en el tiempo | `BulejeComposedChart`: barras semanales talado/trozado/despachado + línea talado acumulado vs meta lineal (`analizarZafra.meses`) | flujo + acumulado contra el plazo |
| 4 | Cadena del permiso | `BulejeFunnelChart` en m³: censo (y autorizado) → talado → trozado → despachado → recibido → aserrado; «consumido en el TH» como nota de rama | es el «punta a punta» que eligió; la rama no se dibuja como merma (lección de `loth-analitica.ts`) |
| 5 | Árboles por etapa | barra apilada por etapa con `ETAPA_TOKEN` (mismos colores que el mapa) | cuenta árboles donde lo demás cuenta m³ |

### 5. Contrato

Tipos en `lib/forestal/loth-extraccion-tipos.ts` (bloque del reporte del architect, se pega tal cual). Funciones puras en `lib/forestal/loth-extraccion.ts`. Lectura en `ForestPlanDB.extraccion`. Ruta `GET /api/admin/forestal/loth/extraccion`:

| Parámetro | Tipo | Regla |
|---|---|---|
| `planId` | string ≤64 | excluye a `contratoId`; 404 si no existe |
| `contratoId` | string ≤64 | resuelve plan por `contratoId`, `planId` o gemelo; permiso sin plan → 200 con `permisos: []` y aviso `permiso_sin_plan` |
| `desde`, `hasta` | `AAAA-MM-DD` | ventana del período (flujo); por defecto 1ª línea → hoy Lima (`limaDateKey`). Los saldos son acumulados a `hasta` |
| `antDesde`, `antHasta` | `AAAA-MM-DD` | los dos o ninguno; los calcula la pantalla con `periodoAnterior` (`ctp-period.ts`) |

Guard: `withApiHandler("forestal-loth-extraccion")` → `requireAdmin(req, ["admin","almacenero","owner"])` (igual que la analítica, sin plata) → `applyRateLimit(req, "GENEROUS", "loth-extraccion")` → `isSpecializationEnabled(tenantId, "spec:forestal:loth-libro")` (403) → Zod `safeParse` (400). Sólo lectura, sin caché en v1 (una escritura del CTP no invalida el prefijo `forest-plan`).

### 6. Lugar en la pantalla

Vista nueva `extraccion` («Extracción», hint «Censo − tala, trozado y despacho por permiso»), **primera del grupo Gestión**, antes de Rentabilidad y Analítica. Orden de la vista: `SectionTitle` + ⓘ + selector de permiso (Todos / cada plan / Sin plan) + período (`CtpPeriodPicker`) + menú, en una fila → avisos (una línea + ⓘ, máx. 3 visibles) → KPIs plegables → tabla (Todos: una fila por permiso; un permiso: una por especie; filtro de especie en la cabecera) → gráficos plegables.

| Queda en Analítica | Pasa a Extracción | Sobra (se dice, no se borra) |
|---|---|---|
| veredicto, anomalías, flujo bosque → producto terminado, «¿qué especie deja plata?», costos operativos, CSV | saldos contra el censo, cadena hasta el CTP, ritmo, proyección, avisos 80/100, gráficos | KPI «Saldo autorizado (días)» de la Analítica = KPI 4; su «Cuadro por especie» se solapa con la tabla. La Analítica sigue sumando todo el negocio sin mirar el plan |

## Alternativas descartadas

1. **Ampliar la Analítica:** no mira el plan, y cambiarlo mueve cifras que ya se leen. Queda para otro ADR.
2. **Ampliar la vista Plan de Manejo:** ya es la base maestra (censo, POA, especies) y es larga; la regla de 2,5 pantallas no da.
3. **Calcular en el navegador** con `estado-arboles` + `plan`: rompe «totales en backend» y el libro del cliente se corta en 500 líneas.
4. **Contador o tabla de saldos:** el saldo se deriva de las líneas, nunca es un contador propio (skill `serfor-osinfor-compliance` §3). Sin schema.

## Consecuencias y riesgos

1. **Semilleros del POA en una plantación:** el 10 % por defecto le quita a Blas 11 árboles y 162,882 m³ (29 %) de la base; el regente declaró 0. Lo decide Brandon: poner 0 % en Parámetros del POA (un dato) o la regla «plantación sin semilleros» (otro ADR). Aviso `semilleros_sistema_vs_regente`.
2. **Dos «restantes»:** `restanteDeEspecie` (formulario de tala) usa el censo entero; esta vista, el aprovechable. En Blas difieren en 162,882 m³. Nombres distintos + ⓘ; alinear en seguimiento.
3. **Líneas sin plan:** `ForestLothDB.estadoDeArboles` las mete en todos los planes (`OR planId null`); con 2+ planes el mapa las cuenta dos veces. Esta vista las atribuye por árbol y deja «Sin plan». Alinear el mapa en seguimiento.
4. **`movilizado`** (`computeBalance`) suma m³ de producto aserrado con m³ de troza; el saldo autorizado lo reusa para coincidir con la vista Plan, y la cadena usa `consumo_troza` (m³ de troza).
5. **Umbrales:** `detectAnomalias` avisa al 90 % (saldo < 10 %); esta vista al 80/100. Se mantienen los dos por ahora.
6. **Plan de prueba en Blas** (`PO-2026-001`, 320 m³ autorizados contra 6,2 m³ de censo) infla «Todos» hasta que se dé de baja.
7. **Rendimiento (sin medir):** 6 consultas en paralelo, topes 20 000 árboles / 50 000 líneas (los de `estadoDeArboles`), `limites.truncado` si se alcanzan; todo lo demás O(n). Medir p95 en QA antes de cerrar.
8. **Especies:** todo cruce por `claveEspecie`; «fuera del plan» sólo si el plan tiene especies autorizadas (la plantación de Blas tiene 0: nada puede estar fuera). Las parecidas (`cruzarEspecies().ambiguas`) avisan, no se funden.
