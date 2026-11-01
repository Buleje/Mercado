# ADR-527 — Cuentas: la plata que entró y salió del negocio en el periodo

- **Estado:** aceptado (2026-11-01). Sin cambios de schema: solo lectura sobre tablas existentes.
- **Pedido por:** Brandon (01-11), «llevar Cuentas al panel para que cualquier aserradero la tenga». Es la planilla de Blas (adelantos, gastos, ingresos) en una pantalla para cualquier negocio.
- **Relacionados:**
  - ADR-451: la caja del mes. Cuentas usa su regla de plata cobrada.
  - ADR-413: liquidaciones de cuenta.
  - ADR-524: alquileres.
  - ADR-525: personas de Adelantos.

## Contexto
La plata del negocio está repartida en varias tablas: adelantos, ventas del POS, pedidos, fiados, caja, gastos, cuentas por pagar, liquidaciones, tesorería, máquinas y alquileres. `finance-aggregates` cuenta **ventas**, y un pedido confirmado ya entra ahí como venta. Cuentas cuenta **plata que entró o salió**, igual que la caja del mes de ADR-451. Junta todo en una lista y tiene una regla por fuente para que cada sol se cuente una sola vez.

## Decisión
1. **Contrato y lectura**
   - Contrato: `lib/finance/cuentas-tipos.ts` (`CuentasDelPeriodo`).
   - Ruta: `GET /api/admin/finanzas/cuentas?periodo=semana|mes|todo`; sin periodo, semana.
   - Lectura: `CuentasMovimientosDB.delPeriodo`. Las reglas viven en `lib/finance/cuentas-del-periodo.ts`, que es puro y tiene tests. No usa caché.
2. **Periodos en hora de Lima.** La semana empieza el lunes; el mes empieza el día 1 a las 05:00 UTC.
   - Una fecha guardada sin hora cuenta por su día UTC y sale con `conHora=false`. Se reconoce porque cae justo a las 00, 05, 12 o 17 UTC con :00.000.
   - Por eso esas fuentes se piden con un día extra a cada lado, y el corte fino se hace después.
3. **Cada fuente, una vez.** En cada fila, la tabla dueña cuenta y su movimiento de caja (la otra cara) no se suma.

   | Fuente | Cuenta | Su cara en caja, que no suma |
   |---|---|---|
   | `Adelanto` no CANCELADO | DADO va a *adelantos* y RECIBIDO a *ingresos* | «Adelanto…», «Adelanto recibido…», «Anulación de adelanto…» |
   | Devolución de un adelanto | sí, desde la caja («Liquidación de adelanto…», «Devolución de adelanto recibido…») | — (si el adelanto está CANCELADO, tampoco suma) |
   | `Sale` no fiado | sí | la fila `venta` con `saleId` |
   | `FiadoCuota` | sí, haya o no caja abierta | «Cobro de fiado · …» |
   | `Order` | solo si **entregado y no a cuenta**, el día de la entrega (`esPedidoCobrado` y `fechaDeCobroDelPedido`, las mismas funciones de la caja del mes) | — |
   | `Expense` no recurrente | sí, el día de `paidAt ?? date`. Un gasto de guía sin `paidAt` no salió | `gasto-caja-<id>` mientras el gasto exista |
   | Pago de la semana (RRHH) | el **neto**: el bruto menos lo descontado de adelantos (`descontadoPorPrefijo`), porque esa parte salió al dar el adelanto | su retiro, que ya es el neto |
   | `Payment` de una cuenta por pagar | sí, en efectivo o por transferencia | «Pago a proveedor · …» |
   | `LiquidacionCuenta` viva con pago | su `pagoMonto`, haya pasado por caja o no | «Liquidación LIQ-…» y su anulación |
   | Caja manual | sí | — (apertura, arqueo y cierre no son plata) |
   | Tesorería | solo MANUAL INGRESO/EGRESO | — |
   | Máquinas | gastos, e ingresos cobrados | — |
   | `AlquilerPago` | gasto si somos inquilinos, ingreso si somos arrendadores | — |

4. **Sumas**
   - Se suma en céntimos y solo en soles. Lo de otra moneda se lista y se cuenta en `otrasMonedas`.
   - La lista trae a lo más 500 filas, las más nuevas. Ventas y pedidos se suman con un `aggregate` que usa el mismo `where`, así que el total sigue completo aunque la lista se corte.
5. **Por cobrar** = adelantos DADO `ABIERTO` en soles, agrupados por persona. No es el «Le debes» de Adelantos, que también suma la madera.
6. **Roles:** `admin`, `owner` y `manager`. Cajero queda fuera porque `lib/adelantos/permisos.ts` no le da lectura de adelantos, y esta pantalla los muestra con nombre. Sin sesión responde 401, un periodo inválido 400 y un error 503.

## Fuera, a propósito
- **`ForestCuentaMov` con concepto `pago` o `pago_hecho`** (pagos de la cuenta forestal). No deja movimiento de caja ni tiene un vínculo con la caja, así que no hay forma de saber si alguien anotó el mismo cobro a mano en caja. Por eso no se puede asegurar que no se cuente dos veces.
  - La caja del mes sí lo cuenta, pero no suma la caja manual: Cuentas la suma.
  - Hoy hay 0 en Blas y 3 en main (en septiembre de main, 1.000).
  - Para meterlo hace falta enlazar el pago con su movimiento de caja, como `cajaMovimientoId` en las liquidaciones.

## Riesgos anotados
- **Alquiler:** ADR-524 lo define como un registro que no mueve caja, así que Cuentas lo suma. Si además alguien anota un gasto o una salida de caja «alquiler» a mano, sale dos veces. No se inventó una heurística para detectarlo; hoy hay 0 alquileres.
- **Tesorería manual** puede repetir algo anotado a mano en caja.
- **Un cobro o una devolución que no pasa por caja** y no tiene tabla propia no aparece.
- **Si se borra un fiado o una cuenta por pagar**, sus cuotas o pagos se borran en cascada y su movimiento de caja deja de sumar.

## Consecuencias (medido el 01-11)
- **Blas:** septiembre y octubre dan lo mismo que la caja del mes:
  - septiembre: entró 1.200 y salió 6.248;
  - octubre: entró 900.
- **main, octubre:** Cuentas queda 290,58 y la caja del mes 300,58. La diferencia de −10 es una salida manual de caja que ADR-451 muestra sin sumar. Un gasto borrado aporta +25 y −25 y se anula.
- **main, septiembre:** la diferencia contra la caja del mes se explica completa:
  - +2.700 de máquinas;
  - +120 de caja manual, que cuenta en los dos lados (entró y salió);
  - −1.000 de pagos forestales, que quedan fuera;
  - 440 de devoluciones de adelantos anulados (ADL-0026/0028/0038 y ADL-0025 recibido). La caja del mes las suma porque sus entregas no filtran el estado del adelanto. Cuentas no las suma: el adelanto entero quedó fuera.
- **Pendiente de la caja del mes (ADR-451):** cuenta el pago de la semana por el bruto, y también suma las devoluciones de adelantos anulados. Se reporta, no se tocó.
- **Revertir:** borrar la ruta y los dos módulos. Queda el par `esPedidoCobrado`/`fechaDeCobroDelPedido`, que no cambia el comportamiento de la caja del mes.
