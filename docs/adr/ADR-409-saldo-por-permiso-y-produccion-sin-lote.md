# ADR-409 — El permiso de la producción sin lote, y el saldo que se puede simular

- **Fecha:** 2026-09-10
- **Estado:** aceptado
- **Pedido por:** Brandon — «que la producción sin lote registre el permiso a vincular… y un apartado
  donde según el permiso esté la tabla de especies, su m³ en rolliza, la conversión a pies con 56 %,
  el volumen de la producción sin aserrar restado y el volumen sobrante que queda».
- **Depende de:** ADR-408 (producir sin lote) · ADR-402 (permiso declarado del asiento) ·
  ADR-358 (tope de rendimiento 56 %) · ADR-326 (trozas del patio)

## Contexto

«Producir sin lote» (ADR-408) registra la jornada que la sierra ya cortó cuando el lote todavía no
existe. La corrida nace **sin materia prima atribuida**, y eso está bien: inventarle trozas sería
fabricar trazabilidad. Pero también nacía **sin decir de qué título habilitante salió**, y ahí se
perdía la única pregunta que el dueño sí puede contestar el lunes a la mañana: *«esto es del permiso
tal»*.

Sin ese dato no hay forma de responder la pregunta que sigue —y que hoy no tenía ninguna pantalla—:

> Bajo este permiso entraron N m³ de rolliza. Al 56 % dan P pies tablares. Ya declaré Q sin lote.
> **¿Cuánto me queda?**

## Decisión

### 1. El modal declara el permiso, y va a `originCode`

El campo ya existía: `ForestCtpEntry.originCode`, el **permiso declarado del asiento** (ADR-402),
pensado justo para la corrida que no consume ninguna guía de la que heredarlo. No hace falta columna
nueva; faltaba dejarlo escribir **en el alta** (hasta hoy sólo se llenaba corrigiendo la línea):

- `createSchema` del POST, `CtpEntryInput` y `ForestCtpDB.create` aceptan y persisten `originCode`.
- La regla de ADR-402 sigue intacta: **la guía manda cuando existe**. Esta corrida no consume
  ninguna, así que no hay nada que pisar.
- Es texto libre con sugerencias, no un `select` cerrado: un permiso puede no tener todavía ninguna
  troza cargada, y rechazarlo empujaría a anotar la jornada sin él —que es el dato que después falta.

### 2. Un apartado de SIMULACIÓN, no una cifra del libro

`components/admin/forestal/CtpSaldoPermisoModal.tsx`, abierto desde la pestaña **Producción**. Por
permiso y por especie: trozas, m³ de rolliza, su equivalente en pies al 56 %, lo ya declarado sin
lote y el sobrante. No escribe nada y no cambia ninguna cifra de las otras pestañas.

Tres reglas que la pantalla dice en voz alta, porque callarlas la volvería mentirosa:

| Regla | Por qué |
|---|---|
| El 56 % es un **techo** (ADR-358), no un rendimiento esperado | «aserrable como máximo» ≠ «va a salir». Un número de cota máxima leído como promesa es madera vendida que no existe |
| Se resta **sólo producción sin lote** | Una corrida que consumió trozas ya se llevó su madera del patio; restarla otra vez contaría dos veces lo mismo. Por eso la base normal es la rolliza que **sigue en patio** |
| Lo que no está en m³ **no se convierte** | Se lista aparte. Un m³ inventado en un libro que se declara ante SERFOR es peor que un hueco |

La base se puede cambiar a «todo lo ingresado» —qué amparó el título en total— y entonces la
pantalla lo dice; son dos preguntas distintas, no dos versiones del mismo número.

Una especie con producción declarada y **sin** rolliza que la respalde aparece igual, con el
sobrante en rojo: es exactamente la fila que hay que poder ver.

### 3. La simulación se ve ANTES de registrar

En el modal de producir sin lote, elegir el permiso muestra cómo le queda el saldo a esa especie
(«sobrante: 0.505 → −0.265 m³»). No hay aritmética nueva: la corrida en borrador entra como una
corrida más en la MISMA función que dibuja el apartado (`simularCorrida`). Dos cuentas paralelas
para el mismo número divergen a la primera columna que se agregue.

