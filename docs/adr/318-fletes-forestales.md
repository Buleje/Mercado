# ADR-318 — Fletes: el viaje también cuesta

- **Fecha:** 2026-07-31
- **Estado:** aceptado
- **Contexto:** costo de materia prima (ADR-134) · directorio forestal (ADR-317) · port de `~/proyectos/appforestal` (`ingresos-camiones`)
- **Relacionado:** ADR-317 (de ahí salen la placa, el transportista y el proveedor)

## El problema

En un aserradero de selva el transporte es el segundo costo después de la madera.
El libro registraba el costo de la materia prima (`WoodEntry.costoTotal`) pero no
el del viaje: quedaba en un cuaderno o en la cabeza del dueño. Dos preguntas
semanales no tenían respuesta:

- *¿cuánto me está saliendo el m³ traído?*
- *¿a qué transportista le debo y cuánto?*

AppForestal lo tenía en `localStorage` (`af_precio_flete_camiones`,
`af_terceros_registros`): se pierde al cambiar de máquina y no lo ve nadie más.

## La decisión

### 1. `ForestFlete`: una fila por viaje

Fecha, tipo (trajo materia prima / se llevó producto), guía que lo amparó,
vehículo, transportista, conductor, proveedor, m³ movidos, monto, quién paga y
si está pagado.

### 2. Sin monto → `null`, nunca `0`

La misma regla del costeo (ADR-134), y acá importa igual:

> un flete sin precio **no es un flete gratis**, es un flete que todavía no se
> cerró.

Un `0` bajaría el S//m³ del período — la dirección más peligrosa en la que puede
mentir un número que se usa para negociar el próximo viaje. Los promedios se
calculan sólo sobre lo que tiene monto y la UI muestra **cuántos quedaron
afuera** (KPI "Sin monto").

### 3. El S//m³ es ponderado, no promedio de promedios

Un viaje de 1 m³ a S/ 500 no puede pesar lo mismo que uno de 30 m³ a S/ 3000.
`resumirFletes` acumula monto y volumen y divide al final: `3500/31 = 112.90`, no
`(500 + 100)/2 = 300`. Hay un test que fija exactamente ese caso.

### 4. Snapshots además de los ids

La placa y el nombre del transportista se copian en la fila. No es
denormalización perezosa: **un viaje ocurrió**. Si el camión se da de baja o la
empresa cambia de razón social, el viaje de marzo siguió siendo el de la placa
que decía la guía. El id agrupa; el snapshot evita que lo agrupado mienta. Por
eso `porTransportista()` agrupa por id **o** por nombre: el transportista tipeado
a mano antes de existir en la libreta también tiene su fila.

### 5. Quién paga define qué significa el número

| `pagaQuien` | Qué es |
|---|---|
| `ctp` | Gasto: sale de la caja |
| `proveedor` | Se le **descuenta** al liquidarle su madera |
| `destinatario` | Lo asume quien recibe |

De ahí salen las dos vistas de cuentas: *Por transportista* ("a quién le debo") y
*A cargo del proveedor* ("qué le descuento").

## Lo que este ADR NO hace

**No toca el costeo del libro.** `WoodEntry.costoTotal` sigue siendo el costo de
materia prima y el margen (ADR-141) se calcula igual que antes. Sumar el flete al
costo *puesto en planta* cambia el COGS de cada despacho y el margen histórico:
es un paso posterior, explícito y con su propio ADR — no un efecto colateral de
haber empezado a anotar viajes.

Tampoco cierra la **liquidación completa** al proveedor (valor de su madera −
fletes − adelantos): para eso falta ligar el ingreso al proveedor por id, que hoy
es `providerName` en texto. Lo que sí queda es el lado de los descuentos.

## Consecuencias

- Vista nueva **Gestión → Fletes** (tecla `j`) con 4 KPIs y 3 pestañas.
- Baja lógica: un viaje borrado sigue habiendo ocurrido.
- Fechas date-only en UTC, como el resto del libro (si no, el viaje del día 1 se
  muestra el 31 en Lima).
- La placa se normaliza igual que en el directorio: sin eso, `b9x-777` y `B9X777`
  parten la agrupación en dos camiones.

## Referencias

- `lib/forestal/fletes.ts` (puro) · `lib/db/forest-flete.db.ts` · `__tests__/forestal-fletes.test.ts` (17 casos).
