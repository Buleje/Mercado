# ADR-431 — Patio por permiso: un criterio, dos puertas

- **Fecha:** 2026-09-24
- **Estado:** Aceptado (pedido de Brandon del 24-09: rediseño de Consumos y Saldos + «patio por permiso»)
- **Ámbito:** Libro CTP — pestañas Consumos, Saldos y Trozas; `GET /api/admin/forestal/trozas/patio`
- **Contrato:** `lib/forestal/patio-resumen.ts` (puerta: re-exporta todo lo de abajo), `lib/forestal/patio-dias.ts` (escala de días), `lib/forestal/patio-filtros.ts` (filtros y facetas), `lib/forestal/patio-por-permiso.ts` (`enPatio`, `resumenPorPermiso`), `lib/forestal/patio-excel.ts` (hojas del Excel), `lib/forestal/trozas-patio.ts` (pestaña Trozas), `WoodEntriesDB.wherePatio`

## Contexto

La pregunta «¿cuántas trozas me quedan por permiso?» tenía una respuesta distinta en cada pantalla. Medido en Blas el 24-09 (SELECT dentro de `BEGIN READ ONLY`):

- **SQL con el criterio del libro** (no consumida ni despachada vigente, no descarte, sin retrozos, con volumen): **77 trozas / 155,65 m³ en 2 permisos**. 10-HUA-PUE/PER-FMP-2026-007: 46 / 135,59, las 46 de guías recibidas, 8 guías. 19-SEC/REG-PLT-2021-017: 31 / 20,06, las 31 de una guía que sigue en la bandeja.
- **Antigüedad de Saldos (Aging)**: 125,22 m³. Son m³ del LIBRO por guía (declarado − consumido), no piezas.
- **Capacidad de Saldos**: 135,59 m³. Sólo lo recibido y libre.
- **Saldo por permiso de Producción (ADR-409, `agregarRolliza`)**: 155,65 m³. Suma como disponibles los 20,06 que no bajaron del camión.
- **Consumos**: 46 trozas. Esconde las 31 por recepcionar (`delPatio`) sin decirlo.
- **Pestaña Trozas**: 77 «Libre en patio · Se puede llevar a la sierra hoy». `estadoDeTroza` no miraba la recepción de la guía.

Encima, el mismo tronco se pintaba con **tres escalas de días**: la KPI de Consumos (añeja desde 15, `>=`), el Aging de Saldos (`>` estricto, 30/60) y la pestaña Trozas (menos de 30 / 30-59 / 60+). Una troza de 15 días era «añeja» en una y «fresca» en otra. Y dos funciones de días distintas: `diasEnPatio` (milisegundos con `floor`) y `diasParada` (día UTC).

## Decisión

