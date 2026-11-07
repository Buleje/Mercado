# ADR-449 — Cruzar lo recibido contra la cuenta de aserríos

**Estado:** Aceptado (2026-09-28), construido: servidor, pantalla de Liquidar y recibo.
**Relacionados:** ADR-322 (cuenta corriente con terceros), ADR-412 §4-§5 (cargo de aserrío y cuenta por persona), ADR-413 (liquidar la cuenta), ADR-437 §6 (guías en la liquidación), ADR-448 (adelantos en las dos direcciones).

## Contexto

Medido en Blas (`cmpxiv6p4000bohvzwl6bnfpv`, 28-09, sólo lectura):

| Qué | Cifra |
|---|---|
| Lo que WASACO pagó por adelantado | ADL-2026-0003 **1 731** + ADL-2026-0004 **1 300** = S/ 3 031, los dos con la misma fecha (19/09 17:00), 0 entregas. Hoy figuran como DADO: Brandon los corrige a RECIBIDO + SERVICIO |
| Lo que le dio el negocio | ADL-2026-0002, S/ 3 217 (salió de la caja, sigue DADO) |
| Su cuenta forestal | **32 cargos** `aserrio_prestado` por **S/ 12 323,02**, 0 abonos |
| Vínculo ficha ↔ parte | `forestPartyId` **null**: «Wasaco» en Adelantos, «WASACO» en el directorio |
| Liquidaciones en Blas | 0 |

Con ADR-448, lo recibido queda en `fuera` de la liquidación («es plata que te dieron, no se cobra acá») y «Dejar en cero» se apaga. Resultado: los S/ 3 031 no se pueden descontar de sus aserríos por ninguna vía que deje rastro. Anotarlos a mano en la cuenta forestal cobraría dos veces el aserrío (el cargo lo escribe la corrida, ADR-412).

## Decisión

1. **La cuenta forestal sigue siendo UNA partida.** El cruce la baja con un **`abono` de concepto `compensacion`** — el mismo concepto del cruce de ADR-413 (`cargo`), que ya está fuera de la carga manual (`CONCEPTOS_MANUALES`). Sin concepto nuevo, sin migración.
2. **Qué se escribe**, en la MISMA transacción y con los mismos locks de la liquidación (guías → persona → `FOR UPDATE` de los adelantos ABIERTOS de la persona → relectura con huella):

   | Libreta | Qué |
   |---|---|
   | Adelantos | una entrega `LIBRE` por adelanto recibido, «Cruce LIQ-… con sus aserríos», con su `liquidacionId` (FIFO por fecha y, a igual fecha, por id; o `imputacion.cruceRecibido[]` a mano) |
   | Cuenta forestal | un `abono` · `compensacion` · C, `referencia` = el LIQ |
   | Caja | **nada** |

   La cabecera guarda en `montoCompensado` todo lo cruzado; el acta (`detalle.cruceRecibido`) dice cuánto fue de lo recibido. Las entregas del cruce llevan `lado: "recibido"` en el acta.
3. **Qué entra al cruce** (`clasificarAdelantos` → `PartidasDePersona.recibidos`): RECIBIDO, ABIERTO, en soles, sin cuotas pactadas. Lo demás recibido sigue en `fuera` con su motivo (dólares, cuotas, excedidos).
4. **Máximo:** `maximoCruceRecibido = min(Σ recibidos, max(0, saldo forestal))`, sólo con vínculo explícito (`cruzable`). La entrada: `cruzarRecibido` (opcional, 0 = no cruzar) e `imputacion.cruceRecibido[]` (opcional, si no FIFO).
5. **«Dejar en cero»**: cruza lo recibido que cabe y cobra el resto. WASACO: cruce **3 031** + pago recibido **12 509,02** (3 217 de ADL-0002 + 9 292,02 de aserríos). Si lo recibido pasa de lo que debe, o no hay vínculo, devuelve `null` y queda sólo «Solo cruzar».
6. **Anular** es el camino de ADR-413 §7 sin cambios: las entregas se dan de baja (los adelantos vuelven a 1 731 y 1 300), el abono también, y sólo se anula la última liquidación viva.
7. **Sugerir el vínculo por nombre** (`lib/adelantos/vinculo-sugerido.ts`, puro): mismo nombre después de quitar tildes, mayúsculas, puntuación y la forma societaria (SAC, EIRL, «SOCIEDAD ANONIMA CERRADA»…), o mismo documento. Una sola candidata o ninguna. La fila pregunta «¿Es la misma persona que WASACO?» con la parte elegida y un «Sí, vincular»: **nunca vincula sola** (reusa `PATCH vincular_parte`). En Blas: 4 fichas × 11 partes → 1 sugerencia, 0 falsos positivos.
8. **Pantalla:** «Solo cruzar» sirve a los dos lados (el que tenga la cuenta forestal); la vista previa dice «Cruzar S/ 3 031,00 de su adelanto contra sus aserríos», la tabla Antes → Después (Aserríos 12 323,02 → 9 292,02 · Lo que te adelantó 3 031 → 0 · Neto sin cambio) y «No mueve la caja». Una línea dice por qué lo recibido no se cruza entero cuando pasa (sin vínculo, sin deuda forestal, o de más).

## Invariantes

