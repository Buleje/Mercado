# ADR-373 — La producción repartida en jornadas

- **Fecha:** 2026-08-08
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Consumos (`lib/forestal/consumo-en-jornadas.ts`,
  `lib/forestal/registrar-jornadas.ts`, `CtpJornadasDelTurno`,
  `use-registrar-jornadas`, `CtpCubicacionParaConsumo`)
- **Relacionados:** ADR-370 (cubicar desde Consumos), ADR-364 (la corrida
  abierta), ADR-358 (tope de rendimiento), invariante T1 (consumo por pieza)

## Contexto

ADR-370 dejó la medición del lado del consumo: se cubica lo que salió de la
sierra y el reparto dice qué le toca a cada troza y a cada día. Pero se quedaba
en la pantalla. Para pasarlo al libro había que abrir el modal de producción y
rehacer la misma cuenta, jornada por jornada.

Lo que un aserradero hace de verdad: el turno del lunes son tres trozas, el
martes otras tres, y la medición se anota junta al final. Declararlo como **una**
corrida obliga a inventar una fecha para madera que salió en cinco días.

## Decisión

**Un botón «Registrar N corridas»** en el bloque de cubicación de Consumos, que
muestra el reparto **antes** de escribir —día, fecha, trozas, rolliza, aserrada,
piezas— y luego lo registra.

### 1 · El día parte las TROZAS, no cada troza

El reparto de Resúmenes (`porDia`) parte cada bloque entre jornadas. Para el
papel está bien; para el libro **no puede ser**: una troza se consume una sola
vez (T1). Si la troza 7 apareciera en la corrida del lunes y en la del martes, la
segunda sería madera que ya no está, y el libro declararía dos veces la misma
pieza.

Así que `armarJornadas` reparte **trozas enteras** entre los días —**LPT**: la
más grande al día más liviano— y las piezas que cada una ampara viajan con ella.
Es además lo que pasa en el patio: una troza se termina en la jornada en que
entró. Con menos trozas que días salen menos jornadas, **y se dice**.

### 2 · «Falló» no es un desenlace

Cada jornada son dos escrituras (consumir → declarar) y cinco jornadas son diez.
`registrarJornadas` distingue tres finales, porque se arreglan distinto:

| Qué pasó | Qué quedó en el libro | Qué hace el operador |
|---|---|---|
| Los dos actos bien | corrida declarada | nada |
| Consumió y no declaró | **corrida abierta con su materia prima** | declararla desde la tabla |
| No consumió | nada | ver el motivo y reintentar ese día |

El resumen **nombra el N° de línea** de las corridas que quedaron abiertas: sin
eso, esa madera queda consumida y sin producción y nadie sabe cuál es. Y dos
fallos seguidos por el mismo motivo cortan el resto: si el mes está cerrado, las
cinco jornadas iban a fallar igual.

### 3 · El libro se escribe con el nombre del catálogo

El patio dice «Comercial»; el formato oficial escribe **`MADERA ASERRADA
(COMERCIAL)`**. La primera corrida quedó con el nombre del patio y **sin
presentación**, porque `presentacionSugerida("Comercial")` no encuentra nada.
`productoDelTipoComercial()` es ahora el single source de esa traducción; «Otro»
y lo desconocido devuelven `null` a propósito —escribir un producto que el
catálogo no tiene es peor que dejar que lo elija una persona—.

Los códigos de paquete se piden **una vez** y se reservan en memoria: pedirlos
por jornada devolvía el mismo número dos veces (el anterior todavía no está
escrito) y el servidor rechazaba el segundo por duplicado.

## Consecuencias

- Lo medido una vez entra al libro con las fechas reales de cada jornada.
- La cuenta es la misma de Resúmenes (`distribuirPorCapacidad`, 33 tests): una
  segunda fórmula para el mismo reparto sería una segunda verdad.
- Sin lote elegido el reparto se ve pero no se escribe, y se explica por qué: la
  corrida se abre dentro de un lote de aserrío.

## Verificación

Tenant real, por el camino del usuario (Playwright, lote `LA-2026-043`, una
cubicación guardada de 30 piezas · 0.9439 m³):

| | Resultado |
|---|---|
| Dos días | corridas **N° 95054** (2026-08-08 · 0.5349 m³ · 17 pza) y **N° 95055** (2026-08-09 · 0.4090 m³ · 13 pza) |
| Suma | **0.9439 m³ · 30 piezas** — exactamente lo cubicado |
| Paquetes creados | `PQ-0291`, `PQ-0292` (uno por jornada, sin colisión) |
| Tras el fix del punto 3 | `PQ-0293` → **`MADERA ASERRADA (COMERCIAL)` · presentación `PIEZAS`** |

Sin errores de consola. 15 tests nuevos: 9 de `armarJornadas` (troza entera,
suma conservada, fechas corridas, reparto parejo, menos trozas que días) y 6 de
`registrarJornadas` (corrida abierta con su N°, corte por fallo repetido, avance).
