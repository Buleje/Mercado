# ADR-432 — Volumen y trazabilidad de un permiso

- **Fecha:** 2026-09-25
- **Estado:** Aceptado (pedido de Brandon del 25-09: «el volumen ingresado por permiso; ahí estará el resumen por tipo y especie del permiso elegido, lo consumido y toda la trazabilidad»)
- **Ámbito:** Libro CTP → Contratos → ficha del permiso; `GET /api/admin/forestal/contratos/[id]?volumen=1`
- **Contrato:** `lib/forestal/volumen-del-permiso.ts` (tipos de salida `VolumenDelPermiso`, entrada `EntradaVolumenDelPermiso`, `armarVolumenDelPermiso`, `m3DeCantidad`), `ForestContratoDB.volumen(tenantId, contratoId)`

## Contexto

La ficha del permiso (ADR-421) tenía el balance de plata, pero no la madera: cuánto entró con ese título, en qué especies, cuánto se aserró, qué se produjo y qué salió. `balance()` suma la producción sólo por `contratoId` y suma `quantity` sin mirar la unidad. El patio por permiso (ADR-431) cuenta piezas vivas, no la vida entera del permiso.

Medido en Blas el 25-09 con `ForestContratoDB.volumen()` (lectura, `BEGIN READ ONLY` para las verificaciones SQL):

- **10-HUA-PUE/PER-FMP-2026-007**: 21 filas de guía (8 GTF), **135,587 m³** de rolliza, 46 trozas (todas libres en el patio), 11 especies (Cachimbo 28,947 · Panguana 20,718 · Pashaco 19,543 · Copal 13,537 …). 30 corridas atadas, **46,1554 m³** (19 570 pt) de aserrada, y **0 m³ de consumo vivo**: el único consumo del libro (10,37 m³, línea 29, Cachimbo 5,154 m³, sin contrato) es de una corrida **anulada**, y una corrida anulada devuelve su madera al patio (`consumidoPorIngreso`). Cuatro especies se produjeron bajo el permiso sin haber entrado por él: Huayruro Negro 2,6434 · Machimango 1,82 · Copaiba 0,911 · Tacho 0,5896 m³.
- **Una GTF con varias especies se asienta en una fila por especie, pero TODAS sus trozas cuelgan de UNA de esas filas.** En 10-HUA, 13 de las 21 filas no tienen trozas propias: la GTF 010-001-0000008 cuelga sus 5 trozas (Azucar huayo ×2, Cachimbo, Huayruro, Pashaco) de la fila «Azucar huayo», y cada troza pesa exactamente lo que dice la fila de su especie. Contado por fila, la ficha decía «13 guías sin lista de trozas».
- **19-SEC/REG-PLT-2021-017**: 1 guía, 20,061 m³, 31 trozas **por recepcionar** (guía pendiente); 0 corridas. La otra guía que figuraba bajo ese permiso (019-001-0000003, 20,687 m³, sin trozas) está **rechazada** y no entra, igual que en `balance()`.
- **19-SEC/REG-PLT-2018-020**: 1 guía de 21,311 m³ **sin lista de trozas**; 4 corridas atadas (1,409 m³) sin un m³ de consumo registrado.
- **REG-PLT 2025-096 / 2026-032 / 2026-033**: 0 guías; producción de Tornillo de 3,814 / 3,091 / 0,434 m³ sin ingreso.
- **0 despachos** en todo el libro de Blas. En `main` sí se ve el hilo entero: CON-25-UCA-0142 tiene una corrida **heredada** (línea 95001, Tornillo 2,9778 m³, sin contrato, comió 5,1342 m³ de su guía) que salió en el despacho línea 42 (GTF 001-0000988, 1,7867 m³). CON-25-UCA-0207 tiene otra heredada (95002, Shihuahuaco 2,4821 m³).

## Decisión

Una lectura, **`?volumen=1`** en la ficha del contrato, que devuelve `{ contrato, volumen }`. La arma una función **pura** (`armarVolumenDelPermiso`) con estas reglas:

1. **Corridas del permiso = atadas + heredadas.** Atada: `contratoId` es este permiso (parte = 1). Heredada: sin contrato y comió de guías del permiso (`ForestCtpConsumo`); cuenta en la **proporción** de lo que comió de este permiso sobre todo lo que comió, así una corrida que mezcla dos permisos no se suma entera a los dos. Una corrida atada a **otro** contrato que comió de éste no suma producción acá: va a `avisos.corridasDeOtroPermiso` con el código del otro contrato.
2. **El consumo en m³ sale sólo de `ForestCtpConsumo`.** Las trozas marcadas (`consumidaEnId`) dan piezas, nunca m³ otra vez.
3. **Unidad de la aserrada:** `m3` tal cual, `pt` ÷ 424 (`PT_POR_M3`); cualquier otra unidad (kg, unidad, vacía) **no se convierte**: `m3: null` y `avisos.sinConvertir`. Una fila de `porTipo` con alguna corrida así va con `m3`/`pt` en `null` («—»), no con un total parcial; la fila por especie suma sólo lo que convierte. Los tramos de despacho (`ForestCtpDespachoOrigen.quantity`) se convierten con la unidad de SU corrida y se multiplican por la parte del permiso.
4. **`aserrablePt` es un derivado** (techo del 56 %, `pieTablarAserrableDe`) sobre todo lo ingresado; `saldoPt = aserrablePt − producidoPt` resta TODA la producción del permiso (atada + heredada). Una especie que supera su techo va a `avisos.excesos`; la especie **sin ingreso** no se repite ahí (ya tiene su aviso y su techo es 0).
5. **`saldoRollizaM3` es el saldo del LIBRO** (ingresado − consumido − rolliza despachada sin aserrar), no el patio pieza por pieza (ADR-431). La producción sin materia prima no lo baja: `avisos.corridasSinMateriaPrima` = las atadas con **0 m³ de guías de ESTE permiso** (`consumidoM3` 0), también la que comió sólo de otro permiso. Trae los `ids` exactos: la lista de Trazabilidad usa esos, así el aviso y la lista no pueden contar distinto.
6. **Lo que no se puede calcular es `null`** (`m3` de una corrida en kg, `rendimientoPct` sin ingreso o sin producción, `trozas` de una guía sin lista), nunca 0.