- Cada adelanto recibe **≤ su saldo**; la cuenta forestal **nunca cambia de signo** (el máximo es su saldo).
- **No se cruza en las dos direcciones a la vez** (`compensar` y `cruzarRecibido` > 0 → 422): uno pide la cuenta a favor suyo y el otro a tu favor.
- **Sólo soles.** Lo que está en dólares queda fuera con «Es en USD: la cuenta se liquida en soles.».
- **El neto de la persona no cambia** con el cruce: −C en la cuenta forestal, −C en lo que le debes.
- **Después de cruzar, «Corregir dirección» queda bloqueada** (hay entregas vivas: `con_entregas`, ADR-448 §10). Anular la liquidación la libera.
- **Lo de antes no cambia:** sin recibidos, la huella, el plan y «Dejar en cero» son idénticos a los de HEAD (probe con `git show HEAD:`, huella `68988e1c` del fixture de WASACO sin recibidos). Una persona CON recibidos cambia de huella una vez (pasan de `fuera` a `recibidos`): un cliente viejo recibe un 409 y recarga.

## Revisión de revisor y seguridad (28-09, sin veto)

9. **La fila muestra «Liquidaciones» aunque el neto dé 0** si la persona tiene alguna liquidación viva (`GET /api/adelantos/cuentas` agrega `liquidacionesVivas`, `LiquidacionCuentaDB.vivasPorPersona`). Después de «Dejar en cero» el neto es 0, «Liquidar» desaparecía y el único «Anular» vive en ese modal. «Corregir dirección» sobre un adelanto cruzado nombra la liquidación y dónde se anula.
10. **El permiso (ADR-421) viaja con lo cobrado.** El abono del cruce y el abono del pago recibido se parten por el permiso de los cargos que cubren, el más viejo primero (`partirPorPermiso`, la misma regla que «cubre por antigüedad»). En Blas los aserríos de WASACO son de FMP-2026-007: sin partir, el balance del permiso seguía en «por recuperar 12 323,02». Lo recibido no necesita nada: la entrega baja el saldo del adelanto y el balance de SU permiso (PLT-2021-017) lo lee de ahí. El `contratoId` de los movimientos no entra en la huella: el reparto por permiso sale de la cuenta releída dentro del lock.
    - **Queda pendiente:** el cruce de siempre (`cargo` `compensacion`) y el pago hecho (`cargo` `pago_hecho`) de ADR-413 todavía no llevan permiso. Se mezclan con el reparto por guía (ADR-437 §6), y cada guía ya tiene el suyo: se hace en otra pasada.
11. **Vincular y desvincular es sólo de admin o dueño** (`soloAdminODueno` en `PATCH vincular_parte`): el vínculo decide contra qué cuenta forestal se cruza la plata, y un manager (con `write` en Adelantos) podía mandar el cruce a otra parte. La fila ya no le muestra «¿Es la misma persona…?». La auditoría guarda la parte anterior y la nueva, con nombre e id. El modal nombra la parte: «Cuenta forestal de WASACO».
12. **Anular un adelanto con entregas vivas de una liquidación → 409 `con_liquidacion`** («anula esa liquidación primero»). Anularlo y después anular la liquidación dejaba el adelanto CANCELADO con el cruce devuelto.
13. **Idempotencia con huella del cuerpo** (`huellaDelCuerpo`, guardada en `detalle.huellaCuerpo`, sin migración): la misma clave con otro cruce u otro pago → 422 `idempotencia_distinta`. Las liquidaciones de antes no tienen huella y se siguen tratando como reintento. La pantalla estrena una clave después de confirmar y después de anular: liquidar otra vez en el mismo modal devolvía la anulada como «repetida».
14. **La sugerencia de vínculo es más estricta:** si los dos tienen documento y es distinto, no se sugiere; «SA» sólo sale como sigla (con puntos, o sin puntos detrás de dos palabras o más: «José Sá» es un apellido).
15. **«Me pagó» se prellena con lo que queda después de cruzar** y avisa «Primero cruza lo que te adelantó»: antes proponía cobrar el aserrío entero.
16. **Los cargos de aserrío toman el lock de la persona** (`bloquearPartesEnTx`, clave `liq:<tenant>:parte:<id>`) al cobrar, recotizar, dejar de cobrar y anular la corrida, después del lock de la corrida. La liquidación nunca toma el de la corrida, así que no se cruzan.

## Alternativas rechazadas

- **Un concepto nuevo** (`cruce_recibido`): más superficie en cada lector de la cuenta (etiquetas, `porConcepto`, estado de pago de guías) para la misma pata.
- **Un tipo de entrega nuevo `CRUCE`**: pide migración del enum y no dice nada que `LIBRE` + `liquidacionId` no diga.
- **Anotarlo a mano** en la cuenta forestal y en Adelantos: dos actos sin código común; si falta una pata, se cobra dos veces el aserrío.
- **Cruzar DADO contra RECIBIDO directo** (sin cuenta forestal): no es el caso de WASACO y cambia la regla de «Dejar en cero»; queda para cuando haya un caso.

## Consecuencias

- `lib/forestal/cuenta-en-la-guia.ts`: «pagado» sumaba toda `compensacion`; el abono del cruce la restaba. Ahora cuenta sólo la que le paga (monto > 0).
- `hooks/use-liquidacion-cuenta.ts` manda `cruzarRecibido` (sin esa línea, la vista previa lo mostraba y el servidor recibía «nada que liquidar»).
- Queda pendiente: ADL-0002 (S/ 3 217) salió de la caja y no se puede corregir a recibido (`movio_caja`); la corrida N° 63 tiene fecha 02/10 (futura) y su cargo de S/ 1 268,84 ya cuenta como por cobrar.
- Tests: `__tests__/cuentas-cruce-recibido.test.ts` (puro, con las 32 cifras de Blas) y `__tests__/cuentas-cruce-recibido-db.test.ts` (base real, tenant `main`: crear, repetir, 409, corregir bloqueado, anular, «Dejar en cero»).
