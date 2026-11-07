# ADR-444 — Un paquete, una guía vigente; y el alta del despacho en un solo acto

- **Fecha:** 2026-09-27
- **Estado:** aceptado (implementado)
- **Pedido por:** Brandon (27-09): «Cuando se registra el despacho, los productos usados quedan usados (la guía queda en borrador) y en Productos disponibles esos productos ya no están hasta que se anule la guía. Tampoco debe ser posible hacer varias guías con el mismo producto.»
- **Depende de:** ADR-134/135 (invariantes I1-I5, atribución despacho → corrida) · ADR-349 (paquetes de la corrida) · ADR-363 (salida de trozas sin aserrar) · ADR-418 (reservas) · ADR-441 (patrón `…EnTx`).

## Contexto (medido el 27-09 por el camino real del modal, en `main`)

| Caso | Paquete | Corrida sin paquetes | Troza |
|---|---|---|---|
| ¿Sale de Productos disponibles tras registrar? | **NO** (seguía PQ-001) | sí | sí |
| ¿Sale del selector del modal? | **NO** | sí | sí |
| ¿Se puede hacer una 2.ª guía con lo mismo? | **SÍ entraba** | sólo por el saldo que queda | no (422) |
| Pedido que no entra en el saldo | **422 con la línea YA grabada**; cada reintento sumaba otra | — | — |
| Borrador (sin N° de guía) | cuenta como usado (bien) | | |
| Anular | libera, pero anular una guía liberaba el paquete aunque otra guía viva lo llevaba | | |

Causas:
- El paquete no tiene estado «despachado»: el despacho sólo guarda su código en `codigoProducto` y cita la corrida por cantidad. La lista mostraba todos los paquetes vivos y el tope `min(paquete, saldo)` disfrazaba el que ya había salido.
- `ForestCtpDB.create` grababa la línea en una transacción y `setOrigenes` validaba los orígenes en OTRA: un I5 o un producto que no cuadraba llegaba después del INSERT. El modal deja la fila para reintentar, y cada reintento duplicaba la línea.
- Blas: 174 paquetes declaran un producto distinto al de su corrida (p. ej. «(COMERCIAL)» en una corrida «(TABLA)»). I3 agrupa sin el paréntesis y pasaba; el paso 4 de los orígenes (producto crudo) los rechazaba — después de grabar. Así nacieron las líneas **#2 y #3 de Despacho en Blas**: SL-681, borradores, **sin origen**, a un minuto una de otra (27-09 18:38 y 18:39).

## Decisión

1. **Una sola transacción.** `ForestCtpDespachoDB.setOrigenesEnTx(tx, …, { cierres })` es el núcleo de `setOrigenes` (mismas reglas, mismo orden, locks de corridas `ORDER BY id`) y `create` lo llama DENTRO de su transacción, después del INSERT. La auditoría (`ctp_origenes_set`) y la caché van después del commit (`despuesDeOrigenes`, con `auditCtpEsperando`). Un 422 ya no deja línea ni consume N° de línea. Cubre también el import de salidas (`wood-entries/import`, mismo `create`): una fila cuyo origen no cuadra ahora se reporta como error y no entra a medias.
2. **Un paquete, una guía vigente.** Si `codigoProducto` es el código de un paquete del tenant, `exigirPaqueteLibreEnTx` bloquea ese paquete (`FOR UPDATE`), relee bajo el lock y rechaza si hay un despacho vivo (`status = registrado`, no borrado; borrador o emitido da igual) con ese código → `PAQUETE_YA_DESPACHADO`, **HTTP 409**, con un mensaje que nombra el paquete, la guía (o «una guía en borrador») y la línea. Orden: el lock de I3 (corridas) primero —siempre, aunque la línea no traiga cantidad—, después el paquete; y el paquete se juzga ANTES del stock, porque sacar dos veces el último bulto de un producto decía «sólo quedan 0,5» cuando la causa era «ya va en otra guía». Las trozas sin aserrar no pasan por acá (su código es de una pieza; T2 las cuida), y una salida de trozas **no cuenta** como despacho del paquete aunque su `codigoProducto` coincida (la salida de UNA troza guarda el código de la pieza: en Blas los paquetes «55»…«72» comparten número con 18 trozas libres). La marca persistente es la pieza colgada del despacho (`trozasDespachadas: { none: {} }`), no `desdeTrozas`. Anular la guía lo libera solo: el criterio es el estado del despacho, no una marca en el paquete.
3. **Disponibles y selector.** `productosDisponibles` excluye los paquetes con despacho vivo con UNA consulta (`codigosDespachados`: `codigoProducto in […]`), y saca la corrida que ya despachó TODOS sus paquetes (su saldo restante es una diferencia del libro, no un bulto; sigue a la vista en Saldos). Todo lo que lee `?disponibles=1` —el selector de la guía, «Productos disponibles» y su resumen, el mapa de planta, despachar desde lotes, el reparto de paquetes— hereda el corte. La campana de reservas vencidas usa el mismo criterio.
4. **Producto del paquete.** En el paso 4 de los orígenes vale el producto de la corrida **o el del paquete que va en ESA línea** (`despacho.codigoProducto` → ese paquete, de esa corrida; el paquete pertenece a su corrida, ADR-349). Sin código de paquete, la comparación estricta de siempre. Lo atribuido a la corrida por ese paquete no pasa de lo que el paquete mide (`I4_SOBRE_ATRIBUCION_DESPACHO`). La especie y la unidad siguen siendo las de la corrida. Siempre `≤`: nada de esto fuerza atribución.
   - *Corrección tras la revisión (27-09):* la primera versión aceptaba el producto de **cualquier** paquete de la corrida; una salida «(COMERCIAL)» sin código sacaba 2 m³ de una corrida «(TABLA)» con 0,5 comerciales — «corta contra comercial» por otra puerta, y en Blas hay 30 corridas con paquetes de productos mezclados.