Y dos decisiones de lectura:

- **Estado de las trozas con el criterio de ADR-431**: `WoodEntriesDB.trozasComoConsumibles(tenantId, { contratoId })` (el mismo mapeo y el mismo `wherePatio` que el patio), y cada pieza cae en UNA cubeta con `motivoBloqueo` + `porRecepcionarDelPatio` + `enPatio`: libres, en lote, por recepcionar, consumidas, despachadas, no recepcionadas, retrozadas (madres). Descarte y sin volumen cuentan en `total` sin cubeta. `totales.trozas` no cuenta las madres retrozadas.
- **Cada troza va a la fila de SU especie dentro de la MISMA GTF** (`filaDeLaTroza`). Si su especie no tiene fila, o viene vacía, se queda donde está. Nunca cruza de GTF.
- **El m³ consumido sigue a sus trozas** (`repartirConsumo`). El lote anota el `ForestCtpConsumo` en la fila donde la troza está CARGADA (`forest-lote-aserrio.db.ts` agrupa por `t.woodEntryId`). Sin repartirlo, la fila Cachimbo diría «1 consumida · 0 m³» y la de Azucar huayo «0 consumidas · 0,8 m³» (en Blas, 29 de las 46 trozas de 10-HUA están cargadas en la fila de otra especie). Cada consumo (fila cargada × corrida) se reparte entre las filas de destino de las trozas que ESA corrida marcó en esa fila, en proporción a su volumen. Si la corrida no marcó trozas (consumo sólo por volumen), va a la fila de la especie de la corrida dentro de la misma GTF; si tampoco hay, se queda donde se anotó. El total por GTF, el del permiso y el `consumidoM3` de cada corrida no cambian.

Orden: especies por ingresado desc con las sin ingreso al final; `porTipo` por especie y luego m³ desc; guías, corridas y despachos por fecha (la guía, por su recepción si la tiene). **Totales = Σ filas** de especie: la cabecera y la tabla no pueden discrepar.

La DB class hace **dos tandas en paralelo**, sin una consulta por fila: (1) contrato, guías vivas, trozas, corridas atadas y consumos de las guías (con la corrida que comió); (2) todos los consumos de las corridas del permiso, sus tramos de despacho, los despachos que se llevaron trozas y el código de los otros contratos. `tenantId` va en la raíz de cada `where`. Medido: 0,35-0,9 s por permiso en el dev server.

## Consecuencias

- La ficha del permiso muestra lo que ninguna pantalla juntaba: en 10-HUA, 135,587 m³ ingresados contra 46,155 m³ producidos (34,04 %) **sin un m³ de consumo vivo**. El aviso «30 corridas sin materia prima, 46,155 m³» dice que el saldo de rolliza del libro (135,587) no bajó por esa producción.
- Las 4 especies producidas sin ingreso (5,96 m³) y los 3 permisos REG-PLT con producción y 0 guías aparecen como aviso y no como error: el libro admite huecos.
- La producción que ve esta ficha **no es la de `balance()`**: esa suma sólo las atadas y mezcla unidades. Con los datos de hoy coinciden (todo es `m3` y no hay heredadas vivas en Blas), pero pueden separarse.

- **Relacionado — ADR-433 (T3):** la vinculación que completa estas corridas ya no puede escribir una troza en una corrida anterior a su ingreso al patio. En Blas, 18 de las 30 corridas de 10-HUA (07/09-10/09) quedan sin madera vinculable hasta corregir las recepciones en Ingresos.

## Fuera de alcance (deuda anotada)

- `balance()` / `balances()` siguen sumando producción sólo por `contratoId` (sin heredadas) y `quantity` sin convertir la unidad.
- Sin rango de fechas: es la vida entera del permiso.
- `trozasComoConsumibles` viene con tope de 5000 piezas por permiso (Blas tiene 77 en todo el libro).
- Las piezas de una heredada en `porTipo` van en proporción y se redondean.
- No se cruza la especie de la corrida con la especie de la guía que comió.
- Sin Excel de la ficha.

## Alternativas descartadas

- **Una página «Volumen por permiso» nueva**: la ficha del permiso ya existe en Contratos (ADR-421) y ahí es donde se elige el permiso. Serían 63 pestañas para la misma pregunta.
- **Sólo `contratoId`**, como `balance()`: pierde las heredadas; en `main`, la corrida 95001 y su despacho no aparecerían bajo CON-25-UCA-0142.
- **Sumar el m³ de las trozas consumidas junto con `ForestCtpConsumo`**: es la misma madera dos veces.
- **Contar las trozas por la fila donde están colgadas**: 13 de 21 filas de 10-HUA se verían «sin lista».
- **Una ruta `/contratos/[id]/volumen`**: `?volumen=1` sigue el patrón de `?usos=1` y `?balance=1` (un solo guard de spec, auth y 404).
- **Todo en SQL**: la proporción de las heredadas y la reatribución por especie se leen y se prueban mejor en TS puro; son decenas de filas por permiso.
