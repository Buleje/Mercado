# ADR-326 — Consumir la troza, no sólo el volumen de la guía

- **Fecha:** 2026-08-01
- **Estado:** aceptado
- **Contexto:** Libro de Operaciones del CTP · Sección 2 (Consumos) · fiscalización OSINFOR
- **Relacionado:** ADR-134 (`ForestCtpConsumo`, I1-I2) · ADR-312 (la troza trazable) · ADR-313 (retrozado) · ADR-325 (recepción) · port de `~/proyectos/appforestal` (`consumo`)

## El problema

En Buleje, dar de alta una corrida de producción era elegir **guías** y tipear
cuántos m³ de cada una entraron. En el patio nadie hace eso: se eligen los palos
que van al carro.

La diferencia no es de comodidad. Un fiscalizador no cuenta metros cúbicos
abstractos: cuenta **piezas** en la pila y pregunta por el código pintado en la
testa. Con el consumo en m³ el libro podía decir *"de la guía 019 se consumieron
6.80 m³"* y nadie podía responder **cuáles** trozas fueron.

Además, el volumen tipeado a mano es un número que puede no cuadrar con lo que
realmente entró: se escribe 6.80 y entraron 6.7998.

## La decisión

**El consumo del libro no se toca.** `ForestCtpConsumo` (ingreso → corrida, en
m³) sigue siendo donde viven las invariantes I1-I6, el costeo y los tres cuadros
resumen. Cambiarlo habría puesto en juego todo eso.

Lo que se agrega es **qué piezas fueron**, y el volumen se deriva de ellas.

### 1. Una referencia en la troza, no una tabla puente

`WoodEntryTroza.consumidaEnId → ForestCtpEntry`. La relación es 1:N de verdad:
una troza entra a **una** corrida y se acabó. Con tabla puente habría que
prohibir por constraint que la misma pieza aparezca en dos corridas; así es
imposible por construcción.

### 2. Elegir piezas DERIVA los consumos por guía

`agruparPorGuia()` es el puente entre las dos formas de mirar el consumo: el
operador tilda piezas, el libro guarda m³ por guía. Nadie tipea un número que
después no cuadra con la pila.

**El alta manual sigue funcionando igual**: si no se elige ninguna troza, el
picker de guías de siempre no se toca. El patio que todavía no carga listas de
piezas no pierde nada.

### 3. Qué NO se puede consumir (T1)

| Motivo | Por qué |
|---|---|
| ya consumida | otra corrida se la comió; consumirla dos veces es el patrón que I2 evita |
| no recepcionada | nunca llegó al patio (ADR-325) |
| descarte | ocupa volumen de su madre pero no es producto (ADR-313) |
| **madre retrozada** | al cortarla dejó de existir como pieza: van los pedazos |
| sin volumen | no habría qué atribuir |

**La madre partida es la regla que más cuesta ver.** Consumir la madre Y sus
pedazos contaría la misma madera dos veces — el mismo error que el Cuadro
Resumen 1 evita al no sumar el retrozado al saldo.

Las reglas viven una sola vez conceptualmente y se aplican en los dos lados:
`motivoBloqueo()` en el cliente pinta la fila en gris con el motivo, y la DB
class rechaza con `T1_TROZA_NO_CONSUMIBLE`. Si divergieran, lo que la pantalla
deja elegir la base lo rechazaría (o, peor, al revés).

### 4. Las bloqueadas se muestran igual

En gris y con el motivo al lado. Una pieza que el operador sabe que está en el
patio y no aparece en la lista se lee como un bug del sistema, y la próxima vez
no confía en la pantalla.

### 5. Las trozas se marcan DESPUÉS de crear la corrida

Mismo patrón que el reproceso (ADR-316): hace falta el id. Si ese paso falla, la
corrida queda guardada y se corrige desde el detalle — perder la producción de un
turno porque una pieza estaba mal sería peor.

## Consecuencias

- Migración `326-troza-consumida.sql`, idempotente, aplicada por el pooler.
- Índice `(tenantId, consumidaEnId)`: "qué trozas se comió esta corrida" es la
  consulta de la pantalla y del certificado.
- Endpoint nuevo `/api/admin/forestal/trozas/patio` (GET lista · POST marca).
  Devuelve **todas** las trozas, también las bloqueadas.
- Código de invariante nuevo: `T1_TROZA_NO_CONSUMIBLE`.
- Acción de auditoría: `ctp_trozas_consumidas`.
- El picker muestra el total en m³ **y en pie tablar**: acá la madera se habla en PT.

## Lo que NO se hace

- No se cambia `ForestCtpConsumo` ni las invariantes I1-I6.
- No se obliga a elegir trozas: el alta manual sigue siendo válida.
- No se consume la madre junto con sus pedazos.

## Referencias

- `lib/forestal/consumo-trozas.ts` · `__tests__/forestal-consumo-trozas.test.ts`
- `lib/db/wood-entries.db.ts` → `trozasDelPatio()` · `marcarTrozasConsumidas()`
- `components/admin/forestal/CtpTrozasPicker.tsx`
- `prisma/manual-migrations/326-troza-consumida.sql` · `scripts/apply-326-migration.mjs`