1. **Un criterio, tres cubetas.** Sobre `estaDisponible` (el del libro): **libres** (guía recibida y sin lote), **en lote** (guía recibida y apartada) y **por recepcionar** (`guiaRecepcionada === false`). libres + en lote = **en el patio** (`enPatio`). `estaLibreEnPatio` = `enPatio` + sin lote, y `esLibre` de la capacidad delega en él: un solo predicado de «libre».
2. **`resumenPorPermiso(trozas, ahora)`** arma una fila por permiso con las tres cubetas, guías, especies (por la especie de la TROZA), la más vieja en el patio y los tramos. Recibe la respuesta ENTERA de `/trozas/patio`. Orden: m³ en el patio, luego m³ por recepcionar; la fila sin permiso al final. `≈pt aserrable` es un derivado al 56 % y se rotula así.
3. **Lo por recepcionar no cuenta días en el patio.** Su única fecha es el asiento de la guía: se muestra aparte como «guía asentada hace N días (sin recepcionar)» (`porRecepcionar.asientoMasViejo`, `diasDelAsiento`). `diasEnPatio` devuelve `null` para esas piezas; la KPI de espera y las añejas sólo miran lo que está `enPatio`.
4. **Una escala de días: `TRAMOS_DIAS_PATIO = [15, 30, 60]`**, bordes `>=`: 0-14 · 15-29 · 30-59 · 60 o más. Una función de días: `diasParada` (día UTC). La usan la KPI (`DIAS_PATIO_ANEJO = 15`), la columna y el filtro (`tramoDeTroza`), el Aging y la pestaña Trozas (`TRAMOS_ANTIGUEDAD` pasa a esos 4 tramos con las mismas claves). La tira de pendientes ya cortaba en 60 (`TROZAS_VARADAS_DIAS`). El texto sale de `ETIQUETA_TRAMO_DIAS` y la severidad va en palabras (`SEVERIDAD_TRAMO_DIAS`: fresca / añeja / varada), nunca sólo en color. Las claves (`hasta15`, `16a30`, `31a60`, `mas60`) son identificadores estables: `16a30` cubre de 15 a 29.
5. **La pestaña Trozas usa el mismo criterio**: `estadoDeTroza` suma el estado **«Por recepcionar»** (después de «no llegó», antes de «apartada»), que no cuenta en el patio ni envejece. «-» cuenta como sin código (`esSinCodigo`), igual que en Consumos.
6. **«Solo este permiso» también acota el patio, en el SERVIDOR.** `GET /trozas/patio?contratoId=` (`leerContratoId`: Zod `safeParse`; malformado = 400 `invalid_contratoId` antes de leer; vacío = sin filtro; se combina con `loteId`). La lista y el conteo comparten `WoodEntriesDB.wherePatio`, con `tenantId` en la raíz y `entry.contratoId` sólo si viene: un id de contrato de otro negocio devuelve 200 con 0 trozas. Usa el índice existente `@@index([tenantId, contratoId])` de `WoodEntry`. Sin migración ni SQL nuevo. La respuesta dice su alcance (`contratoId`).
7. **Filtros nuevos del patio**: tramos de días, largo, diámetro (`diametroCm` o el promedio de `d1Cm`/`d2Cm`), sin código y **guía CITES** (`guiaCites`: derivado de la guía, no de la troza). Con un rango puesto, la pieza sin dato queda fuera. Cada control se esconde si su faceta da 0 (en Blas: diámetro, sin código y CITES dan 0 de 77).
8. **Excel del patio por permiso** en UN archivo: «Por permiso», una hoja por permiso y «Qué se exportó» (alcance, filtros, «m³ del patio pieza por pieza; no es el saldo declarado», aviso si vino truncado). Los nombres de hoja salen saneados, sin repetirse sin distinguir mayúsculas contra TODAS las hojas del libro (incluidas las 4 de Saldos) y con el sufijo « (2)» cortado antes del tope de 31. `nombreArchivoPatio` devuelve el nombre sin «.xlsx» y con la fecha de Lima.

## Consecuencias

- **Cambian colores que el usuario ya conoce.** El Aging de Saldos pintaba de verde hasta 30 días lo que Consumos llamaba «añeja» desde 15; ahora los dos dicen «añeja» desde 15. La pestaña Trozas pasa de 3 a 4 tramos.
- **La pestaña Trozas deja de decir 77 libres en Blas**: 46 libres y 31 por recepcionar.
- La KPI «Trozas en el patio» (`enPatioPiezas`) es el número que comparten el contador de la pestaña y la fila de «Por permiso». La tabla con «Solo libres» apagado puede mostrar además las bloqueadas; la pantalla lo dice.
- Tres números del mismo patio siguen existiendo y **no se suman**: el saldo declarado (libro), los m³ del libro por guía (Aging) y los m³ del patio pieza por pieza («Por permiso»). Cada uno lleva su rótulo.

## Fuera de alcance (deuda anotada)

- `agregarRolliza` / `CtpSaldoPermisoModal` (ADR-409) siguen contando lo no recepcionado como disponible.
- `?grafo=1`, `saldos=1`, `conciliacion`, `curva`, `kardex`, `available=produccion` y `/lotes-aserrio` no leen `contratoId`. La tira de pendientes (`?varadas`) tampoco, y cuenta los 60 días con `NOW() - 60 days` (instante), no con `diasParada`.
- `diasParada` toma el día UTC de `hoy`: entre las 19:00 y las 24:00 de Lima suma un día (el patrón que `edad-del-patio.ts` ya resolvió leyendo `ahora` en Lima).
- Cuando la troza no tiene fecha de recepción propia, los días cuentan desde el ASIENTO aunque la guía tenga su fecha de recepción. En Blas, las 46 de 10-HUA son de guías recibidas el 11-09 y el 23-09, asentadas el 08-09: salen con 16 días («añejas») y no con 1-13.

## Alternativas descartadas

- **Una página «Patio» nueva**: serían 63 pestañas y la tabla quedaría lejos del clic que la filtra. El patio vive en Consumos y Saldos reusa el mismo componente.
- **Reusar `agregarRolliza`**: cuenta como disponibles 20,06 m³ que no llegaron.
- **Filtrar el contrato en el cliente**: hay 5 lectores de `/trozas/patio`; cada uno tendría que acordarse, y bajar el patio entero para tirar la mitad.
- **Un estado «no_recepcionada» para lo que está en la bandeja**: mezclaría «nunca llegó» (ADR-325) con «llegó y falta el papel».