El modal de la guía (`CtpDespachoGuiaModal`) sólo cambia el cierre del aviso ante el 409: «Quítalo de la lista para registrar el resto.» en vez de «quedó en la lista para reintentar».

## Consecuencias

- **Dato viejo de Blas, sin tocar:** las líneas #2 y #3 de Despacho (SL-681, borradores sin origen) cuentan como guías vivas: SL-681 sale de Productos disponibles (Blas pasa de 3 paquetes listados a 1: SL-680 ya salió en la guía 19-00000-000001, SL-681 lo retienen #2/#3; queda SL-682 con 0,754 m³ del libro contra 0,5 de etiqueta). Para despacharlo hay que **anular #2 y #3** y registrarlo de nuevo (ahora entra por el punto 4). Anular sólo una no lo libera.
- **Salto de numeración:** `lineNo` es `MAX + 1` e incluye las líneas anuladas y borradas. Las líneas fantasma del bug viejo, anuladas, quedan con su número en el libro (en Blas, #2 y #3; la próxima es la #4). Un alta rechazada ya no consume número. Ojo en `main`: los tests de base real usan `lineNo` altos (90 000+); un alta real hecha mientras corren toma `MAX + 1` sobre esos.
- Cada alta de despacho con paquete suma dos consultas dentro de la transacción (lock + relectura) y una más en el paso 4 (productos de los paquetes de las corridas citadas).
- Un código escrito a mano en «Código del producto» que coincida con el de un paquete también lo marca como despachado. Es lo que dice el acta.

## Pendientes (detectados en la revisión, fuera de este ADR)

- **Apartar** no rechaza en el servidor un paquete que ya va en una guía: la pantalla ya no lo ofrece (sale de Disponibles), pero el endpoint de reserva lo aceptaría.
- **`buscarPaquetes`** no dice en qué guía va un paquete despachado: quien lo busca por código ve que no está, no dónde está.
- Los **consumos** de `create` (corrida → ingresos, `setConsumos`) siguen en una transacción aparte: una corrida cuyo consumo viola I1/I2 queda grabada sin consumos. Es el mismo hueco que este ADR cierra en la salida.

## Alternativas descartadas

- **Columna `ForestCtpPaquete.despachadoEnId`** (migración aditiva): una segunda fuente de verdad que hay que mantener sincronizada al anular, borrar o editar un despacho — el «anular una guía liberó el paquete que otra guía viva llevaba» es justo ese tipo de desincronización. El estado del despacho ya dice lo mismo sin migración. Si algún día el volumen de despachos hace cara la consulta `in […]`, se agrega como índice o columna derivada, no como verdad.
- **Validar orígenes antes del INSERT, en otra transacción:** reabre el TOCTOU entre validar y grabar.
- **Filtrar sólo en la pantalla:** la regla tiene que vivir donde se escribe; si no, el POST la saltea.

## Referencias

Código: `lib/db/forest-ctp.db.ts` (`create`, `bloquearProduccion`, `productosDisponibles`, `reservasVencidas`), `lib/db/forest-ctp-despacho.db.ts` (`setOrigenesEnTx`, `despuesDeOrigenes`, `exigirPaqueteLibreEnTx`, `codigosDespachados`), `lib/db/forest-ctp-consumo.db.ts` (código `PAQUETE_YA_DESPACHADO`), `lib/forestal/ctp-api-errors.ts` (409). Tests: `__tests__/forestal-despacho-paquete-una-guia.test.ts` (base real, `main`), `__tests__/forestal-cambiar-apartado.test.ts` (campana). Memorias: `ctp-libro-invariantes-2026-07-15`, `orden-de-locks-del-libro`.
