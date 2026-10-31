# ADR-363 — La troza que sale como entró

- **Fecha:** 2026-08-07
- **Estado:** aceptado
- **Contexto:** Libro CTP · Despacho · materia prima · invariantes I3/I5/T1
- **Relacionado:** ADR-326 (consumo por pieza) · ADR-135 (atribución del despacho) · ADR-325 (recepción) · ADR-362 (una guía, varios productos)

## El problema

El botón «Trozas / productos ingresados» del formato del SNIFFS existe porque un
CTP no siempre asierra lo que compra: parte de la madera se revende **en rollo**,
tal como bajó del camión. Para el libro, esa salida es un despacho más — pero uno
que no viene de ninguna corrida.

Hasta acá el libro sólo sabía despachar producto transformado:
`assertStockDisponible` mide `producido − despachado − reprocesado` por producto,
así que una salida de MADERA EN ROLLO daba stock 0 y se rechazaba. Y la
atribución (`ForestCtpDespachoOrigen`) apunta a una corrida: sin corrida, no hay
de dónde colgar la cadena de custodia.

Con el botón deshabilitado el operador tenía dos salidas malas: registrar la
venta como si fuera producto aserrado (que rompe el rendimiento del mes y miente
sobre lo que viajó) o no registrarla.

## La decisión

Una troza puede **salir sin aserrar**, y eso se registra igual que se registra
que entró a la sierra: marcando la PIEZA.

```prisma
model WoodEntryTroza {
  consumidaEnId  String?  // ADR-326 — la corrida que se la comió
  despachadaEnId String?  // ADR-363 — el despacho que se la llevó entera
  fechaDespacho  DateTime?
}
```

Referencia y no tabla puente, por lo mismo que el consumo: una pieza sale en UN
despacho. Con puente habría que prohibir por constraint que la misma troza
aparezca dos veces; así es imposible.

## Invariante T2 — qué troza puede salir

Una pieza se puede despachar sin aserrar si, y sólo si:

| Condición | Por qué |
|---|---|
| No está consumida en una corrida VIVA | Si se aserró, ya no hay troza que cargar |
| No está despachada en otro despacho vivo | La misma madera no viaja dos veces |
| Está recepcionada (`noRecepcionada = false`) | Lo que nunca llegó no puede salir (ADR-325) |
| No es descarte | El pedazo que no sirve no es producto |
| No es madre retrozada (`retrozos > 0`) | Salen los pedazos, no la madre: contarla con ellos es la misma madera dos veces (ADR-313) |
| Tiene volumen | Sin volumen no hay nada que declarar |
| Su ingreso está vivo y no anulado | Madera de una guía anulada no existe |
| El período no está cerrado | Un acta cerrada no se altera (ADR-139) |

El chequeo va **dentro de la transacción** y con `SELECT … FOR UPDATE ORDER BY
id` sobre las piezas pedidas: es el mismo recurso disputado que el consumo, y sin
el lock dos tablets despachan la misma troza. `ORDER BY id` porque sin eso las
dos se abrazan en deadlock.

## Lo que cambia alrededor (y por qué NO alcanza con la columna)

Una columna nueva que sólo la escribe el que la creó es un dato que miente en
todas las demás pantallas. Lo que se tocó:

| Lectura | Cambio |
|---|---|
| `trozasDelPatio` · `buscarTrozas` · `trozasDe` | Las tres traen `despachadaEn`, con su ESTADO: un despacho anulado devuelve la troza al patio |
| `serializar()` de `/trozas/patio` y `/trozas` | La whitelist suma `despachadaEnId` — sin eso el JSON lo omite y la pantalla declara libre una pieza que ya viajó |
| `estaDisponible` / `motivoBloqueo` (cliente) | «ya salió despachada» se suma a los motivos, con su nombre |
| `assertStockDisponible` (I3) | Una línea con trozas NO se mide contra `producido − despachado`: su stock son las piezas, y T2 ya lo validó |
| `saldos()` | El saldo de materia prima por especie resta lo que salió sin aserrar. Sin eso el patio declara madera que ya no está |
| `trazabilidad()` | Una línea con trozas tiene cadena **completa** con las guías de sus piezas: el origen es el ingreso, no una corrida |
| `annul` / `softDelete` de una línea | Sueltan sus trozas, igual que ya sueltan las consumidas |

## Consecuencias

- El despacho de trozas **no toca el rendimiento**: no consume ni produce, así
  que no entra en el 56 % (ADR-358) ni en el Cuadro Resumen 3.
- El certificado de trazabilidad de esa línea se emite igual: su cadena es más
  corta (ingreso → salida) pero está completa, que es lo que el gate exige.
- El costo de lo despachado (COGS) de esas líneas queda **desconocido** por ahora
  —`null`, nunca 0—: se deriva del costo del ingreso y eso es otra ronda.
- La UI: el botón «Trozas / productos ingresados» del alta abre el patio con los
  mismos filtros del picker de consumo y agrega renglones a la misma lista. En el
  papel salen como MADERA EN ROLLO, presentación TROZAS.

## Migración

`prisma/manual-migrations/363-despacho-de-trozas.sql` — dos `ADD COLUMN IF NOT
EXISTS`, un índice y la FK con `ON DELETE SET NULL`, todo idempotente y aplicable
por el pooler (DDL simple). Se aplica con `scripts/apply-363-migration.mjs`, que
prueba `DIRECT_URL` y cae al pooler si el DNS directo de Supabase no resuelve
(gotcha conocido del repo). Expand puro: ninguna lectura vieja depende de las
columnas nuevas.
