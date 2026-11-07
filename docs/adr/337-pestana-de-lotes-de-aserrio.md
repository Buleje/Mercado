# ADR-337 — El lote de aserrío tiene pestaña propia, y llena el casillero (10) del libro

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro de Operaciones del CTP · Sección 2 (Consumos) · fase Operación · fiscalización SERFOR/OSINFOR
- **Relacionado:** ADR-334 (el lote de aserrío) · ADR-326 (consumo por pieza) · ADR-325 (recepción física) · ADR-311 (paridad con el formato oficial) · ADR-136 (el lote COMERCIAL, que es otra cosa)

## El problema

El lote de aserrío nació con ADR-334 como un panel **dentro** de Consumos: una
pantalla de armado colgada arriba del cuadro oficial de la Sección 2. Tres cosas
no cerraban.

1. **El armado no es un consumo.** Apartar madera en el patio pasa *antes* de que
   entre a la sierra; Consumos, en cambio, es el registro de lo que **ya** entró.
   Convivían la acción de mañana y el asiento de ayer en la misma pantalla, y el
   cuadro oficial —lo que se presenta— quedaba debajo de un formulario.

2. **Del lote no se podía saber nada.** Se veían el código, la especie y el
   conteo de piezas en una tarjeta mínima. No había forma de contestar «¿qué
   trozas tiene?», «¿hace cuánto está apartado?», «¿cuánto rindió?» ni «¿por qué
   este lote apartó 11.5 m³ y la corrida declaró 9?».

3. **El casillero (10) de la Sección 2 —«N° de lote consumido»— iba vacío a
   propósito**, con este razonamiento escrito en el código: *las trozas no
   tienen lote, los lotes se arman recién en producción*. Eso era cierto **hasta
   ADR-334** y dejó de serlo: desde que la corrida se declara sobre un lote de
   aserrío, el libro tiene el dato exacto que el formato pide y lo estaba
   dejando en blanco.

## Las opciones

| Opción | Por qué no / por qué sí |
|---|---|
| Dejarlo dentro de Consumos y agrandar el panel | Empeora el problema 1: más superficie de acción tapando el asiento oficial |
| Módulo aparte (tab del sidebar) | El lote no vive fuera del libro: sale de sus ingresos y muere en su producción. Un tab suelto lo desconecta |
| **Pestaña propia dentro del libro, en la fase Operación** ✅ | Es un paso del flujo del patio y comparte cabina, período y atajos con las otras cuatro |
| Llenar (10) con el lote **comercial** de la corrida | ❌ Se crea DESPUÉS del consumo: declararlo como origen es datar la trazabilidad al revés |

## La decisión

### 1. `Lotes de aserrío` es la segunda pestaña de Operación

Orden: **Ingresos → Lotes → Consumos → Producción → Despacho**, que es el orden
real del patio: llega la madera, se aparta la que entra junta al carro, se
aserra, sale producto. Atajo `L`.

**No lee el período** (como Trozas o Directorio): un lote abierto es estado vivo
del patio —lo que está apartado hoy—, no un asiento de junio. El período de lo
aserrado se sigue mirando en Consumos.

### 2. Lo que la pestaña muestra, y qué número es cuál

`lib/forestal/lotes-aserrio.ts` es puro y testeado (23 tests); la pantalla no
calcula, muestra. Dos definiciones que no son intercambiables:

- **volumen apartado** = sólo las piezas **libres** del lote. Si alguien consumió
  una pieza por fuera, la sierra va a recibir menos que lo que el lote declara, y
  el número grande tiene que ser el verdadero;
- **volumen del lote** = todas sus piezas. Es el que se compara contra el volumen
  de entrada de la corrida.

El **rendimiento** sólo existe si la corrida declaró en m³ — convertir pie tablar
a m³ para poder mostrar un porcentaje sería inventar el dato — y usa el mismo
veredicto que Consumos (`juzgarRendimientoConsumo`), no un criterio nuevo.

Tres alertas, ninguna bloqueante: lote **vacío**, lote **añejo** (≥7 días
apartando madera sin aserrar) y **pieza consumida por fuera**. Un lote consumido
por una corrida **anulada** se marca y se puede deshacer, que es la misma regla
del resto del libro: manda el ESTADO de la corrida, nunca el id pelado.

### 3. El casillero (10) se llena con el lote de ASERRÍO

`filasConsumo()` acepta el mapa `corrida → lote` y lo usan **los tres** lectores
de la Sección 2 —pantalla, Excel oficial y carpeta de fiscalización— para que no
declaren cosas distintas del mismo período. Sigue vacío en las corridas cargadas
a mano: el libro admite huecos, no datos inventados.

### 4. El lote se reusa en las otras pestañas

- **Producción**: «Producir» abre la corrida con el lote ya elegido (trae especie,
  volumen de entrada y piezas).
- **Consumos**: una tira dice cuánta madera espera la sierra y lleva a Lotes.
- **Trozas**: columna «Lote» — la pregunta del patio «¿dónde está la 118?» ahora
  se contesta con el lote, no sólo con la guía. Para eso, las **tres** lecturas
  de una troza (`trozasDelPatio`, `buscarTrozas`, `trozasDe`) y los serializadores
  de los dos endpoints traen `loteAserrio`.
- **Picker de piezas**: la troza apartada se sigue pudiendo consumir a mano —está
  en la pila— pero muestra su lote. No bloquea: informa.

### 5. Producir desde un lote ahora SÍ atribuye la materia prima

El hueco que destapó despachar un lote de verdad: `consumir()` marcaba las
piezas y nada más, así que la corrida quedaba **sin `ForestCtpConsumo`** — no
aparecía en la Sección 2 y su despacho no podía certificarse («corrida citada
sin origen»). El consumo del libro vive en dos lugares —las piezas y los m³ por
guía— y los dos se escriben ahora en el mismo paso: el reparto se **deriva** de
las trozas del lote con `agruparPorGuia()`, la misma función que usa el
formulario cuando el operador elige piezas a mano.

Se calcula **antes** de marcar nada: si I1/I2 rechazan, el lote queda abierto y
no hay medio consumo escrito. Y sólo si la corrida no tenía atribución propia —
un operador que la declaró a mano manda.

**Ningún gate estático lo habría visto**: `tsc`, `lint` y los tests pasaban en
verde con la cadena cortada al medio. Apareció al despachar un lote real y
mirar la ficha del despacho.

### 6. La cadena, medida de punta a punta

`guía 001-0000203 → 2 trozas → LA-2026-006 → corrida #95024 → consumo 2.3608 m³
→ casillero (10)` y, del otro lado, `despacho QA → corrida #95023 → LA-2026-005
(2 piezas) · el lote declara 2.5 de 6 despachados`. Todo borrado después: 0
lotes, 59 trozas en patio, 47 libres — los mismos números que antes de la prueba.

## Consecuencias

- El Excel oficial y la carpeta de fiscalización piden un endpoint más
  (`/lotes-aserrio`). Si falla, la columna (10) va vacía y el resto del libro
  sale igual; en la pantalla de Consumos ese fetch tiene su propio `catch` por lo
  mismo.
- `CtpLotesAserrio.tsx` (el panel viejo dentro de Consumos) se borró: su trabajo
  vive ahora en `CtpLoteArmarModal`.
- La invariante **L-A1** (una especie por lote) se hace evidente en pantalla
  *antes* de guardar —el botón no se habilita con dos especies elegidas— y el
  servidor la sigue validando pieza por pieza. Una pantalla no es una garantía.