### 4. Contrato: `GET /api/admin/forestal/ctp?saldoPermisos=1`

Devuelve **insumos agregados**, no filas finales: `rolliza` (por permiso → especie, con disponible e
ingresado), `corridas` (producción sin materia prima) y `patio` (total/leídas/truncado). Así la
pantalla cambia de base sin volver a pedir nada, y el 56 % vive en un solo lugar
(`lib/forestal/saldo-por-permiso.ts`, puro y con tests).

`ForestCtpDB.produccionSinMateriaPrima` define «sin lote» de forma literal: sin consumos y sin
`volumeInputM3`. **Sin período**: el saldo de un título habilitante no empieza el día 1 del mes.

### 5. Lo que el apartado deja hacer, además de mirar

Un cuadro que sólo mira no cambia nada. Las tres cosas que se pueden hacer desde ahí salen del
mismo hecho: **el libro que ya venía cargando sin lote llega con todo bajo «Sin permiso declarado»**
(ocho de ocho corridas, en el tenant de pruebas).

| Acción | Qué reusa | Por qué ahí |
|---|---|---|
| **Asignar un permiso a varias corridas** | `corregirLinea` (ADR-401/402), una por una | Es donde se ve el montón. Se eligen cuáles, se dice cuántos m³ se mueven y el resultado se detalla línea por línea: el servidor rechaza las que ya tienen materia prima y las de un mes cerrado |
| **Vincular la materia prima** | el MISMO `CtpVincularMateriaPrimaModal` de la pestaña, con sus cinco reglas | La corrida que el cuadro resta es justo la que no dice de qué madera salió. Los datos viajan con la corrida y no del listado del período: el saldo no mira período, y una producción de hace tres meses dejaría el click muerto |
| **Bajarlo en Excel o en papel** | `ctp-print-shared` y el patrón de `ctp-export` | Las dos salidas repiten la nota metodológica. Un Excel sin esas cuatro líneas se lee como un informe de capacidad, y es una simulación. El Excel trae además la hoja de las producciones que sostienen cada resta: sin ella el número no se puede auditar contra el libro |

El relleno masivo es **sólo de `originCode`**: es el campo que hoy es un hueco (ADR-402 §3), no una
afirmación que algo esté citando. Extenderlo a otros campos necesita su propio ADR.

## Consecuencias

- Aparece una lectura cara (el patio entero agregado): se paga **sólo al abrir el apartado**, nunca
  al montar la pestaña, y con TTL de 60 s en `ctpGet`.
- El apartado hereda el tope de la lectura del patio (5.000 piezas). Cuando trunca, lo **dice**.
- Una corrida sin lote sigue sin trozas atribuidas: el permiso declarado **no es** cadena de
  custodia. Vincular la materia prima real sigue siendo el acto aparte de ADR-408.
- El apartado no es sólo lectura: desde ahí se asigna permiso en tanda, se vincula la materia prima
  y se baja el cuadro. Ninguna de las tres inventa un camino nuevo — todas entran por el que ya
  existía.
- Se arreglaron dos cosas de ADR-408 que este camino destapó al usarlo de verdad:
  1. el código de paquete era `SL-1`, `SL-2`… y es **único en toda la planta**: la segunda
     producción sin lote chocaba. Ahora sigue la serie de la planta (`sugerirCodigoPaquete`);
  2. si la declaración de paquetes fallaba, la corrida del paso 1 **quedaba creada y vacía**. Ahora
     se deshace y el mensaje lo dice.

## Alternativas

- **Un campo nuevo en el schema para «permiso simulado».** Dos columnas para el mismo dato, y la que
  ya existe (`originCode`) es la que leen la columna «N° Permiso», el filtro y los KPIs (ADR-400).
- **Restar también las corridas que consumieron trozas.** Contaría la madera dos veces: esa rolliza
  ya no está en el patio.
- **Calcular las filas en el servidor.** El toggle de base pediría datos de nuevo, o habría dos
  aritméticas del 56 % (una por base) esperando divergir.
